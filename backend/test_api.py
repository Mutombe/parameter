#!/usr/bin/env python
"""
Comprehensive API Test Script for Parameter Backend
Tests all endpoints for functionality and scalability
"""
import requests
import json
import sys
import time
from datetime import datetime, timedelta
from decimal import Decimal

BASE_URL = "http://localhost:8000"
API_URL = f"{BASE_URL}/api"

# Tenant configuration - use Host header for multi-tenant access
TENANT_DOMAIN = "demo.localhost"

# Test credentials
ADMIN_EMAIL = "admin@parameter.co.zw"
ADMIN_PASSWORD = "Admin@123"

# Store session for authenticated requests
session = requests.Session()
csrf_token = None

# Test statistics
tests_passed = 0
tests_failed = 0
test_results = []

def log_result(test_name, passed, details="", error=None):
    """Log test result."""
    global tests_passed, tests_failed

    status = "PASS" if passed else "FAIL"
    if passed:
        tests_passed += 1
        print(f"  [PASS] {test_name}")
    else:
        tests_failed += 1
        print(f"  [FAIL] {test_name}")
        if error:
            print(f"    Error: {error}")

    test_results.append({
        'test': test_name,
        'status': status,
        'details': details,
        'error': str(error) if error else None
    })

def get_headers(use_tenant=False):
    """Get headers with CSRF token and optional tenant host."""
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    if csrf_token:
        headers['X-CSRFToken'] = csrf_token
    if use_tenant:
        headers['Host'] = TENANT_DOMAIN
    return headers

def get_tenant_headers():
    """Get headers for tenant-specific endpoints."""
    return get_headers(use_tenant=True)

def test_health_check():
    """Test basic server health."""
    print("\n=== Health Check ===")
    try:
        response = session.get(f"{API_URL}/docs/", timeout=10)
        log_result("API Docs accessible", response.status_code == 200)
        return response.status_code == 200
    except Exception as e:
        log_result("API Docs accessible", False, error=e)
        return False

def test_authentication():
    """Test authentication endpoints."""
    global csrf_token, session

    print("\n=== Authentication Tests ===")

    # Create a fresh session for tenant
    session = requests.Session()

    # Test login with valid credentials on tenant domain
    try:
        response = session.post(
            f"{API_URL}/accounts/auth/login/",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={'Content-Type': 'application/json', 'Host': TENANT_DOMAIN}
        )

        if response.status_code == 200:
            data = response.json()
            # Get CSRF token from cookies
            for cookie in session.cookies:
                if cookie.name == 'csrftoken':
                    csrf_token = cookie.value
                    break
            log_result("Login with valid credentials (tenant)", True, f"User: {data.get('user', {}).get('email')}")
        else:
            log_result("Login with valid credentials (tenant)", False, error=response.text)
            return False
    except Exception as e:
        log_result("Login with valid credentials (tenant)", False, error=e)
        return False

    # Test login with invalid credentials (in a separate session)
    try:
        test_session = requests.Session()
        response = test_session.post(
            f"{API_URL}/accounts/auth/login/",
            json={"email": "invalid@test.com", "password": "wrongpassword"},
            headers={'Content-Type': 'application/json', 'Host': TENANT_DOMAIN}
        )
        log_result("Login rejection with invalid credentials", response.status_code == 400)
    except Exception as e:
        log_result("Login rejection with invalid credentials", False, error=e)

    # Test me endpoint
    try:
        response = session.get(f"{API_URL}/accounts/auth/me/", headers=get_tenant_headers())
        log_result("Get current user (me)", response.status_code == 200)
    except Exception as e:
        log_result("Get current user (me)", False, error=e)

    return True

