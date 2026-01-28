"""Views for data import API."""
import os
import tempfile
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from .models import ImportJob
from .serializers import (
    ImportJobSerializer, ImportJobListSerializer, FileUploadSerializer
)
from .services import parse_file, validate_data, process_import, COLUMN_MAPPINGS
from .tasks import process_import_job


class ImportJobViewSet(viewsets.ModelViewSet):
    """ViewSet for managing import jobs."""
    queryset = ImportJob.objects.all()
    permission_classes = [IsAuthenticated]
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
        """Get list of available import templates."""
        templates = []
        for entity_type, mapping in COLUMN_MAPPINGS.items():
            templates.append({
                'type': entity_type,
                'name': entity_type.replace('_', ' ').title(),
                'required_columns': mapping['required'],
                'optional_columns': mapping['optional'],
                'download_url': f'/api/imports/templates/{entity_type}/'
            })

        return Response({
            'templates': templates,
            'combined_template_url': '/api/imports/templates/combined/'
        })

    @action(detail=False, methods=['get'], url_path='templates/(?P<template_type>[^/.]+)')
    def download_template(self, request, template_type=None):
        """Download a template file for the specified entity type."""
        import pandas as pd
        from io import BytesIO

        if template_type == 'combined':
            # Create multi-sheet Excel template
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                for entity_type, mapping in COLUMN_MAPPINGS.items():
                    columns = mapping['required'] + mapping['optional']
                    df = pd.DataFrame(columns=columns)
                    # Add example row
                    example = get_example_row(entity_type)
                    df = pd.concat([df, pd.DataFrame([example])], ignore_index=True)
                    df.to_excel(writer, sheet_name=entity_type.title(), index=False)

            output.seek(0)
            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename=import_template_combined.xlsx'
            return response

        elif template_type in COLUMN_MAPPINGS:
            # Single entity template
            mapping = COLUMN_MAPPINGS[template_type]
            columns = mapping['required'] + mapping['optional']

            output = BytesIO()
            df = pd.DataFrame(columns=columns)
            example = get_example_row(template_type)
            df = pd.concat([df, pd.DataFrame([example])], ignore_index=True)

            # Write to Excel
            df.to_excel(output, index=False, engine='openpyxl')
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename=import_template_{template_type}.xlsx'
            return response

        else:
            return Response(
                {'error': f'Unknown template type: {template_type}'},
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
        'leases': {
            'tenant_ref': 'Jane Doe',
            'property_ref': 'Sunrise Apartments',
            'unit_number': '5',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31',
            'monthly_rent': '500.00',
            'currency': 'USD',
            'deposit_amount': '500.00',
        },
    }
    return examples.get(entity_type, {})
