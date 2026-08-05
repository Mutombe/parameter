"""Intraproperty Transfer journals (brand spec — PARAMETER ADJUSTMENTS).

Moves value between two categories for the SAME payer within the SAME
property — e.g. $100 receipted to Rates that belonged to Maintenance —
without reversing and re-doing the whole receipt:

    1. Dr payer from-pocket / Cr payer to-pocket          (AR nets zero)
    2. Bank untouched (not a refund)
    3. Dr landlord from-pocket / Cr landlord to-pocket, both carrying the
       Intraproperty Transfers GL (9200) as their extension
    4. Dr Unpaid[to] / Cr Unpaid[from]  (Unpaid accounts stay true)
    5. Reverse the commission originally charged at the FROM rate on the
       transferred value
    6. Charge the commission the TO category would have attracted
    7. The IntrapropertyTransfer record re-attributes the value's income
       category for the Income Statement and related reports

Commission math follows the spec: the configured percentage is the GROSS
deduction; net = gross / (1 + VAT rate); VAT = gross - net.
(E.g. $100 @10% -> $10 gross = $8.70 commission + $1.30 VAT at 15%.)
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

TWO = Decimal('0.01')


def _income_type_for(category):
    from apps.accounting.models import IncomeType
    it = IncomeType.objects.filter(code__iexact=category).first()
    if it:
        return it
    name_map = {
        'rent': 'rental', 'levy': 'levy', 'special_levy': 'special levy',
        'maintenance': 'maintenance', 'parking': 'parking', 'rates': 'rates',
        'vat': 'vat', 'deposit': 'deposit',
    }
    frag = name_map.get(category, category)
    return IncomeType.objects.filter(name__icontains=frag).first()


def commission_pct_for(property_obj, category):
    """Gross commission %% for (property, category): per-property override
    first, then the income type's default, else zero.

    Non-commissionable categories (Rates, Levy, Special Levy, Maintenance,
    Rates, Deposit, VAT) never attract commission — the income type carries a
    non-zero `default_commission_rate` for other purposes, so `is_commissionable`
    is the authority. This keeps a plain Rates -> Maintenance transfer a pure
    three-step move with no commission legs, exactly as specified.
    """
    from apps.masterfile.models import PropertyIncomeCommission
    it = _income_type_for(category)
    if it is None:
        return Decimal('0'), Decimal('15')
    vat_pct = Decimal(str(it.vat_rate or '15')) if getattr(it, 'is_vatable', True) else Decimal('0')
    if not getattr(it, 'is_commissionable', True):
        return Decimal('0'), vat_pct
    override = None
    if property_obj is not None:
        override = PropertyIncomeCommission.objects.filter(
            property=property_obj, income_type=it).first()
    if override is not None and override.rate is not None:
        return Decimal(str(override.rate)), vat_pct
    return Decimal(str(it.default_commission_rate or '0')), vat_pct


def _gross_split(amount, pct, vat_pct):
    gross = (Decimal(str(amount)) * pct / Decimal('100')).quantize(TWO, ROUND_HALF_UP)
    net = (gross / (Decimal('1') + vat_pct / Decimal('100'))).quantize(TWO, ROUND_HALF_UP)
    return gross, net, gross - net


@transaction.atomic
def intraproperty_transfer(payer, property_obj, from_category, to_category,
                           amount, currency='USD', user=None, description=''):
    """Execute the 7-step transfer. Returns the IntrapropertyTransfer record."""
    from django.utils import timezone
    from apps.accounting.models import (
        SubsidiaryAccount, Journal, JournalEntry, ChartOfAccount,
        IntrapropertyTransfer,
    )
    from apps.billing.models import get_unpaid_account

    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError('Transfer amount must be positive')
    if from_category == to_category:
        raise ValueError('Choose two different categories')
    landlord = property_obj.landlord

    payer_from = SubsidiaryAccount.get_or_create_for_tenant_category(
        payer, category=from_category, currency=currency)
    payer_to = SubsidiaryAccount.get_or_create_for_tenant_category(
        payer, category=to_category, currency=currency)
    ll_from = SubsidiaryAccount.get_or_create_for_landlord_category(
        landlord, category=from_category, currency=currency)
    ll_to = SubsidiaryAccount.get_or_create_for_landlord_category(
        landlord, category=to_category, currency=currency)
    unpaid_from = get_unpaid_account(from_category)
    unpaid_to = get_unpaid_account(to_category)
    transfers_gl, _ = ChartOfAccount.objects.get_or_create(
        code='9200', defaults={'name': 'Intraproperty Transfers',
                               'account_type': 'equity',
                               'account_subtype': 'retained_earnings',
                               'is_system': True})

    label = (description or
             f'Intraproperty transfer {from_category} -> {to_category}: '
             f'{currency}{amount} ({payer.name} @ {property_obj.name})')

    # ── Steps 1, 3, 4 — the value movement journal ──
    j = Journal.objects.create(
        journal_type=Journal.JournalType.GENERAL, date=timezone.now().date(),
        description=label, reference='ITF', currency=currency, created_by=user)
    JournalEntry.objects.create(journal=j, subsidiary_account=payer_from,
                                description=label, debit_amount=amount,
                                credit_amount=Decimal('0'), source_type='transfer')
    JournalEntry.objects.create(journal=j, subsidiary_account=payer_to,
                                description=label, credit_amount=amount,
                                debit_amount=Decimal('0'), source_type='transfer')
    JournalEntry.objects.create(journal=j, subsidiary_account=ll_from,
                                extension_account=transfers_gl,
                                description=label, debit_amount=amount,
                                credit_amount=Decimal('0'), source_type='transfer')
    JournalEntry.objects.create(journal=j, subsidiary_account=ll_to,
                                extension_account=transfers_gl,
                                description=label, credit_amount=amount,
                                debit_amount=Decimal('0'), source_type='transfer')
    JournalEntry.objects.create(journal=j, account=unpaid_to, description=label,
                                debit_amount=amount, credit_amount=Decimal('0'),
                                source_type='transfer')
    JournalEntry.objects.create(journal=j, account=unpaid_from, description=label,
                                credit_amount=amount, debit_amount=Decimal('0'),
                                source_type='transfer')
    j.post(user)

    # ── Steps 5 & 6 — commission re-allocation ──
    from_pct, from_vat = commission_pct_for(property_obj, from_category)
    to_pct, to_vat = commission_pct_for(property_obj, to_category)
    rev_gross, rev_net, rev_vat = _gross_split(amount, from_pct, from_vat)
    new_gross, new_net, new_vat = _gross_split(amount, to_pct, to_vat)

    jc = None
    if rev_gross > 0 or new_gross > 0:
        commission_gl = (ChartOfAccount.objects
                         .filter(account_subtype='commission_income')
                         .order_by('id').first())
        if commission_gl is None:
            commission_gl, _ = ChartOfAccount.objects.get_or_create(
                code='6000', defaults={'name': 'Agent Commission',
                                       'account_type': 'expense',
                                       'account_subtype': 'commission_income',
                                       'is_system': True})
        vat_gl, _ = ChartOfAccount.objects.get_or_create(
            code='2110', defaults={'name': 'VAT Payable (Commission)',
                                   'account_type': 'liability',
                                   'account_subtype': 'vat_payable',
                                   'is_system': True})
        clabel = f'Commission re-allocation on {label}'
        jc = Journal.objects.create(
            journal_type=Journal.JournalType.GENERAL, date=timezone.now().date(),
            description=clabel, reference='ITF-COM', currency=currency,
            created_by=user)
        if rev_gross > 0:
            # reverse the FROM-rate commission: funds return to the landlord
            JournalEntry.objects.create(journal=jc, subsidiary_account=ll_to,
                                        extension_account=commission_gl,
                                        description=f'Reversal of {from_pct}% commission ({from_category})',
                                        credit_amount=rev_gross, debit_amount=Decimal('0'),
                                        source_type='transfer')
            JournalEntry.objects.create(journal=jc, account=commission_gl,
                                        description=clabel, debit_amount=rev_net,
                                        credit_amount=Decimal('0'), source_type='transfer')
            # VAT line only when the category actually attracts VAT — a
            # zero-amount entry fails the debit-or-credit invariant.
            if rev_vat > 0:
                JournalEntry.objects.create(journal=jc, account=vat_gl,
                                            description=clabel, debit_amount=rev_vat,
                                            credit_amount=Decimal('0'), source_type='transfer')
        if new_gross > 0:
            # charge the TO-rate commission as if receipted correctly
            JournalEntry.objects.create(journal=jc, subsidiary_account=ll_to,
                                        extension_account=commission_gl,
                                        description=f'{to_pct}% commission ({to_category})',
                                        debit_amount=new_gross, credit_amount=Decimal('0'),
                                        source_type='transfer')
            JournalEntry.objects.create(journal=jc, account=commission_gl,
                                        description=clabel, credit_amount=new_net,
                                        debit_amount=Decimal('0'), source_type='transfer')
            if new_vat > 0:
                JournalEntry.objects.create(journal=jc, account=vat_gl,
                                            description=clabel, credit_amount=new_vat,
                                            debit_amount=Decimal('0'), source_type='transfer')
        jc.post(user)

    return IntrapropertyTransfer.objects.create(
        tenant=payer, property=property_obj,
        from_category=from_category, to_category=to_category,
        amount=amount, currency=currency,
        commission_reversed=rev_gross, commission_charged=new_gross,
        journal=j, commission_journal=jc,
        narration=label, created_by=user)
