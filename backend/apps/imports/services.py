"""Services for data import processing."""
import math
import re
import pandas as pd
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction
from django.utils import timezone

from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement


def sanitize_row_dict(d):
    """
    Sanitize a pandas row dict for JSON serialization.
    Replaces NaN, Infinity, and other non-JSON-safe values with None.
    Converts Decimal, datetime, and date objects to strings.
    """
    clean = {}
    for k, v in d.items():
        if v is None:
            clean[k] = None
        elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            clean[k] = None
        elif isinstance(v, Decimal):
            clean[k] = str(v)
        elif isinstance(v, (datetime,)):
            clean[k] = v.isoformat()
        elif hasattr(v, 'isoformat'):
            clean[k] = v.isoformat()
        else:
            clean[k] = v
    return clean


# ──────────────────────────────────────────────────────────────
# Column alias map: common variations → canonical column name
# ──────────────────────────────────────────────────────────────
COLUMN_ALIASES = {
    # Name variations
    'full_name': 'name',
    'fullname': 'name',
    'full name': 'name',
    'tenant_name': 'name',
    'tenant name': 'name',
    'landlord_name': 'name',
    'landlord name': 'name',
    'property_name': 'name',
    'property name': 'name',
    'company_name': 'name',
    'company name': 'name',
    'first_name': 'name',

    # Email variations
    'email_address': 'email',
    'email address': 'email',
    'e-mail': 'email',
    'e_mail': 'email',
    'emailaddress': 'email',
    'mail': 'email',

    # Phone variations
    'phone_number': 'phone',
    'phone number': 'phone',
    'telephone': 'phone',
    'tel': 'phone',
    'mobile': 'phone',
    'mobile_number': 'phone',
    'mobile number': 'phone',
    'cell': 'phone',
    'cell_phone': 'phone',
    'cellphone': 'phone',
    'contact_number': 'phone',
    'contact number': 'phone',

    # Alt phone variations
    'alt_phone_number': 'alt_phone',
    'alternative_phone': 'alt_phone',
    'other_phone': 'alt_phone',
    'secondary_phone': 'alt_phone',
    'phone_2': 'alt_phone',
    'phone2': 'alt_phone',

    # Address variations
    'street_address': 'address',
    'street address': 'address',
    'physical_address': 'address',
    'physical address': 'address',
    'postal_address': 'address',
    'location': 'address',

    # ID number variations
    'id_no': 'id_number',
    'id no': 'id_number',
    'id': 'id_number',
    'national_id': 'id_number',
    'national id': 'id_number',
    'passport_number': 'id_number',
    'passport number': 'id_number',
    'identification_number': 'id_number',
    'identification number': 'id_number',
    'id_num': 'id_number',

    # Landlord ref variations
    'landlord': 'landlord_ref',
    'landlord_name_ref': 'landlord_ref',
    'landlord name': 'landlord_ref',
    'landlord_code': 'landlord_ref',
    'landlord code': 'landlord_ref',
    'owner': 'landlord_ref',
    'property_owner': 'landlord_ref',

    # Tenant ref variations
    'tenant': 'tenant_ref',
    'tenant_name_ref': 'tenant_ref',
    'tenant name': 'tenant_ref',
    'tenant_code': 'tenant_ref',
    'tenant code': 'tenant_ref',
    'renter': 'tenant_ref',

    # Property ref variations
    'property': 'property_ref',
    'property_name_ref': 'property_ref',
    'property name': 'property_ref',
    'property_code': 'property_ref',
    'property code': 'property_ref',
    'building': 'property_ref',
    'building_name': 'property_ref',

    # Unit variations
    'unit': 'unit_number',
    'unit_no': 'unit_number',
    'unit no': 'unit_number',
    'unit_num': 'unit_number',
    'flat_number': 'unit_number',
    'flat number': 'unit_number',
    'room_number': 'unit_number',
    'room number': 'unit_number',
    'suite': 'unit_number',
    'suite_number': 'unit_number',

    # Rent / amount variations
    'rent': 'monthly_rent',
    'rental': 'monthly_rent',
    'rent_amount': 'monthly_rent',
    'rent amount': 'monthly_rent',
    'rental_amount': 'monthly_rent',
    'rental amount': 'monthly_rent',
    'monthly_rental': 'monthly_rent',
    'monthly rental': 'monthly_rent',
    'monthly_amount': 'monthly_rent',
    'amount': 'monthly_rent',

    # Deposit variations
    'deposit': 'deposit_amount',
    'security_deposit': 'deposit_amount',
    'security deposit': 'deposit_amount',

    # Commission variations
    'commission': 'commission_rate',
    'management_fee': 'commission_rate',
    'management fee': 'commission_rate',

    # Date variations
    'lease_start': 'start_date',
    'lease start': 'start_date',
    'start': 'start_date',
    'from_date': 'start_date',
    'from date': 'start_date',
    'commencement_date': 'start_date',
    'commencement date': 'start_date',
    'lease_end': 'end_date',
    'lease end': 'end_date',
    'end': 'end_date',
    'to_date': 'end_date',
    'to date': 'end_date',
    'expiry_date': 'end_date',
    'expiry date': 'end_date',
    'expiration_date': 'end_date',

    # City variations
    'town': 'city',
    'city_town': 'city',

    # Type variations
    'prop_type': 'property_type',
    'property type': 'property_type',

    # Currency variations
    'cur': 'currency',
    'ccy': 'currency',

    # Notes variations
    'comments': 'notes',
    'description': 'notes',
    'remarks': 'notes',
    'note': 'notes',

    # Bank variations
    'bank': 'bank_name',
    'branch': 'bank_branch',
    'acc_number': 'account_number',
    'acc_name': 'account_name',
    'account_no': 'account_number',
    'account no': 'account_number',
}

