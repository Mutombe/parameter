"""URL routes for AI service."""
from django.urls import path
from .views import (
    AskMeView, BankReconciliationView,
    AIStatusView, SuggestedQuestionsView,
    OCRLeaseExtractionView, OCRInvoiceExtractionView, OCRIDExtractionView
)

urlpatterns = [
    path('ask/', AskMeView.as_view(), name='ai-ask'),
    path('reconcile/', BankReconciliationView.as_view(), name='ai-reconcile'),
    path('status/', AIStatusView.as_view(), name='ai-status'),
    path('suggestions/', SuggestedQuestionsView.as_view(), name='ai-suggestions'),
    # OCR Endpoints
    path('ocr/lease/', OCRLeaseExtractionView.as_view(), name='ai-ocr-lease'),
    path('ocr/invoice/', OCRInvoiceExtractionView.as_view(), name='ai-ocr-invoice'),
    path('ocr/id/', OCRIDExtractionView.as_view(), name='ai-ocr-id'),
]