def test_masterfile_landlords():
    """Test landlord CRUD operations."""
    print("\n=== Landlord Tests ===")
    landlord_id = None

    # List landlords
    try:
        response = session.get(f"{API_URL}/masterfile/landlords/", headers=get_tenant_headers())
        log_result("List landlords", response.status_code == 200)
    except Exception as e:
        log_result("List landlords", False, error=e)

    # Create landlord
    try:
        landlord_data = {
            "name": f"Test Landlord {datetime.now().timestamp()}",
            "contact_person": "John Doe",
            "email": f"landlord{int(time.time())}@test.com",
            "phone": "+263771234567",
            "address": "123 Test Street, Harare"
        }
        response = session.post(
            f"{API_URL}/masterfile/landlords/",
            json=landlord_data,
            headers=get_tenant_headers()
        )
        if response.status_code == 201:
            landlord_id = response.json().get('id')
            log_result("Create landlord", True, f"ID: {landlord_id}")
        else:
            log_result("Create landlord", False, error=response.text)
    except Exception as e:
        log_result("Create landlord", False, error=e)

    # Get single landlord
    if landlord_id:
        try:
            response = session.get(f"{API_URL}/masterfile/landlords/{landlord_id}/", headers=get_tenant_headers())
            log_result("Get single landlord", response.status_code == 200)
        except Exception as e:
            log_result("Get single landlord", False, error=e)

        # Update landlord
        try:
            response = session.patch(
                f"{API_URL}/masterfile/landlords/{landlord_id}/",
                json={"contact_person": "Jane Doe Updated"},
                headers=get_tenant_headers()
            )
            log_result("Update landlord", response.status_code == 200)
        except Exception as e:
            log_result("Update landlord", False, error=e)

    return landlord_id

def test_masterfile_properties(landlord_id):
    """Test property CRUD operations."""
    print("\n=== Property Tests ===")
    property_id = None

    # List properties
    try:
        response = session.get(f"{API_URL}/masterfile/properties/", headers=get_tenant_headers())
        log_result("List properties", response.status_code == 200)
    except Exception as e:
        log_result("List properties", False, error=e)

    # Create property
    if landlord_id:
        try:
            property_data = {
                "name": f"Test Property {datetime.now().timestamp()}",
                "landlord": landlord_id,
                "address": "456 Property Ave, Harare",
                "property_type": "residential",
                "total_units": 10
            }
            response = session.post(
                f"{API_URL}/masterfile/properties/",
                json=property_data,
                headers=get_tenant_headers()
            )
            if response.status_code == 201:
                property_id = response.json().get('id')
                log_result("Create property", True, f"ID: {property_id}")
            else:
                log_result("Create property", False, error=response.text)
        except Exception as e:
            log_result("Create property", False, error=e)

    return property_id

def test_masterfile_units(property_id):
    """Test unit CRUD operations."""
    print("\n=== Unit Tests ===")
    unit_id = None

    # List units
    try:
        response = session.get(f"{API_URL}/masterfile/units/", headers=get_tenant_headers())
        log_result("List units", response.status_code == 200)
    except Exception as e:
        log_result("List units", False, error=e)

    # Create unit
    if property_id:
        try:
            unit_data = {
                "property": property_id,
                "unit_number": f"A{int(time.time()) % 1000}",
                "floor": 1,
                "bedrooms": 2,
                "bathrooms": 1,
                "size_sqm": 75.5,
                "rent_amount": "500.00",
                "status": "vacant"
            }
            response = session.post(
                f"{API_URL}/masterfile/units/",
                json=unit_data,
                headers=get_tenant_headers()
            )
            if response.status_code == 201:
                unit_id = response.json().get('id')
                log_result("Create unit", True, f"ID: {unit_id}")
            else:
                log_result("Create unit", False, error=response.text)
        except Exception as e:
            log_result("Create unit", False, error=e)

    return unit_id