# Sheet name aliases for entity type detection
SHEET_ALIASES = {
    'landlords': 'landlords',
    'landlord': 'landlords',
    'owners': 'landlords',
    'owner': 'landlords',
    'properties': 'properties',
    'property': 'properties',
    'buildings': 'properties',
    'building': 'properties',
    'tenants': 'tenants',
    'tenant': 'tenants',
    'renters': 'tenants',
    'renter': 'tenants',
    'leases': 'leases',
    'lease': 'leases',
    'lease_agreements': 'leases',
    'lease agreements': 'leases',
    'agreements': 'leases',
    'contracts': 'leases',
}

# Values that should be treated as empty/null
EMPTY_VALUES = {
    '', 'nan', 'none', 'null', 'n/a', 'na', '-', '--', '---',
    'not available', 'not applicable', 'nil', 'undefined', '#n/a',
    '#ref!', '#value!', '#null!', '#div/0!', '#name?',
}

# Valid enum values for each choice field
VALID_ENUMS = {
    'landlord_type': {
        'individual': 'individual',
        'company': 'company',
        'trust': 'trust',
        'corp': 'company',
        'corporate': 'company',
        'business': 'company',
        'organization': 'company',
        'organisation': 'company',
        'person': 'individual',
        'personal': 'individual',
    },
    'property_type': {
        'residential': 'residential',
        'commercial': 'commercial',
        'industrial': 'industrial',
        'mixed': 'mixed',
        'mixed use': 'mixed',
        'mixed_use': 'mixed',
        'house': 'residential',
        'apartment': 'residential',
        'flat': 'residential',
        'office': 'commercial',
        'shop': 'commercial',
        'retail': 'commercial',
        'warehouse': 'industrial',
        'factory': 'industrial',
    },
    'tenant_type': {
        'individual': 'individual',
        'company': 'company',
        'corporate': 'company',
        'business': 'company',
        'person': 'individual',
        'personal': 'individual',
    },
    'account_type': {
        'rental': 'rental',
        'levy': 'levy',
        'both': 'both',
        'rent': 'rental',
    },
    'id_type': {
        'national_id': 'national_id',
        'national id': 'national_id',
        'nationalid': 'national_id',
        'id': 'national_id',
        'passport': 'passport',
        'drivers_license': 'drivers_license',
        'drivers license': 'drivers_license',
        'driver_license': 'drivers_license',
        'driving_license': 'drivers_license',
        'driving license': 'drivers_license',
        'dl': 'drivers_license',
        'company_reg': 'company_reg',
        'company reg': 'company_reg',
        'company registration': 'company_reg',
        'registration': 'company_reg',
        'cr': 'company_reg',
    },
    'payment_frequency': {
        'monthly': 'monthly',
        'quarterly': 'quarterly',
        'annually': 'annually',
        'annual': 'annually',
        'yearly': 'annually',
        'month': 'monthly',
        'quarter': 'quarterly',
        'year': 'annually',
    },
    'preferred_currency': {
        'usd': 'USD',
        'zwl': 'ZWL',
        'zar': 'ZAR',
        'gbp': 'GBP',
        'eur': 'EUR',
        'bwp': 'BWP',
        '$': 'USD',
        'us$': 'USD',
        'us dollar': 'USD',
        'us dollars': 'USD',
        'dollar': 'USD',
        'dollars': 'USD',
        'rand': 'ZAR',
        'pula': 'BWP',
    },
}
# Currency field uses same map
VALID_ENUMS['currency'] = VALID_ENUMS['preferred_currency']


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
            'total_units': 0,
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


