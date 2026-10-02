"""Views for data import API."""
import os
import tempfile
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import RequireCapability
from rest_framework.parsers import MultiPartParser, FormParser

from .models import ImportJob
from .serializers import (
    ImportJobSerializer, ImportJobListSerializer, FileUploadSerializer
)
from .services import parse_file, validate_data, process_import, COLUMN_MAPPINGS
from .tasks import process_import_job


# Bulk import exists only for high-volume Tenant / Account Holder creation and
# subsequent Lease creation. Landlords and Properties are created through the
# normal application UI (a Property needs an existing Landlord and a unique
# Property ID), so they — and the old combined template — are no longer part of
# the import workflow.
IMPORTABLE_TYPES = ('tenants', 'account_holders', 'leases')
_TYPE_LABELS = {'landlords': 'Landlords', 'properties': 'Properties', 'combined': 'Combined'}


class ImportJobViewSet(viewsets.ModelViewSet):
    """ViewSet for managing import jobs."""
    queryset = ImportJob.objects.all()
    permission_classes = [IsAuthenticated, RequireCapability]
    # The entire data-import feature is governed by the data.import capability.
    capability_map = {'default': 'data.import'}
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return ImportJobListSerializer
        return ImportJobSerializer

    def get_queryset(self):
        return ImportJob.objects.filter(created_by=self.request.user)

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        Upload a file for import.

        Returns validation preview before processing.
        """
        serializer = FileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data['file']
        import_type = serializer.validated_data.get('import_type')

        # Save file temporarily for parsing
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{uploaded_file.name.split(".")[-1]}') as tmp:
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            # Parse file
            data_frames = parse_file(tmp_path, uploaded_file.name)

            if not data_frames:
                return Response(
                    {'error': 'Could not detect any valid data in the file'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Account Holders share the tenant column shape, so a single-entity
            # file auto-detects as 'tenants'. Honour the user's explicit choice
            # here too, so the validation preview reflects account holders.
            if (import_type == 'account_holders'
                    and 'tenants' in data_frames and 'account_holders' not in data_frames):
                data_frames = {'account_holders': data_frames['tenants']}

            # Bulk import is only for Tenants, Account Holders and Leases.
            # Reject any sheet that resolves to Landlords/Properties (or any
            # other non-importable type) — those are created through the app.
            disallowed = [t for t in data_frames if t not in IMPORTABLE_TYPES]
            if disallowed:
                names = ', '.join(_TYPE_LABELS.get(t, t.replace('_', ' ').title())
                                  for t in disallowed)
                return Response(
                    {'error': (f'Bulk import is only available for Tenants, Account '
                               f'Holders and Leases. {names} must be created through the '
                               f'application, not imported. Remove those sheet(s) and '
                               f're-upload.')},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Determine import type
            if len(data_frames) > 1:
                detected_type = 'combined'
            else:
                detected_type = list(data_frames.keys())[0]

            # Validate data
            validation = validate_data(data_frames)

            # Create import job
            job = ImportJob.objects.create(
                import_type=import_type or detected_type,
                status=ImportJob.Status.VALIDATED,
                file_name=uploaded_file.name,
                file=uploaded_file,
                total_rows=validation['total_rows'],
                preview_data=validation,
                created_by=request.user
            )

            return Response({
                'job_id': job.id,
                'import_type': job.import_type,
                'validation': validation,
                'message': 'File validated successfully. Call /confirm/ to process.'
            })

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """
        Confirm and process a validated import job.

        Starts background processing.
        """
        job = self.get_object()

        if job.status != ImportJob.Status.VALIDATED:
            return Response(
                {'error': f'Job is not in validated state. Current status: {job.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update status and queue for processing
        job.status = ImportJob.Status.PENDING
        job.started_at = timezone.now()
        job.save()

        # Queue background task
        process_import_job(job.id)

        return Response({
            'job_id': job.id,
            'status': job.status,
            'message': 'Import job queued for processing'
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a pending or processing import job."""
        job = self.get_object()

        if job.status in [ImportJob.Status.COMPLETED, ImportJob.Status.FAILED]:
            return Response(
                {'error': 'Cannot cancel a completed or failed job'},
                status=status.HTTP_400_BAD_REQUEST
            )

        job.status = ImportJob.Status.CANCELLED
        job.save()

        return Response({
            'job_id': job.id,
            'status': job.status,
            'message': 'Import job cancelled'
        })

    @action(detail=False, methods=['get'])
    def templates(self, request):
        """Get list of available import templates (Tenants, Account Holders,
        Leases only — Landlords/Properties are created through the app)."""
        templates = []
        for entity_type in IMPORTABLE_TYPES:
            mapping = COLUMN_MAPPINGS[entity_type]
            templates.append({
                'type': entity_type,
                'name': entity_type.replace('_', ' ').title(),
                'required_columns': mapping['required'],
                'optional_columns': mapping['optional'],
                'download_url': f'/api/imports/templates/{entity_type}/'
            })

        return Response({
            'templates': templates,
        })

    @action(detail=False, methods=['get'], url_path='templates/(?P<template_type>[^/.]+)')
    def download_template(self, request, template_type=None):
        """Download a template file for the specified entity type."""
        import pandas as pd
        from io import BytesIO

        if template_type in IMPORTABLE_TYPES:
            # Single entity template
            mapping = COLUMN_MAPPINGS[template_type]
            columns = mapping['required'] + mapping['optional']

            output = BytesIO()
            df = pd.DataFrame(columns=columns)
            example = get_example_row(template_type)
            df = pd.concat([df, pd.DataFrame([example])], ignore_index=True)

            # Name the sheet after the entity so a re-uploaded template routes
            # back to the right type by sheet name (SHEET_ALIASES) rather than
            # relying on column auto-detection — important for account holders,
            # whose columns are indistinguishable from tenants.
            sheet_name = template_type.replace('_', ' ').title()[:31]
            df.to_excel(output, index=False, engine='openpyxl', sheet_name=sheet_name)
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename=import_template_{template_type}.xlsx'
            return response

        else:
            label = _TYPE_LABELS.get(template_type, template_type)
            return Response(
                {'error': (f'No bulk-import template for "{label}". Bulk import is '
                           f'available only for Tenants, Account Holders and Leases; '
                           f'Landlords and Properties are created in the application.')},
                status=status.HTTP_404_NOT_FOUND
            )


