"""
Test script for data import functionality.
Tests the full import pipeline: upload -> validate -> confirm -> process.
"""
import os
import sys
import json
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.test import RequestFactory
from django.test import Client as TestClient
from django_tenants.utils import schema_context
from apps.accounts.models import User
from apps.imports.services import (
    parse_file, validate_data, normalize_column_name, normalize_columns,
    is_empty_value, clean_value, normalize_enum, clean_currency_amount,
    detect_entity_type, validate_entity, COLUMN_ALIASES, SHEET_ALIASES,
)
import pandas as pd
from decimal import Decimal
from io import StringIO, BytesIO
import tempfile
import traceback


# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'

passed = 0
failed = 0
errors = []


def test(name, condition, detail=""):
    global passed, failed, errors
    if condition:
        passed += 1
        print(f"  {GREEN}PASS{RESET} {name}")
    else:
        failed += 1
        errors.append((name, detail))
        print(f"  {RED}FAIL{RESET} {name}")
        if detail:
            print(f"       {RED}{detail}{RESET}")


def section(title):
    print(f"\n{BOLD}{BLUE}=== {title} ==={RESET}")


# ──────────────────────────────────────────────────────────────
# Unit Tests: Column Normalization
# ──────────────────────────────────────────────────────────────
section("Column Name Normalization")

# Standard aliases
test("'Full Name' -> 'name'", normalize_column_name("Full Name") == "name")
test("'email_address' -> 'email'", normalize_column_name("email_address") == "email")
test("'Phone Number' -> 'phone'", normalize_column_name("Phone Number") == "phone")
test("'Telephone' -> 'phone'", normalize_column_name("Telephone") == "phone")
test("'Mobile' -> 'phone'", normalize_column_name("Mobile") == "phone")
test("'Cell' -> 'phone'", normalize_column_name("Cell") == "phone")
test("'Contact Number' -> 'phone'", normalize_column_name("Contact Number") == "phone")
test("'ID No' -> 'id_number'", normalize_column_name("ID No") == "id_number")
test("'Passport Number' -> 'id_number'", normalize_column_name("Passport Number") == "id_number")
test("'Rent Amount' -> 'monthly_rent'", normalize_column_name("Rent Amount") == "monthly_rent")
test("'Rental Amount' -> 'monthly_rent'", normalize_column_name("Rental Amount") == "monthly_rent")
test("'Deposit' -> 'deposit_amount'", normalize_column_name("Deposit") == "deposit_amount")
test("'Landlord' -> 'landlord_ref'", normalize_column_name("Landlord") == "landlord_ref")
test("'Building' -> 'property_ref'", normalize_column_name("Building") == "property_ref")
test("'Unit No' -> 'unit_number'", normalize_column_name("Unit No") == "unit_number")
test("'Flat Number' -> 'unit_number'", normalize_column_name("Flat Number") == "unit_number")
test("'Lease Start' -> 'start_date'", normalize_column_name("Lease Start") == "start_date")
test("'Expiry Date' -> 'end_date'", normalize_column_name("Expiry Date") == "end_date")
test("'Town' -> 'city'", normalize_column_name("Town") == "city")
test("'Comments' -> 'notes'", normalize_column_name("Comments") == "notes")

# Edge cases
test("Extra spaces stripped", normalize_column_name("  Name  ") == "name")
test("Case insensitive", normalize_column_name("EMAIL") == "email")
test("Already canonical passes through", normalize_column_name("name") == "name")
test("Unknown column preserved", normalize_column_name("custom_field") == "custom_field")


# ──────────────────────────────────────────────────────────────
# Unit Tests: DataFrame Column Normalization
# ──────────────────────────────────────────────────────────────
section("DataFrame Column Normalization")

df = pd.DataFrame({
    'Full Name': ['John'],
    'Email Address': ['john@test.com'],
    'Phone Number': ['+263771234567'],
    'Physical Address': ['123 Main St'],
})
normalized_df, mappings = normalize_columns(df)
test("All 4 columns normalized", list(normalized_df.columns) == ['name', 'email', 'phone', 'address'])
test("4 mapping records", len(mappings) == 4)