# ──────────────────────────────────────────────────────────────
# Column normalization
# ──────────────────────────────────────────────────────────────

def normalize_column_name(col):
    """
    Normalize a column name to its canonical form.
    Handles spaces, underscores, case, and common aliases.
    """
    # Basic normalization
    normalized = str(col).lower().strip()
    # Remove extra whitespace
    normalized = re.sub(r'\s+', ' ', normalized)
    # Remove special characters except spaces and underscores
    normalized = re.sub(r'[^\w\s]', '', normalized)
    # Normalize whitespace to underscore for matching
    underscore_form = normalized.replace(' ', '_')

    # Direct match
    if normalized in COLUMN_ALIASES:
        return COLUMN_ALIASES[normalized]
    if underscore_form in COLUMN_ALIASES:
        return COLUMN_ALIASES[underscore_form]

    # Try without underscores (space form)
    space_form = normalized.replace('_', ' ')
    if space_form in COLUMN_ALIASES:
        return COLUMN_ALIASES[space_form]

    # Return the underscore form as default
    return underscore_form


def normalize_columns(df):
    """
    Normalize all column names in a DataFrame.
    Returns (renamed_df, column_mapping_info) where column_mapping_info
    tracks what was renamed for user feedback.
    """
    mapping_info = []
    new_columns = {}

    for col in df.columns:
        original = str(col).strip()
        normalized = normalize_column_name(col)

        if normalized != original.lower().strip().replace(' ', '_'):
            mapping_info.append({
                'original': original,
                'mapped_to': normalized,
            })

        new_columns[col] = normalized

    df = df.rename(columns=new_columns)

    # Handle duplicate columns after normalization (keep first)
    seen = set()
    cols_to_drop = []
    for i, col in enumerate(df.columns):
        if col in seen:
            cols_to_drop.append(i)
        else:
            seen.add(col)

    if cols_to_drop:
        df = df.iloc[:, [i for i in range(len(df.columns)) if i not in cols_to_drop]]

    return df, mapping_info


# ──────────────────────────────────────────────────────────────
# Value checking helpers
# ──────────────────────────────────────────────────────────────

def is_empty_value(val):
    """Check if a value should be treated as empty/null."""
    if val is None:
        return True
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return True
    if isinstance(val, str) and val.strip().lower() in EMPTY_VALUES:
        return True
    if pd.isna(val):
        return True
    return False


def is_empty_row(row):
    """Check if a row is completely empty."""
    return all(is_empty_value(v) for v in row.values)


EMAIL_REGEX = re.compile(
    r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
)


def validate_email_format(email):
    """Validate email format. Returns (is_valid, cleaned_email)."""
    if is_empty_value(email):
        return False, None
    cleaned = str(email).strip().lower()
    if EMAIL_REGEX.match(cleaned):
        return True, cleaned
    return False, cleaned


def validate_phone_format(phone):
    """
    Validate and clean phone number.
    Returns (is_valid, cleaned_phone, warning).
    Accepts various formats: +263771234567, 0771234567, 077 123 4567, etc.
    """
    if is_empty_value(phone):
        return False, None, None
    cleaned = str(phone).strip()
    # Remove common formatting characters
    digits_only = re.sub(r'[\s\-\(\)\.]', '', cleaned)
    # Must have at least 7 digits
    digit_count = sum(1 for c in digits_only if c.isdigit())
    if digit_count < 7:
        return False, cleaned, f"Phone '{cleaned}' seems too short (less than 7 digits)"
    if digit_count > 15:
        return False, cleaned, f"Phone '{cleaned}' seems too long (more than 15 digits)"
    # Check it's mostly digits (allow + prefix)
    if not re.match(r'^\+?[\d\s\-\(\)\.]+$', cleaned):
        return False, cleaned, f"Phone '{cleaned}' contains unexpected characters"
    return True, cleaned, None


def clean_currency_amount(val):
    """
    Clean a monetary value by stripping currency symbols and formatting.
    Returns cleaned string suitable for Decimal conversion.
    """
    if is_empty_value(val):
        return None
    s = str(val).strip()
    # Remove common currency symbols and codes
    s = re.sub(r'^[A-Z]{3}\s*', '', s)  # USD 500
    s = re.sub(r'^[$€£¥₹R]\s*', '', s)  # $500
    s = re.sub(r'\s*[A-Z]{3}$', '', s)  # 500 USD
    # Remove thousand separators (commas or spaces between digits)
    s = re.sub(r'(\d)[,\s](\d{3})', r'\1\2', s)
    s = re.sub(r'(\d)[,\s](\d{3})', r'\1\2', s)  # Run twice for millions
    s = s.strip()
    return s if s else None


