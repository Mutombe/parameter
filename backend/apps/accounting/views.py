"""Views for accounting module."""
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q
from django.utils import timezone
from .models import (
    ChartOfAccount, ExchangeRate, Journal, JournalEntry,
    GeneralLedger, AuditTrail, FiscalPeriod
)
from .serializers import (
    ChartOfAccountSerializer, ExchangeRateSerializer,
    JournalSerializer, JournalCreateSerializer, JournalEntrySerializer,
    GeneralLedgerSerializer, AuditTrailSerializer, FiscalPeriodSerializer,
    TrialBalanceSerializer
)


class ChartOfAccountViewSet(viewsets.ModelViewSet):
    """CRUD for Chart of Accounts."""
    queryset = ChartOfAccount.objects.select_related('parent').all()
    serializer_class = ChartOfAccountSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['account_type', 'account_subtype', 'is_active', 'currency']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name', 'current_balance']
    ordering = ['code']

    def get_queryset(self):
        queryset = super().get_queryset()
        # Optionally filter to only root accounts
        if self.request.query_params.get('root_only'):
            queryset = queryset.filter(parent__isnull=True)
        return queryset

    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """Get accounts grouped by type."""
        result = {}
        for account_type in ChartOfAccount.AccountType.values:
            accounts = self.get_queryset().filter(account_type=account_type, is_active=True)
            result[account_type] = ChartOfAccountSerializer(accounts, many=True).data
        return Response(result)

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        """Seed default chart of accounts."""
        defaults = [
            # Assets
            ('1000', 'Cash', 'asset', 'cash', True),
            ('1100', 'Bank - USD', 'asset', 'cash', True),
            ('1110', 'Bank - ZiG', 'asset', 'cash', True),
            ('1200', 'Accounts Receivable', 'asset', 'accounts_receivable', True),
            ('1300', 'Prepaid Expenses', 'asset', 'prepaid', True),
            # Liabilities
            ('2000', 'Accounts Payable', 'liability', 'accounts_payable', True),
            ('2100', 'VAT Payable', 'liability', 'vat_payable', True),
            ('2200', 'Tenant Deposits', 'liability', 'tenant_deposits', True),
            # Equity
            ('3000', 'Retained Earnings', 'equity', 'retained_earnings', True),
            ('3100', 'Capital', 'equity', 'capital', True),
            # Revenue
            ('4000', 'Rental Income', 'revenue', 'rental_income', True),
            ('4100', 'Commission Income', 'revenue', 'commission_income', True),
            ('4200', 'Other Income', 'revenue', 'other_income', True),
            # Expenses
            ('5000', 'Operating Expenses', 'expense', 'operating_expense', True),
            ('5100', 'Maintenance & Repairs', 'expense', 'maintenance', True),
            ('5200', 'Utilities', 'expense', 'utilities', True),
        ]

        created = 0
        for code, name, acc_type, subtype, is_system in defaults:
            _, was_created = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'account_subtype': subtype,
                    'is_system': is_system
                }
            )
            if was_created:
                created += 1

        return Response({'message': f'Created {created} default accounts'})


