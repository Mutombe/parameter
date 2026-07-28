"""Currency Conversion journals (brand spec — PARAMETER ADJUSTMENTS).

Partial Conversion
    Converts a payer's SECONDARY-currency credit balance into the primary
    currency, touching ONLY the payer's two pockets and the two Unpaid
    accounts (per category). Accounts Receivable follows automatically via
    the pocket-first control mirror. Landlord pockets, commission, VAT and
    bank accounts are untouched.

    Per category with a credit balance in the from-currency pocket:
        Journal A (from-currency):  Dr payer pocket  /  Cr Unpaid[cat]
        Journal B (to-currency):    Cr payer pocket  /  Dr Unpaid[cat]
    Narration: "ZWG500 converted to USD$20".

Full Conversion
    Mirrors an ENTIRE receipt into the other currency: the original
    receipt is reversed (negative receipt, same currency) and re-receipted
    in the target currency at the conversion rate — every account the
    original touched (bank, pockets, Unpaid, commission, VAT, controls)
    participates, exactly as if the payment had been made in the other
    currency.

Rate resolution: explicit override > property pre-configured rate >
company Currency Settings default.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction


def resolve_rate(override=None, property_obj=None):
    """ZWG-per-USD rate: override > property rate > Currency Settings."""
    if override:
        return Decimal(str(override))
    if property_obj is not None and getattr(property_obj, 'exchange_rate', None):
        return Decimal(str(property_obj.exchange_rate))
    from django.db import connection
    tenant = getattr(connection, 'tenant', None)
    default = getattr(tenant, 'exchange_rate', None) or Decimal('25')
    return Decimal(str(default))


def convert_amount(amount, from_currency, to_currency, rate):
    """rate is ZWG per USD."""
    amount = Decimal(str(amount))
    if from_currency == to_currency:
        return amount
    if from_currency == 'ZWG' and to_currency == 'USD':
        return (amount / rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if from_currency == 'USD' and to_currency == 'ZWG':
        return (amount * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    raise ValueError(f'Unsupported currency pair {from_currency}->{to_currency}')


def _credit_balance(pocket):
    """Positive number = pocket holds a credit balance (payer paid ahead)."""
    from django.db.models import Sum
    from apps.accounting.models import SubsidiaryTransaction
    t = SubsidiaryTransaction.objects.filter(
        account=pocket, is_consolidated=False,
    ).aggregate(dr=Sum('debit_amount'), cr=Sum('credit_amount'))
    dr, cr = t['dr'] or Decimal('0'), t['cr'] or Decimal('0')
    return cr - dr  # payer pockets are debit-normal; credit balance = cr>dr


@transaction.atomic
def partial_convert_payer(payer, from_currency='ZWG', to_currency='USD',
                          rate=None, categories=None, user=None,
                          property_obj=None):
    """Run Partial Conversion for one tenant/account-holder.

    Converts every from-currency pocket credit balance (optionally limited
    to `categories`) into the to-currency pocket of the SAME category.
    Returns a list of CurrencyConversion records (may be empty).
    """
    from apps.accounting.models import (
        SubsidiaryAccount, Journal, JournalEntry, CurrencyConversion,
    )
    from apps.billing.models import get_unpaid_account, UNPAID_ACCOUNT_MAP
    from django.utils import timezone

    rate = resolve_rate(rate, property_obj)
    cats = categories or list(UNPAID_ACCOUNT_MAP.keys())
    done = []
    for cat in cats:
        from_pocket = SubsidiaryAccount.objects.filter(
            tenant=payer, category=cat, currency=from_currency,
        ).first()
        if from_pocket is None:
            continue
        bal = _credit_balance(from_pocket)
        if bal <= 0:
            continue
        converted = convert_amount(bal, from_currency, to_currency, rate)
        if converted <= 0:
            continue
        to_pocket = SubsidiaryAccount.get_or_create_for_tenant_category(
            payer, category=cat, currency=to_currency)
        unpaid = get_unpaid_account(cat)
        narration = f'{from_currency}{bal} converted to {to_currency}${converted}'

        # Journal A — clear the from-currency side
        ja = Journal.objects.create(
            journal_type=Journal.JournalType.GENERAL,
            date=timezone.now().date(),
            description=narration, reference=f'CNV-{from_currency}',
            currency=from_currency, created_by=user)
        JournalEntry.objects.create(
            journal=ja, subsidiary_account=from_pocket,
            description=narration, debit_amount=bal, credit_amount=Decimal('0'),
            source_type='conversion')
        JournalEntry.objects.create(
            journal=ja, account=unpaid, description=narration,
            credit_amount=bal, debit_amount=Decimal('0'), source_type='conversion')
        ja.post(user)

        # Journal B — mirror into the to-currency side
        jb = Journal.objects.create(
            journal_type=Journal.JournalType.GENERAL,
            date=timezone.now().date(),
            description=narration, reference=f'CNV-{to_currency}',
            currency=to_currency, created_by=user)
        JournalEntry.objects.create(
            journal=jb, subsidiary_account=to_pocket,
            description=narration, credit_amount=converted, debit_amount=Decimal('0'),
            source_type='conversion')
        JournalEntry.objects.create(
            journal=jb, account=unpaid, description=narration,
            debit_amount=converted, credit_amount=Decimal('0'), source_type='conversion')
        jb.post(user)

        done.append(CurrencyConversion.objects.create(
            scope='partial', tenant=payer, category=cat,
            from_currency=from_currency, to_currency=to_currency,
            rate=rate, amount_from=bal, amount_to=converted,
            journal_from=ja, journal_to=jb, narration=narration,
            created_by=user))
    return done


@transaction.atomic
def full_convert_receipt(receipt, rate=None, user=None):
    """Mirror an entire receipt into the other currency (Full Conversion)."""
    from apps.accounting.models import CurrencyConversion
    from apps.billing.models import Receipt

    from_currency = receipt.currency or 'USD'
    to_currency = 'USD' if from_currency == 'ZWG' else 'ZWG'
    prop = None
    if receipt.invoice_id and receipt.invoice and receipt.invoice.unit_id and receipt.invoice.unit:
        prop = receipt.invoice.unit.property
    rate = resolve_rate(rate, prop)
    converted = convert_amount(receipt.amount, from_currency, to_currency, rate)
    narration = f'{from_currency}{receipt.amount} converted to {to_currency}${converted}'

    # Reverse the original (negative receipt, same currency) …
    reversal = Receipt.objects.create(
        tenant=receipt.tenant, invoice=receipt.invoice,
        amount=-receipt.amount, currency=from_currency,
        payment_method=receipt.payment_method, reference=receipt.reference,
        bank_account=receipt.bank_account, income_type=receipt.income_type,
        sub_account_category=receipt.sub_account_category,
        description=f'Full conversion out: {narration}',
        date=receipt.date, created_by=user)
    # … and mirror it in the target currency, through the SAME engine so
    # every account the original touched participates.
    mirrored = Receipt.objects.create(
        tenant=receipt.tenant, invoice=receipt.invoice,
        amount=converted, currency=to_currency,
        payment_method=receipt.payment_method, reference=receipt.reference,
        bank_account=receipt.bank_account, income_type=receipt.income_type,
        sub_account_category=receipt.sub_account_category,
        description=f'Full conversion in: {narration}',
        date=receipt.date, created_by=user)

    return CurrencyConversion.objects.create(
        scope='full', tenant=receipt.tenant,
        category=receipt.sub_account_category or '',
        from_currency=from_currency, to_currency=to_currency,
        rate=rate, amount_from=receipt.amount, amount_to=converted,
        receipt=receipt, reference_from=reversal.receipt_number,
        reference_to=mirrored.receipt_number, narration=narration,
        created_by=user)