def get_example_row(entity_type):
    """Get example row data for template."""
    examples = {
        'landlords': {
            'name': 'John Smith Properties',
            'email': 'john@example.com',
            'phone': '+263771234567',
            'address': '123 Main Street, Harare',
            'landlord_type': 'individual',
            'bank_name': 'First Bank',
            'account_number': '1234567890',
            'commission_rate': '10.00',
        },
        'properties': {
            'name': 'Sunrise Apartments',
            'landlord_ref': 'John Smith Properties',
            'address': '456 Park Avenue',
            'city': 'Harare',
            'property_type': 'residential',
            'unit_definition': '1-20',
            'total_units': '20',
        },
        'tenants': {
            'name': 'Jane Doe',
            'email': 'jane@example.com',
            'phone': '+263779876543',
            'id_number': '63-123456-A-78',
            'tenant_type': 'individual',
            'id_type': 'national_id',
        },
        'account_holders': {
            'name': 'Unit 12 Owner',
            'email': 'owner@example.com',
            'phone': '+263779876543',
            'id_number': '63-123456-A-78',
            'tenant_type': 'individual',
            'account_type': 'levy',
            'id_type': 'national_id',
        },
        'leases': {
            # Reference EXISTING records by their unique code — the import
            # never creates them and never matches by name:
            #   party  = an existing Tenant (TN…) or Account Holder (AH…)
            #   property = an existing property CODE (PROP…), not its name
            #   unit   = an existing unit number within that property
            'tenant_account_holder_ref': 'TN000001',
            'property_ref': 'PROP0009',
            'unit_number': 'UNIT-001',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31',
            # Recurring Rent (tenant) or Levy (account holder) charge.
            'monthly_rent_levy': '500.00',
            'currency': 'USD',
            'deposit_amount': '500.00',
        },
    }
    return examples.get(entity_type, {})