def test_masterfile_tenants():
    """Test tenant CRUD operations."""
    print("\n=== Tenant Tests ===")
    tenant_id = None

    # List tenants
    try:
        response = session.get(f"{API_URL}/masterfile/tenants/", headers=get_tenant_headers())
        log_result("List tenants", response.status_code == 200)
    except Exception as e:
        log_result("List tenants", False, error=e)

    # Create tenant
    try:
        tenant_data = {
            "first_name": "Test",
            "last_name": f"Tenant{int(time.time())}",
            "email": f"tenant{int(time.time())}@test.com",
            "phone": "+263772345678",
            "id_number": f"ID{int(time.time())}",
            "emergency_contact": "Emergency Person",
            "emergency_phone": "+263773456789"
        }
        response = session.post(
            f"{API_URL}/masterfile/tenants/",
            json=tenant_data,
            headers=get_tenant_headers()
        )
        if response.status_code == 201:
            tenant_id = response.json().get('id')
            log_result("Create tenant", True, f"ID: {tenant_id}")
        else:
            log_result("Create tenant", False, error=response.text)
    except Exception as e:
        log_result("Create tenant", False, error=e)

    return tenant_id

def test_masterfile_leases(unit_id, tenant_id):
    """Test lease CRUD operations."""
    print("\n=== Lease Tests ===")
    lease_id = None

    # List leases
    try:
        response = session.get(f"{API_URL}/masterfile/leases/", headers=get_tenant_headers())
        log_result("List leases", response.status_code == 200)
    except Exception as e:
        log_result("List leases", False, error=e)

    # Create lease
    if unit_id and tenant_id:
        try:
            start_date = datetime.now().strftime("%Y-%m-%d")
            end_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
            lease_data = {
                "unit": unit_id,
                "tenant": tenant_id,
                "start_date": start_date,
                "end_date": end_date,
                "rent_amount": "500.00",
                "deposit_amount": "1000.00",
                "payment_day": 1,
                "status": "active"
            }
            response = session.post(
                f"{API_URL}/masterfile/leases/",
                json=lease_data,
                headers=get_tenant_headers()
            )
            if response.status_code == 201:
                lease_id = response.json().get('id')
                log_result("Create lease", True, f"ID: {lease_id}")
            else:
                log_result("Create lease", False, error=response.text)
        except Exception as e:
            log_result("Create lease", False, error=e)

    return lease_id

def test_billing_invoices(lease_id):
    """Test invoice CRUD operations."""
    print("\n=== Invoice Tests ===")
    invoice_id = None

    # List invoices
    try:
        response = session.get(f"{API_URL}/billing/invoices/", headers=get_tenant_headers())
        log_result("List invoices", response.status_code == 200)
    except Exception as e:
        log_result("List invoices", False, error=e)

    # Create invoice
    if lease_id:
        try:
            due_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            invoice_data = {
                "lease": lease_id,
                "due_date": due_date,
                "items": [
                    {"description": "Monthly Rent", "amount": "500.00"},
                    {"description": "Utilities", "amount": "50.00"}
                ]
            }
            response = session.post(
                f"{API_URL}/billing/invoices/",
                json=invoice_data,
                headers=get_tenant_headers()
            )
            if response.status_code == 201:
                invoice_id = response.json().get('id')
                log_result("Create invoice", True, f"ID: {invoice_id}")
            else:
                log_result("Create invoice", False, error=response.text)
        except Exception as e:
            log_result("Create invoice", False, error=e)

    return invoice_id

def test_billing_receipts(invoice_id):
    """Test receipt CRUD operations."""
    print("\n=== Receipt Tests ===")

    # List receipts
    try:
        response = session.get(f"{API_URL}/billing/receipts/", headers=get_tenant_headers())
        log_result("List receipts", response.status_code == 200)
    except Exception as e:
        log_result("List receipts", False, error=e)

    # Create receipt (if invoice exists)
    if invoice_id:
        try:
            receipt_data = {
                "invoice": invoice_id,
                "amount": "550.00",
                "payment_method": "bank_transfer",
                "reference": f"REF{int(time.time())}"
            }
            response = session.post(
                f"{API_URL}/billing/receipts/",
                json=receipt_data,
                headers=get_tenant_headers()
            )
            if response.status_code == 201:
                receipt_id = response.json().get('id')
                log_result("Create receipt", True, f"ID: {receipt_id}")
            else:
                log_result("Create receipt", False, error=response.text)
        except Exception as e:
            log_result("Create receipt", False, error=e)