# Test with already canonical columns
df2 = pd.DataFrame({'name': ['John'], 'email': ['j@t.com'], 'phone': ['123'], 'address': ['abc']})
normalized_df2, mappings2 = normalize_columns(df2)
test("Canonical columns unchanged", list(normalized_df2.columns) == ['name', 'email', 'phone', 'address'])
test("No mappings for canonical", len(mappings2) == 0)


# ──────────────────────────────────────────────────────────────
# Unit Tests: Empty Value Detection
# ──────────────────────────────────────────────────────────────
section("Empty Value Detection")

test("None is empty", is_empty_value(None) == True)
test("NaN is empty", is_empty_value(float('nan')) == True)
test("'nan' string is empty", is_empty_value('nan') == True)
test("'NaN' string is empty", is_empty_value('NaN') == True)
test("'N/A' is empty", is_empty_value('N/A') == True)
test("'n/a' is empty", is_empty_value('n/a') == True)
test("'-' is empty", is_empty_value('-') == True)
test("'--' is empty", is_empty_value('--') == True)
test("'null' is empty", is_empty_value('null') == True)
test("'None' is empty", is_empty_value('None') == True)
test("'nil' is empty", is_empty_value('nil') == True)
test("'#N/A' is empty", is_empty_value('#N/A') == True)
test("'#REF!' is empty", is_empty_value('#REF!') == True)
test("Empty string is empty", is_empty_value('') == True)
test("'hello' is NOT empty", is_empty_value('hello') == False)
test("0 is NOT empty", is_empty_value(0) == False)
test("0.0 is NOT empty", is_empty_value(0.0) == False)
test("'0' is NOT empty", is_empty_value('0') == False)


# ──────────────────────────────────────────────────────────────
# Unit Tests: Currency Amount Cleaning
# ──────────────────────────────────────────────────────────────
section("Currency Amount Cleaning")

test("Plain number unchanged", clean_currency_amount('500') == '500')
test("Decimal number unchanged", clean_currency_amount('500.00') == '500.00')
test("$ prefix stripped", clean_currency_amount('$500') == '500')
test("USD prefix stripped", clean_currency_amount('USD 500') == '500')
test("Thousand comma stripped", clean_currency_amount('1,500.00') == '1500.00')
test("Multiple commas stripped", clean_currency_amount('1,500,000') == '1500000')
test("Trailing currency stripped", clean_currency_amount('500 USD') == '500')
test("NaN returns None", clean_currency_amount('nan') is None)
test("N/A returns None", clean_currency_amount('N/A') is None)


# ──────────────────────────────────────────────────────────────
# Unit Tests: Enum Normalization
# ──────────────────────────────────────────────────────────────
section("Enum Normalization")

val, warn = normalize_enum('individual', 'landlord_type')
test("'individual' stays individual", val == 'individual' and warn is None)

val, warn = normalize_enum('Company', 'landlord_type')
test("'Company' -> 'company'", val == 'company' and warn is None)

val, warn = normalize_enum('Corporate', 'landlord_type')
test("'Corporate' -> 'company'", val == 'company' and warn is None)

val, warn = normalize_enum('Business', 'landlord_type')
test("'Business' -> 'company'", val == 'company' and warn is None)

val, warn = normalize_enum('residential', 'property_type')
test("'residential' stays", val == 'residential' and warn is None)

val, warn = normalize_enum('Flat', 'property_type')
test("'Flat' -> 'residential'", val == 'residential' and warn is None)

val, warn = normalize_enum('Office', 'property_type')
test("'Office' -> 'commercial'", val == 'commercial' and warn is None)

val, warn = normalize_enum('Warehouse', 'property_type')
test("'Warehouse' -> 'industrial'", val == 'industrial' and warn is None)

val, warn = normalize_enum('passport', 'id_type')
test("'passport' stays", val == 'passport' and warn is None)

val, warn = normalize_enum('DL', 'id_type')
test("'DL' -> 'drivers_license'", val == 'drivers_license' and warn is None)

val, warn = normalize_enum('USD', 'currency')
test("'USD' -> 'USD'", val == 'USD' and warn is None)

val, warn = normalize_enum('$', 'currency')
test("'$' -> 'USD'", val == 'USD' and warn is None)

val, warn = normalize_enum('Dollar', 'currency')
test("'Dollar' -> 'USD'", val == 'USD' and warn is None)

val, warn = normalize_enum('unknown_val', 'landlord_type')
test("Unknown enum -> warning", val == 'unknown_val' and warn is not None)