def normalize_enum(val, field_name):
    """
    Normalize an enum value to its canonical form.
    Returns (normalized_value, warning_message) or (None, error_message).
    """
    if is_empty_value(val):
        return None, None

    lookup = str(val).strip().lower()
    enum_map = VALID_ENUMS.get(field_name)
    if not enum_map:
        return str(val).strip(), None

    if lookup in enum_map:
        canonical = enum_map[lookup]
        if lookup != canonical:
            return canonical, None  # Silently normalize
        return canonical, None

    # Try without special characters
    simplified = re.sub(r'[^a-z0-9]', '', lookup)
    for key, canonical in enum_map.items():
        if re.sub(r'[^a-z0-9]', '', key) == simplified:
            return canonical, None

    # Not found — return original with warning
    valid_options = sorted(set(enum_map.values()))
    return str(val).strip(), (
        f"Unrecognized {field_name} '{val}'. "
        f"Valid options: {', '.join(valid_options)}. Using as-is."
    )


# ──────────────────────────────────────────────────────────────
# File parsing
# ──────────────────────────────────────────────────────────────

def parse_file(file_path, file_name):
    """
    Parse uploaded file and return dict of DataFrames.

    Supports:
    - Excel with multiple sheets (combined import)
    - Excel with single sheet (single entity)
    - CSV (single entity)

    Returns: {entity_type: DataFrame}
    """
    file_ext = file_name.lower().split('.')[-1]

    if file_ext == 'csv':
        # Try multiple encodings for CSV
        df = None
        for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
            try:
                df = pd.read_csv(file_path, encoding=encoding, on_bad_lines='skip')
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        if df is None:
            raise ValueError(
                "Could not read the CSV file. The file may have an unsupported "
                "encoding. Try saving it as UTF-8 in your spreadsheet application."
            )

        # Drop completely empty rows
        df = df.dropna(how='all').reset_index(drop=True)

        # Store original columns before normalization (for mapping display)
        original_columns = [str(c).strip() for c in df.columns]

        # Normalize columns
        df, _ = normalize_columns(df)

        # Preserve original column names for later mapping display
        df.attrs['original_columns'] = original_columns

        entity_type = detect_entity_type(df.columns.tolist())
        if not entity_type:
            raise ValueError(
                "Could not determine the type of data in this file. "
                "Please ensure your columns match the template headers, "
                "or use one of the downloadable templates."
            )
        return {entity_type: df}

    elif file_ext in ['xlsx', 'xls']:
        try:
            excel_file = pd.ExcelFile(file_path)
        except Exception as e:
            raise ValueError(
                f"Could not open the Excel file. It may be corrupted or "
                f"in an unsupported format. Error: {str(e)}"
            )

        sheet_names = excel_file.sheet_names
        result = {}

        for sheet in sheet_names:
            # Normalize sheet name to entity type
            normalized_sheet = sheet.lower().strip()
            entity_type = SHEET_ALIASES.get(normalized_sheet)

            try:
                df = pd.read_excel(excel_file, sheet_name=sheet)
            except Exception:
                continue  # Skip unreadable sheets

            # Drop completely empty rows
            df = df.dropna(how='all').reset_index(drop=True)

            if len(df) == 0:
                continue  # Skip empty sheets

            # Store original columns before normalization
            original_columns = [str(c).strip() for c in df.columns]

            # Normalize columns
            df, _ = normalize_columns(df)

            # Preserve original column names for later mapping display
            df.attrs['original_columns'] = original_columns

            if entity_type and entity_type in COLUMN_MAPPINGS:
                result[entity_type] = df
            else:
                # Try to detect entity type from columns
                detected = detect_entity_type(df.columns.tolist())
                if detected:
                    result[detected] = df

        return result

    else:
        raise ValueError(
            f"Unsupported file type: .{file_ext}. "
            f"Please upload a CSV (.csv) or Excel (.xlsx) file."
        )


def detect_entity_type(columns):
    """Detect entity type from column names."""
    columns_lower = set(c.lower().strip() for c in columns)

    # Score-based detection: count how many expected columns match
    scores = {}
    for entity_type, mapping in COLUMN_MAPPINGS.items():
        all_cols = set(mapping['required'] + mapping['optional'])
        matched = columns_lower & all_cols
        scores[entity_type] = len(matched)

    # Check for unique identifying columns (strong signals)
    if 'landlord_ref' in columns_lower:
        scores['properties'] += 10
    if 'tenant_ref' in columns_lower:
        scores['leases'] += 10
    if 'property_ref' in columns_lower:
        scores['leases'] += 10
    if 'commission_rate' in columns_lower:
        scores['landlords'] += 5
    if 'bank_name' in columns_lower:
        scores['landlords'] += 5
    if 'id_number' in columns_lower:
        scores['tenants'] += 5
    if 'unit_number' in columns_lower:
        scores['leases'] += 3
    if 'monthly_rent' in columns_lower:
        scores['leases'] += 5

    # Return entity with highest score (if any columns matched)
    if scores:
        best = max(scores, key=scores.get)
        if scores[best] > 0:
            return best

    return None