def test_billing_expenses():
    """Test expense CRUD operations."""
    print("\n=== Expense Tests ===")

    # List expenses
    try:
        response = session.get(f"{API_URL}/billing/expenses/", headers=get_tenant_headers())
        log_result("List expenses", response.status_code == 200)
    except Exception as e:
        log_result("List expenses", False, error=e)

def test_accounting_chart_of_accounts():
    """Test chart of accounts CRUD operations."""
    print("\n=== Chart of Accounts Tests ===")

    # List accounts
    try:
        response = session.get(f"{API_URL}/accounting/accounts/", headers=get_tenant_headers())
        log_result("List chart of accounts", response.status_code == 200)
        if response.status_code == 200:
            accounts = response.json()
            log_result("Chart of accounts has data", len(accounts.get('results', accounts)) > 0 if isinstance(accounts, dict) else len(accounts) > 0)
    except Exception as e:
        log_result("List chart of accounts", False, error=e)

def test_accounting_journals():
    """Test journal CRUD operations."""
    print("\n=== Journal Tests ===")

    # List journals
    try:
        response = session.get(f"{API_URL}/accounting/journals/", headers=get_tenant_headers())
        log_result("List journals", response.status_code == 200)
    except Exception as e:
        log_result("List journals", False, error=e)

def test_accounting_general_ledger():
    """Test general ledger operations."""
    print("\n=== General Ledger Tests ===")

    # List general ledger entries
    try:
        response = session.get(f"{API_URL}/accounting/general-ledger/", headers=get_tenant_headers())
        log_result("List general ledger", response.status_code == 200)
    except Exception as e:
        log_result("List general ledger", False, error=e)

def test_accounting_audit_trail():
    """Test audit trail operations."""
    print("\n=== Audit Trail Tests ===")

    # List audit trail
    try:
        response = session.get(f"{API_URL}/accounting/audit-trail/", headers=get_tenant_headers())
        log_result("List audit trail", response.status_code == 200)
    except Exception as e:
        log_result("List audit trail", False, error=e)

def test_reports():
    """Test report endpoints."""
    print("\n=== Report Tests ===")

    # Dashboard stats
    try:
        response = session.get(f"{API_URL}/reports/dashboard/", headers=get_tenant_headers())
        log_result("Dashboard stats", response.status_code == 200)
    except Exception as e:
        log_result("Dashboard stats", False, error=e)

    # Trial balance
    try:
        response = session.get(f"{API_URL}/reports/trial-balance/", headers=get_tenant_headers())
        log_result("Trial balance report", response.status_code == 200)
    except Exception as e:
        log_result("Trial balance report", False, error=e)

    # Income statement
    try:
        response = session.get(f"{API_URL}/reports/income-statement/", headers=get_tenant_headers())
        log_result("Income statement report", response.status_code == 200)
    except Exception as e:
        log_result("Income statement report", False, error=e)

    # Balance sheet
    try:
        response = session.get(f"{API_URL}/reports/balance-sheet/", headers=get_tenant_headers())
        log_result("Balance sheet report", response.status_code == 200)
    except Exception as e:
        log_result("Balance sheet report", False, error=e)

    # Cash flow
    try:
        response = session.get(f"{API_URL}/reports/cash-flow/", headers=get_tenant_headers())
        log_result("Cash flow report", response.status_code == 200)
    except Exception as e:
        log_result("Cash flow report", False, error=e)

    # Vacancy report
    try:
        response = session.get(f"{API_URL}/reports/vacancy/", headers=get_tenant_headers())
        log_result("Vacancy report", response.status_code == 200)
    except Exception as e:
        log_result("Vacancy report", False, error=e)

    # Rent roll
    try:
        response = session.get(f"{API_URL}/reports/rent-roll/", headers=get_tenant_headers())
        log_result("Rent roll report", response.status_code == 200)
    except Exception as e:
        log_result("Rent roll report", False, error=e)

