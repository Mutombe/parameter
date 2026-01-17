"""URL routes for accounting module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChartOfAccountViewSet, ExchangeRateViewSet, JournalViewSet,
    GeneralLedgerViewSet, AuditTrailViewSet, FiscalPeriodViewSet
)

router = DefaultRouter()
router.register('accounts', ChartOfAccountViewSet, basename='chart-of-account')
router.register('exchange-rates', ExchangeRateViewSet, basename='exchange-rate')
router.register('journals', JournalViewSet, basename='journal')
router.register('general-ledger', GeneralLedgerViewSet, basename='general-ledger')
router.register('audit-trail', AuditTrailViewSet, basename='audit-trail')
router.register('fiscal-periods', FiscalPeriodViewSet, basename='fiscal-period')

urlpatterns = [
    path('', include(router.urls)),
]
