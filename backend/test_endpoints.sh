#!/bin/bash
# Comprehensive API Endpoint Test Script for Parameter Backend

BASE_URL="http://localhost:8000"
HOST="demo.localhost"
COOKIES="cookies.txt"

echo "=============================================="
echo "PARAMETER API ENDPOINT TESTS"
echo "=============================================="
echo "Date: $(date)"
echo ""

# Login first
echo "=== Authentication ==="
echo -n "Login: "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/accounts/auth/login/" \
  -H "Content-Type: application/json" \
  -H "Host: $HOST" \
  -d '{"email":"admin@parameter.co.zw","password":"Admin@123"}' \
  -c $COOKIES)

if echo "$LOGIN_RESPONSE" | grep -q "Login successful"; then
  echo "PASS"
else
  echo "FAIL - $LOGIN_RESPONSE"
  exit 1
fi

# Get CSRF token
CSRF_TOKEN=$(grep csrftoken $COOKIES | awk '{print $7}')

# Function to test GET endpoint
test_get() {
  local endpoint=$1
  local name=$2
  echo -n "$name: "
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" -H "Host: $HOST" -b $COOKIES)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "PASS (HTTP $HTTP_CODE)"
    return 0
  else
    echo "FAIL (HTTP $HTTP_CODE)"
    return 1
  fi
}

# Test all endpoints
PASSED=0
FAILED=0

echo ""
echo "=== Masterfile Endpoints ==="
test_get "/api/masterfile/landlords/" "List Landlords" && ((PASSED++)) || ((FAILED++))
test_get "/api/masterfile/properties/" "List Properties" && ((PASSED++)) || ((FAILED++))
test_get "/api/masterfile/units/" "List Units" && ((PASSED++)) || ((FAILED++))
test_get "/api/masterfile/tenants/" "List Tenants" && ((PASSED++)) || ((FAILED++))
test_get "/api/masterfile/leases/" "List Leases" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== Billing Endpoints ==="
test_get "/api/billing/invoices/" "List Invoices" && ((PASSED++)) || ((FAILED++))
test_get "/api/billing/receipts/" "List Receipts" && ((PASSED++)) || ((FAILED++))
test_get "/api/billing/expenses/" "List Expenses" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== Accounting Endpoints ==="
test_get "/api/accounting/accounts/" "Chart of Accounts" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounting/journals/" "Journals" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounting/general-ledger/" "General Ledger" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounting/audit-trail/" "Audit Trail" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounting/fiscal-periods/" "Fiscal Periods" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounting/exchange-rates/" "Exchange Rates" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== Report Endpoints ==="
test_get "/api/reports/dashboard/" "Dashboard Stats" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/trial-balance/" "Trial Balance" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/income-statement/" "Income Statement" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/balance-sheet/" "Balance Sheet" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/cash-flow/" "Cash Flow" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/vacancy/" "Vacancy Report" && ((PASSED++)) || ((FAILED++))
test_get "/api/reports/rent-roll/" "Rent Roll" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== Search Endpoints ==="
test_get "/api/search/?q=test" "Unified Search" && ((PASSED++)) || ((FAILED++))
test_get "/api/search/suggestions/?q=test" "Search Suggestions" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== Notification Endpoints ==="
test_get "/api/notifications/notifications/" "List Notifications" && ((PASSED++)) || ((FAILED++))
test_get "/api/notifications/preferences/" "Notification Preferences" && ((PASSED++)) || ((FAILED++))
test_get "/api/notifications/changelog/" "Masterfile Changelog" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== AI Service Endpoints ==="
test_get "/api/ai/status/" "AI Status" && ((PASSED++)) || ((FAILED++))
test_get "/api/ai/suggestions/" "AI Suggestions" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=== User/Auth Endpoints ==="
test_get "/api/accounts/auth/me/" "Current User (me)" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounts/users/" "List Users" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounts/activity/" "User Activity" && ((PASSED++)) || ((FAILED++))
test_get "/api/accounts/invitations/" "User Invitations" && ((PASSED++)) || ((FAILED++))

echo ""
echo "=============================================="
echo "TEST SUMMARY"
echo "=============================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
TOTAL=$((PASSED + FAILED))
echo "Total:  $TOTAL"
if [ $TOTAL -gt 0 ]; then
  RATE=$((PASSED * 100 / TOTAL))
  echo "Success Rate: $RATE%"
fi

# Cleanup
rm -f $COOKIES

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "All tests passed!"
  exit 0
else
  echo ""
  echo "Some tests failed!"
  exit 1
fi
