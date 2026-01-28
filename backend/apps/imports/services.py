"""Services for data import processing."""
import pandas as pd
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction
from django.utils import timezone

from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement


# Column mappings for each entity type
COLUMN_MAPPINGS = {
    'landlords': {
        'required': ['name', 'email', 'phone', 'address'],
        'optional': ['landlord_type', 'alt_phone', 'bank_name', 'bank_branch',
                     'account_number', 'account_name', 'tax_id', 'vat_registered',
                     'vat_number', 'commission_rate', 'preferred_currency',
                     'payment_frequency', 'notes'],
        'defaults': {
            'landlord_type': 'individual',
            'preferred_currency': 'USD',
            'payment_frequency': 'monthly',
            'commission_rate': Decimal('10.00'),
        }
    },
    'properties': {
        'required': ['name', 'landlord_ref', 'address', 'city'],
        'optional': ['property_type', 'suburb', 'country', 'unit_definition',
                     'year_built', 'total_units', 'total_floors', 'parking_spaces',
                     'notes'],
        'defaults': {
            'property_type': 'residential',
            'country': 'Zimbabwe',
            'total_units': 1,
            'total_floors': 1,
        }
    },
    'tenants': {
        'required': ['name', 'email', 'phone', 'id_number'],
        'optional': ['tenant_type', 'account_type', 'alt_phone', 'id_type',
                     'emergency_contact_name', 'emergency_contact_phone',
                     'emergency_contact_relation', 'employer_name',
                     'employer_address', 'occupation', 'notes'],
        'defaults': {
            'tenant_type': 'individual',
            'account_type': 'rental',
            'id_type': 'national_id',
        }
    },
    'leases': {
        'required': ['tenant_ref', 'property_ref', 'unit_number', 'start_date',
                     'end_date', 'monthly_rent'],
        'optional': ['currency', 'deposit_amount', 'billing_day', 'grace_period_days',
                     'annual_escalation_rate', 'terms_and_conditions', 'special_conditions'],
        'defaults': {
            'currency': 'USD',
            'billing_day': 1,
            'grace_period_days': 5,
            'annual_escalation_rate': Decimal('0'),
        }
    },
}


def parse_file(file_path, file_name):
    """
    Parse uploaded file and return dict of DataFrames.

    Supports:
    - Excel with multiple sheets (combined import)
    - Excel with single sheet (single entity)
    - CSV (single entity)

    Returns: {sheet_name: DataFrame}
    """
    file_ext = file_name.lower().split('.')[-1]

    if file_ext == 'csv':
        # CSV is always single entity - detect type from columns
        df = pd.read_csv(file_path)
        entity_type = detect_entity_type(df.columns.tolist())
        return {entity_type: df}

    elif file_ext in ['xlsx', 'xls']:
        # Excel can be single or multi-sheet
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names

        result = {}
        for sheet in sheet_names:
            # Normalize sheet name to entity type
            normalized = sheet.lower().strip()
            if normalized in COLUMN_MAPPINGS:
                result[normalized] = pd.read_excel(excel_file, sheet_name=sheet)
            else:
                # Try to detect entity type from columns
                df = pd.read_excel(excel_file, sheet_name=sheet)
                entity_type = detect_entity_type(df.columns.tolist())
                if entity_type:
                    result[entity_type] = df

        return result

    else:
        raise ValueError(f"Unsupported file type: {file_ext}")


def detect_entity_type(columns):
    """Detect entity type from column names."""
    columns_lower = [c.lower().strip() for c in columns]

    # Check for unique identifying columns
    if 'landlord_ref' in columns_lower or 'landlord_code' in columns_lower:
        return 'properties'
    if 'tenant_ref' in columns_lower or 'property_ref' in columns_lower:
        return 'leases'
    if 'commission_rate' in columns_lower or 'bank_name' in columns_lower:
        return 'landlords'
    if 'id_number' in columns_lower or 'emergency_contact' in columns_lower:
        return 'tenants'

    # Fallback based on required columns
    if all(c in columns_lower for c in ['name', 'email', 'phone', 'address']):
        return 'landlords'
    if all(c in columns_lower for c in ['name', 'email', 'phone', 'id_number']):
        return 'tenants'

    return None


