# Parameter - Real Estate Accounting System

A multi-tenant SaaS platform for real estate property management companies. Parameter combines double-entry bookkeeping, property operations, AI-powered automation, and a tenant self-service portal into a single system.

**Live:** Deployed on Railway (Backend) + Vercel (Frontend)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
  - [Core Accounting Engine](#1-core-accounting-engine)
  - [Property & Lease Management](#2-property--lease-management)
  - [Billing & Revenue](#3-billing--revenue)
  - [Reporting & Analytics](#4-reporting--analytics)
  - [Parameter AI (Powered by Claude)](#5-parameter-ai-powered-by-claude)
  - [Bank Reconciliation](#6-bank-reconciliation)
  - [Late Payment Penalties](#7-late-payment-penalties)
  - [Notifications & Scheduled Emails](#8-notifications--scheduled-emails)
  - [Tenant Portal](#9-tenant-portal)
  - [User Management & Invitations](#10-user-management--invitations)
  - [Company Settings & Branding](#11-company-settings--branding)
  - [User Profile & Preferences](#12-user-profile--preferences)
  - [Data Import](#13-data-import)
  - [Search](#14-search)
  - [Multi-Tenancy & Super Admin](#15-multi-tenancy--super-admin)
  - [Impersonation (Support)](#16-impersonation-support)
  - [Soft Delete & Trash](#17-soft-delete--trash)
  - [Audit Trail](#18-audit-trail)
  - [Pagination, Search & Filtering](#19-pagination-search--filtering)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Background Jobs](#background-jobs)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.13, Django 5, Django REST Framework |
| **Frontend** | React 18 (Vite), TypeScript, Tailwind CSS |
| **Database** | PostgreSQL with schema-based multi-tenancy (django-tenants) |
| **State** | TanStack Query (server), Zustand (client) |
| **AI** | Anthropic Claude API (chat, OCR, reconciliation) |
| **Tasks** | Celery / django-steady-queue for cron jobs |
| **UI** | Framer Motion, Recharts, Lucide React |
| **Auth** | JWT (SimpleJWT) with role-based access control |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Frontend (React/Vite)                   │
│  Landing ─ Login ─ Dashboard ─ Masterfile ─ Billing ─ ...   │
│  Tenant Portal ─ Super Admin ─ Settings ─ AI Tools          │
└──────────────────────┬───────────────────────────────────────┘
                       │ REST API (JWT Auth)
┌──────────────────────▼───────────────────────────────────────┐
│                    Backend (Django/DRF)                       │
│  TenantMiddleware ─ RBAC ─ AuditTrail ─ WebSocket Notifs    │
├──────────────────────────────────────────────────────────────┤
│  Apps: accounts │ accounting │ billing │ masterfile │        │
│        reports  │ ai_service │ notifications │ imports │     │
│        tenants  │ search │ trash                             │
├──────────────────────────────────────────────────────────────┤
│  PostgreSQL (django-tenants)                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ public  │ │ acme    │ │ beta    │ │ gamma   │  ...       │
│  │ schema  │ │ schema  │ │ schema  │ │ schema  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└──────────────────────────────────────────────────────────────┘
```

Each company (tenant) gets its own PostgreSQL schema. Data isolation is enforced at the database level. The `public` schema holds tenant registration, global settings, and domain routing.

---

## Features

### 1. Core Accounting Engine

**Double-entry bookkeeping** with strict debit/credit validation and atomic transactions.

- **Chart of Accounts** - Hierarchical 4-digit account structure (Assets 1xxx, Liabilities 2xxx, Equity 3xxx, Revenue 4xxx, Expenses 5xxx). Parent-child relationships, system accounts protected from deletion.
- **Journal System** - Types: General, Sales, Receipts, Payments, Adjustment, Reversal. Statuses: Draft, Posted, Reversed. Auto-numbering with date prefix. All postings are atomic with row-level locking to prevent race conditions.
- **General Ledger** - Immutable posted transactions with running balances. Indexed by account + date for fast queries.
- **Multi-Currency** - USD and ZiG (Zimbabwe Gold) with historical exchange rates and effective dates. Per-account and per-transaction currency support.
- **Fiscal Periods** - Define and close accounting periods. Closed periods prevent backdated entries.
- **Income Types** - Configurable income categories linked to GL accounts with per-type commission rates and VAT settings.
- **Expense Categories** - User-created categories with GL account mapping, deductibility flags, and approval thresholds.
- **Bank Accounts** - Bank, Mobile Money, and Cash account types with book vs bank balance tracking. Default account per currency.
- **Journal Reallocation** - Move expenses between GL accounts with automatic reversal of original allocation and full audit trail.

### 2. Property & Lease Management

Full masterfile CRUD for the real estate lifecycle.

- **Landlords** - Types: Individual, Company, Trust. Banking details, tax info (Tax ID, VAT registration), commission rates, payment frequency preferences.
- **Properties** - Types: Residential, Commercial, Industrial, Mixed Use. Unit definition ranges (e.g. "1-17", "A1-A20; B1-B15") with auto-generation of units. Occupancy/vacancy tracking, amenity tracking, property images.
- **Units** - Types: Apartment, Office, Shop, Warehouse, Parking, Storage. Specifications (floor, bedrooms, bathrooms, size), rental amount/currency, deposit tracking, occupancy status.
- **Tenants** - Types: Individual, Company. Account types: Rental Tenant, Levy Account Holder, or Both. ID documentation, emergency contacts, employment info, portal user integration.
- **Lease Agreements** - Types: Rental, Levy. Statuses: Draft, Active, Expired, Terminated. Enforces 1:1 constraint (one active lease per unit). Financial terms, billing config (day of month, grace period), annual escalation rates, document upload.
- **Property Manager Assignment** - Assign staff users to manage specific properties with primary manager designation.

### 3. Billing & Revenue

Implements the 5-activity accounting flow: Debt Recognition, Payment Receipt, Revenue Recognition, Commission/VAT, and Expense Payouts.

- **Invoicing** - Types: Rent, Deposit, Levy, Special Levy, Rates, Parking, Penalty, Utility, Maintenance, VAT, Other. Statuses: Draft, Sent, Partially Paid, Paid, Overdue, Cancelled. Auto-numbering, GL integration on post, multi-currency.
- **Receipts** - Payment methods: Cash, Bank Transfer, EcoCash, Card, Cheque. Links to bank accounts and invoices. Auto-receipt numbering, GL posting with commission/VAT calculation.
- **Commission & VAT** (Activity 4) - Configurable commission rates per income type. Receipt posting automatically splits: gross commission, net commission payable, and VAT payable as separate GL entries.
- **Expenses** - Types: Landlord Payment, Maintenance, Utility, Commission, Other. Approval workflow above threshold. GL integration on post.
- **Automated Monthly Billing** - Cron job generates rent invoices for all active leases at the start of each billing cycle.

### 4. Reporting & Analytics

15 report types across 4 categories, all with print, CSV export, and Excel export.

**Financial Reports:**
- Trial Balance (with balanced/unbalanced indicator)
- Income Statement (Profit & Loss with revenue vs expense chart)
- Balance Sheet (Assets = Liabilities + Equity validation)
- Cash Flow Statement (Operating, Investing, Financing activities)
- Aged Analysis (0-30, 31-60, 61-90, 91-120, 120+ day buckets with tenant breakdown)

**Property Management:**
- Vacancy Report (occupancy chart + property table)
- Rent Roll (lease listing with pie chart by property)
- Tenant Account Statement (transaction history with running balance)
- Landlord Account Statement (collections, commission, net payable)

**Comparative Reports:**
- Commission by Property (ranked table + bar chart, uses full API data for totals)
- Commission by Income Type (pie chart + ranked table)
- Bank to Income Analysis (3-level drill-down: matrix → bank → individual receipts)

**Administrative Reports:**
- Receipts Listing (all receipts with multi-field search)
- Deposits Listing (deposit status tracking per lease)
- Lease Charges Summary (charges, payments, balances per lease)

**Report Emails** - Scheduled email delivery of reports in HTML table format with branded headers.

### 5. Parameter AI (Powered by Claude)

AI features powered by Anthropic's Claude API with per-tenant feature toggles controlled by the Super Admin.

- **Natural Language Querying** - Ask questions about your accounting data in plain English. Example: "Why are maintenance costs high for Block A?" or "What is the vacancy rate?" Uses RAG (Retrieval-Augmented Generation) pattern to prevent data leakage between tenants.
- **OCR Document Scanning** - Upload lease agreements, invoices, or ID documents (National ID, Passport, Driver's License). Claude Vision extracts structured data (tenant info, financial terms, line items) with confidence levels (High/Medium/Low) for review before import.
- **Semantic Bank Reconciliation** - AI matches messy bank statement references to invoices and tenants. Handles variations in reference formats and provides confidence scores for each match suggestion.
- **Feature Isolation** - Per-tenant toggles: `ai_accounting_enabled`, `ai_reconciliation_enabled`, `ai_reports_enabled`, `ai_ocr_enabled`. Super Admin controls access. The AI service is pluggable and can be swapped for other LLM providers.

### 6. Bank Reconciliation

Period-based reconciliation workflow with AI assistance.

- Import bank transactions (credits/debits) from statements
- Match transactions to receipts and journals (manual or AI-suggested)
- Track reconciliation status: Unreconciled, Reconciled, Disputed
- Statement balance vs book balance comparison
- Match confidence tracking
- Outstanding items report
- Variance notes
- Draft and Completed statuses with user tracking

### 7. Late Payment Penalties

Automated penalty system for overdue invoices.

- **Configurable Rules** - Penalty types: Percentage, Flat Fee, or Both. Grace period support, maximum penalty caps, recurring or one-time.
- **Granular Overrides** - Property-level and tenant-level configuration overrides. Exclusion list for special cases (e.g. payment plan tenants).
- **Automated Application** - Cron job detects overdue invoices past grace period and generates penalty invoices automatically.
- **Management UI** - View, configure, and manage all penalty rules. Preview penalties before applying.

### 8. Notifications & Scheduled Emails

Multi-channel notification system with granular preferences.

**In-App Notifications:**
- Masterfile events (created, updated, deleted)
- Billing events (invoices, overdue alerts, payments received)
- Lease events (expiring, activated, terminated)
- Due date reminders and penalty alerts
- System alerts and user invitations
- Priorities: Low, Medium, High, Urgent
- Real-time delivery via WebSocket

**Email Notifications:**
- Branded HTML email templates with company logo
- Invoice alerts and overdue reminders
- Payment received confirmations
- Lease expiry warnings
- Rental due date reminders
- Late penalty notifications
- User invitation emails
- Scheduled report emails (11 report types delivered on schedule)

**Notification Preferences:**
- Per-type email toggles
- Push/in-app toggles
- Daily digest option with configurable time

**Masterfile Change Log:**
- Detailed before/after change tracking for all entity types
- User and IP address logging
- Triggers corresponding notifications

### 9. Tenant Portal

Self-service portal for rental tenants with a simplified interface.

- **Tenant Dashboard** - Overview of outstanding balance, recent invoices, and payment status.
- **Invoice View** - Browse own invoices with status and date filtering. Download and print capability.
- **Receipt View** - View all payment records and receipts.
- **Account Statement** - Full transaction history with running balance.
- **Lease Details** - View lease terms, dates, and conditions.
- **Payment Notification** - Submit payment notifications for landlord/manager verification.

Portal users have the `tenant_portal` role and can only see their own data.

### 10. User Management & Invitations

Role-based access control with multiple invitation flows.

**Roles:**

| Role | Access Level |
|------|-------------|
| Super Admin | All tenants, global settings, AI toggles, tenant management |
| Admin | Full access within own tenant |
| Accountant | Financial operations, reports, billing |
| Clerk | Data entry, limited reporting |
| Tenant Portal | Own invoices, receipts, statements only |

**Team Invitations:**
- Invite team members by email with role assignment
- Token-based invitation with 1-hour expiration
- Statuses: Pending, Accepted, Expired, Cancelled
- Resend and cancel capabilities
- Invited-by tracking

**Bulk User Invitations:**
- CSV upload for batch invitations
- Batch processing with error handling
- Email sent to each invitee

**Tenant (Company) Invitations:**
- Super Admin invites new companies
- Invitation types: Full Account or Demo Account
- Subscription plan assignment (Free, Basic, Professional, Enterprise)
- Personal welcome message support

**Demo Account Flow:**
- Self-service demo signup
- Async processing with status tracking
- Auto-expiration after demo period
- Upgrade path from demo to full account

### 11. Company Settings & Branding

Configure company identity that appears across all documents and reports.

- **Company Information** - Name, description, contact details, address.
- **Logo Management** - Upload company logo (displayed in reports, invoices, exported documents, and email headers). Logo proxy endpoint for PDF generation.
- **Invoice Settings** - Customizable invoice prefix (e.g. "INV-"), footer text, paper size (A4, Letter, Legal), logo display toggle.
- **Currency Configuration** - Primary and secondary currency setup. Exchange rate management.
- **Print Settings** - Paper size, logo display, template selection for printed/exported documents.
- **Security Settings** - Password policy, access control configuration, audit settings.

### 12. User Profile & Preferences

Personal settings for each user account.

- **Profile Management** - Edit first name, last name, email, phone number.
- **Avatar/Profile Picture** - Upload, preview, and remove profile picture. Displayed in the app header and team management views.
- **Password Management** - Change password with current password verification. Token-based password reset flow via email.
- **Preferred Currency** - Set default display currency.
- **Notification Preferences** - Granular control over which notifications are received by email, push, or in-app.

### 13. Data Import

Bulk data import with validation and preview.

- **Import Types:** Landlords, Properties, Tenants, Leases, Invoices, Receipts, Combined (multi-sheet)
- **Workflow:** Upload file (CSV/Excel) → Validation phase with detailed error reporting → Preview data before commit → Background processing with progress tracking
- **Error Handling:** Row-level error tracking with field-specific messages. Success/failure counts. Full audit trail of imports.

### 14. Search

Unified full-text search across all entities.

- Search across: Landlords, Properties, Units, Tenants, Leases, Invoices, Receipts, Expenses
- Multiple strategies: full-text search, field search, semantic matching
- Relevance scoring with computed fields (vacancy rate, occupancy, invoice balance)
- Auto-complete suggestions, recent searches, popular entities
- Keyboard shortcut: `Ctrl/Cmd + K`

### 15. Multi-Tenancy & Super Admin

Schema-based isolation with centralized management.

**Tenant Management:**
- Each company gets an isolated PostgreSQL schema
- Account statuses: Pending, Active, Demo Expired, Suspended
- Subscription plans: Free, Basic, Professional, Enterprise
- Subdomain routing (e.g. `acme.parameter.app`)
- Scheduled deletion with 24-hour grace period

**Super Admin Dashboard:**
- Manage all tenant companies
- Toggle AI features per tenant
- Suspend/activate tenants
- Schedule tenant deletion
- View tenant statistics and system health
- Global settings management (key-value store)

### 16. Impersonation (Support)

Unit tenant impersonation for customer support purposes.

- Admin/support staff can view the system as a specific tenant user
- Impersonation state tracked in the auth store
- All actions during impersonation are logged in the audit trail
- Used for troubleshooting and support without sharing credentials

### 17. Soft Delete & Trash

Non-destructive deletion with recovery.

- **Soft Delete** - Items are flagged as deleted with a `deleted_at` timestamp instead of permanent removal. Default queries exclude deleted items automatically.
- **Trash Management** - View all deleted items across entity types. Restore items to active status. Permanently purge individual items or bulk purge.
- **Applied to:** Landlords, Properties, Units, Tenants, Leases, Invoices, Receipts, Expenses.

### 18. Audit Trail

Immutable record of all financial and sensitive actions.

- Records: user, action, IP address, user agent, timestamp
- Cannot be modified or deleted
- Tracks changes as JSON (before/after values)
- Searchable log with filtering
- Essential for compliance and security

### 19. Pagination, Search & Filtering

All data-heavy tables support client-side pagination and search.

- **Reports** - 9 report types with search + pagination (25 rows/page): Trial Balance, Vacancy, Rent Roll, Aged Analysis tenant breakdown, Receipts Listing, Deposits Listing, Lease Charges, Commission by Property, Bank to Income L3 drill-down.
- **Search fields** are contextual per report (e.g. tenant name, property, unit, lease number, receipt number, bank account).
- Search resets pagination to page 1 automatically.
- Totals and chart visualizations always use the full dataset, not the paginated subset.
- Reusable `TableFilter` component (search bar with result count) and `Pagination` component (page navigation with "Showing X to Y of Z").

---

## Project Structure

```
parameter/
├── backend/
│   ├── config/              # Django settings, URLs, WSGI/ASGI
│   ├── apps/
│   │   ├── accounts/        # User auth, roles, invitations, profile
│   │   ├── accounting/      # Chart of accounts, journals, GL, bank accounts
│   │   ├── ai_service/      # Claude AI integration, OCR, reconciliation
│   │   ├── billing/         # Invoices, receipts, expenses, penalties
│   │   ├── imports/         # Bulk data import (CSV/Excel)
│   │   ├── masterfile/      # Landlords, properties, units, tenants, leases
│   │   ├── notifications/   # In-app, email, WebSocket notifications
│   │   ├── reports/         # Financial & operational report generation
│   │   ├── search/          # Unified full-text search
│   │   ├── tenants/         # Multi-tenancy, company settings, onboarding
│   │   └── trash/           # Soft delete recovery
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── ui/          # Button, Input, Pagination, TableFilter, etc.
│   │   │   └── Layout/      # Main layout, sidebar, header
│   │   ├── pages/
│   │   │   ├── Accounting/  # Chart of accounts, journals, bank accounts
│   │   │   ├── Admin/       # Team management, audit trail, data import
│   │   │   ├── AI/          # Document scanner
│   │   │   ├── Billing/     # Invoices, receipts, expenses, penalties
│   │   │   ├── Dashboard/   # Main dashboard
│   │   │   ├── Masterfile/  # Landlords, properties, units, tenants, leases
│   │   │   ├── Reports/     # All 15 report types
│   │   │   ├── Settings/    # Company & user settings
│   │   │   └── TenantPortal/ # Tenant self-service views
│   │   ├── hooks/           # Custom React hooks (usePagination, etc.)
│   │   ├── services/        # API client (Axios)
│   │   ├── stores/          # Zustand stores (auth, UI state)
│   │   └── lib/             # Utilities, formatters, print/export helpers
│   └── package.json
├── docs/
│   └── ACCOUNTING_TRAINING_GUIDE.md
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.13+
- Node.js 18+
- PostgreSQL 15+

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Linux/Mac
# .venv\Scripts\activate        # Windows

pip install -r requirements.txt

# Create PostgreSQL database
createdb parameter

# Run migrations
python manage.py migrate_schemas --shared
python manage.py migrate_schemas

# Create super admin
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Production Build

```bash
cd frontend
npm run build    # Outputs to dist/
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DATABASE_URL` | PostgreSQL connection string |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `CORS_ALLOWED_ORIGINS` | Frontend URLs for CORS |
| `ANTHROPIC_API_KEY` | Claude API key for AI features |
| `EMAIL_HOST` | SMTP server for email notifications |
| `EMAIL_HOST_USER` | SMTP username |
| `EMAIL_HOST_PASSWORD` | SMTP password |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |

---

## API Documentation

Swagger/OpenAPI documentation is available at:
- **Swagger UI:** `/api/docs/`
- **OpenAPI Schema:** `/api/schema/`

Generated automatically by `drf-spectacular`.

---

## Background Jobs

Automated tasks run on schedule via Celery/django-steady-queue:

| Task | Schedule | Description |
|------|----------|-------------|
| `generate_monthly_invoices_all_tenants` | 1st of month | Generate rent invoices for all active leases |
| `mark_overdue_invoices_all_tenants` | Daily | Mark unpaid invoices past due date as overdue |
| `apply_late_penalties_all_tenants` | Daily | Apply configured penalties to overdue invoices |
| `send_rental_due_reminders_all_tenants` | Daily | Send upcoming rent due reminders |
| `send_invoice_reminder` | Daily | Send overdue invoice reminder emails |
| `send_invoice_emails_task` | On demand | Batch invoice email delivery |
| `send_bulk_email_task` | On demand | General bulk email capability |
| Scheduled report emails | Configurable | Deliver 11 report types via branded HTML email |

---

## Double-Entry Activity Flows

The system implements 5 core accounting activities:

| Activity | Trigger | Debit | Credit |
|----------|---------|-------|--------|
| 1. Debt Recognition | Invoice posted | Accounts Receivable (1200) | Rental Income (4000) |
| 2. Payment Receipt | Receipt posted | Bank/Cash (1100/1000) | Accounts Receivable (1200) |
| 3. Revenue Recognition | Receipt with commission | Deferred Revenue (2200) | Rental Income (4000) |
| 4. Commission/VAT | Receipt with commission | COS Commission (5100) | Commission Payable (2100) + VAT Payable (2110) |
| 5. Expense Payout | Expense posted | Expense Account (5xxx) | Bank/Cash (1100/1000) |

All journal entries are atomic - they either complete fully or not at all. Row-level database locking prevents concurrent modification of the same accounts.

---

## License

Proprietary. All rights reserved.