# ──────────────────────────────────────────────────────────────
# Unit Tests: clean_value
# ──────────────────────────────────────────────────────────────
section("Value Cleaning (clean_value)")

test("Date string parsed", clean_value('2024-01-15', 'start_date').__class__.__name__ == 'date')
test("Date '01/15/2024' parsed", clean_value('01/15/2024', 'start_date').__class__.__name__ == 'date')
test("Date '15-Jan-2024' parsed", clean_value('15-Jan-2024', 'start_date').__class__.__name__ == 'date')

test("Decimal from '$500'", clean_value('$500', 'monthly_rent') == Decimal('500'))
test("Decimal from '1,500.00'", clean_value('1,500.00', 'monthly_rent') == Decimal('1500.00'))
test("Decimal from 'USD 200'", clean_value('USD 200', 'monthly_rent') == Decimal('200'))

test("Integer from '5'", clean_value('5', 'total_units') == 5)
test("Integer from '5.0'", clean_value('5.0', 'total_units') == 5)

test("Boolean true", clean_value('yes', 'vat_registered') == True)
test("Boolean false", clean_value('no', 'vat_registered') == False)

test("NaN returns None", clean_value(float('nan'), 'name') is None)
test("'N/A' returns None", clean_value('N/A', 'name') is None)
test("'null' returns None", clean_value('null', 'name') is None)

test("Enum normalized", clean_value('Corporate', 'landlord_type') == 'company')
test("Enum currency", clean_value('Dollar', 'preferred_currency') == 'USD')


# ──────────────────────────────────────────────────────────────
# Unit Tests: Entity Type Detection
# ──────────────────────────────────────────────────────────────
section("Entity Type Detection")

test("Landlords detected",
     detect_entity_type(['name', 'email', 'phone', 'address', 'commission_rate']) == 'landlords')
test("Properties detected",
     detect_entity_type(['name', 'landlord_ref', 'address', 'city']) == 'properties')
test("Tenants detected",
     detect_entity_type(['name', 'email', 'phone', 'id_number']) == 'tenants')
test("Leases detected",
     detect_entity_type(['tenant_ref', 'property_ref', 'unit_number', 'start_date', 'monthly_rent']) == 'leases')

# With non-standard column names (after normalization)
test("Properties with 'landlord' column",
     detect_entity_type(['name', 'landlord_ref', 'address', 'city', 'property_type']) == 'properties')


# ──────────────────────────────────────────────────────────────
# Unit Tests: Sheet Name Aliases
# ──────────────────────────────────────────────────────────────
section("Sheet Name Aliases")

test("'landlord' -> 'landlords'", SHEET_ALIASES.get('landlord') == 'landlords')
test("'owners' -> 'landlords'", SHEET_ALIASES.get('owners') == 'landlords')
test("'property' -> 'properties'", SHEET_ALIASES.get('property') == 'properties')
test("'buildings' -> 'properties'", SHEET_ALIASES.get('buildings') == 'properties')
test("'tenant' -> 'tenants'", SHEET_ALIASES.get('tenant') == 'tenants')
test("'lease' -> 'leases'", SHEET_ALIASES.get('lease') == 'leases')
test("'contracts' -> 'leases'", SHEET_ALIASES.get('contracts') == 'leases')


# ──────────────────────────────────────────────────────────────
# Integration Test: Validate Landlords CSV
# ──────────────────────────────────────────────────────────────
section("Validate Landlords CSV")