def validate_data(data_frames):
    """
    Validate all data frames and return validation results.

    Returns: {
        'valid': bool,
        'entities': {
            'landlords': {'count': N, 'errors': [...]},
            ...
        },
        'total_rows': N,
        'error_count': N
    }
    """
    results = {
        'valid': True,
        'entities': {},
        'total_rows': 0,
        'error_count': 0,
    }

    for entity_type, df in data_frames.items():
        entity_result = validate_entity(entity_type, df)
        results['entities'][entity_type] = entity_result
        results['total_rows'] += entity_result['count']
        results['error_count'] += len(entity_result['errors'])

        if entity_result['errors']:
            results['valid'] = False

    return results


def validate_entity(entity_type, df):
    """Validate a single entity DataFrame."""
    if entity_type not in COLUMN_MAPPINGS:
        return {
            'count': len(df),
            'errors': [{'row': 0, 'field': '', 'message': f'Unknown entity type: {entity_type}'}]
        }

    mapping = COLUMN_MAPPINGS[entity_type]
    errors = []

    # Normalize column names
    df.columns = [c.lower().strip() for c in df.columns]

    # Check required columns exist
    missing_cols = [c for c in mapping['required'] if c not in df.columns]
    if missing_cols:
        errors.append({
            'row': 0,
            'field': '',
            'message': f"Missing required columns: {', '.join(missing_cols)}"
        })
        return {'count': len(df), 'errors': errors, 'preview': []}

    # Validate each row
    preview_rows = []
    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)
        row_errors = []

        # Check required fields have values
        for col in mapping['required']:
            val = row.get(col)
            if pd.isna(val) or str(val).strip() == '':
                row_errors.append({
                    'row': row_num,
                    'field': col,
                    'message': f"Required field '{col}' is empty"
                })

        # Type-specific validation
        if entity_type == 'leases':
            # Validate dates
            for date_field in ['start_date', 'end_date']:
                val = row.get(date_field)
                if not pd.isna(val):
                    try:
                        if isinstance(val, str):
                            pd.to_datetime(val)
                    except:
                        row_errors.append({
                            'row': row_num,
                            'field': date_field,
                            'message': f"Invalid date format for '{date_field}'"
                        })

            # Validate monthly_rent
            rent = row.get('monthly_rent')
            if not pd.isna(rent):
                try:
                    Decimal(str(rent))
                except InvalidOperation:
                    row_errors.append({
                        'row': row_num,
                        'field': 'monthly_rent',
                        'message': "Invalid amount for 'monthly_rent'"
                    })

        errors.extend(row_errors)

        # Add to preview (first 10 rows)
        if len(preview_rows) < 10:
            preview_rows.append(row.to_dict())

    return {
        'count': len(df),
        'errors': errors,
        'preview': preview_rows
    }


def process_import(job, data_frames):
    """
    Process validated data and create records.

    Processing order: landlords -> properties -> tenants -> leases
    """
    from .models import ImportError

    # Track created objects for reference resolution
    created_refs = {
        'landlords': {},  # name/code -> object
        'properties': {},  # name/code -> object
        'tenants': {},  # name/code -> object
    }

    processing_order = ['landlords', 'properties', 'tenants', 'leases']

    total_success = 0
    total_errors = 0

    for entity_type in processing_order:
        if entity_type not in data_frames:
            continue

        df = data_frames[entity_type]
        df.columns = [c.lower().strip() for c in df.columns]

        for idx, row in df.iterrows():
            row_num = idx + 2
            job.processed_rows += 1
            job.save(update_fields=['processed_rows'])

            try:
                with transaction.atomic():
                    obj = create_entity(entity_type, row, created_refs)

                    # Store reference for later use
                    if entity_type == 'landlords':
                        created_refs['landlords'][obj.name.lower()] = obj
                        if obj.code:
                            created_refs['landlords'][obj.code.lower()] = obj
                    elif entity_type == 'properties':
                        created_refs['properties'][obj.name.lower()] = obj
                        if obj.code:
                            created_refs['properties'][obj.code.lower()] = obj
                    elif entity_type == 'tenants':
                        created_refs['tenants'][obj.name.lower()] = obj
                        if obj.code:
                            created_refs['tenants'][obj.code.lower()] = obj

                    total_success += 1

            except Exception as e:
                total_errors += 1
                ImportError.objects.create(
                    job=job,
                    sheet_name=entity_type,
                    row_number=row_num,
                    error_message=str(e),
                    row_data=row.to_dict()
                )

    job.success_count = total_success
    job.error_count = total_errors
    job.save()

    return total_success, total_errors