# ──────────────────────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────────────────────

def validate_data(data_frames):
    """
    Validate all data frames and return validation results.

    Returns: {
        'valid': bool,
        'can_import': bool,  # True if only warnings, no blocking errors
        'entities': {
            'entity_type': {
                'count': N,
                'errors': [...],
                'warnings': [...],
                'column_mappings': [...],
                'preview': [...]
            },
        },
        'total_rows': N,
        'error_count': N,
        'warning_count': N
    }
    """
    results = {
        'valid': True,
        'can_import': True,
        'entities': {},
        'total_rows': 0,
        'error_count': 0,
        'warning_count': 0,
    }

    for entity_type, df in data_frames.items():
        entity_result = validate_entity(entity_type, df)
        results['entities'][entity_type] = entity_result
        results['total_rows'] += entity_result['count']
        results['error_count'] += len(entity_result['errors'])
        results['warning_count'] += len(entity_result.get('warnings', []))

        if entity_result['errors']:
            results['valid'] = False
            results['can_import'] = False

    return results


def validate_entity(entity_type, df):
    """Validate a single entity DataFrame with comprehensive checks."""
    if entity_type not in COLUMN_MAPPINGS:
        return {
            'count': len(df),
            'errors': [{'row': 0, 'field': '', 'message': f'Unknown entity type: {entity_type}'}],
            'warnings': [],
            'column_mappings': [],
            'preview': [],
        }

    mapping = COLUMN_MAPPINGS[entity_type]
    errors = []
    warnings = []

    # Generate column mappings from original column names (stored by parse_file)
    original_columns = df.attrs.get('original_columns', [])
    column_mappings = []
    if original_columns:
        for orig, norm in zip(original_columns, df.columns):
            if orig.lower().replace(' ', '_') != norm:
                column_mappings.append({'original': orig, 'mapped_to': norm})

    # Re-normalize columns (should already be normalized from parse, but be safe)
    df, extra_mappings = normalize_columns(df)
    if extra_mappings and not column_mappings:
        column_mappings = extra_mappings

    # Check required columns exist
    missing_cols = [c for c in mapping['required'] if c not in df.columns]
    if missing_cols:
        # Try to give helpful suggestions
        available = list(df.columns)
        suggestion = (
            f"Missing required columns: {', '.join(missing_cols)}. "
            f"Your file has these columns: {', '.join(available)}. "
            f"Please check that your column headers match the template."
        )
        errors.append({
            'row': 0,
            'field': '',
            'message': suggestion,
        })
        return {
            'count': len(df),
            'errors': errors,
            'warnings': warnings,
            'column_mappings': column_mappings,
            'preview': [],
        }

    # Track seen values for duplicate detection
    seen_emails = {}
    seen_names = {}
    seen_id_numbers = {}

    # Validate each row
    preview_rows = []
    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)

        # Skip completely empty rows
        if is_empty_row(row):
            continue

        row_errors = []
        row_warnings = []

        # Check required fields have values
        for col in mapping['required']:
            val = row.get(col)
            if is_empty_value(val):
                row_errors.append({
                    'row': row_num,
                    'field': col,
                    'message': f"Row {row_num}: Required field '{col}' is empty"
                })

        # ── Email validation ──
        if 'email' in df.columns:
            email_val = row.get('email')
            if not is_empty_value(email_val):
                valid, cleaned = validate_email_format(email_val)
                if not valid:
                    row_errors.append({
                        'row': row_num,
                        'field': 'email',
                        'message': (
                            f"Row {row_num}: Invalid email format '{email_val}'. "
                            f"Expected format: name@domain.com"
                        )
                    })
                else:
                    # Duplicate check within file
                    if cleaned in seen_emails:
                        row_warnings.append({
                            'row': row_num,
                            'field': 'email',
                            'message': (
                                f"Row {row_num}: Duplicate email '{cleaned}' "
                                f"(also in row {seen_emails[cleaned]})"
                            )
                        })
                    else:
                        seen_emails[cleaned] = row_num

        # ── Phone validation ──
        for phone_field in ['phone', 'alt_phone']:
            if phone_field in df.columns:
                phone_val = row.get(phone_field)
                if not is_empty_value(phone_val):
                    valid, cleaned, warning = validate_phone_format(phone_val)
                    if not valid and warning:
                        row_warnings.append({
                            'row': row_num,
                            'field': phone_field,
                            'message': f"Row {row_num}: {warning}"
                        })

        # ── Name duplicate check ──
        if 'name' in df.columns:
            name_val = row.get('name')
            if not is_empty_value(name_val):
                name_lower = str(name_val).strip().lower()
                if name_lower in seen_names:
                    row_warnings.append({
                        'row': row_num,
                        'field': 'name',
                        'message': (
                            f"Row {row_num}: Duplicate name '{name_val}' "
                            f"(also in row {seen_names[name_lower]})"
                        )
                    })
                else:
                    seen_names[name_lower] = row_num

        # ── ID number duplicate check ──
        if 'id_number' in df.columns:
            id_val = row.get('id_number')
            if not is_empty_value(id_val):
                id_lower = str(id_val).strip().lower()
                if id_lower in seen_id_numbers:
                    row_errors.append({
                        'row': row_num,
                        'field': 'id_number',
                        'message': (
                            f"Row {row_num}: Duplicate ID number '{id_val}' "
                            f"(also in row {seen_id_numbers[id_lower]}). "
                            f"Each tenant must have a unique ID number."
                        )
                    })
                else:
                    seen_id_numbers[id_lower] = row_num

        # ── Enum field validation ──
        enum_fields = {
            'landlords': ['landlord_type', 'preferred_currency', 'payment_frequency'],
            'properties': ['property_type'],
            'tenants': ['tenant_type', 'account_type', 'id_type'],
            'leases': ['currency'],
        }

        for enum_field in enum_fields.get(entity_type, []):
            if enum_field in df.columns:
                val = row.get(enum_field)
                if not is_empty_value(val):
                    normalized, warning = normalize_enum(val, enum_field)
                    if warning:
                        row_warnings.append({
                            'row': row_num,
                            'field': enum_field,
                            'message': f"Row {row_num}: {warning}"
                        })

        # ── Numeric field validation ──
        decimal_fields = ['monthly_rent', 'deposit_amount', 'commission_rate',
                         'annual_escalation_rate']
        for field in decimal_fields:
            if field in df.columns:
                val = row.get(field)
                if not is_empty_value(val):
                    cleaned = clean_currency_amount(val)
                    if cleaned:
                        try:
                            dec_val = Decimal(cleaned)
                            if dec_val < 0:
                                row_warnings.append({
                                    'row': row_num,
                                    'field': field,
                                    'message': (
                                        f"Row {row_num}: Negative value for '{field}' ({val}). "
                                        f"Please verify this is correct."
                                    )
                                })
                        except (InvalidOperation, ValueError):
                            row_errors.append({
                                'row': row_num,
                                'field': field,
                                'message': (
                                    f"Row {row_num}: Invalid number '{val}' for '{field}'. "
                                    f"Expected a numeric value like '500.00'"
                                )
                            })

        integer_fields = ['total_units', 'total_floors', 'parking_spaces',
                         'year_built', 'billing_day', 'grace_period_days']
        for field in integer_fields:
            if field in df.columns:
                val = row.get(field)
                if not is_empty_value(val):
                    try:
                        int_val = int(float(str(val).strip()))
                        if field == 'billing_day' and not (1 <= int_val <= 28):
                            row_warnings.append({
                                'row': row_num,
                                'field': field,
                                'message': (
                                    f"Row {row_num}: Billing day {int_val} is unusual. "
                                    f"Typically 1-28 to work in all months."
                                )
                            })
                        if field == 'year_built' and int_val > 0:
                            current_year = datetime.now().year
                            if int_val < 1800 or int_val > current_year + 5:
                                row_warnings.append({
                                    'row': row_num,
                                    'field': field,
                                    'message': (
                                        f"Row {row_num}: Year built '{int_val}' seems unusual."
                                    )
                                })
                    except (ValueError, TypeError):
                        row_errors.append({
                            'row': row_num,
                            'field': field,
                            'message': (
                                f"Row {row_num}: Invalid integer '{val}' for '{field}'. "
                                f"Expected a whole number."
                            )
                        })

        # ── Date validation ──
        for date_field in ['start_date', 'end_date']:
            if date_field in df.columns:
                val = row.get(date_field)
                if not is_empty_value(val):
                    try:
                        if isinstance(val, str):
                            pd.to_datetime(val)
                        elif not hasattr(val, 'date') and not hasattr(val, 'isoformat'):
                            pd.to_datetime(str(val))
                    except (ValueError, TypeError):
                        row_errors.append({
                            'row': row_num,
                            'field': date_field,
                            'message': (
                                f"Row {row_num}: Could not parse date '{val}' for '{date_field}'. "
                                f"Try formats like: 2024-01-15, 01/15/2024, or 15-Jan-2024"
                            )
                        })

        # ── Lease-specific: end_date after start_date ──
        if entity_type == 'leases':
            start_val = row.get('start_date')
            end_val = row.get('end_date')
            if not is_empty_value(start_val) and not is_empty_value(end_val):
                try:
                    start_dt = pd.to_datetime(start_val)
                    end_dt = pd.to_datetime(end_val)
                    if end_dt <= start_dt:
                        row_errors.append({
                            'row': row_num,
                            'field': 'end_date',
                            'message': (
                                f"Row {row_num}: End date ({end_val}) must be after "
                                f"start date ({start_val})"
                            )
                        })
                except (ValueError, TypeError):
                    pass  # Date parsing errors already caught above

        errors.extend(row_errors)
        warnings.extend(row_warnings)

        # Add to preview (first 10 rows)
        if len(preview_rows) < 10:
            preview_rows.append(sanitize_row_dict(row.to_dict()))

    return {
        'count': len(df),
        'errors': errors,
        'warnings': warnings,
        'column_mappings': column_mappings,
        'preview': preview_rows,
    }