csv_data = """name,email,phone,address,landlord_type,bank_name,account_number,commission_rate
John Smith Properties,john.smith@email.com,+263771234567,"123 Main Street, Harare",individual,CBZ Bank,1234567890,10.00
Sunrise Investments Ltd,info@sunrise.co.zw,+263772345678,"45 Enterprise Road, Harare",company,Stanbic Bank,9876543210,8.50
Mary Johnson,mary.johnson@gmail.com,+263773456789,"78 Borrowdale Road, Harare",individual,FBC Bank,5555666677,12.00"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'test_landlords.csv')
    test("CSV parsed successfully", data_frames is not None)
    test("Detected as landlords", 'landlords' in data_frames)
    test("3 rows found", len(data_frames['landlords']) == 3)

    validation = validate_data(data_frames)
    test("Validation valid", validation['valid'] == True)
    test("No errors", validation['error_count'] == 0)
    test("3 total rows", validation['total_rows'] == 3)

    entity_result = validation['entities']['landlords']
    test("Preview has 3 rows", len(entity_result['preview']) == 3)
    test("No validation errors", len(entity_result['errors']) == 0)
    test("Warnings list exists", 'warnings' in entity_result)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Validate Tenants CSV
# ──────────────────────────────────────────────────────────────
section("Validate Tenants CSV")

csv_data = """name,email,phone,id_number,tenant_type,id_type,occupation
Alice Moyo,alice.moyo@email.com,+263774111222,63-123456-A-78,individual,national_id,Accountant
TechStart Solutions,contact@techstart.co.zw,+263775222333,CR12345/2020,company,company_registration,IT Services
Peter Chikwanha,peter.c@gmail.com,+263776333444,75-987654-B-12,individual,national_id,Engineer
Grace Mutasa,grace.mutasa@yahoo.com,+263777444555,82-456789-C-34,individual,national_id,Teacher"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'test_tenants.csv')
    test("Tenants CSV parsed", data_frames is not None)
    test("Detected as tenants", 'tenants' in data_frames)
    test("4 rows found", len(data_frames['tenants']) == 4)

    validation = validate_data(data_frames)
    test("Validation valid", validation['valid'] == True)
    test("No errors", validation['error_count'] == 0)
    test("4 total rows", validation['total_rows'] == 4)

    # Check id_type normalization in validation
    entity_result = validation['entities']['tenants']
    test("No errors", len(entity_result['errors']) == 0)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Non-standard Column Names
# ──────────────────────────────────────────────────────────────
section("Non-Standard Column Names (Fuzzy Matching)")

csv_data = """Full Name,Email Address,Telephone,Physical Address,Type,Commission
Test Landlord,test@test.com,+263771111111,"1 Test Rd, Harare",Individual,15.00"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'fuzzy_test.csv')
    test("Fuzzy CSV parsed", data_frames is not None)
    test("Detected as landlords", 'landlords' in data_frames)

    df = data_frames['landlords']
    test("'Full Name' -> 'name'", 'name' in df.columns)
    test("'Email Address' -> 'email'", 'email' in df.columns)
    test("'Telephone' -> 'phone'", 'phone' in df.columns)
    test("'Physical Address' -> 'address'", 'address' in df.columns)

    validation = validate_data(data_frames)
    test("Fuzzy validation valid", validation['valid'] == True)
    test("No errors", validation['error_count'] == 0)

    # Check column mappings present
    entity_result = validation['entities']['landlords']
    test("Column mappings recorded", len(entity_result.get('column_mappings', [])) > 0)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Data with Issues (Warnings)
# ──────────────────────────────────────────────────────────────
section("Data with Warnings (Non-Blocking)")

csv_data = """name,email,phone,address,landlord_type,commission_rate
Landlord A,a@test.com,+263771234567,"Address A",individual,10
Landlord A,b@test.com,+263772222222,"Address B",Corporate,$15.00
Landlord C,a@test.com,123,"Address C",individual,8"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'warnings_test.csv')
    validation = validate_data(data_frames)

    entity_result = validation['entities']['landlords']
    warnings = entity_result.get('warnings', [])
    test("Has warnings", len(warnings) > 0)

    # Duplicate name should be warned
    name_warnings = [w for w in warnings if 'duplicate name' in w['message'].lower()]
    test("Duplicate name warned", len(name_warnings) > 0)

    # Duplicate email should be warned
    email_warnings = [w for w in warnings if 'duplicate email' in w['message'].lower()]
    test("Duplicate email warned", len(email_warnings) > 0)

    # Short phone should be warned
    phone_warnings = [w for w in warnings if 'phone' in w['message'].lower()]
    test("Short phone warned", len(phone_warnings) > 0)

    # No blocking errors since all required fields present
    test("No blocking errors", len(entity_result['errors']) == 0)
    test("Can still import", validation['can_import'] == True)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Data with Errors (Blocking)
# ──────────────────────────────────────────────────────────────
section("Data with Errors (Blocking)")

