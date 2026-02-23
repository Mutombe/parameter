# Accounting System Training Guide

## Parameter Real Estate Accounting System

**Document Version:** 2.0
**Last Updated:** February 2026
**Audience:** Junior Accountants, Finance Staff

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Double-Entry Bookkeeping](#double-entry-bookkeeping)
3. [Chart of Accounts](#chart-of-accounts)
4. [Daily Operations](#daily-operations)
5. [Financial Reports](#financial-reports)
6. [Late Payment Penalties](#late-payment-penalties)
7. [Bank Reconciliation](#bank-reconciliation)
8. [Using Parameter AI](#using-parameter-ai)
9. [Report Search & Pagination](#report-search--pagination)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## System Overview

The Parameter Accounting System is a fully-integrated double-entry bookkeeping system designed for real estate property management. It handles:

- Tenant invoicing and rent collection
- Payment processing and receipting
- Landlord settlements and commissions
- Expense tracking and payouts
- Complete financial reporting

### Key Features

| Feature | Description |
|---------|-------------|
| Double-Entry Enforcement | Every transaction has equal debits and credits |
| Atomic Transactions | All journal entries are processed completely or not at all |
| Immutable Audit Trail | All financial actions are permanently recorded |
| Multi-Currency Support | Handles USD, ZiG, and other currencies |
| Real-Time Reporting | 15 report types with search, pagination, and export |
| Parameter AI | Natural language queries, OCR document scanning, smart reconciliation (powered by Claude) |
| Automated Billing | Monthly invoice generation, overdue detection, and late penalty application |
| Scheduled Report Emails | Receive branded HTML report emails on a schedule |
| Bank Reconciliation | Match bank statements to book records with AI assistance |
| Late Payment Penalties | Configurable penalty rules with automated daily application |
| Tenant Portal | Self-service access for tenants to view invoices, receipts, and statements |
| Company Branding | Logo and settings appear on all reports, invoices, and exported documents |

---

## Double-Entry Bookkeeping

### The Fundamental Equation

```
ASSETS = LIABILITIES + EQUITY
```

Every transaction in the system maintains this equation by recording equal debits and credits.

### Normal Balance Rules

| Account Type | Normal Balance | Increases With | Decreases With |
|--------------|----------------|----------------|----------------|
| Assets | Debit | Debit | Credit |
| Liabilities | Credit | Credit | Debit |
| Equity | Credit | Credit | Debit |
| Revenue | Credit | Credit | Debit |
| Expenses | Debit | Debit | Credit |

### Transaction Flow Examples

#### Example 1: Tenant Pays Rent

**Step 1: Create Invoice (Activity 1 - Debt Recognition)**

When you create and post an invoice, the system automatically records:

```
Journal Entry:
┌─────────────────────────────────────────────────────┐
│  Date: 2026-01-15                                   │
│  Reference: INV202601-0001                          │
│  Description: Invoice - John Smith - Unit A101     │
├─────────────────────────────────────────────────────┤
│  Dr: Accounts Receivable (1200)         $1,000.00  │
│  Cr: Rental Income (4000)               $1,000.00  │
└─────────────────────────────────────────────────────┘
```

**What this means:**
- Accounts Receivable increases (tenant owes money)
- Rental Income increases (revenue is earned)

**Step 2: Receive Payment (Activity 2 - Payment Receipt)**

When you record and post a receipt, the system records:

```
Journal Entry:
┌─────────────────────────────────────────────────────┐
│  Date: 2026-01-20                                   │
│  Reference: RCT202601-0001                          │
│  Description: Receipt - John Smith                  │
├─────────────────────────────────────────────────────┤
│  Dr: Bank - USD (1100)                  $1,000.00  │
│  Cr: Accounts Receivable (1200)         $1,000.00  │
└─────────────────────────────────────────────────────┘
```

**What this means:**
- Bank balance increases (cash received)
- Accounts Receivable decreases (debt is cleared)

#### Example 2: Paying an Expense

When you record a maintenance expense payment:

```
Journal Entry:
┌─────────────────────────────────────────────────────┐
│  Date: 2026-01-18                                   │
│  Reference: EXP202601-0001                          │
│  Description: Plumbing repair - Property A          │
├─────────────────────────────────────────────────────┤
│  Dr: Maintenance & Repairs (5100)         $250.00  │
│  Cr: Bank - USD (1100)                    $250.00  │
└─────────────────────────────────────────────────────┘
```

**What this means:**
- Maintenance expense increases
- Bank balance decreases (cash paid out)

---

## Chart of Accounts

### Account Code Structure

The system uses a standardized 4-digit account coding system:

| Code Range | Account Type | Description |
|------------|--------------|-------------|
| 1000-1999 | Assets | What the company owns |
| 2000-2999 | Liabilities | What the company owes |
| 3000-3999 | Equity | Owner's investment and retained earnings |
| 4000-4999 | Revenue | Income from operations |
| 5000-5999 | Expenses | Costs of operations |

### Complete Account List

#### Assets (1000-1999)

| Code | Account Name | Description |
|------|-------------|-------------|
| 1000 | Cash | Physical cash on hand |
| 1100 | Bank - USD | US Dollar bank account |
| 1110 | Bank - ZiG | ZiG currency bank account |
| 1200 | Accounts Receivable | Money owed by tenants |
| 1300 | Prepaid Expenses | Expenses paid in advance |

#### Liabilities (2000-2999)

| Code | Account Name | Description |
|------|-------------|-------------|
| 2000 | Accounts Payable | Money owed to suppliers |
| 2100 | VAT Payable | Value Added Tax collected |
| 2200 | Tenant Deposits | Security deposits held |

#### Equity (3000-3999)

| Code | Account Name | Description |
|------|-------------|-------------|
| 3000 | Retained Earnings | Accumulated profits |
| 3100 | Capital | Owner's investment |

#### Revenue (4000-4999)

| Code | Account Name | Description |
|------|-------------|-------------|
| 4000 | Rental Income | Income from rent |
| 4100 | Commission Income | Management fees earned |
| 4200 | Other Income | Miscellaneous income |

#### Expenses (5000-5999)

| Code | Account Name | Description |
|------|-------------|-------------|
| 5000 | Operating Expenses | General operating costs |
| 5100 | Maintenance & Repairs | Property maintenance |
| 5200 | Utilities | Utility costs |

---

## Daily Operations

### 1. Creating an Invoice

**Navigation:** Invoices > Create Invoice

**Steps:**
1. Click "Create Invoice" button
2. Select the Tenant from the dropdown
3. Select the Unit or Lease
4. Choose Invoice Type (Rent, Deposit, Utility, etc.)
5. Enter the Amount
6. Set the Invoice Date and Due Date
7. Add any description or notes
8. Click "Save" to create as Draft
9. Click "Post to Ledger" to record in accounting

**Important Notes:**
- Invoices start as "Draft" status
- Only posted invoices appear in financial reports
- Posted invoices cannot be deleted (use reversal if needed)

### 2. Recording a Payment Receipt

**Navigation:** Receipts > Create Receipt

**Steps:**
1. Click "Create Receipt" button
2. Select the Tenant
3. Optionally select the Invoice to allocate payment
4. Enter the Amount Received
5. Select Payment Method:
   - Cash (records to account 1000)
   - Bank Transfer (records to account 1100 or 1110)
   - EcoCash (records to bank account)
   - Card (records to bank account)
   - Cheque (records to bank account)
6. Enter Reference number (bank ref, mobile money ref, etc.)
7. Add any notes
8. Click "Save & Post"

**The system automatically:**
- Creates the journal entry
- Updates the invoice status (Partial or Paid)
- Updates the tenant's balance

### 3. Processing Expenses

**Navigation:** Expenses > Create Expense

**Steps:**
1. Select Expense Type
2. Enter Payee Name
3. Enter Amount
4. Add Description
5. Submit for Approval (if required)
6. Once approved, click "Post Payment"

### 4. Viewing Tenant Ledger

**Navigation:** Tenants > Select Tenant > Ledger Tab

This shows:
- All invoices issued to the tenant
- All payments received
- Running balance
- Aging analysis (current, 30 days, 60 days, 90+ days)

---

## Financial Reports

### Trial Balance

**Purpose:** Verify that total debits equal total credits

**Navigation:** Reports > Trial Balance

**What to Check:**
- The "Balanced" indicator should be TRUE
- If not balanced, there is a system error that needs investigation

**Sample Output:**
```
Trial Balance as of January 15, 2026

Account                        Debit         Credit
─────────────────────────────────────────────────────
1100 Bank - USD             $50,000.00
1200 Accounts Receivable    $15,000.00
2200 Tenant Deposits                       $5,000.00
3000 Retained Earnings                    $20,000.00
4000 Rental Income                        $45,000.00
5100 Maintenance & Repairs   $5,000.00
─────────────────────────────────────────────────────
TOTALS                      $70,000.00    $70,000.00
                            ═══════════════════════════
Status: BALANCED
```

### Income Statement (Profit & Loss)

**Purpose:** Show revenue minus expenses for a period

**Navigation:** Reports > Income Statement

**Formula:** Net Income = Total Revenue - Total Expenses

**Sample Output:**
```
Income Statement
Period: January 1 - January 31, 2026

REVENUE
  Rental Income                 $45,000.00
  Commission Income              $2,500.00
                               ───────────
  Total Revenue                 $47,500.00

EXPENSES
  Operating Expenses             $3,000.00
  Maintenance & Repairs          $5,000.00
  Utilities                      $1,500.00
                               ───────────
  Total Expenses                 $9,500.00

                               ═══════════
NET INCOME                      $38,000.00
```

### Balance Sheet

**Purpose:** Show financial position at a point in time

**Navigation:** Reports > Balance Sheet

**Must Satisfy:** Assets = Liabilities + Equity

**Sample Output:**
```
Balance Sheet as of January 31, 2026

ASSETS
  Cash                           $5,000.00
  Bank - USD                    $50,000.00
  Accounts Receivable           $15,000.00
                               ───────────
  Total Assets                  $70,000.00

LIABILITIES
  Accounts Payable               $2,000.00
  Tenant Deposits                $5,000.00
                               ───────────
  Total Liabilities              $7,000.00

EQUITY
  Retained Earnings             $25,000.00
  Net Income (Current Period)   $38,000.00
                               ───────────
  Total Equity                  $63,000.00

                               ═══════════
Total Liabilities + Equity      $70,000.00

Status: BALANCED
```

### Cash Flow Statement

**Purpose:** Track where cash came from and where it went

**Navigation:** Reports > Cash Flow

**Three Sections:**
1. Operating Activities (day-to-day business)
2. Investing Activities (buying/selling assets)
3. Financing Activities (owner contributions/withdrawals)

### Rent Roll

**Purpose:** List all active leases and monthly rent amounts

**Navigation:** Reports > Rent Roll

**Shows:**
- Tenant name
- Property and unit
- Monthly rent amount
- Lease start and end dates

### Vacancy Report

**Purpose:** Track property occupancy rates

**Navigation:** Reports > Vacancy

**Shows:**
- Total units per property
- Occupied vs vacant units
- Vacancy rate percentage
- Search and pagination (filter by property name or landlord)

### Aged Analysis

**Purpose:** Track overdue amounts by aging bucket

**Navigation:** Reports > Aged Analysis

**Features:**
- Filter by property, landlord, and as-of date
- Summary cards: Total Outstanding, Overdue Invoices, Total Overdue
- Visual aging bucket chart (Current, 31-60, 61-90, 91-120, 120+ days)
- Tenant breakdown table with search and pagination

**Buckets:**

| Bucket | Age Range | Risk Level |
|--------|-----------|------------|
| Current | 0-30 days | Normal |
| 31-60 days | 31-60 days | Watch |
| 61-90 days | 61-90 days | Concern |
| 91-120 days | 91-120 days | High risk |
| 120+ days | Over 120 days | Critical |

### Commission Reports

**Purpose:** Track management commission earned

**Navigation:** Reports > Commission by Property / Commission by Income

**Shows:**
- Commission by Property: Property ranking, landlord, rate, revenue, commission amount, percentage of total
- Commission by Income: Breakdown by income category (Rent, Parking, Levies, etc.)
- Visual charts (bar chart and pie chart)
- Search and pagination for large datasets

### Receipts Listing

**Purpose:** View all payment receipts in one place

**Navigation:** Reports > Receipts Listing

**Shows:**
- Date, receipt number, tenant, property, unit, income type, bank, method, reference, amount
- Search by receipt number, tenant, property, bank, or income type
- Pagination (25 per page)
- Total amount footer

### Bank to Income Analysis

**Purpose:** See how income is distributed across bank accounts

**Navigation:** Reports > Bank to Income

**3-Level Drill-Down:**
1. **Level 1 (Matrix):** Income types vs bank accounts (heatmap coloring)
2. **Level 2 (Bank Drill):** Click a bank column to see income categories for that bank
3. **Level 3 (Receipts):** Click a category to see individual receipts (with search and pagination)

### Landlord Statement

**Purpose:** Calculate amounts due to property owners

**Navigation:** Reports > Landlord Statement

**Shows:**
- Total rent invoiced
- Total rent collected
- Commission rate and amount
- Net payable to landlord

### Exporting & Printing Reports

All reports support three output methods:

| Action | Button | Result |
|--------|--------|--------|
| **Print** | Printer icon | Opens print dialog with formatted report (portrait or landscape) |
| **CSV** | CSV button | Downloads a CSV file for spreadsheet use |
| **Excel** | Excel button | Downloads an Excel (.xlsx) file with formatting |

Reports with wide tables (Rent Roll, Receipts Listing, Bank to Income) automatically use landscape orientation when printing.

### Scheduled Report Emails

Reports can be delivered via email on a schedule. The email includes:
- Branded HTML header with your company logo
- Report data rendered as a styled HTML table
- Period and generation date
- Professional email template

Contact your administrator to configure scheduled report delivery.

---

## Late Payment Penalties

The system can automatically apply penalties to overdue invoices.

### How Penalties Work

1. An invoice goes past its due date
2. The grace period expires (if configured)
3. The system generates a penalty invoice linked to the original

### Configuration

**Navigation:** Billing > Late Penalties

| Setting | Description |
|---------|-------------|
| Penalty Type | Percentage of invoice, Flat Fee, or Both |
| Rate / Amount | e.g. 5% or $50 flat |
| Grace Period | Days after due date before penalty applies (e.g. 7 days) |
| Maximum Cap | Maximum penalty amount per invoice |
| Recurring | Apply penalty once or every period it remains unpaid |

### Overrides

- **Property-level:** Set different rules per property
- **Tenant-level:** Exclude specific tenants (e.g. tenants on payment plans)

### Automated Penalty Generation

The system runs a daily background job that:
1. Scans all overdue invoices across all tenants
2. Checks if the grace period has passed
3. Checks for exclusions
4. Creates penalty invoices automatically
5. Sends notification to the tenant

**Important:** Review the Late Penalties page regularly to ensure penalties are applied correctly. You can adjust or cancel penalty invoices if needed.

---

## Bank Reconciliation

Bank reconciliation matches your book records to actual bank statements.

### Reconciliation Workflow

**Navigation:** Accounting > Bank Reconciliation

**Steps:**
1. Select the bank account to reconcile
2. Set the reconciliation period (start and end date)
3. Enter the bank statement closing balance
4. Import or manually enter bank transactions
5. Match bank transactions to receipts/journals:
   - **Manual match:** Select matching items
   - **AI match:** Use the AI suggestion button for automatic matching
6. Review unmatched/outstanding items
7. Add notes for any variances
8. Mark reconciliation as Complete

### Transaction Statuses

| Status | Meaning |
|--------|---------|
| Unreconciled | Not yet matched to a book entry |
| Reconciled | Successfully matched |
| Disputed | Flagged for investigation |

### AI-Powered Matching

If AI reconciliation is enabled for your company, the system can automatically suggest matches by:
- Analyzing bank reference text against invoice numbers and tenant names
- Handling messy or abbreviated references
- Providing a confidence score for each suggestion

Always review AI suggestions before accepting.

---

## Using Parameter AI

Parameter AI is powered by Claude and provides intelligent assistance across several areas. Your company administrator controls which AI features are available.

### Natural Language Queries

**Where:** Reports page (Ask Me input)

Ask questions in plain English about your data:
- "What is the current vacancy rate?"
- "Which tenants are most overdue?"
- "Why are maintenance costs high for Block A?"
- "What is the total outstanding balance?"

The AI uses only your company's data (tenant isolation is enforced).

### Document Scanner (OCR)

**Navigation:** AI > Document Scanner

Upload documents and the AI will extract structured data:

| Document Type | Extracted Fields |
|---------------|-----------------|
| Lease Agreement | Tenant name, property, unit, rent amount, dates, terms |
| Invoice | Vendor, line items, amounts, VAT, totals |
| ID Document | Name, ID number, date of birth, nationality |

Each extracted field includes a confidence level (High, Medium, Low). Always review extracted data before importing.

### AI Bank Reconciliation

See the [Bank Reconciliation](#bank-reconciliation) section above. The AI suggests matches between messy bank references and your invoices/tenants.

---

## Report Search & Pagination

Large reports now include search and pagination to make it easy to find specific records.

### How to Use

1. **Search Bar** - Located above the table. Type to filter rows instantly. The result count updates in real-time.
2. **Pagination** - Located below the table. Shows 25 rows per page with "Showing X to Y of Z" indicator.
3. **Page Navigation** - First, Previous, page numbers, Next, Last buttons.

### Search Fields by Report

| Report | Searchable Fields |
|--------|------------------|
| Trial Balance | Account code, account name |
| Vacancy | Property name, landlord |
| Rent Roll | Tenant, property, unit, lease number |
| Aged Analysis (Tenants) | Tenant name |
| Receipts Listing | Receipt #, tenant, property, bank, income type |
| Deposits Listing | Tenant, property, unit, lease number |
| Lease Charges | Tenant, property, unit, lease number |
| Commission by Property | Property name, landlord |
| Bank to Income (L3) | Tenant, property, receipt number |

**Note:** Search filtering only affects the visible table rows. Totals, summary cards, and charts always use the complete dataset.

---

## Best Practices

### Daily Tasks

1. **Post all receipts** - Record payments the same day received
2. **Check Trial Balance** - Verify debits = credits daily
3. **Review Overdue Invoices** - Follow up on late payments
4. **Reconcile Cash** - Match physical cash to account 1000

### Weekly Tasks

1. **Bank Reconciliation** - Match bank statement to account 1100/1110
2. **Accounts Receivable Aging** - Review and follow up on old balances
3. **Process Pending Expenses** - Approve and post waiting expenses

### Monthly Tasks

1. **Generate All Reports** - Run full set of financial statements
2. **Landlord Settlements** - Calculate and process landlord payments
3. **Review Chart of Accounts** - Ensure no incorrect postings
4. **Close Period** - Mark the month as closed (prevents backdating)

### Golden Rules

| Rule | Explanation |
|------|-------------|
| Never delete journal entries | Use reversal entries instead |
| Always post invoices first | Before recording receipts |
| Document everything | Add clear descriptions to all transactions |
| Reconcile regularly | Don't let accounts drift out of balance |
| Review before posting | Check amounts and accounts before confirming |

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Trial Balance Not Balanced

**Possible Causes:**
1. Direct database modification (outside the system)
2. System error during posting
3. Incomplete transaction

**Solution:**
1. Run audit trail report for recent entries
2. Identify the unbalanced journal
3. Create a correcting journal entry

#### Issue: Invoice Shows Wrong Amount

**Solution:**
1. If not posted: Edit the invoice directly
2. If posted: Create a reversal, then create new correct invoice

#### Issue: Receipt Applied to Wrong Invoice

**Solution:**
1. If not posted: Edit the receipt
2. If posted: Reverse the receipt, create new receipt with correct allocation

#### Issue: Cannot Find a Transaction

**Solution:**
1. Use Search function with reference number
2. Check tenant ledger
3. Run General Ledger report filtered by date range
4. Check Audit Trail for all system activity

#### Issue: Account Balance Seems Wrong

**Steps to Investigate:**
1. Run account statement for the specific account
2. Review all transactions line by line
3. Compare to source documents
4. Identify any missing or duplicate entries

### Error Messages

| Error | Meaning | Action |
|-------|---------|--------|
| "Debits must equal credits" | Journal is unbalanced | Check and correct entry amounts |
| "Account not found" | Invalid account code | Verify account exists in Chart of Accounts |
| "Cannot modify posted journal" | Trying to edit finalized entry | Use reversal instead |
| "Insufficient permissions" | User role restriction | Contact administrator |

---

## Quick Reference Card

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + K | Open Search |
| Ctrl/Cmd + N | New Entry (context-sensitive) |
| Esc | Close modal/dialog |

### Status Meanings

**Invoice Status:**
- Draft: Not yet sent or posted
- Sent: Posted to ledger, awaiting payment
- Partial: Some payment received
- Paid: Fully paid
- Overdue: Past due date, not fully paid
- Cancelled: Voided/reversed

**Journal Status:**
- Draft: Not yet posted to GL
- Posted: Recorded in General Ledger
- Reversed: Offset by reversal entry

### Contact for Support

For system issues or accounting questions:
- Check this guide first
- Review the Help section in the application
- Contact your supervisor or system administrator

---

## Appendix: Accounting Equation Examples

### Starting a New Month

```
Beginning:  Assets ($100,000) = Liabilities ($20,000) + Equity ($80,000)
```

### After Recording Rent Invoice ($5,000)

```
Assets increase (A/R +$5,000)
Equity increases (Revenue +$5,000)

Result: Assets ($105,000) = Liabilities ($20,000) + Equity ($85,000)
```

### After Receiving Payment ($5,000)

```
Assets change (Bank +$5,000, A/R -$5,000)
Net asset change: $0

Result: Assets ($105,000) = Liabilities ($20,000) + Equity ($85,000)
```

### After Paying Expense ($1,000)

```
Assets decrease (Bank -$1,000)
Equity decreases (Expense +$1,000)

Result: Assets ($104,000) = Liabilities ($20,000) + Equity ($84,000)
```

---

*This document is part of the Parameter Real Estate Accounting System documentation.*
