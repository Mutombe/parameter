"""Views for accounting module."""
import csv
import io
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from django.db.models import Sum, Q, Count
from django.http import HttpResponse
from django.utils import timezone
from .models import (
    ChartOfAccount, ExchangeRate, Journal, JournalEntry,
    GeneralLedger, AuditTrail, FiscalPeriod, BankAccount,
    BankTransaction, BankReconciliation, ReconciliationItem,
    ExpenseCategory, JournalReallocation, IncomeType
)
from .serializers import (
    ChartOfAccountSerializer, ExchangeRateSerializer,
    JournalSerializer, JournalCreateSerializer, JournalEntrySerializer,
    GeneralLedgerSerializer, AuditTrailSerializer, FiscalPeriodSerializer,
    TrialBalanceSerializer, BankAccountSerializer, BankTransactionSerializer,
    BankTransactionUploadSerializer, BankReconciliationSerializer,
    ReconciliationCreateSerializer, ReconciliationWorkspaceSerializer,
    ExpenseCategorySerializer, JournalReallocationSerializer,
    ReallocationCreateSerializer, IncomeTypeSerializer
)
from apps.accounts.mixins import TenantSchemaValidationMixin


class ProtectedDeleteMixin:
    """Mixin to handle ProtectedError on delete gracefully."""
    def destroy(self, request, *args, **kwargs):
        from django.db.models import ProtectedError
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ProtectedError as e:
            protected = set()
            for obj in e.protected_objects:
                protected.add(type(obj).__name__)
            names = ', '.join(protected)
            return Response(
                {'detail': f'Cannot delete because it has related {names}. Remove them first.'},
                status=status.HTTP_409_CONFLICT
            )


