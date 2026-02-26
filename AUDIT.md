# Comprehensive Codebase Audit: Parameter

**Multi-tenant SaaS Real Estate Accounting System** — Django 4.2 + React 18 + PostgreSQL

**Audit Date:** 2026-02-26
**Branch:** `bug-fixes`

---

## Table of Contents

- [Critical Issues](#critical-issues-fix-immediately)
- [High Severity Issues](#high-severity-issues)
- [Medium Severity Issues](#medium-severity-issues)
- [Low Severity Issues](#low-severity-issues)
- [What's Done Well](#whats-done-well)
- [Priority Action Plan](#priority-action-plan)

---

## Critical Issues (Fix Immediately)

### 1. Publicly Accessible Debug Endpoint

- **File:** `backend/apps/tenants/views.py` (~line 1432)
- **Endpoint:** `/api/tenants/debug-info/` with `AllowAny` permission
- **Impact:** Exposes tenant schema info, database connection status, PostgreSQL search_path, and table existence checks to **anyone**
- **Fix:** Restrict to `IsAdminUser` or remove entirely

### 2. Cascade Delete Can Destroy Financial Data

- **File:** `backend/apps/masterfile/models.py:287`
- `Unit.property` uses `on_delete=CASCADE` — deleting a Property cascades to all Units → LeaseAgreements → Invoices/Receipts
- **Fix:** Change to `on_delete=models.PROTECT`

### 3. Weak Tenant Isolation on User Model

- **File:** `backend/apps/accounts/models.py:60-63`
- `tenant_schema` is a plain `CharField` (not a ForeignKey to Client). No middleware validation that user's tenant matches the request tenant.
- **Fix:** Add ForeignKey to Client, enforce in middleware

### 4. AuditTrail Not Tenant-Scoped

- **File:** `backend/apps/accounting/models.py` (~line 413)
- `AuditTrail` has no `tenant_schema` field. Record IDs are per-tenant but audit entries are shared, causing cross-tenant leakage in audit logs.
- **Fix:** Add `tenant_schema` field with composite uniqueness

---

## High Severity Issues

### 5. S3 Files Are Publicly Readable

- **File:** `backend/config/settings/base.py` (~line 192)
- `AWS_DEFAULT_ACL = 'public-read'` and `AWS_QUERYSTRING_AUTH = False`
- **Impact:** All uploaded documents (potentially sensitive financial docs) are publicly accessible
- **Fix:** Set `AWS_DEFAULT_ACL = 'private'` and `AWS_QUERYSTRING_AUTH = True`

### 6. Password Reset Token Not Tenant-Scoped

- **File:** `backend/apps/accounts/models.py:194-200`
- `PasswordResetToken` has no `tenant_schema` field — potential cross-tenant password reset
- **Fix:** Add tenant_schema field, validate in reset view

### 7. Race Condition in Code Generation

- **File:** `backend/apps/masterfile/models.py:160-169`
- `generate_code()` uses `order_by('-id').first()` with **no locking** — two concurrent saves can generate the same code
- Same pattern in `Landlord`, `Property`, `RentalTenant`, `Invoice`, `Receipt`
- **Fix:** Use `select_for_update()` or database sequences

### 8. Zero Test Coverage

- No unit tests exist in any app directory
- Only manual integration test files (`test_api.py`, `test_import.py`) in the backend root
- **Fix:** Implement comprehensive test suite (models, serializers, views, permissions)

### 9. 30+ Silent Exception Swallowing

- **Files:** `masterfile/views.py`, `notifications/signals.py`, `tenants/views.py`, `accounting/signals.py`
- Bare `except Exception: pass` blocks with **no logging** — failures in email sending, signal handlers, and tenant setup go completely unnoticed
- **Fix:** Add logging to all exception handlers at minimum

### 10. Hardcoded Credentials in Version Control

- `backend/test_api.py:14` — `ADMIN_PASSWORD = "Admin@123"`
- `backend/apps/tenants/management/commands/setup_public_tenant.py` — `default='Parameter2024!'`
- `backend/apps/tenants/management/commands/create_demo_tenant.py` — `default='demo123'`
- **Fix:** Use environment variables for all defaults

---

## Medium Severity Issues

### 11. Missing Data Validations

| Missing Validation                                   | Location                    |
| ---------------------------------------------------- | --------------------------- |
| No `end_date > start_date` check on leases           | `masterfile/models.py:494`  |
| No positive amount validators on invoices             | `billing/models.py:85-89`   |
| No unique constraint on RentalTenant email/ID         | `masterfile/models.py:381`  |
| No duplicate invoice prevention (same tenant+period)  | `billing/models.py:78-82`   |
| Nullable `LeaseAgreement.property` (denormalized)     | `masterfile/models.py:477`  |

### 12. N+1 Queries and In-Memory Processing

- `masterfile/serializers.py` — Python-side filtering with `next()`, `any()`, list comprehensions instead of DB queries
- `masterfile/views.py:236-284` — Sorting/filtering in Python: `sorted(tenant.leases.all(), ...)`
- `masterfile/models.py:171-182` — `vacancy_rate` property triggers 2 queries per property
- **Fix:** Use database annotations, `order_by()`, and `prefetch_related`

### 13. Fat Controllers / Business Logic in Views

- `masterfile/views.py:370-467` — 95+ lines of email template HTML embedded in view
- `billing/views.py:76-149` — Complex invoice generation logic in controller
- **Fix:** Extract to service layer classes

### 14. Exposed API Documentation

- `backend/config/urls.py` — Swagger UI at `/api/docs/` and OpenAPI schema at `/api/schema/` are publicly accessible
- **Fix:** Restrict to authenticated users in production

### 15. Denormalized Balance Field Drift

- `billing/models.py` — `Invoice.balance` is stored but can diverge from `total_amount - amount_paid`
- **Fix:** Make `balance` a `@property` or ensure atomic updates

### 16. Missing Database Indexes

- `Invoice.income_type`, `Receipt.bank_account`, `PropertyManager.assigned_by` lack indexes
- No composite indexes for common filter patterns (`lease_type + status`, `invoice_type + status`)

---

## Low Severity Issues

### 17. Code Duplication

- `generate_code()` pattern repeated in 5+ models — extract to utility
- Email template HTML duplicated 3x in `masterfile/views.py`

### 18. Inconsistent Logging

- Only ~27 files use logging; most endpoints have none
- No structured logging or request tracing

### 19. XSS Risk in Print Template

- `frontend/src/lib/printTemplate.ts` (~line 478) — uses `element.innerHTML` to populate print window
- Low risk since it's internal document printing, but should sanitize

### 20. CSRF Exempt on Login Endpoints

- `backend/apps/accounts/views.py:40,240` — `@csrf_exempt` on login and validate_reset_token
- Mitigated by CORS restrictions and SameSite cookies, but worth documenting

---

## What's Done Well

| Area                   | Assessment                                                    |
| ---------------------- | ------------------------------------------------------------- |
| **Authentication**     | JWT + RBAC with 5 roles, proper permission classes            |
| **Multi-tenancy**      | Schema-based isolation via django-tenants                     |
| **Query Optimization** | Extensive `select_related`/`prefetch_related` usage           |
| **Rate Limiting**      | Anonymous: 30/min, User: 120/min, Login: 5/min               |
| **Production Security**| HSTS, SSL redirect, secure cookies, content-type nosniff      |
| **Pagination**         | Global default (25 items, max 100)                            |
| **Soft Delete**        | Clean 3-manager pattern with trash recovery                   |
| **Error Responses**    | Custom exception handler with user-friendly messages          |
| **Token Security**     | `secrets.token_urlsafe(32)`, 1-hour expiry, single-use       |
| **Payment Concurrency**| `select_for_update()` on invoice payment processing           |

---

## Priority Action Plan

| Priority | Action                                                  | Effort    |
| -------- | ------------------------------------------------------- | --------- |
| **P0**   | Remove/restrict debug endpoint                          | 5 min     |
| **P0**   | Change Unit→Property to `on_delete=PROTECT`             | 15 min    |
| **P0**   | Fix S3 ACL to `private` + signed URLs                   | 15 min    |
| **P1**   | Add `tenant_schema` to AuditTrail & PasswordResetToken  | 1-2 hrs   |
| **P1**   | Strengthen User ↔ Client tenant binding                 | 2-3 hrs   |
| **P1**   | Add model validations (dates, amounts, uniqueness)      | 2-3 hrs   |
| **P1**   | Fix code generation race conditions                     | 1-2 hrs   |
| **P1**   | Add logging to all exception handlers                   | 1-2 hrs   |
| **P2**   | Extract service layer for email/invoicing               | 4-6 hrs   |
| **P2**   | Add missing database indexes                            | 1-2 hrs   |
| **P2**   | Replace in-memory processing with DB queries            | 2-3 hrs   |
| **P3**   | Implement test suite                                    | Ongoing   |
| **P3**   | Restrict API docs in production                         | 15 min    |

---

**Overall Grade: B-** — Solid architecture and good security fundamentals, but critical gaps in tenant isolation enforcement, cascade delete protection, and test coverage need immediate attention.
