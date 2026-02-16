"""URL routes for billing module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    InvoiceViewSet, ReceiptViewSet, ExpenseViewSet, BulkMailingViewSet,
    LatePenaltyConfigViewSet, LatePenaltyExclusionViewSet
)

router = DefaultRouter()
router.register('invoices', InvoiceViewSet, basename='invoice')
router.register('receipts', ReceiptViewSet, basename='receipt')
router.register('expenses', ExpenseViewSet, basename='expense')
router.register('mailing', BulkMailingViewSet, basename='mailing')
router.register('penalty-configs', LatePenaltyConfigViewSet, basename='penalty-config')
router.register('penalty-exclusions', LatePenaltyExclusionViewSet, basename='penalty-exclusion')

urlpatterns = [
    path('', include(router.urls)),
]
