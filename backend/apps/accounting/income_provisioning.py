"""
Income Account Auto-Provisioning.
Auto-creates IncomeType and ChartOfAccount records based on property management type.
"""
from .models import IncomeType, ChartOfAccount


# Definitions: (code, name, gl_subtype, commissionable, vatable, order, management_type)
RENTAL_INCOME_TYPES = [
    ('RENT', 'Rental Income', 'rental_income', True, False, 1, 'rental'),
    ('RATES', 'Rates Recovery', 'rates_income', False, False, 4, 'both'),
    ('VAT', 'VAT Income', 'vat_income', False, True, 6, 'rental'),
    ('MAINTENANCE', 'Maintenance Recovery', 'other_income', False, False, 9, 'both'),
]

LEVY_INCOME_TYPES = [
    ('LEVY', 'Levy Income', 'levy_income', False, False, 2, 'levy'),
    ('SPECIAL_LEVY', 'Special Levy', 'special_levy_income', False, False, 3, 'levy'),
    ('RATES', 'Rates Recovery', 'rates_income', False, False, 4, 'both'),
    ('MAINTENANCE', 'Maintenance Recovery', 'other_income', False, False, 9, 'both'),
    ('PARKING', 'Parking Income', 'parking_income', True, False, 5, 'levy'),
]

CURRENCIES = ['USD', 'ZWG']


def provision_income_accounts(property_instance):
    """
    Auto-create IncomeType + COA records based on property.management_type.
    Uses get_or_create for idempotency.
    """
    if property_instance.management_type == 'levy':
        type_defs = LEVY_INCOME_TYPES
    else:
        type_defs = RENTAL_INCOME_TYPES

    created_types = []

    for code, name, gl_subtype, commissionable, vatable, order, mgmt_type in type_defs:
        # Create GL accounts for each currency
        for currency in CURRENCIES:
            suffix = 'Z' if currency == 'ZWG' else ''
            gl_code = f'4{order}00{suffix}'
            gl_name = f'{name} ({currency})'

            ChartOfAccount.objects.get_or_create(
                code=gl_code,
                defaults={
                    'name': gl_name,
                    'account_type': 'revenue',
                    'account_subtype': gl_subtype,
                    'is_system': True,
                    'currency': currency,
                }
            )

        # Create the IncomeType (linked to USD GL account)
        usd_gl_code = f'4{order}00'
        gl_account = ChartOfAccount.objects.get(code=usd_gl_code)

        income_type, was_created = IncomeType.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'gl_account': gl_account,
                'is_commissionable': commissionable,
                'is_vatable': vatable,
                'display_order': order,
                'is_system': True,
                'management_type': mgmt_type,
            }
        )
        if was_created:
            created_types.append(income_type)

    return created_types
