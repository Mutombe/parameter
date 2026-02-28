"""URL routes for reports."""
from django.urls import path
from .views import (
    DashboardStatsView, TrialBalanceReportView, IncomeStatementView,
    BalanceSheetView, VacancyReportView, RentRollView, RentRolloverView,
    LandlordStatementView,
    CashFlowStatementView, AgedAnalysisView, TenantAccountSummaryView,
    DepositAccountSummaryView, CommissionReportView, CommissionPropertyDrilldownView,
    LeaseChargeSummaryView,
    ReceiptListingView, CommissionAnalysisView, IncomeItemAnalysisView,
    IncomeItemDrilldownView, IncomeExpenditureReportView,
    DataVisualizationView, StreamingCSVExportView
)
from .property_performance import PropertyPerformanceView
from .tax_reports import VATReturnView, WithholdingTaxView, AnnualIncomeSummaryView

urlpatterns = [
    # Core financial reports
    path('dashboard/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('trial-balance/', TrialBalanceReportView.as_view(), name='trial-balance'),
    path('income-statement/', IncomeStatementView.as_view(), name='income-statement'),
    path('balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('cash-flow/', CashFlowStatementView.as_view(), name='cash-flow'),

    # Property reports
    path('vacancy/', VacancyReportView.as_view(), name='vacancy-report'),
    path('rent-roll/', RentRollView.as_view(), name='rent-roll'),
    path('rent-rollover/', RentRolloverView.as_view(), name='rent-rollover'),

    # Landlord & Tenant reports
    path('landlord-statement/', LandlordStatementView.as_view(), name='landlord-statement'),
    path('tenant-account/', TenantAccountSummaryView.as_view(), name='tenant-account'),
    path('deposit-summary/', DepositAccountSummaryView.as_view(), name='deposit-summary'),

    # Aged analysis
    path('aged-analysis/', AgedAnalysisView.as_view(), name='aged-analysis'),

    # Commission reports
    path('commission/', CommissionReportView.as_view(), name='commission-report'),
    path('commission/drilldown/', CommissionPropertyDrilldownView.as_view(), name='commission-property-drilldown'),
    path('commission-analysis/', CommissionAnalysisView.as_view(), name='commission-analysis'),

    # Billing reports
    path('lease-charges/', LeaseChargeSummaryView.as_view(), name='lease-charges'),
    path('receipts/', ReceiptListingView.as_view(), name='receipt-listing'),

    # Income reports
    path('income-item-analysis/', IncomeItemAnalysisView.as_view(), name='income-item-analysis'),
    path('income-item-analysis/drilldown/', IncomeItemDrilldownView.as_view(), name='income-item-drilldown'),
    path('income-expenditure/', IncomeExpenditureReportView.as_view(), name='income-expenditure'),

    # Data visualization
    path('charts/', DataVisualizationView.as_view(), name='data-visualization'),

    # Streaming CSV export
    path('export/', StreamingCSVExportView.as_view(), name='streaming-export'),

    # Property performance P&L
    path('property-performance/<int:pk>/', PropertyPerformanceView.as_view(), name='property-performance'),

    # ZIMRA tax compliance reports
    path('tax/vat-return/', VATReturnView.as_view(), name='vat-return'),
    path('tax/withholding-tax/', WithholdingTaxView.as_view(), name='withholding-tax'),
    path('tax/annual-income/', AnnualIncomeSummaryView.as_view(), name='annual-income-summary'),
]
