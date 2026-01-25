"""URL routes for accounting module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChartOfAccountViewSet, ExchangeRateViewSet, JournalViewSet,
    GeneralLedgerViewSet, AuditTrailViewSet, FiscalPeriodViewSet,
    BankAccountViewSet, BankTransactionViewSet, BankReconciliationViewSet,
    ExpenseCategoryViewSet, JournalReallocationViewSet, IncomeTypeViewSet
)

router = DefaultRouter()
router.register('accounts', ChartOfAccountViewSet, basename='chart-of-account')
router.register('exchange-rates', ExchangeRateViewSet, basename='exchange-rate')
router.register('journals', JournalViewSet, basename='journal')
router.register('general-ledger', GeneralLedgerViewSet, basename='general-ledger')
router.register('audit-trail', AuditTrailViewSet, basename='audit-trail')
router.register('fiscal-periods', FiscalPeriodViewSet, basename='fiscal-period')
router.register('bank-accounts', BankAccountViewSet, basename='bank-account')
router.register('bank-transactions', BankTransactionViewSet, basename='bank-transaction')
router.register('bank-reconciliations', BankReconciliationViewSet, basename='bank-reconciliation')
router.register('expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register('reallocations', JournalReallocationViewSet, basename='reallocation')
router.register('income-types', IncomeTypeViewSet, basename='income-type')

urlpatterns = [
    path('', include(router.urls)),
]