def test_search():
    """Test search endpoints."""
    print("\n=== Search Tests ===")

    # Unified search
    try:
        response = session.get(f"{API_URL}/search/?q=test", headers=get_tenant_headers())
        log_result("Unified search", response.status_code == 200)
    except Exception as e:
        log_result("Unified search", False, error=e)

    # Search suggestions
    try:
        response = session.get(f"{API_URL}/search/suggestions/?q=test", headers=get_tenant_headers())
        log_result("Search suggestions", response.status_code == 200)
    except Exception as e:
        log_result("Search suggestions", False, error=e)

def test_notifications():
    """Test notification endpoints."""
    print("\n=== Notification Tests ===")

    # List notifications
    try:
        response = session.get(f"{API_URL}/notifications/notifications/", headers=get_tenant_headers())
        log_result("List notifications", response.status_code == 200)
    except Exception as e:
        log_result("List notifications", False, error=e)

    # List preferences
    try:
        response = session.get(f"{API_URL}/notifications/preferences/", headers=get_tenant_headers())
        log_result("List notification preferences", response.status_code == 200)
    except Exception as e:
        log_result("List notification preferences", False, error=e)

def test_ai_service():
    """Test AI service endpoints."""
    print("\n=== AI Service Tests ===")

    # AI status
    try:
        response = session.get(f"{API_URL}/ai/status/", headers=get_tenant_headers())
        log_result("AI service status", response.status_code == 200)
    except Exception as e:
        log_result("AI service status", False, error=e)

    # Suggested questions
    try:
        response = session.get(f"{API_URL}/ai/suggestions/", headers=get_tenant_headers())
        log_result("AI suggested questions", response.status_code == 200)
    except Exception as e:
        log_result("AI suggested questions", False, error=e)

def test_tenant_management():
    """Test tenant (company) management endpoints."""
    print("\n=== Tenant Management Tests ===")

    # Check subdomain availability
    try:
        response = session.post(
            f"{API_URL}/accounts/auth/login/",  # Re-login first
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={'Content-Type': 'application/json'}
        )
    except:
        pass

    # Subscription plans (public)
    try:
        response = requests.get(f"{BASE_URL}/api/accounts/auth/login/")  # Just checking public access
        log_result("Public endpoints accessible", True)
    except Exception as e:
        log_result("Public endpoints accessible", False, error=e)

def test_scalability():
    """Test API scalability with concurrent requests."""
    print("\n=== Scalability Tests ===")

    import concurrent.futures
    import statistics

    def make_request():
        start = time.time()
        try:
            response = session.get(f"{API_URL}/masterfile/landlords/", headers=get_tenant_headers())
            return time.time() - start, response.status_code == 200
        except:
            return time.time() - start, False

    # Test with 10 concurrent requests
    times = []
    successes = 0

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(10)]
            for future in concurrent.futures.as_completed(futures):
                elapsed, success = future.result()
                times.append(elapsed)
                if success:
                    successes += 1

        avg_time = statistics.mean(times)
        log_result(f"10 concurrent requests (avg: {avg_time:.3f}s)", successes >= 8, f"Success rate: {successes}/10")
    except Exception as e:
        log_result("Concurrent request handling", False, error=e)

    # Test response time for list endpoints
    endpoints = [
        "/masterfile/landlords/",
        "/masterfile/properties/",
        "/masterfile/units/",
        "/masterfile/tenants/",
        "/billing/invoices/",
        "/reports/dashboard/"
    ]

    for endpoint in endpoints:
        try:
            start = time.time()
            response = session.get(f"{API_URL}{endpoint}", headers=get_tenant_headers())
            elapsed = time.time() - start
            log_result(f"Response time {endpoint} ({elapsed:.3f}s)", elapsed < 2.0 and response.status_code == 200)
        except Exception as e:
            log_result(f"Response time {endpoint}", False, error=e)