def create_entity(entity_type, row, refs):
    """Create a single entity from row data."""
    mapping = COLUMN_MAPPINGS[entity_type]

    # Build data dict with defaults
    data = dict(mapping['defaults'])

    # Add values from row
    for col in mapping['required'] + mapping['optional']:
        val = row.get(col)
        if not pd.isna(val) and str(val).strip() != '':
            data[col] = clean_value(val, col)

    if entity_type == 'landlords':
        return Landlord.objects.create(**data)

    elif entity_type == 'properties':
        # Resolve landlord reference
        landlord_ref = str(row.get('landlord_ref', '')).lower().strip()
        landlord = refs['landlords'].get(landlord_ref)

        if not landlord:
            # Try to find existing landlord
            landlord = Landlord.objects.filter(
                name__iexact=landlord_ref
            ).first() or Landlord.objects.filter(
                code__iexact=landlord_ref
            ).first()

        if not landlord:
            raise ValueError(f"Landlord not found: {landlord_ref}")

        data.pop('landlord_ref', None)
        data['landlord'] = landlord
        return Property.objects.create(**data)

    elif entity_type == 'tenants':
        return RentalTenant.objects.create(**data)

    elif entity_type == 'leases':
        # Resolve tenant reference
        tenant_ref = str(row.get('tenant_ref', '')).lower().strip()
        tenant = refs['tenants'].get(tenant_ref)

        if not tenant:
            tenant = RentalTenant.objects.filter(
                name__iexact=tenant_ref
            ).first() or RentalTenant.objects.filter(
                code__iexact=tenant_ref
            ).first()

        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_ref}")

        # Resolve property reference
        property_ref = str(row.get('property_ref', '')).lower().strip()
        prop = refs['properties'].get(property_ref)

        if not prop:
            prop = Property.objects.filter(
                name__iexact=property_ref
            ).first() or Property.objects.filter(
                code__iexact=property_ref
            ).first()

        if not prop:
            raise ValueError(f"Property not found: {property_ref}")

        # Auto-create unit if it doesn't exist
        unit_number = str(row.get('unit_number', '')).strip()
        unit, created = Unit.objects.get_or_create(
            property=prop,
            unit_number=unit_number,
            defaults={
                'rental_amount': data.get('monthly_rent', Decimal('0')),
                'currency': data.get('currency', 'USD'),
            }
        )

        # Build lease data
        lease_data = {
            'tenant': tenant,
            'unit': unit,
            'property': prop,
            'start_date': data.get('start_date'),
            'end_date': data.get('end_date'),
            'monthly_rent': data.get('monthly_rent'),
            'currency': data.get('currency', 'USD'),
            'deposit_amount': data.get('deposit_amount'),
            'billing_day': data.get('billing_day', 1),
            'grace_period_days': data.get('grace_period_days', 5),
            'status': 'active',  # Import as active
        }

        return LeaseAgreement.objects.create(**lease_data)


def clean_value(val, field_name):
    """Clean and convert value based on field type."""
    if pd.isna(val):
        return None

    val = str(val).strip()

    # Date fields
    if field_name in ['start_date', 'end_date']:
        return pd.to_datetime(val).date()

    # Decimal fields
    if field_name in ['monthly_rent', 'deposit_amount', 'commission_rate',
                      'annual_escalation_rate']:
        return Decimal(val)

    # Integer fields
    if field_name in ['total_units', 'total_floors', 'parking_spaces',
                      'year_built', 'billing_day', 'grace_period_days']:
        return int(float(val))

    # Boolean fields
    if field_name in ['vat_registered']:
        return val.lower() in ['true', 'yes', '1', 'y']

    return val
