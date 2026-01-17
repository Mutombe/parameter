"""Views for AI service."""
from decimal import Decimal
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .service import AIService
from .ocr_service import OCRService


class AskMeView(APIView):
    """
    Natural language query endpoint.
    The "Ask Me" feature for Reports page.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        question = request.data.get('question')

        if not question:
            return Response(
                {'error': 'Question is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get tenant from request (set by middleware)
        tenant = getattr(request, 'tenant', None)

        ai_service = AIService(tenant=tenant)
        result = ai_service.natural_language_query(question)

        return Response(result)


class BankReconciliationView(APIView):
    """
    Semantic bank reconciliation endpoint.
    Matches bank statement references to tenant records.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        statement_ref = request.data.get('reference')
        amount = request.data.get('amount')
        date = request.data.get('date')

        if not statement_ref or not amount:
            return Response(
                {'error': 'Reference and amount are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(amount))
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid amount format'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = getattr(request, 'tenant', None)
        ai_service = AIService(tenant=tenant)

        result = ai_service.semantic_bank_reconciliation(
            statement_ref=statement_ref,
            amount=amount,
            date=date
        )

        return Response(result)


class AIStatusView(APIView):
    """Check AI feature status for current tenant."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)

        if not tenant:
            return Response({
                'ai_enabled': False,
                'features': {}
            })

        return Response({
            'ai_enabled': True,
            'features': {
                'accounting': tenant.ai_accounting_enabled,
                'reconciliation': tenant.ai_reconciliation_enabled,
                'reports': tenant.ai_reports_enabled,
                'ocr': tenant.ai_ocr_enabled
            }
        })


class SuggestedQuestionsView(APIView):
    """Get suggested questions for the Ask Me feature."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        suggestions = [
            {
                'category': 'Vacancy',
                'questions': [
                    'What is the current vacancy rate?',
                    'Which properties have the most vacant units?',
                    'How has vacancy changed this month?'
                ]
            },
            {
                'category': 'Financial',
                'questions': [
                    'What is the total outstanding balance?',
                    'What is our collection rate?',
                    'Which tenants have overdue payments?'
                ]
            },
            {
                'category': 'Properties',
                'questions': [
                    'How many properties do we manage?',
                    'What is the total rental income this month?',
                    'Which landlord has the most properties?'
                ]
            },
            {
                'category': 'Maintenance',
                'questions': [
                    'What are the maintenance costs for Block A?',
                    'Which properties need the most repairs?',
                    'What is the average maintenance cost per unit?'
                ]
            }
        ]

        return Response(suggestions)


class OCRLeaseExtractionView(APIView):
    """
    Extract lease agreement data from uploaded document.
    Supports images and PDF files.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('file')

        if not file:
            return Response(
                {'error': 'File is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
        if file.content_type not in allowed_types:
            return Response(
                {'error': f'Invalid file type. Allowed: {", ".join(allowed_types)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = getattr(request, 'tenant', None)
        ocr_service = OCRService(tenant=tenant)

        result = ocr_service.extract_lease_data(
            image_bytes=file.read(),
            filename=file.name
        )

        return Response(result)


class OCRInvoiceExtractionView(APIView):
    """
    Extract invoice data from uploaded document.
    Supports images and PDF files.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('file')

        if not file:
            return Response(
                {'error': 'File is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
        if file.content_type not in allowed_types:
            return Response(
                {'error': f'Invalid file type. Allowed: {", ".join(allowed_types)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = getattr(request, 'tenant', None)
        ocr_service = OCRService(tenant=tenant)

        result = ocr_service.extract_invoice_data(
            image_bytes=file.read(),
            filename=file.name
        )

        return Response(result)


class OCRIDExtractionView(APIView):
    """
    Extract ID document data for KYC verification.
    Supports National ID, Passport, Driver's License.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('file')

        if not file:
            return Response(
                {'error': 'File is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        allowed_types = ['image/jpeg', 'image/png', 'image/gif']
        if file.content_type not in allowed_types:
            return Response(
                {'error': f'Invalid file type. Allowed: {", ".join(allowed_types)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = getattr(request, 'tenant', None)
        ocr_service = OCRService(tenant=tenant)

        result = ocr_service.extract_id_document(
            image_bytes=file.read(),
            filename=file.name
        )

        return Response(result)