# ──────────────────────────────────────────────────────────────
# Import processing
# ──────────────────────────────────────────────────────────────

def process_import(job, data_frames):
    """
    Process validated data and create records.

    Processing order: landlords -> properties -> tenants -> leases
    """
    from django.db import connection as db_connection
    from .models import ImportError as ImportErrorModel

    # Capture schema — entity creation signals can alter connection state
    _schema = getattr(db_connection, 'schema_name', None)

    def _ensure_schema():
        """Restore schema if it was changed by signal handlers."""
        if _schema and getattr(db_connection, 'schema_name', None) != _schema:
            db_connection.set_schema(_schema)

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

        df = data_frames[entity_type].copy()

        # Re-normalize columns
        df, _ = normalize_columns(df)

        for idx, row in df.iterrows():
            row_num = idx + 2

            # Skip completely empty rows
            if is_empty_row(row):
                continue

            _ensure_schema()
            job.processed_rows += 1
            job.save(update_fields=['processed_rows'])

            try:
                with transaction.atomic():
                    obj = create_entity(entity_type, row, created_refs)

                    # Restore schema after entity creation (signals may change it)
                    _ensure_schema()

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
                _ensure_schema()
                total_errors += 1
                error_msg = str(e)

                # Make common Django errors more user-friendly
                if 'unique constraint' in error_msg.lower() or 'duplicate key' in error_msg.lower():
                    # Try to extract the field name
                    name_val = ''
                    try:
                        name_val = str(row.get('name', '')).strip()
                    except Exception:
                        pass
                    error_msg = (
                        f"A record with this data already exists"
                        f"{' (' + name_val + ')' if name_val else ''}. "
                        f"Skipped to avoid duplicates."
                    )
                elif 'null value in column' in error_msg.lower():
                    error_msg = (
                        f"Missing required data. Some required fields are empty. "
                        f"Original error: {error_msg}"
                    )
                elif 'value too long' in error_msg.lower():
                    error_msg = (
                        f"One of the values is too long for its field. "
                        f"Try shortening text values. Original error: {error_msg}"
                    )

                ImportErrorModel.objects.create(
                    job=job,
                    sheet_name=entity_type,
                    row_number=row_num,
                    error_message=error_msg,
                    row_data=sanitize_row_dict(row.to_dict())
                )

    _ensure_schema()
    job.success_count = total_success
    job.error_count = total_errors
    job.save()

    return total_success, total_errors