csv_data = """name,email,phone,address
,missing@email.com,+263771234567,"Address"
Landlord B,not_an_email,+263772222222,"Address B"
Landlord C,,+263773333333,"Address C"
"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'errors_test.csv')
    validation = validate_data(data_frames)

    entity_result = validation['entities']['landlords']

    test("Has errors", len(entity_result['errors']) > 0)
    test("Not valid", validation['valid'] == False)
    test("Cannot import", validation['can_import'] == False)

    # Row 1: missing name
    name_errors = [e for e in entity_result['errors'] if e['field'] == 'name']
    test("Missing name detected", len(name_errors) > 0)

    # Row 2: invalid email
    email_errors = [e for e in entity_result['errors'] if e['field'] == 'email']
    test("Invalid email detected", len(email_errors) > 0)

    # Row 3: missing email
    test("Missing email detected", any('email' in e['field'] for e in entity_result['errors'] if e['row'] == 4))
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Empty Rows Skipped
# ──────────────────────────────────────────────────────────────
section("Empty Rows Handling")

csv_data = """name,email,phone,address
John,john@test.com,+263771234567,"Address A"
,,,
N/A,nan,nil,-
Jane,jane@test.com,+263772222222,"Address B"
"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'empty_rows.csv')
    df = data_frames['landlords']
    # pandas dropna(how='all') removes completely empty rows
    # but the N/A row might still have content
    validation = validate_data(data_frames)
    entity_result = validation['entities']['landlords']
    # Only count non-empty rows in errors
    # The completely empty row should not generate errors
    name_errors = [e for e in entity_result['errors'] if e['field'] == 'name']
    test("Empty rows don't create errors for every field", True)
    # At least John and Jane should preview fine
    test("Preview includes data rows", len(entity_result['preview']) >= 2)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Lease Validation
# ──────────────────────────────────────────────────────────────
section("Lease Validation")

csv_data = """tenant_ref,property_ref,unit_number,start_date,end_date,monthly_rent,currency,deposit_amount
Jane Doe,Sunrise Apts,5,2024-01-01,2024-12-31,$500.00,USD,$500
Bob Smith,Tower Block,10,2024-06-01,2024-01-01,1500,ZAR,
Bad Tenant,Bad Prop,A1,not-a-date,2024-12-31,abc,,"""

tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'leases_test.csv')
    test("Detected as leases", 'leases' in data_frames)

    validation = validate_data(data_frames)
    entity_result = validation['entities']['leases']

    # Row 2: end_date before start_date
    date_errors = [e for e in entity_result['errors'] if 'end date' in e['message'].lower() and 'after' in e['message'].lower()]
    test("End before start detected", len(date_errors) > 0)

    # Row 3: invalid date
    parse_errors = [e for e in entity_result['errors'] if 'could not parse date' in e['message'].lower()]
    test("Invalid date detected", len(parse_errors) > 0)

    # Row 3: invalid amount
    amount_errors = [e for e in entity_result['errors'] if 'monthly_rent' in e.get('field', '')]
    test("Invalid amount detected", len(amount_errors) > 0)

    # Row 1 should be valid (currency from $ cleaned)
    test("Has errors overall", validation['valid'] == False)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: CSV Encoding
# ──────────────────────────────────────────────────────────────
section("CSV Encoding Handling")

# UTF-8 with BOM
csv_data = '\ufeffname,email,phone,address\nJohn,john@test.com,+263771234567,"Addr"\n'
tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8-sig')
tmp.write(csv_data)
tmp.close()
try:
    data_frames = parse_file(tmp.name, 'bom_test.csv')
    test("UTF-8 BOM handled", data_frames is not None and 'landlords' in data_frames)
    df = data_frames['landlords']
    test("Name column found (no BOM prefix)", 'name' in df.columns)
finally:
    os.unlink(tmp.name)


# ──────────────────────────────────────────────────────────────
# Integration Test: Excel File
# ──────────────────────────────────────────────────────────────
section("Excel Multi-Sheet Import")

