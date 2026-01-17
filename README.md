# parameter

**Role:** You are a Lead Full-Stack Architect specialized in Multi-tenant SaaS, Financial Engineering, and AI integration.

**Objective:** Design and implement a robust, scalable, and maintainable Real Estate Accounting System. The system must follow a Double-Entry T-Account Architecture (Activities 1-5: Debt Recognition, Payment Receipt, Revenue Recognition, Commission/VAT, and Expense Payouts).

**Tech Stack:**

- **Backend**: Python, Django Rest Framework (DRF), PostgreSQL (using django-tenants for schema-level isolation and libraries like steady-queue cron-jobs and tasks).
- **Frontend: React (Vite)**, Tailwind CSS, Framer Motion (for smooth UI transitions), Lucide React (for iconography).
- **State Management:** TanStack Query (React Query) for server state; Zustand for local UI state.

**Core Architectural Requirements:**

1. **Multi-Tenancy:** Implement schema-based multi-tenancy. Real estate companies (Tenants) must be completely isolated. A "Public" schema handles shared data like Tenant registration and global settings.
2. **The Double-Entry Engine:** All financial transactions must hit a GeneralLedger table with strict Debit and Credit validation.
3. **AI Orchestration Layer:** Build a pluggable AI service. The Super Admin must have a toggle to enable/disable AI features per module. All AI interactions must use a RAG (Retrieval-Augmented Generation) pattern to prevent data leakage between tenants.
4. **Security & Audit:** Every API request must be tied to a user_id and tenant_id. Every change to a financial record must generate an entry in an immutable AuditTrail table.

**Modules and Feature Checklist:**

1. **Core Accounting (The Ledger)**

- Double-Entry GL with trial balance validation.
- Multi-currency support (USD/ZiG) with exchange rate history.
- Automated Transaction Reversal logic with mandatory "Reason" field.
- AI Feature: Semantic Bank/EcoCash Reconciliation (matching messy bank refs to tenant IDs).

1. **Operational Management**

- Masterfile: CRUD for Landlords, Properties, Units, and Tenants.
- Automated Billing: Monthly cron jobs to generate rent invoices (Activity 1).
- Batch Processing: Ability to process 100+ receipts in a single transaction block.
- AI Feature: OCR Lease/Invoice extraction to auto-populate Masterfile data.

1. **Reporting & Analytics**

- Financials: P&L, Balance Sheet, Cash Flow.
- Real Estate: Rent Rollover, Vacancy Reports, Landlord Statements.
- AI Feature: Natural Language Querying. Users can ask: "Why are maintenance costs high for Block A?" (Integrate a "Ask Me" placeholder in the UI).

1. **Admin & Security**

- Super Admin Dashboard: Manage Tenant Schemas, toggle AI features, and monitor API/Token usage.
- Role-Based Access Control (RBAC): Admin, Accountant, Clerk, Tenant (Portal).
- Audit Trail: searchable log of all sensitive actions.

**Detailed Coding Task:**

1. Backend: Provide the [models.py](http://models.py/) for the Accounting Engine (Journal, Ledger, Tenant, Landlord).
2. Middleware: Create a TenantMiddleware to route requests based on subdomains.
3. AI Logic: Create an AIService class that checks for is_ai_enabled flags before calling the LLM API.
4. Frontend: Create a high-fidelity Dashboard layout using Tailwind and Framer Motion, featuring the "Ask Me" contextual input component in the Reports page.

**Guiding Principles:**

1. Robustness: Use Django Signals for automated ledger entries.
2. Reliability: Atomic database transactions for all financial Activity flows.
3. Scalability: Decouple the AI service so it can be swapped (Claude/Gemini/Local LLM).