def create_entity(entity_type, row, refs):
    """Create a single entity from row data with robust value cleaning."""
    mapping = COLUMN_MAPPINGS[entity_type]

    # Build data dict with defaults
    data = dict(mapping['defaults'])

    # Add values from row
    for col in mapping['required'] + mapping['optional']:
        val = row.get(col)
        if not is_empty_value(val):
            data[col] = clean_value(val, col)

    if entity_type == 'landlords':
        return Landlord.objects.create(**data)

    elif entity_type == 'properties':
        # Resolve landlord reference
        landlord_ref_raw = row.get('landlord_ref', '')
        landlord_ref = str(landlord_ref_raw).lower().strip() if not is_empty_value(landlord_ref_raw) else ''
        landlord = refs['landlords'].get(landlord_ref)

        if not landlord:
            # Try to find existing landlord by name or code (case-insensitive)
            landlord = Landlord.objects.filter(
                name__iexact=landlord_ref
            ).first() or Landlord.objects.filter(
                code__iexact=landlord_ref
            ).first()

        if not landlord and landlord_ref:
            # Try partial match as a last resort
            landlord = Landlord.objects.filter(
                name__icontains=landlord_ref
            ).first()

        if not landlord:
            existing_landlords = list(
                Landlord.objects.values_list('name', flat=True)[:10]
            )
            hint = ""
            if existing_landlords:
                hint = f" Available landlords: {', '.join(existing_landlords)}"
            raise ValueError(
                f"Could not find landlord '{landlord_ref_raw}'.{hint} "
                f"Make sure the landlord is created first (or included in the same import file)."
            )

        data.pop('landlord_ref', None)
        data['landlord'] = landlord
        return Property.objects.create(**data)

    elif entity_type == 'tenants':
        return RentalTenant.objects.create(**data)

    elif entity_type == 'leases':
        # Resolve tenant reference
        tenant_ref_raw = row.get('tenant_ref', '')
        tenant_ref = str(tenant_ref_raw).lower().strip() if not is_empty_value(tenant_ref_raw) else ''
        tenant = refs['tenants'].get(tenant_ref)

        if not tenant:
            tenant = RentalTenant.objects.filter(
                name__iexact=tenant_ref
            ).first() or RentalTenant.objects.filter(
                code__iexact=tenant_ref
            ).first()

        if not tenant and tenant_ref:
            tenant = RentalTenant.objects.filter(
                name__icontains=tenant_ref
            ).first()

        if not tenant:
            existing_tenants = list(
                RentalTenant.objects.values_list('name', flat=True)[:10]
            )
            hint = ""
            if existing_tenants:
                hint = f" Available tenants: {', '.join(existing_tenants)}"
            raise ValueError(
                f"Could not find tenant '{tenant_ref_raw}'.{hint} "
                f"Make sure the tenant is created first (or included in the same import file)."
            )

        # Resolve property reference
        property_ref_raw = row.get('property_ref', '')
        property_ref = str(property_ref_raw).lower().strip() if not is_empty_value(property_ref_raw) else ''
        prop = refs['properties'].get(property_ref)

        if not prop:
            prop = Property.objects.filter(
                name__iexact=property_ref
            ).first() or Property.objects.filter(
                code__iexact=property_ref
            ).first()

        if not prop and property_ref:
            prop = Property.objects.filter(
                name__icontains=property_ref
            ).first()

        if not prop:
            existing_props = list(
                Property.objects.values_list('name', flat=True)[:10]
            )
            hint = ""
            if existing_props:
                hint = f" Available properties: {', '.join(existing_props)}"
            raise ValueError(
                f"Could not find property '{property_ref_raw}'.{hint} "
                f"Make sure the property is created first (or included in the same import file)."
            )

        # Auto-create unit if it doesn't exist
        unit_number_raw = row.get('unit_number', '')
        unit_number = str(unit_number_raw).strip() if not is_empty_value(unit_number_raw) else ''
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
    """Clean and convert value based on field type with robust handling."""
    if is_empty_value(val):
        return None

    # Convert to string and strip whitespace
    str_val = str(val).strip()

    # Check if it became empty after stripping
    if str_val.lower() in EMPTY_VALUES:
        return None

    # Date fields
    if field_name in ['start_date', 'end_date']:
        try:
            if hasattr(val, 'date'):
                return val.date()
            return pd.to_datetime(str_val).date()
        except (ValueError, TypeError):
            raise ValueError(
                f"Could not parse date '{str_val}' for {field_name}. "
                f"Try formats: 2024-01-15, 01/15/2024, 15-Jan-2024"
            )

    # Decimal fields — strip currency symbols first
    if field_name in ['monthly_rent', 'deposit_amount', 'commission_rate',
                      'annual_escalation_rate']:
        cleaned = clean_currency_amount(val)
        if cleaned is None:
            return None
        try:
            return Decimal(cleaned)
        except (InvalidOperation, ValueError):
            raise ValueError(
                f"Could not convert '{val}' to a number for {field_name}. "
                f"Remove any text or special characters."
            )

    # Integer fields
    if field_name in ['total_units', 'total_floors', 'parking_spaces',
                      'year_built', 'billing_day', 'grace_period_days']:
        try:
            return int(float(str_val))
        except (ValueError, TypeError):
            raise ValueError(
                f"Could not convert '{val}' to a whole number for {field_name}."
            )

    # Boolean fields
    if field_name in ['vat_registered']:
        return str_val.lower() in ['true', 'yes', '1', 'y', 'on']

    # Enum fields — normalize to canonical values
    if field_name in VALID_ENUMS:
        normalized, _ = normalize_enum(val, field_name)
        return normalized if normalized else str_val

    return str_val