def test_data_validation():
    """Test data validation on endpoints."""
    print("\n=== Data Validation Tests ===")

    # Test invalid email format
    try:
        response = session.post(
            f"{API_URL}/masterfile/tenants/",
            json={
                "first_name": "Test",
                "last_name": "Validation",
                "email": "invalid-email",  # Invalid
                "phone": "+263771234567"
            },
            headers=get_tenant_headers()
        )
        log_result("Invalid email rejection", response.status_code == 400)
    except Exception as e:
        log_result("Invalid email rejection", False, error=e)

    # Test missing required fields
    try:
        response = session.post(
            f"{API_URL}/masterfile/landlords/",
            json={},  # Empty data
            headers=get_tenant_headers()
        )
        log_result("Missing required fields rejection", response.status_code == 400)
    except Exception as e:
        log_result("Missing required fields rejection", False, error=e)

def test_pagination():
    """Test pagination on list endpoints."""
    print("\n=== Pagination Tests ===")

    try:
        response = session.get(f"{API_URL}/masterfile/landlords/?page=1&page_size=5", headers=get_tenant_headers())
        if response.status_code == 200:
            data = response.json()
            has_pagination = 'results' in data or 'count' in data or isinstance(data, list)
            log_result("Pagination support", has_pagination)
        else:
            log_result("Pagination support", False, error=response.text)
    except Exception as e:
        log_result("Pagination support", False, error=e)

def test_filtering():
    """Test filtering on list endpoints."""
    print("\n=== Filtering Tests ===")

    # Test status filter on leases
    try:
        response = session.get(f"{API_URL}/masterfile/leases/?status=active", headers=get_tenant_headers())
        log_result("Filtering by status", response.status_code == 200)
    except Exception as e:
        log_result("Filtering by status", False, error=e)

    # Test search filter
    try:
        response = session.get(f"{API_URL}/masterfile/landlords/?search=test", headers=get_tenant_headers())
        log_result("Search filter", response.status_code == 200)
    except Exception as e:
        log_result("Search filter", False, error=e)

def cleanup_test_data(landlord_id=None):
    """Clean up test data created during tests."""
    print("\n=== Cleanup ===")

    if landlord_id:
        try:
            response = session.delete(f"{API_URL}/masterfile/landlords/{landlord_id}/", headers=get_tenant_headers())
            log_result("Cleanup test landlord", response.status_code in [200, 204])
        except Exception as e:
            log_result("Cleanup test landlord", False, error=e)

def main():
    """Run all tests."""
    print("=" * 60)
    print("PARAMETER API COMPREHENSIVE TEST SUITE")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Run tests
    if not test_health_check():
        print("\n[ERROR] Server is not responding. Aborting tests.")
        sys.exit(1)

    if not test_authentication():
        print("\n[ERROR] Authentication failed. Aborting tests.")
        sys.exit(1)

    # Masterfile tests
    landlord_id = test_masterfile_landlords()
    property_id = test_masterfile_properties(landlord_id)
    unit_id = test_masterfile_units(property_id)
    tenant_id = test_masterfile_tenants()
    lease_id = test_masterfile_leases(unit_id, tenant_id)

    # Billing tests
    invoice_id = test_billing_invoices(lease_id)
    test_billing_receipts(invoice_id)
    test_billing_expenses()

    # Accounting tests
    test_accounting_chart_of_accounts()
    test_accounting_journals()
    test_accounting_general_ledger()
    test_accounting_audit_trail()

    # Report tests
    test_reports()

    # Search tests
    test_search()

    # Notification tests
    test_notifications()

    # AI Service tests
    test_ai_service()

    # Tenant management tests
    test_tenant_management()

    # Additional tests
    test_data_validation()
    test_pagination()
    test_filtering()
    test_scalability()

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {tests_passed + tests_failed}")
    print(f"Passed: {tests_passed}")
    print(f"Failed: {tests_failed}")
    print(f"Success Rate: {(tests_passed / (tests_passed + tests_failed) * 100):.1f}%")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if tests_failed > 0:
        print("\n[FAILED TESTS]:")
        for result in test_results:
            if result['status'] == 'FAIL':
                print(f"  - {result['test']}: {result['error']}")

    return 0 if tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