class ExchangeRateViewSet(viewsets.ModelViewSet):
    """CRUD for exchange rates."""
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['from_currency', 'to_currency']

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Get latest exchange rate for currency pair."""
        from_curr = request.query_params.get('from', 'USD')
        to_curr = request.query_params.get('to', 'ZiG')

        rate = ExchangeRate.get_rate(from_curr, to_curr)
        return Response({
            'from_currency': from_curr,
            'to_currency': to_curr,
            'rate': str(rate),
            'date': timezone.now().date().isoformat()
        })


class JournalViewSet(viewsets.ModelViewSet):
    """CRUD for journal entries."""
    queryset = Journal.objects.select_related(
        'created_by', 'posted_by', 'reversed_by'
    ).prefetch_related('entries', 'entries__account').all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['journal_type', 'status', 'date', 'currency']
    search_fields = ['journal_number', 'description', 'reference']
    ordering_fields = ['date', 'journal_number', 'created_at']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return JournalCreateSerializer
        return JournalSerializer

    @action(detail=True, methods=['post'])
    def post_journal(self, request, pk=None):
        """Post a draft journal."""
        journal = self.get_object()
        try:
            journal.post(request.user)
            return Response(JournalSerializer(journal).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reverse_journal(self, request, pk=None):
        """Reverse a posted journal."""
        journal = self.get_object()
        reason = request.data.get('reason')

        if not reason:
            return Response(
                {'error': 'Reversal reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            reversal = journal.reverse(reason, request.user)
            return Response({
                'message': 'Journal reversed successfully',
                'original': JournalSerializer(journal).data,
                'reversal': JournalSerializer(reversal).data
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GeneralLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    """View general ledger entries."""
    queryset = GeneralLedger.objects.select_related(
        'account', 'journal_entry', 'journal_entry__journal'
    ).all()
    serializer_class = GeneralLedgerSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['account', 'date', 'currency']
    search_fields = ['description']
    ordering_fields = ['date', 'created_at']
    ordering = ['-date', '-created_at']

    @action(detail=False, methods=['get'])
    def account_statement(self, request):
        """Get statement for a specific account."""
        account_id = request.query_params.get('account')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not account_id:
            return Response(
                {'error': 'account parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(account_id=account_id)

        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        queryset = queryset.order_by('date', 'created_at')

        # Calculate running balance
        entries = list(queryset)
        account = ChartOfAccount.objects.get(id=account_id)

        return Response({
            'account': ChartOfAccountSerializer(account).data,
            'entries': GeneralLedgerSerializer(entries, many=True).data,
            'summary': {
                'total_debits': sum(e.debit_amount for e in entries),
                'total_credits': sum(e.credit_amount for e in entries),
                'closing_balance': account.current_balance
            }
        })

    @action(detail=False, methods=['get'])
    def trial_balance(self, request):
        """Generate trial balance report."""
        as_of_date = request.query_params.get('as_of_date', timezone.now().date())

        accounts = ChartOfAccount.objects.filter(is_active=True).order_by('code')

        trial_balance = []
        total_debits = Decimal('0')
        total_credits = Decimal('0')

        for account in accounts:
            balance = account.current_balance

            if account.normal_balance == 'debit':
                debit_balance = balance if balance > 0 else Decimal('0')
                credit_balance = abs(balance) if balance < 0 else Decimal('0')
            else:
                credit_balance = balance if balance > 0 else Decimal('0')
                debit_balance = abs(balance) if balance < 0 else Decimal('0')

            if debit_balance or credit_balance:
                trial_balance.append({
                    'account_code': account.code,
                    'account_name': account.name,
                    'account_type': account.account_type,
                    'debit_balance': debit_balance,
                    'credit_balance': credit_balance
                })
                total_debits += debit_balance
                total_credits += credit_balance

        return Response({
            'as_of_date': str(as_of_date),
            'accounts': trial_balance,
            'totals': {
                'total_debits': total_debits,
                'total_credits': total_credits,
                'is_balanced': total_debits == total_credits
            }
        })


class AuditTrailViewSet(viewsets.ReadOnlyModelViewSet):
    """View audit trail (read-only)."""
    queryset = AuditTrail.objects.select_related('user').all()
    serializer_class = AuditTrailSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['action', 'model_name', 'user']
    search_fields = ['action', 'model_name', 'user_email', 'changes']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']


class FiscalPeriodViewSet(viewsets.ModelViewSet):
    """Manage fiscal periods."""
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def close_period(self, request, pk=None):
        """Close a fiscal period."""
        period = self.get_object()

        if period.is_closed:
            return Response(
                {'error': 'Period is already closed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        period.is_closed = True
        period.closed_at = timezone.now()
        period.closed_by = request.user
        period.save()

        AuditTrail.objects.create(
            action='fiscal_period_closed',
            model_name='FiscalPeriod',
            record_id=period.id,
            changes={'period': period.name},
            user=request.user
        )

        return Response(FiscalPeriodSerializer(period).data)