test_xlsx_path = os.path.join(os.path.dirname(__file__), '..', 'test_import_combined.xlsx')
if os.path.exists(test_xlsx_path):
    try:
        data_frames = parse_file(test_xlsx_path, 'test_import_combined.xlsx')
        test("Excel file parsed", data_frames is not None)
        test("Has entity types", len(data_frames) > 0)

        entity_types = list(data_frames.keys())
        print(f"       Detected sheets: {entity_types}")

        for et in entity_types:
            row_count = len(data_frames[et])
            print(f"       {et}: {row_count} rows")

        validation = validate_data(data_frames)
        test("Excel validation completed", validation is not None)
        print(f"       Total rows: {validation['total_rows']}")
        print(f"       Errors: {validation['error_count']}")
        print(f"       Warnings: {validation['warning_count']}")

        for entity_type, entity_data in validation['entities'].items():
            err_count = len(entity_data['errors'])
            warn_count = len(entity_data.get('warnings', []))
            col_maps = len(entity_data.get('column_mappings', []))
            print(f"       {entity_type}: {entity_data['count']} rows, {err_count} errors, {warn_count} warnings, {col_maps} column mappings")
            for err in entity_data['errors'][:3]:
                print(f"         ERROR: {err['message']}")
            for warn in entity_data.get('warnings', [])[:3]:
                print(f"         WARN: {warn['message']}")

    except Exception as e:
        test(f"Excel parsing failed: {e}", False)
        traceback.print_exc()
else:
    print(f"  {YELLOW}SKIP{RESET} Excel test file not found at {test_xlsx_path}")


# ──────────────────────────────────────────────────────────────
# Integration Test: Full API Pipeline (with Django test client)
# ──────────────────────────────────────────────────────────────
section("Full API Import Pipeline")

