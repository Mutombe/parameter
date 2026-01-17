"""URL routes for reports."""
from django.urls import path
from .views import (
    DashboardStatsView, TrialBalanceReportView, IncomeStatementView,
    BalanceSheetView, VacancyReportView, RentRollView, LandlordStatementView,
    CashFlowStatementView
)

urlpatterns = [
    path('dashboard/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('trial-balance/', TrialBalanceReportView.as_view(), name='trial-balance'),
    path('income-statement/', IncomeStatementView.as_view(), name='income-statement'),
    path('balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('cash-flow/', CashFlowStatementView.as_view(), name='cash-flow'),
    path('vacancy/', VacancyReportView.as_view(), name='vacancy-report'),
    path('rent-roll/', RentRollView.as_view(), name='rent-roll'),
    path('landlord-statement/', LandlordStatementView.as_view(), name='landlord-statement'),
]