class ChartOfAccountViewSet(TenantSchemaValidationMixin, ProtectedDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Chart of Accounts."""
    queryset = ChartOfAccount.objects.select_related('parent').prefetch_related('children').all()
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
    filterset_fields = ['from_currency', 'to_currency', 'effective_date']
    search_fields = ['source']
    ordering_fields = ['effective_date', 'rate']
    ordering = ['-effective_date']

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


class JournalViewSet(TenantSchemaValidationMixin, viewsets.ModelViewSet):
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

    def get_queryset(self):
        queryset = super().get_queryset()
        # Date range filtering
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(timestamp__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(timestamp__date__lte=end_date)
        return queryset


class FiscalPeriodViewSet(viewsets.ModelViewSet):
    """Manage fiscal periods."""
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_closed']
    search_fields = ['name']
    ordering_fields = ['start_date', 'end_date', 'name']
    ordering = ['-start_date']

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


class BankAccountViewSet(TenantSchemaValidationMixin, ProtectedDeleteMixin, viewsets.ModelViewSet):
    """
    CRUD for Bank Accounts.
    Supports FBC Bank, EcoCash, ZB Bank, CABS, Cash with USD/ZWG currencies.
    """
    queryset = BankAccount.objects.select_related('gl_account').all()
    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['account_type', 'currency', 'is_active', 'is_default']
    search_fields = ['code', 'name', 'bank_name', 'account_number']
    ordering_fields = ['name', 'book_balance', 'bank_balance']
    ordering = ['name']

    @action(detail=False, methods=['get'])
    def by_currency(self, request):
        """Get bank accounts grouped by currency."""
        result = {}
        for currency in BankAccount.Currency.values:
            accounts = self.get_queryset().filter(currency=currency, is_active=True)
            result[currency] = BankAccountSerializer(accounts, many=True).data
        return Response(result)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get summary of all bank accounts."""
        accounts = self.get_queryset().filter(is_active=True)

        usd_total = accounts.filter(currency='USD').aggregate(
            book_total=Sum('book_balance'),
            bank_total=Sum('bank_balance')
        )
        zwg_total = accounts.filter(currency='ZWG').aggregate(
            book_total=Sum('book_balance'),
            bank_total=Sum('bank_balance')
        )

        return Response({
            'total_accounts': accounts.count(),
            'usd': {
                'book_balance': usd_total['book_total'] or Decimal('0'),
                'bank_balance': usd_total['bank_total'] or Decimal('0'),
                'difference': (usd_total['bank_total'] or Decimal('0')) - (usd_total['book_total'] or Decimal('0'))
            },
            'zwg': {
                'book_balance': zwg_total['book_total'] or Decimal('0'),
                'bank_balance': zwg_total['bank_total'] or Decimal('0'),
                'difference': (zwg_total['bank_total'] or Decimal('0')) - (zwg_total['book_total'] or Decimal('0'))
            },
            'accounts': BankAccountSerializer(accounts, many=True).data
        })

    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this bank account as default for its currency."""
        account = self.get_object()
        account.is_default = True
        account.save()
        return Response(BankAccountSerializer(account).data)

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        """Seed default bank accounts (FBC, EcoCash, ZB, CABS, Cash)."""
        # Get or create the cash GL account
        cash_account, _ = ChartOfAccount.objects.get_or_create(
            code='1100',
            defaults={
                'name': 'Bank - USD',
                'account_type': 'asset',
                'account_subtype': 'cash',
                'is_system': True
            }
        )

        defaults = [
            ('FBC', 'FBC Bank', 'bank', 'FBC Bank Limited', 'USD'),
            ('ECOCASH', 'EcoCash', 'mobile_money', 'EcoCash', 'USD'),
            ('ZB', 'ZB Bank', 'bank', 'ZB Bank Limited', 'USD'),
            ('CABS', 'CABS Bank', 'bank', 'CABS Building Society', 'USD'),
            ('CASH', 'Petty Cash', 'cash', 'Cash', 'USD'),
            ('FBC_ZWG', 'FBC Bank ZWG', 'bank', 'FBC Bank Limited', 'ZWG'),
            ('ECOCASH_ZWG', 'EcoCash ZWG', 'mobile_money', 'EcoCash', 'ZWG'),
        ]

        created = 0
        for code, name, acc_type, bank_name, currency in defaults:
            _, was_created = BankAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'bank_name': bank_name,
                    'currency': currency,
                    'gl_account': cash_account
                }
            )
            if was_created:
                created += 1

        return Response({'message': f'Created {created} default bank accounts'})


class BankTransactionViewSet(TenantSchemaValidationMixin, viewsets.ModelViewSet):
    """
    CRUD for Bank Transactions.
    Supports uploading bank statements and AI-assisted matching.
    """
    queryset = BankTransaction.objects.select_related(
        'bank_account', 'matched_receipt', 'matched_journal', 'reconciled_by'
    ).all()
    serializer_class = BankTransactionSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ['bank_account', 'status', 'transaction_type', 'transaction_date']
    search_fields = ['reference', 'description']
    ordering_fields = ['transaction_date', 'amount']
    ordering = ['-transaction_date']

    @action(detail=False, methods=['post'])
    def upload_statement(self, request):
        """Upload bank statement from CSV/Excel file."""
        serializer = BankTransactionUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file = serializer.validated_data['file']
        bank_account = serializer.validated_data['bank_account']
        file_format = serializer.validated_data['file_format']

        transactions_created = 0
        errors = []

        try:
            if file_format == 'csv':
                decoded_file = file.read().decode('utf-8')
                reader = csv.DictReader(io.StringIO(decoded_file))

                for row in reader:
                    try:
                        # Parse CSV row - adjust field names as needed
                        trans_date = row.get('Date') or row.get('date') or row.get('Transaction Date')
                        reference = row.get('Reference') or row.get('reference') or row.get('Ref')
                        description = row.get('Description') or row.get('description') or row.get('Narration')
                        debit = row.get('Debit') or row.get('debit') or row.get('DR')
                        credit = row.get('Credit') or row.get('credit') or row.get('CR')
                        balance = row.get('Balance') or row.get('balance')

                        # Determine transaction type and amount
                        if debit and float(debit.replace(',', '') or 0) > 0:
                            trans_type = 'debit'
                            amount = Decimal(debit.replace(',', ''))
                        elif credit and float(credit.replace(',', '') or 0) > 0:
                            trans_type = 'credit'
                            amount = Decimal(credit.replace(',', ''))
                        else:
                            continue

                        BankTransaction.objects.create(
                            bank_account=bank_account,
                            transaction_date=trans_date,
                            reference=reference or '',
                            description=description or '',
                            transaction_type=trans_type,
                            amount=amount,
                            running_balance=Decimal(balance.replace(',', '')) if balance else None
                        )
                        transactions_created += 1
                    except Exception as e:
                        errors.append(f'Row error: {str(e)}')

            return Response({
                'message': f'Uploaded {transactions_created} transactions',
                'transactions_created': transactions_created,
                'errors': errors
            })

        except Exception as e:
            return Response(
                {'error': f'Failed to parse file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Manually reconcile a transaction."""
        transaction_obj = self.get_object()
        receipt_id = request.data.get('receipt_id')
        journal_id = request.data.get('journal_id')

        receipt = None
        journal = None

        if receipt_id:
            from apps.billing.models import Receipt
            try:
                receipt = Receipt.objects.get(id=receipt_id)
            except Receipt.DoesNotExist:
                return Response(
                    {'error': 'Receipt not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        if journal_id:
            try:
                journal = Journal.objects.get(id=journal_id)
            except Journal.DoesNotExist:
                return Response(
                    {'error': 'Journal not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        transaction_obj.reconcile(receipt=receipt, journal=journal, user=request.user)
        return Response(BankTransactionSerializer(transaction_obj).data)

    @action(detail=False, methods=['get'])
    def unreconciled(self, request):
        """Get all unreconciled transactions."""
        bank_account_id = request.query_params.get('bank_account')
        queryset = self.get_queryset().filter(status='unreconciled')

        if bank_account_id:
            queryset = queryset.filter(bank_account_id=bank_account_id)

        return Response({
            'count': queryset.count(),
            'total_credits': queryset.filter(transaction_type='credit').aggregate(total=Sum('amount'))['total'] or Decimal('0'),
            'total_debits': queryset.filter(transaction_type='debit').aggregate(total=Sum('amount'))['total'] or Decimal('0'),
            'transactions': BankTransactionSerializer(queryset[:100], many=True).data
        })

    @action(detail=False, methods=['post'])
    def auto_match(self, request):
        """AI-assisted auto-matching of transactions with receipts."""
        bank_account_id = request.data.get('bank_account')

        if not bank_account_id:
            return Response(
                {'error': 'bank_account is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.billing.models import Receipt

        unreconciled = BankTransaction.objects.filter(
            bank_account_id=bank_account_id,
            status='unreconciled',
            transaction_type='credit'
        )

        matched = 0
        suggestions = []

        for trans in unreconciled:
            # Try to find matching receipt by amount and date range
            potential_matches = Receipt.objects.filter(
                amount=trans.amount,
                date__gte=trans.transaction_date - timezone.timedelta(days=3),
                date__lte=trans.transaction_date + timezone.timedelta(days=3),
                journal__isnull=False
            ).exclude(bank_transactions__isnull=False)

            if potential_matches.count() == 1:
                # Exact match found
                receipt = potential_matches.first()
                trans.matched_receipt = receipt
                trans.ai_match_confidence = 95
                trans.ai_match_suggestion = {
                    'receipt_id': receipt.id,
                    'receipt_number': receipt.receipt_number,
                    'tenant': receipt.tenant.name,
                    'confidence': 95
                }
                trans.save()
                suggestions.append({
                    'transaction_id': trans.id,
                    'match_type': 'exact',
                    'receipt': {
                        'id': receipt.id,
                        'number': receipt.receipt_number,
                        'tenant': receipt.tenant.name
                    },
                    'confidence': 95
                })
                matched += 1
            elif potential_matches.count() > 1:
                # Multiple potential matches
                trans.ai_match_confidence = 60
                trans.ai_match_suggestion = {
                    'potential_matches': [
                        {'id': r.id, 'number': r.receipt_number, 'tenant': r.tenant.name}
                        for r in potential_matches[:5]
                    ],
                    'confidence': 60
                }
                trans.save()
                suggestions.append({
                    'transaction_id': trans.id,
                    'match_type': 'multiple',
                    'potential_receipts': [
                        {'id': r.id, 'number': r.receipt_number, 'tenant': r.tenant.name}
                        for r in potential_matches[:5]
                    ],
                    'confidence': 60
                })

        return Response({
            'matched': matched,
            'total_processed': unreconciled.count(),
            'suggestions': suggestions
        })


class BankReconciliationViewSet(viewsets.ModelViewSet):
    """
    Sage-style Bank Reconciliation management.
    Supports creating with auto-populated items, checkbox toggling, and completing.
    """
    queryset = BankReconciliation.objects.select_related(
        'bank_account', 'created_by', 'completed_by'
    ).all()
    serializer_class = BankReconciliationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['bank_account', 'bank_account__currency', 'status']
    search_fields = ['bank_account__name', 'notes']
    ordering_fields = ['period_end', 'period_start', 'created_at', 'statement_balance']
    ordering = ['-period_end']

    def get_serializer_class(self):
        if self.action == 'create':
            return ReconciliationCreateSerializer
        return BankReconciliationSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create a new Sage-style reconciliation with auto-populated items."""
        import calendar
        serializer = ReconciliationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        bank_account = serializer.validated_data['bank_account']
        month = serializer.validated_data['month']
        year = serializer.validated_data['year']
        statement_balance = serializer.validated_data['statement_balance']
        notes = serializer.validated_data.get('notes', '')

        # Check no existing DRAFT for same bank+month+year
        existing = BankReconciliation.objects.filter(
            bank_account=bank_account, month=month, year=year, status='draft'
        ).first()
        if existing:
            return Response(
                {'error': f'A draft reconciliation already exists for {calendar.month_name[month]} {year}. Please complete or delete it first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Compute period_start and period_end
        _, last_day = calendar.monthrange(year, month)
        from datetime import date
        period_start = date(year, month, 1)
        period_end = date(year, month, last_day)

        # Compute book_balance from GL
        gl_balance = GeneralLedger.objects.filter(
            account=bank_account.gl_account,
            date__lte=period_end
        ).aggregate(
            total_debit=Sum('debit_amount'),
            total_credit=Sum('credit_amount')
        )
        total_debit = gl_balance['total_debit'] or Decimal('0')
        total_credit = gl_balance['total_credit'] or Decimal('0')
        book_balance = total_debit - total_credit

        # Create the reconciliation
        recon = BankReconciliation.objects.create(
            bank_account=bank_account,
            month=month,
            year=year,
            period_start=period_start,
            period_end=period_end,
            statement_balance=statement_balance,
            book_balance=book_balance,
            notes=notes,
            created_by=request.user,
        )

        # Populate ReconciliationItem rows
        # Receipts (money in)
        from apps.billing.models import Receipt
        receipts = Receipt.objects.filter(
            bank_account=bank_account,
            date__gte=period_start,
            date__lte=period_end,
            journal__isnull=False,
        ).select_related('tenant', 'invoice')

        receipt_items = []
        for r in receipts:
            receipt_items.append(ReconciliationItem(
                reconciliation=recon,
                item_type='receipt',
                receipt=r,
                date=r.date,
                reference=r.receipt_number,
                description=f'{r.tenant.name} - {r.get_payment_method_display()}',
                amount=r.amount,
            ))
        if receipt_items:
            ReconciliationItem.objects.bulk_create(receipt_items)

        # Payments (money out) — GL credits to bank's GL account
        gl_payments = GeneralLedger.objects.filter(
            account=bank_account.gl_account,
            credit_amount__gt=0,
            date__gte=period_start,
            date__lte=period_end,
        ).select_related('journal_entry', 'journal_entry__journal')

        payment_items = []
        for gl in gl_payments:
            journal = gl.journal_entry.journal if gl.journal_entry else None
            payment_items.append(ReconciliationItem(
                reconciliation=recon,
                item_type='payment',
                gl_entry=gl,
                date=gl.date,
                reference=journal.reference if journal else '',
                description=gl.description,
                amount=gl.credit_amount,
            ))
        if payment_items:
            ReconciliationItem.objects.bulk_create(payment_items)

        # Return full workspace
        recon = BankReconciliation.objects.select_related(
            'bank_account', 'created_by', 'completed_by'
        ).prefetch_related('items').get(pk=recon.pk)
        return Response(
            ReconciliationWorkspaceSerializer(recon).data,
            status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        """Allow updating statement_balance on DRAFT reconciliations."""
        recon = self.get_object()
        if recon.status != 'draft':
            return Response(
                {'error': 'Only draft reconciliations can be updated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        statement_balance = request.data.get('statement_balance')
        if statement_balance is not None:
            recon.statement_balance = Decimal(str(statement_balance))
            recon.save(update_fields=['statement_balance', 'updated_at'])
        recon = BankReconciliation.objects.select_related(
            'bank_account',
        ).prefetch_related('items').get(pk=recon.pk)
        return Response(ReconciliationWorkspaceSerializer(recon).data)

    @action(detail=True, methods=['post'])
    def toggle_item(self, request, pk=None):
        """Toggle a single reconciliation item's is_reconciled state."""
        reconciliation = self.get_object()
        if reconciliation.status != 'draft':
            return Response(
                {'error': 'Cannot modify a completed reconciliation'},
                status=status.HTTP_400_BAD_REQUEST
            )
        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'error': 'item_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            item = reconciliation.items.get(id=item_id)
        except ReconciliationItem.DoesNotExist:
            return Response(
                {'error': 'Item not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        item.is_reconciled = not item.is_reconciled
        item.reconciled_at = timezone.now() if item.is_reconciled else None
        item.save(update_fields=['is_reconciled', 'reconciled_at'])

        # Recompute summary
        all_items = list(reconciliation.items.all())
        reconciled_count = sum(1 for i in all_items if i.is_reconciled)
        unreconciled_count = sum(1 for i in all_items if not i.is_reconciled)

        unticked_payments = sum(i.amount for i in all_items if i.item_type == 'payment' and not i.is_reconciled)
        unticked_receipts = sum(i.amount for i in all_items if i.item_type == 'receipt' and not i.is_reconciled)
        diff = (reconciliation.statement_balance - reconciliation.book_balance) + unticked_payments - unticked_receipts

        return Response({
            'item_id': item.id,
            'is_reconciled': item.is_reconciled,
            'difference': str(diff),
            'is_balanced': abs(diff) < Decimal('0.01'),
            'reconciled_count': reconciled_count,
            'unreconciled_count': unreconciled_count,
        })

    @action(detail=True, methods=['post'])
    def select_all(self, request, pk=None):
        """Mark all items as reconciled."""
        reconciliation = self.get_object()
        if reconciliation.status != 'draft':
            return Response(
                {'error': 'Cannot modify a completed reconciliation'},
                status=status.HTTP_400_BAD_REQUEST
            )
        now = timezone.now()
        reconciliation.items.filter(is_reconciled=False).update(
            is_reconciled=True, reconciled_at=now
        )
        recon = BankReconciliation.objects.select_related(
            'bank_account',
        ).prefetch_related('items').get(pk=reconciliation.pk)
        return Response(ReconciliationWorkspaceSerializer(recon).data)

    @action(detail=True, methods=['post'])
    def deselect_all(self, request, pk=None):
        """Mark all items as unreconciled."""
        reconciliation = self.get_object()
        if reconciliation.status != 'draft':
            return Response(
                {'error': 'Cannot modify a completed reconciliation'},
                status=status.HTTP_400_BAD_REQUEST
            )
        reconciliation.items.filter(is_reconciled=True).update(
            is_reconciled=False, reconciled_at=None
        )
        recon = BankReconciliation.objects.select_related(
            'bank_account',
        ).prefetch_related('items').get(pk=reconciliation.pk)
        return Response(ReconciliationWorkspaceSerializer(recon).data)

    @action(detail=True, methods=['get'])
    def workspace(self, request, pk=None):
        """Get full workspace data for a reconciliation."""
        reconciliation = BankReconciliation.objects.select_related(
            'bank_account', 'created_by', 'completed_by'
        ).prefetch_related('items').get(pk=self.get_object().pk)
        return Response(ReconciliationWorkspaceSerializer(reconciliation).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete the reconciliation. Allows non-zero difference (user requirement)."""
        reconciliation = self.get_object()

        if reconciliation.status == 'completed':
            return Response(
                {'error': 'Reconciliation is already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reconciliation.status = 'completed'
        reconciliation.completed_at = timezone.now()
        reconciliation.completed_by = request.user
        reconciliation.save()

        # Update bank account
        reconciliation.bank_account.last_reconciled_date = reconciliation.period_end
        reconciliation.bank_account.last_reconciled_balance = reconciliation.statement_balance
        reconciliation.bank_account.save(update_fields=['last_reconciled_date', 'last_reconciled_balance', 'updated_at'])

        AuditTrail.objects.create(
            action='reconciliation_completed',
            model_name='BankReconciliation',
            record_id=reconciliation.id,
            changes={
                'bank_account': reconciliation.bank_account.name,
                'period': f'{reconciliation.month}/{reconciliation.year}',
                'statement_balance': str(reconciliation.statement_balance),
                'difference': str(reconciliation.difference),
            },
            user=request.user
        )

        return Response(BankReconciliationSerializer(reconciliation).data)

    @action(detail=True, methods=['get'])
    def export_excel(self, request, pk=None):
        """Export reconciliation to Excel/CSV format."""
        reconciliation = self.get_object()
        items = reconciliation.items.all()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="reconciliation_{reconciliation.id}.csv"'

        writer = csv.writer(response)

        writer.writerow(['Bank Reconciliation Report'])
        writer.writerow([''])
        writer.writerow(['Bank Account:', reconciliation.bank_account.name])
        writer.writerow(['Period:', f'{reconciliation.period_start} to {reconciliation.period_end}'])
        writer.writerow([''])
        writer.writerow(['Statement Balance:', reconciliation.statement_balance])
        writer.writerow(['Book Balance:', reconciliation.book_balance])
        writer.writerow(['Difference:', reconciliation.difference])
        writer.writerow(['Status:', 'Balanced' if reconciliation.is_balanced else 'Unbalanced'])
        writer.writerow([''])

        writer.writerow(['Reconciliation Items'])
        writer.writerow(['Date', 'Reference', 'Description', 'Type', 'Amount', 'Reconciled'])

        for item in items:
            writer.writerow([
                item.date,
                item.reference,
                item.description,
                item.item_type,
                item.amount,
                'Yes' if item.is_reconciled else 'No'
            ])

        return response

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get reconciliation summary for all bank accounts."""
        bank_accounts = BankAccount.objects.filter(is_active=True)

        summary = []
        for account in bank_accounts:
            last_recon = account.reconciliations.filter(status='completed').first()
            pending = account.transactions.filter(status='unreconciled').count()

            summary.append({
                'bank_account': BankAccountSerializer(account).data,
                'last_reconciled': last_recon.period_end if last_recon else None,
                'last_reconciled_balance': account.last_reconciled_balance,
                'pending_transactions': pending,
                'unreconciled_difference': account.unreconciled_difference
            })

        return Response(summary)


class ExpenseCategoryViewSet(TenantSchemaValidationMixin, ProtectedDeleteMixin, viewsets.ModelViewSet):
    """
    CRUD for Expense Categories.
    Allows dynamic creation of expense item types.
    """
    queryset = ExpenseCategory.objects.select_related('gl_account').all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active', 'is_deductible', 'requires_approval']
    search_fields = ['code', 'name', 'description']
    ordering = ['name']

    def destroy(self, request, *args, **kwargs):
        """Prevent deletion of system categories."""
        category = self.get_object()
        if category.is_system:
            return Response(
                {'error': 'System categories cannot be deleted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        """Seed default expense categories."""
        # Get or create expense GL account
        expense_account, _ = ChartOfAccount.objects.get_or_create(
            code='5000',
            defaults={
                'name': 'Operating Expenses',
                'account_type': 'expense',
                'account_subtype': 'operating_expense',
                'is_system': True
            }
        )

        defaults = [
            ('MAINT', 'Maintenance', 'Property maintenance and repairs'),
            ('UTIL', 'Utilities', 'Water, electricity, and other utilities'),
            ('MGMT', 'Management Fees', 'Property management fees'),
            ('INSUR', 'Insurance', 'Property insurance'),
            ('LEGAL', 'Legal Fees', 'Legal and professional fees'),
            ('SECUR', 'Security', 'Security services'),
            ('CLEAN', 'Cleaning', 'Cleaning and sanitation'),
            ('GARDEN', 'Gardening', 'Landscaping and gardening'),
            ('RATES', 'Rates & Taxes', 'Municipal rates and taxes'),
        ]

        created = 0
        for code, name, desc in defaults:
            _, was_created = ExpenseCategory.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'description': desc,
                    'gl_account': expense_account,
                    'is_system': True
                }
            )
            if was_created:
                created += 1

        return Response({'message': f'Created {created} default expense categories'})


class JournalReallocationViewSet(viewsets.ModelViewSet):
    """
    Journal Reallocation management.
    Allows moving expenses between accounts.
    """
    queryset = JournalReallocation.objects.select_related(
        'original_entry', 'new_entry', 'from_account', 'to_account', 'reallocated_by'
    ).all()
    serializer_class = JournalReallocationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['from_account', 'to_account', 'reallocated_by']
    search_fields = ['reason', 'from_account__name', 'to_account__name', 'from_account__code', 'to_account__code']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return ReallocationCreateSerializer
        return JournalReallocationSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create a new reallocation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        original_entry = JournalEntry.objects.get(id=serializer.validated_data['original_entry_id'])
        to_account = ChartOfAccount.objects.get(id=serializer.validated_data['to_account_id'])
        amount = serializer.validated_data['amount']
        reason = serializer.validated_data['reason']

        reallocation = JournalReallocation.create_reallocation(
            original_entry=original_entry,
            to_account=to_account,
            amount=amount,
            reason=reason,
            user=request.user
        )

        return Response(
            JournalReallocationSerializer(reallocation).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'])
    def by_account(self, request):
        """Get reallocations grouped by account."""
        from_account = request.query_params.get('from_account')
        to_account = request.query_params.get('to_account')

        queryset = self.get_queryset()

        if from_account:
            queryset = queryset.filter(from_account_id=from_account)
        if to_account:
            queryset = queryset.filter(to_account_id=to_account)

        total = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        return Response({
            'count': queryset.count(),
            'total_reallocated': total,
            'reallocations': JournalReallocationSerializer(queryset, many=True).data
        })


class IncomeTypeViewSet(TenantSchemaValidationMixin, ProtectedDeleteMixin, viewsets.ModelViewSet):
    """
    CRUD for Income Types.
    Defines income categories for detailed analysis (Rent, Levy, Special Levy, etc.).
    """
    queryset = IncomeType.objects.select_related('gl_account').all()
    serializer_class = IncomeTypeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active', 'is_commissionable', 'is_vatable', 'management_type', 'is_system']
    search_fields = ['code', 'name', 'description']
    ordering = ['display_order', 'name']

    def perform_destroy(self, instance):
        if instance.is_system:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('System income types cannot be deleted.')
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.is_system:
            # Only allow updating certain fields on system records
            allowed = {'is_active', 'display_order', 'description'}
            changed = set(serializer.validated_data.keys())
            disallowed = changed - allowed
            if disallowed:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    f'System income types only allow changes to: {", ".join(allowed)}. '
                    f'Cannot change: {", ".join(disallowed)}'
                )
        serializer.save()

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        """Seed default income types."""
        # Get or create revenue GL account
        income_account, _ = ChartOfAccount.objects.get_or_create(
            code='4000',
            defaults={
                'name': 'Rental Income',
                'account_type': 'revenue',
                'account_subtype': 'rental_income',
                'is_system': True
            }
        )

        # (code, name, subtype, commissionable, vatable, order, management_type)
        defaults = [
            ('RENT', 'Rental Income', 'rental_income', True, False, 1, 'rental'),
            ('LEVY', 'Levy Income', 'levy_income', False, False, 2, 'levy'),
            ('SPECIAL_LEVY', 'Special Levy', 'special_levy_income', False, False, 3, 'levy'),
            ('RATES', 'Rates Recovery', 'rates_income', False, False, 4, 'both'),
            ('PARKING', 'Parking Income', 'parking_income', True, False, 5, 'levy'),
            ('VAT', 'VAT Income', 'vat_income', False, True, 6, 'rental'),
            ('DEPOSIT', 'Deposit Income', 'other_income', False, False, 7, 'both'),
            ('OTHER', 'Other Income', 'other_income', True, False, 8, 'both'),
        ]

        created = 0
        for code, name, subtype, commissionable, vatable, order, mgmt_type in defaults:
            gl_acct, _ = ChartOfAccount.objects.get_or_create(
                account_subtype=subtype,
                defaults={
                    'code': f'4{order}00',
                    'name': name,
                    'account_type': 'revenue',
                    'is_system': True
                }
            )

            _, was_created = IncomeType.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'gl_account': gl_acct,
                    'is_commissionable': commissionable,
                    'is_vatable': vatable,
                    'display_order': order,
                    'is_system': True,
                    'management_type': mgmt_type,
                }
            )
            if was_created:
                created += 1

        return Response({'message': f'Created {created} default income types'})

    @action(detail=False, methods=['get'])
    def for_invoicing(self, request):
        """Get income types available for invoicing."""
        income_types = self.get_queryset().filter(is_active=True)
        return Response([
            {
                'id': it.id,
                'code': it.code,
                'name': it.name,
                'is_commissionable': it.is_commissionable,
                'commission_rate': it.default_commission_rate,
                'is_vatable': it.is_vatable,
                'vat_rate': it.vat_rate
            }
            for it in income_types
        ])