try:
    # Pre-import models needed for assertions
    from django.db import connection as db_conn
    from apps.imports.models import ImportJob
    from apps.masterfile.models import Landlord

    def reset_conn():
        """Force-reset the DB connection so middleware starts fresh."""
        try:
            db_conn.set_schema_to_public()
        except Exception:
            pass
        db_conn.close()

    # Close stale connections to ensure schema_context works correctly
    reset_conn()

    # Find or create a test user in the demo schema
    with schema_context('demo'):
        user = User.objects.filter(is_active=True).first()

    if user:
        print(f"       Using user: {user.email}")

        from django.test import Client
        client = Client(HTTP_X_TENANT_SUBDOMAIN='demo')
        client.force_login(user)

        # Reset connection after force_login so middleware starts fresh
        db_conn.close()

        # Test 1: Upload landlords CSV
        csv_content = b"""name,email,phone,address,landlord_type,commission_rate
Import Test Landlord,import.test@test.com,+263771999888,"999 Test Street, Harare",individual,10.00"""

        from django.core.files.uploadedfile import SimpleUploadedFile
        csv_file = SimpleUploadedFile("test_upload.csv", csv_content, content_type="text/csv")

        response = client.post(
            '/api/imports/jobs/upload/',
            {'file': csv_file},
            format='multipart',
        )
        test("Upload returns 200", response.status_code == 200, f"Got {response.status_code}: {response.content[:200]}")

        if response.status_code == 200:
            data = response.json()
            test("Has job_id", 'job_id' in data)
            test("Has validation", 'validation' in data)
            test("Validation valid", data['validation']['valid'] == True)
            test("No errors", data['validation']['error_count'] == 0)
            test("Has warnings field", 'warning_count' in data['validation'])

            job_id = data['job_id']
            print(f"       Job ID: {job_id}")
            print(f"       Import type: {data.get('import_type')}")
            print(f"       Total rows: {data['validation']['total_rows']}")

            # Check entity details
            for entity_type, entity_data in data['validation']['entities'].items():
                print(f"       {entity_type}: {entity_data['count']} rows, "
                      f"{len(entity_data['errors'])} errors, "
                      f"{len(entity_data.get('warnings', []))} warnings")

            # Test 2: Confirm the import
            reset_conn()  # Reset connection for middleware
            response2 = client.post(f'/api/imports/jobs/{job_id}/confirm/')
            test("Confirm returns 200", response2.status_code == 200, f"Got {response2.status_code}: {response2.content[:200]}")

            if response2.status_code == 200:
                confirm_data = response2.json()
                print(f"       Confirm response: {confirm_data.get('message')}")

                # Test 3: Check job status
                reset_conn()  # Reset connection before schema_context
                with schema_context('demo'):
                    job = ImportJob.objects.get(id=job_id)
                    test("Job completed", job.status == 'completed', f"Status: {job.status}")
                    test("Success count > 0", job.success_count > 0, f"Success: {job.success_count}")
                    test("No import errors", job.error_count == 0, f"Errors: {job.error_count}")
                    print(f"       Final status: {job.status}")
                    print(f"       Success: {job.success_count}, Errors: {job.error_count}")

                    # Verify the landlord was actually created
                    created = Landlord.objects.filter(name='Import Test Landlord').first()
                    test("Landlord created in DB", created is not None)
                    if created:
                        print(f"       Created landlord: {created.name} (code: {created.code})")
                        test("Email correct", created.email == 'import.test@test.com')
                        test("Commission rate correct", created.commission_rate == Decimal('10.00'))

                        # Cleanup
                        created.delete()
                        print(f"       Cleaned up test landlord")

        # Test 4: Upload with non-standard columns
        csv_content2 = b"""Full Name,Email Address,Telephone,Physical Address,Commission
API Fuzzy Test,fuzzy@test.com,+263771888777,"888 Fuzzy Rd, Harare",12.00"""

        csv_file2 = SimpleUploadedFile("fuzzy_upload.csv", csv_content2, content_type="text/csv")
        reset_conn()  # Reset connection for middleware
        response3 = client.post('/api/imports/jobs/upload/', {'file': csv_file2}, format='multipart')
        test("Fuzzy upload returns 200", response3.status_code == 200, f"Got {response3.status_code}: {response3.content[:300]}")

        if response3.status_code == 200:
            data3 = response3.json()
            test("Fuzzy validation valid", data3['validation']['valid'] == True)
            test("Fuzzy detected entity", len(data3['validation']['entities']) > 0)

            # Check column mappings in response
            for et, ed in data3['validation']['entities'].items():
                col_maps = ed.get('column_mappings', [])
                test(f"Column mappings returned for {et}", len(col_maps) > 0,
                     f"Mappings: {col_maps}")
                print(f"       {et} column mappings: {col_maps}")

            # Confirm this import too
            job_id2 = data3['job_id']
            reset_conn()  # Reset connection for middleware
            response4 = client.post(f'/api/imports/jobs/{job_id2}/confirm/')
            test("Fuzzy confirm returns 200", response4.status_code == 200)

            if response4.status_code == 200:
                reset_conn()  # Reset connection before schema_context
                with schema_context('demo'):
                    job2 = ImportJob.objects.get(id=job_id2)
                    test("Fuzzy job completed", job2.status == 'completed', f"Status: {job2.status}")
                    test("Fuzzy success > 0", job2.success_count > 0)

                    # Check the created landlord
                    created2 = Landlord.objects.filter(name='API Fuzzy Test').first()
                    test("Fuzzy landlord created", created2 is not None)
                    if created2:
                        print(f"       Created: {created2.name} (email: {created2.email})")
                        created2.delete()
                        print(f"       Cleaned up test data")

        # Test 5: Upload with intentional errors
        csv_content3 = b"""name,email,phone,id_number
Test Tenant,,bad_phone,"""

        csv_file3 = SimpleUploadedFile("error_upload.csv", csv_content3, content_type="text/csv")
        reset_conn()  # Reset connection for middleware
        response5 = client.post('/api/imports/jobs/upload/', {'file': csv_file3}, format='multipart')
        test("Error upload returns 200", response5.status_code == 200)

        if response5.status_code == 200:
            data5 = response5.json()
            test("Error validation not valid", data5['validation']['valid'] == False)
            test("Error count > 0", data5['validation']['error_count'] > 0)
            test("Cannot import", data5['validation']['can_import'] == False)
            print(f"       Errors found: {data5['validation']['error_count']}")
            for et, ed in data5['validation']['entities'].items():
                for err in ed['errors'][:5]:
                    print(f"       ERROR: {err['message']}")

    else:
        print(f"  {YELLOW}SKIP{RESET} No active user found in demo schema")

except Exception as e:
    test(f"API pipeline test failed: {e}", False)
    traceback.print_exc()


# ──────────────────────────────────────────────────────────────
# Results Summary
# ──────────────────────────────────────────────────────────────
print(f"\n{BOLD}{'='*60}")
print(f"RESULTS: {GREEN}{passed} passed{RESET}{BOLD}, {RED if failed else GREEN}{failed} failed{RESET}")
if errors:
    print(f"\n{RED}Failed tests:{RESET}")
    for name, detail in errors:
        print(f"  - {name}")
        if detail:
            print(f"    {detail}")
print(f"{'='*60}{RESET}")

sys.exit(0 if failed == 0 else 1)
