"""URL routes for billing module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InvoiceViewSet, ReceiptViewSet, ExpenseViewSet

router = DefaultRouter()
router.register('invoices', InvoiceViewSet, basename='invoice')
router.register('receipts', ReceiptViewSet, basename='receipt')
router.register('expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    path('', include(router.urls)),
]
