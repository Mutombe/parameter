import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Building2, Users, FileText, BarChart3, DollarSign, Receipt,
  BookOpen, ChevronRight, Search, Home, Settings, UserPlus,
  PieChart, Calculator, FileCheck, Bell, Shield, Zap,
  ArrowLeft, Menu, X, Phone, Mail, Sun, Moon, Monitor, LayoutDashboard
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { useThemeEffect } from '../hooks/useThemeEffect'
import PrivacyPolicyModal from '../components/PrivacyPolicyModal'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { PiBuildingApartmentLight } from "react-icons/pi";
import { AiOutlineDollar } from "react-icons/ai";

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Home,
    subsections: [
      { id: 'overview', title: 'Platform Overview' },
      { id: 'registration', title: 'Registration & Setup' },
      { id: 'dashboard', title: 'Understanding the Dashboard' },
      { id: 'navigation', title: 'Navigation Guide' },
    ]
  },
  {
    id: 'masterfile',
    title: 'Masterfile Management',
    icon: PiBuildingApartmentLight,
    subsections: [
      { id: 'landlords', title: 'Managing Landlords' },
      { id: 'properties', title: 'Properties & Units' },
      { id: 'tenants', title: 'Tenant Management' },
      { id: 'leases', title: 'Lease Agreements' },
    ]
  },
  {
    id: 'billing',
    title: 'Billing & Invoicing',
    icon: FileText,
    subsections: [
      { id: 'invoices', title: 'Creating Invoices' },
      { id: 'auto-billing', title: 'Automated Billing' },
      { id: 'receipts', title: 'Recording Payments' },
      { id: 'expenses', title: 'Expense Management' },
      { id: 'late-penalties', title: 'Late Penalties' },
      { id: 'statements', title: 'Tenant Statements' },
    ]
  },
  {
    id: 'accounting',
    title: 'Accounting',
    icon: Calculator,
    subsections: [
      { id: 'chart-of-accounts', title: 'Chart of Accounts' },
      { id: 'journal-entries', title: 'Journal Entries' },
      { id: 'general-ledger', title: 'General Ledger' },
      { id: 'audit-trail', title: 'Audit Trail' },
    ]
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    icon: BarChart3,
    subsections: [
      { id: 'financial-reports', title: 'Financial Reports' },
      { id: 'property-reports', title: 'Property Reports' },
      { id: 'custom-reports', title: 'Custom Reports' },
    ]
  },
  {
    id: 'data-import',
    title: 'Data Import',
    icon: Zap,
    subsections: [
      { id: 'import-overview', title: 'Import Overview' },
      { id: 'import-formats', title: 'Supported Formats' },
      { id: 'document-scanner', title: 'Document Scanner (AI)' },
    ]
  },
  {
    id: 'tenant-portal',
    title: 'Tenant Portal',
    icon: UserPlus,
    subsections: [
      { id: 'portal-overview', title: 'Portal Overview' },
      { id: 'portal-invoices', title: 'Viewing Invoices' },
      { id: 'portal-payments', title: 'Payment Notifications' },
    ]
  },
  {
    id: 'admin',
    title: 'Administration',
    icon: Settings,
    subsections: [
      { id: 'team-management', title: 'Team Management' },
      { id: 'roles-permissions', title: 'Roles & Permissions' },
      { id: 'notifications', title: 'Notifications & Email' },
      { id: 'settings', title: 'System Settings' },
    ]
  },
]

const content: Record<string, { title: string; content: React.ReactNode }> = {
  overview: {
    title: 'Platform Overview',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Parameter is a comprehensive real estate accounting platform designed specifically for property
          managers in Zimbabwe. It combines powerful double-entry accounting with intuitive property
          management features to streamline your business operations.
        </p>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Key Features</h4>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Multi-tenant Architecture:</strong> Each company gets complete data isolation</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Double-Entry Accounting:</strong> Industry-standard bookkeeping with automatic journal entries</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Automated Billing:</strong> Generate monthly invoices with one click</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Multi-Currency Support:</strong> Handle USD and ZiG transactions seamlessly</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Bulk Data Import:</strong> Import from CSV, Excel, or scanned documents with AI-powered OCR</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Tenant Self-Service Portal:</strong> Tenants view invoices, track payments, and notify management</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Automated Notifications:</strong> Email alerts for invoices, overdue payments, late penalties, and more</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  registration: {
    title: 'Registration & Setup',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Getting started with Parameter is quick and easy. Follow these steps to set up your company account:
        </p>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold">1</div>
              <h4 className="font-semibold text-gray-900">Create Your Account</h4>
            </div>
            <p className="text-gray-600 text-sm ml-11">
              Visit the signup page and enter your company details. Choose a unique subdomain (e.g., yourcompany.parameter.co.zw)
              that will be your company's URL. Select your preferred subscription plan.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold">2</div>
              <h4 className="font-semibold text-gray-900">Set Up Admin Account</h4>
            </div>
            <p className="text-gray-600 text-sm ml-11">
              Create your administrator account with a secure password. This account will have full access to all
              features and the ability to invite team members.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold">3</div>
              <h4 className="font-semibold text-gray-900">Configure Your Settings</h4>
            </div>
            <p className="text-gray-600 text-sm ml-11">
              Set your default currency (USD or ZiG), configure notification preferences, and customize your
              chart of accounts. The system comes with a real estate-specific chart of accounts ready to use.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold">4</div>
              <h4 className="font-semibold text-gray-900">Add Your Data</h4>
            </div>
            <p className="text-gray-600 text-sm ml-11">
              Start by adding landlords, then properties and units. <strong>Import existing data from CSV, Excel files, or
              scanned documents</strong> — or enter records manually. Once your portfolio is set up, add tenants and
              create lease agreements to begin billing.
            </p>
          </div>
        </div>
      </div>
    )
  },
  dashboard: {
    title: 'Understanding the Dashboard',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The dashboard provides a quick overview of your property management business. Here's what each section shows:
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <AiOutlineDollar className="w-5 h-5 text-emerald-600" />
              <h4 className="font-semibold text-gray-900">Revenue Overview</h4>
            </div>
            <p className="text-sm text-gray-600">
              Total revenue collected this month, compared to previous periods. Includes rent and other income.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <PiBuildingApartmentLight className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-gray-900">Portfolio Stats</h4>
            </div>
            <p className="text-sm text-gray-600">
              Total properties, units, and current occupancy rate across your entire portfolio.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-amber-600" />
              <h4 className="font-semibold text-gray-900">Outstanding Invoices</h4>
            </div>
            <p className="text-sm text-gray-600">
              Number of unpaid and overdue invoices requiring attention. Click to view details.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-gray-900">Notifications</h4>
            </div>
            <p className="text-sm text-gray-600">
              Alerts for expiring leases, overdue payments, and other important events.
            </p>
          </div>
        </div>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-2">Quick Actions</h4>
          <p className="text-sm text-gray-600">
            Use the quick action buttons to create new invoices, record payments, add tenants,
            or generate reports directly from the dashboard.
          </p>
        </div>
      </div>
    )
  },
  navigation: {
    title: 'Navigation Guide',
    content: (
      <div className="space-y-6 pt-4">
        <p className="text-gray-600 leading-relaxed">
          Parameter uses a sidebar navigation system for easy access to all features:
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <Home className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900">Dashboard</h4>
              <p className="text-sm text-gray-600">Your home base with overview metrics and quick actions</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <PiBuildingApartmentLight className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900">Masterfile</h4>
              <p className="text-sm text-gray-600">Landlords, Properties, Units, Tenants, and Leases</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <Receipt className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900">Billing</h4>
              <p className="text-sm text-gray-600">Invoices and Receipts management</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <Calculator className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900">Accounting</h4>
              <p className="text-sm text-gray-600">Chart of Accounts, Journals, and Audit Trail</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <BarChart3 className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900">Reports</h4>
              <p className="text-sm text-gray-600">Financial statements and analytics</p>
            </div>
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>Tip:</strong> Use the search bar (Ctrl/Cmd + K) to quickly find any record or navigate to any page.
          </p>
        </div>
      </div>
    )
  },
  landlords: {
    title: 'Managing Landlords',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Landlords are property owners whose assets you manage. Each landlord can have multiple properties.
        </p>
        <h4 className="font-semibold text-gray-900">Adding a New Landlord</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Landlords</strong></li>
          <li>Click the <strong>"Add Landlord"</strong> button</li>
          <li>Fill in the required information:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Name (individual or company name)</li>
              <li>Landlord type (Individual, Company, or Trust)</li>
              <li>Contact details (email, phone)</li>
              <li>Banking information for commission payments</li>
              <li>Commission rate percentage</li>
            </ul>
          </li>
          <li>Click <strong>"Save"</strong> to create the landlord</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Landlord Features</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Statement Generation:</strong> Generate landlord statements showing rent collected and commissions</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Property Overview:</strong> View all properties owned by the landlord</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Commission Tracking:</strong> Automatic calculation based on rent collected</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  properties: {
    title: 'Properties & Units',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Properties represent physical buildings or complexes. Each property contains one or more units that can be rented out.
        </p>
        <h4 className="font-semibold text-gray-900">Adding a Property</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Properties</strong></li>
          <li>Click <strong>"Add Property"</strong></li>
          <li>Select the landlord who owns this property</li>
          <li>Enter property details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Property name and type (Residential/Commercial)</li>
              <li>Full address including city and suburb</li>
              <li>Total number of units</li>
            </ul>
          </li>
        </ol>
        <h4 className="font-semibold text-gray-900 mt-6">Adding Units</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Units</strong></li>
          <li>Click <strong>"Add Unit"</strong></li>
          <li>Select the parent property</li>
          <li>Enter unit details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Unit number/identifier</li>
              <li>Unit type (Apartment, Office, Shop, etc.)</li>
              <li>Number of bedrooms/bathrooms</li>
              <li>Monthly rental amount</li>
            </ul>
          </li>
        </ol>
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-sm text-primary-800">
            <strong>Tip:</strong> Units are automatically marked as "Occupied" when an active lease is created.
          </p>
        </div>
      </div>
    )
  },
  tenants: {
    title: 'Tenant Management',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Tenants are individuals or companies who rent your units. Each tenant is assigned a unique code for easy identification.
        </p>
        <h4 className="font-semibold text-gray-900">Adding a Tenant</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Tenants</strong></li>
          <li>Click <strong>"Add Tenant"</strong></li>
          <li>Fill in tenant information:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Full name (individual or company)</li>
              <li>Tenant type (Individual or Company)</li>
              <li>Email and phone number</li>
              <li>ID type and number (National ID, Passport, or Company Registration)</li>
            </ul>
          </li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Tenant Features</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Ledger View:</strong> Complete transaction history for each tenant</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Active Leases:</strong> View current and past lease agreements</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Balance Tracking:</strong> Outstanding balance automatically calculated</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  leases: {
    title: 'Lease Agreements',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Lease agreements link tenants to units and define the rental terms. They are essential for billing.
        </p>
        <h4 className="font-semibold text-gray-900">Creating a Lease</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Leases</strong></li>
          <li>Click <strong>"Add Lease"</strong></li>
          <li>Select the tenant and available unit</li>
          <li>Configure lease terms:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Start and end dates</li>
              <li>Monthly rent amount</li>
              <li>Security deposit amount</li>
              <li>Billing day (day of month invoices are generated)</li>
            </ul>
          </li>
          <li>Click <strong>"Create Lease"</strong></li>
          <li>Activate the lease when ready to start billing</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Lease Statuses</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li><span className="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2"></span><strong>Draft:</strong> Lease is created but not yet active</li>
            <li><span className="inline-block w-2 h-2 bg-emerald-400 rounded-full mr-2"></span><strong>Active:</strong> Lease is in effect, billing enabled</li>
            <li><span className="inline-block w-2 h-2 bg-amber-400 rounded-full mr-2"></span><strong>Expiring:</strong> Lease ends within 30 days</li>
            <li><span className="inline-block w-2 h-2 bg-red-400 rounded-full mr-2"></span><strong>Terminated:</strong> Lease has been ended</li>
          </ul>
        </div>
      </div>
    )
  },
  invoices: {
    title: 'Creating Invoices',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Invoices are generated for tenants based on their lease agreements. They can be created manually or automatically.
        </p>
        <h4 className="font-semibold text-gray-900">Manual Invoice Creation</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Billing → Invoices</strong></li>
          <li>Click <strong>"Add Invoice"</strong></li>
          <li>Select the lease (tenant and unit auto-populate)</li>
          <li>Enter invoice details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Invoice type (Rent, Deposit, Other)</li>
              <li>Billing period</li>
              <li>Amount and currency</li>
              <li>Due date</li>
            </ul>
          </li>
          <li>Save as Draft or Send immediately</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Invoice Actions</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Post to Ledger:</strong> Creates accounting entries (Debit A/R, Credit Revenue)</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Print:</strong> Generate a printable PDF invoice</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>View Details:</strong> See full invoice breakdown and payment history</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'auto-billing': {
    title: 'Automated Billing',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Generate invoices for all active leases with a single click using the automated billing feature.
        </p>
        <h4 className="font-semibold text-gray-900">Generating Monthly Invoices</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Billing → Invoices</strong></li>
          <li>Click the <strong>"Generate Monthly"</strong> button</li>
          <li>Select the billing month and year</li>
          <li>Review the list of leases that will be billed</li>
          <li>Click <strong>"Generate Invoices"</strong></li>
        </ol>
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-sm text-primary-800">
            <strong>How it works:</strong> The system creates invoices for all active leases based on their
            monthly rent amount and billing day. Invoices are created as "Sent" status and can be posted to
            the ledger in bulk.
          </p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> The system prevents duplicate invoices for the same lease and billing period.
            If an invoice already exists, it will be skipped.
          </p>
        </div>
      </div>
    )
  },
  receipts: {
    title: 'Recording Payments',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Receipts record payments received from tenants. Each receipt is linked to a tenant and can be
          allocated to specific invoices.
        </p>
        <h4 className="font-semibold text-gray-900">Creating a Receipt</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Billing → Receipts</strong></li>
          <li>Click <strong>"Add Receipt"</strong></li>
          <li>Select the tenant</li>
          <li>Enter payment details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>Amount received and currency</li>
              <li>Payment method (Cash, Bank Transfer, Mobile Money, etc.)</li>
              <li>Reference number (check number, transfer reference)</li>
              <li>Payment date</li>
            </ul>
          </li>
          <li>Optionally link to a specific invoice</li>
          <li>Save and post to ledger</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Receipt Actions</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Post to Ledger:</strong> Creates accounting entries (Debit Cash/Bank, Credit A/R)</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Print Receipt:</strong> Generate a printable receipt for the tenant</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  expenses: {
    title: 'Expense Management',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Track and manage all property-related expenses. Expenses are posted to the general ledger with proper
          double-entry accounting.
        </p>
        <h4 className="font-semibold text-gray-900">Recording an Expense</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Billing → Expenses</strong></li>
          <li>Click <strong>"Add Expense"</strong></li>
          <li>Select the expense category (e.g., Repairs, Utilities, Insurance)</li>
          <li>Enter the amount, date, and description</li>
          <li>Optionally link to a property or unit</li>
          <li>Save and post to the ledger</li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Expense Categories</h4>
          <p className="text-sm text-gray-600 mb-3">
            Manage expense categories in <strong>Accounting → Expense Categories</strong>. Each category maps
            to a GL account for accurate financial reporting.
          </p>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Repairs & Maintenance</li>
            <li>• Utilities (Water, Electricity)</li>
            <li>• Insurance Premiums</li>
            <li>• Security Services</li>
            <li>• Management Fees</li>
          </ul>
        </div>
      </div>
    )
  },
  'late-penalties': {
    title: 'Late Penalties',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Automatically apply late payment penalties to overdue invoices. The system runs daily checks and
          generates penalty invoices based on your configured rules.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Penalty Types</h4>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span className="text-sm text-gray-600"><strong>Fixed Amount:</strong> A flat fee added to the overdue invoice (e.g., $50)</span>
            </div>
            <div className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span className="text-sm text-gray-600"><strong>Percentage:</strong> A percentage of the outstanding balance (e.g., 5%)</span>
            </div>
          </div>
        </div>
        <h4 className="font-semibold text-gray-900">Configuration</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Billing → Late Penalties</strong></li>
          <li>Configure penalty type, amount/rate, and grace period</li>
          <li>Set whether penalties apply once or recur</li>
          <li>Penalties run automatically — overdue invoices are checked daily</li>
        </ol>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Tenants receive an email notification when a late penalty is applied. The penalty
            creates a separate invoice linked to the original overdue invoice.
          </p>
        </div>
      </div>
    )
  },
  statements: {
    title: 'Tenant Statements',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Generate statements showing a tenant's complete transaction history including invoices, payments,
          and running balance.
        </p>
        <h4 className="font-semibold text-gray-900">Generating a Statement</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Masterfile → Tenants</strong></li>
          <li>Click on the tenant to view their profile</li>
          <li>Click <strong>"View Ledger"</strong> to see their statement</li>
          <li>Use filters to select date range</li>
          <li>Export as PDF for printing or emailing</li>
        </ol>
      </div>
    )
  },
  'chart-of-accounts': {
    title: 'Chart of Accounts',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The Chart of Accounts (COA) is the foundation of your accounting system. Parameter comes with a
          real estate-specific COA that you can customize.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Default Account Categories</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h5 className="font-medium text-gray-800 mb-2">Assets (1xxx)</h5>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Cash and Bank Accounts</li>
                <li>• Accounts Receivable</li>
                <li>• Prepaid Expenses</li>
                <li>• Property & Equipment</li>
              </ul>
            </div>
            <div>
              <h5 className="font-medium text-gray-800 mb-2">Liabilities (2xxx)</h5>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Accounts Payable</li>
                <li>• Tenant Deposits</li>
                <li>• VAT Payable</li>
                <li>• Landlord Payables</li>
              </ul>
            </div>
            <div>
              <h5 className="font-medium text-gray-800 mb-2">Revenue (4xxx)</h5>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Rental Income</li>
                <li>• Commission Income</li>
                <li>• Late Fees</li>
                <li>• Service Fees</li>
              </ul>
            </div>
            <div>
              <h5 className="font-medium text-gray-800 mb-2">Expenses (5xxx)</h5>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Repairs & Maintenance</li>
                <li>• Utilities</li>
                <li>• Insurance</li>
                <li>• Salaries</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  },
  'journal-entries': {
    title: 'Journal Entries',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Journal entries are the building blocks of double-entry accounting. Each entry must have balanced
          debits and credits.
        </p>
        <h4 className="font-semibold text-gray-900">Creating a Journal Entry</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Accounting → Journals</strong></li>
          <li>Click <strong>"Add Journal"</strong></li>
          <li>Enter the journal date and description</li>
          <li>Add line items with account, debit, and credit amounts</li>
          <li>Ensure total debits equal total credits</li>
          <li>Save as Draft or Post immediately</li>
        </ol>
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-sm text-primary-800">
            <strong>Auto-Generated Journals:</strong> When you post invoices or receipts to the ledger,
            the system automatically creates the appropriate journal entries.
          </p>
        </div>
      </div>
    )
  },
  'general-ledger': {
    title: 'General Ledger',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The General Ledger shows all posted transactions organized by account. Use it to review account
          activity and balances.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Viewing the Ledger</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Filter by account to see specific transactions</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Filter by date range for period-specific views</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>View running balance after each transaction</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Export to Excel for external reporting</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'audit-trail': {
    title: 'Audit Trail',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The audit trail provides a complete history of all changes made in the system for compliance and
          accountability.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">What's Tracked</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>All create, update, and delete operations</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>User who made the change</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Timestamp of the action</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Before and after values for changes</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'financial-reports': {
    title: 'Financial Reports',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Parameter provides comprehensive financial reporting tools for business analysis and compliance.
        </p>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Trial Balance</h4>
            <p className="text-sm text-gray-600">
              Lists all accounts with their debit and credit balances. Ensures books are balanced.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Income Statement</h4>
            <p className="text-sm text-gray-600">
              Shows revenue and expenses for a period, calculating net income or loss.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Balance Sheet</h4>
            <p className="text-sm text-gray-600">
              Snapshot of assets, liabilities, and equity at a specific date.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Cash Flow Statement</h4>
            <p className="text-sm text-gray-600">
              Tracks cash movements from operating, investing, and financing activities.
            </p>
          </div>
        </div>
      </div>
    )
  },
  'property-reports': {
    title: 'Property Reports',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Property-specific reports help you analyze portfolio performance and identify opportunities.
        </p>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Vacancy Report</h4>
            <p className="text-sm text-gray-600">
              Shows current occupancy rates, vacant units, and potential revenue loss.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Rent Roll</h4>
            <p className="text-sm text-gray-600">
              Complete list of all units with current rent amounts and tenant information.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Landlord Statement</h4>
            <p className="text-sm text-gray-600">
              Summary of rent collected, commissions, and net amount due to each landlord.
            </p>
          </div>
        </div>
      </div>
    )
  },
  'custom-reports': {
    title: 'Custom Reports',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Create custom reports by filtering and exporting data to meet specific business needs.
        </p>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Export Options</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>PDF:</strong> Formatted reports ready for printing or sharing</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Excel:</strong> Raw data for further analysis in spreadsheets</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>CSV:</strong> Simple format for importing into other systems</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'team-management': {
    title: 'Team Management',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Invite team members and manage access to your Parameter account.
        </p>
        <h4 className="font-semibold text-gray-900">Inviting Team Members</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to <strong>Admin → Team</strong></li>
          <li>Click <strong>"Invite User"</strong></li>
          <li>Enter the person's email address</li>
          <li>Select their role (Admin, Accountant, Clerk)</li>
          <li>Click <strong>"Send Invitation"</strong></li>
        </ol>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">
            The invitee will receive an email with instructions to create their account and join your company.
          </p>
        </div>
      </div>
    )
  },
  'roles-permissions': {
    title: 'Roles & Permissions',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Parameter uses role-based access control to manage what each user can see and do.
        </p>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Admin</h4>
            <p className="text-sm text-gray-600">
              Full access to all features including team management, settings, and all data.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Accountant</h4>
            <p className="text-sm text-gray-600">
              Access to billing, accounting, and reports. Can create and post transactions.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Clerk</h4>
            <p className="text-sm text-gray-600">
              Limited access for data entry. Can create records but not post or delete.
            </p>
          </div>
        </div>
      </div>
    )
  },
  settings: {
    title: 'System Settings',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Configure system-wide settings to customize Parameter for your business needs.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Available Settings</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Default Currency:</strong> Set USD or ZiG as your primary currency</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Notifications:</strong> Configure email alerts for important events</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Invoice Templates:</strong> Customize invoice appearance</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Exchange Rates:</strong> Manage currency conversion rates</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'import-overview': {
    title: 'Import Overview',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Import your existing data into Parameter to get started quickly. Whether you're migrating from another
          system or starting from spreadsheets, the import tool handles it all.
        </p>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">What You Can Import</h4>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Landlords:</strong> Names, contact details, bank info, commission rates</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Properties & Units:</strong> Property names, addresses, unit numbers, rent amounts</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Tenants:</strong> Names, emails, phone numbers, ID numbers</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Leases:</strong> Start/end dates, rent amounts, linked tenants and units</span>
            </li>
          </ul>
        </div>
        <h4 className="font-semibold text-gray-900">How to Import</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Navigate to the Masterfile section (e.g., Landlords, Tenants)</li>
          <li>Click the <strong>"Import"</strong> button</li>
          <li>Upload your file (CSV, Excel, or scanned document)</li>
          <li>Map columns to the correct fields</li>
          <li>Review the preview and confirm the import</li>
        </ol>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>Tip:</strong> Download a sample template first to see the expected format, then populate it with
            your data before uploading.
          </p>
        </div>
      </div>
    )
  },
  'import-formats': {
    title: 'Supported Formats',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Parameter accepts multiple file formats for data import to accommodate different workflows.
        </p>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">CSV (.csv)</h4>
            <p className="text-sm text-gray-600">
              Comma-separated values — the simplest format. Export from any spreadsheet app. Ensure the first row
              contains column headers.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Excel (.xlsx, .xls)</h4>
            <p className="text-sm text-gray-600">
              Microsoft Excel workbooks. Supports multiple sheets — the importer reads data from each sheet and
              lets you select which one to import.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 mb-2">Scanned Documents (AI)</h4>
            <p className="text-sm text-gray-600">
              Upload photos or scanned PDFs of paper records. The AI-powered document scanner extracts structured
              data from tables, invoices, and forms using OCR.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Column Mapping</h4>
          <p className="text-sm text-gray-600">
            After uploading, you'll see a column mapping interface. Match your file's columns to Parameter fields.
            The system auto-detects common column names (e.g., "Name", "Email", "Phone") and suggests mappings.
          </p>
        </div>
      </div>
    )
  },
  'document-scanner': {
    title: 'Document Scanner (AI)',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The AI-powered document scanner lets you import data from photos, scanned documents, and PDFs.
          It uses optical character recognition (OCR) and AI to extract structured data.
        </p>
        <h4 className="font-semibold text-gray-900">How It Works</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Click <strong>"Import"</strong> and select the <strong>Document Scanner</strong> tab</li>
          <li>Upload an image or PDF of your document</li>
          <li>The AI analyzes the document and extracts data into a structured table</li>
          <li>Review and edit the extracted data</li>
          <li>Confirm to import the records into the system</li>
        </ol>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Best Practices</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Ensure documents are clear and well-lit for best OCR accuracy</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Tabular data (spreadsheet printouts, invoices) works best</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Always review extracted data before confirming the import</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'portal-overview': {
    title: 'Tenant Portal Overview',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          The Tenant Portal gives tenants self-service access to view their invoices, payment history,
          and lease details. Tenants log in with their own credentials on a separate portal interface.
        </p>
        <div className="bg-primary-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Portal Features</h4>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Dashboard:</strong> Overview of outstanding balance and recent activity</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Invoices:</strong> View and download all invoices with status tracking</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Payment Notifications:</strong> Notify management of payments made</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Lease Details:</strong> View current lease terms and unit information</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-1 flex-shrink-0" />
              <span><strong>Profile:</strong> Update contact details and change password</span>
            </li>
          </ul>
        </div>
        <h4 className="font-semibold text-gray-900">Setting Up Tenant Access</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Create a tenant record in <strong>Masterfile → Tenants</strong></li>
          <li>Ensure the tenant has a valid email address</li>
          <li>Invite them via <strong>Admin → Team</strong> with the <strong>Tenant Portal</strong> role</li>
          <li>The tenant receives an email invitation to create their portal account</li>
        </ol>
      </div>
    )
  },
  'portal-invoices': {
    title: 'Viewing Invoices (Tenant)',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Tenants can view all their invoices in the portal, filter by status, and download individual invoices
          for their records.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Invoice Details Available</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Invoice number, date, and due date</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Total amount and outstanding balance</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Payment status (Pending, Paid, Overdue)</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span>Print or download invoice as PDF</span>
            </li>
          </ul>
        </div>
      </div>
    )
  },
  'portal-payments': {
    title: 'Payment Notifications',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Tenants can notify property managers about payments they've made. This creates a record that
          management can review and reconcile with actual bank deposits.
        </p>
        <h4 className="font-semibold text-gray-900">Submitting a Payment Notification</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
          <li>Go to <strong>Payment Notification</strong> in the tenant portal</li>
          <li>Enter the payment amount and date</li>
          <li>Select the payment method (Bank Transfer, Cash, etc.)</li>
          <li>Add the bank reference number</li>
          <li>Optionally add notes</li>
          <li>Submit — both tenant and management receive email confirmation</li>
        </ol>
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-sm text-primary-800">
            <strong>Note:</strong> Payment notifications do not automatically create receipts. An accountant or
            admin must verify the payment and record a receipt in the system.
          </p>
        </div>
      </div>
    )
  },
  notifications: {
    title: 'Notifications & Email',
    content: (
      <div className="space-y-6">
        <p className="text-gray-600 leading-relaxed">
          Parameter sends automated email notifications for key events and provides in-app notifications
          for real-time updates.
        </p>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Automated Email Notifications</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>New Invoice:</strong> Sent to tenants when monthly invoices are generated</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Payment Reminders:</strong> Sent 3 days before an invoice is due</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Overdue Notices:</strong> Sent when an invoice passes its due date</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Late Penalties:</strong> Sent when a penalty is applied</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Payment Received:</strong> Confirmation sent to tenants when payment is recorded</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="w-4 h-4 text-primary-600 mt-0.5" />
              <span><strong>Team Invitations:</strong> Sent when a user is invited to join the team</span>
            </li>
          </ul>
        </div>
        <div className="bg-gray-50 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Admin Notifications</h4>
          <p className="text-sm text-gray-600 mb-2">
            Staff members (Admin and Accountant roles) receive summary emails for:
          </p>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Monthly billing completion reports</li>
            <li>• Daily overdue invoice reports</li>
            <li>• Late penalty application summaries</li>
            <li>• Tenant payment notifications</li>
          </ul>
        </div>
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-sm text-primary-800">
            <strong>Preferences:</strong> Users can configure their notification preferences in <strong>Settings</strong> to
            control which emails they receive and enable daily digest mode.
          </p>
        </div>
      </div>
    )
  },
}

export default function Learn() {
  const { theme, setTheme } = useUIStore()
  const { isAuthenticated, user } = useAuthStore()
  useThemeEffect()
  const dashboardPath = user?.role === 'tenant_portal' ? '/portal' : '/dashboard'
  const [activeSection, setActiveSection] = useState('getting-started')
  const [activeSubsection, setActiveSubsection] = useState('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeSubsection])

  const currentContent = content[activeSubsection]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <img src="/logo.png" alt="Parameter" className="w-8 h-8 rounded-lg object-contain dark:brightness-0 dark:invert" />
                <span className="font-bold text-lg text-gray-900">Parameter</span>
              </Link>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600 font-medium">Documentation</span>
            </div>
            <div className="flex items-center gap-2 md:gap-6">
              <div className="hidden md:flex items-center gap-6">
                <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">Home</Link>
                {isAuthenticated ? (
                  <Link
                    to={dashboardPath}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/login" className="text-gray-600 hover:text-gray-900 transition-colors">Sign In</Link>
                    <Link
                      to="/signup"
                      className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                title={`Theme: ${theme}`}
              >
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : theme === 'light' ? <Sun className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-600 hover:text-gray-900"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className={`
            ${mobileMenuOpen ? 'fixed inset-0 z-30 bg-white px-6 pt-28 pb-6 overflow-auto' : 'hidden'}
            md:block md:relative md:w-64 md:flex-shrink-0 md:pt-0
          `}>
            {mobileMenuOpen && (
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden absolute top-4 right-4 p-2 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <nav className="space-y-6">
              {sections.map((section) => (
                <div key={section.id}>
                  <button
                    onClick={() => {
                      setActiveSection(section.id)
                      setActiveSubsection(section.subsections[0].id)
                    }}
                    className={`flex items-center gap-2 w-full text-left font-semibold mb-2 ${
                      activeSection === section.id ? 'text-primary-600' : 'text-gray-900'
                    }`}
                  >
                    <section.icon className="w-4 h-4" />
                    {section.title}
                  </button>
                  <ul className="space-y-1 ml-6">
                    {section.subsections.map((sub) => (
                      <li key={sub.id}>
                        <button
                          onClick={() => {
                            setActiveSection(section.id)
                            setActiveSubsection(sub.id)
                            setMobileMenuOpen(false)
                          }}
                          className={`block w-full text-left py-1 text-sm transition-colors ${
                            activeSubsection === sub.id
                              ? 'text-primary-600 font-medium'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {sub.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main ref={contentRef} className="flex-1 min-w-0 scroll-mt-20">
            <motion.div
              key={activeSubsection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
            >
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link to="/" className="hover:text-gray-700">Home</Link>
                <ChevronRight className="w-4 h-4" />
                <span>Documentation</span>
                <ChevronRight className="w-4 h-4" />
                <span className="text-gray-900">{currentContent?.title}</span>
              </div>

              <h1 className="text-3xl font-bold text-gray-900 mb-6">{currentContent?.title}</h1>
              {currentContent?.content}
            </motion.div>

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <button
                onClick={() => {
                  const allSubs = sections.flatMap(s => s.subsections.map(sub => ({ ...sub, sectionId: s.id })))
                  const currentIdx = allSubs.findIndex(s => s.id === activeSubsection)
                  if (currentIdx > 0) {
                    const prev = allSubs[currentIdx - 1]
                    setActiveSection(prev.sectionId)
                    setActiveSubsection(prev.id)
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => {
                  const allSubs = sections.flatMap(s => s.subsections.map(sub => ({ ...sub, sectionId: s.id })))
                  const currentIdx = allSubs.findIndex(s => s.id === activeSubsection)
                  if (currentIdx < allSubs.length - 1) {
                    const next = allSubs[currentIdx + 1]
                    setActiveSection(next.sectionId)
                    setActiveSubsection(next.id)
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-6 mt-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="Parameter" className="w-8 h-8 rounded-lg object-contain dark:brightness-0 dark:invert" />
                <span className="font-bold text-lg text-white">Parameter</span>
              </div>
              <p className="text-sm">Real estate accounting platform for Zimbabwe.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
                <li><Link to="/learn" className="hover:text-white transition-colors">Documentation</Link></li>
                <li>
                  {isAuthenticated
                    ? <Link to={dashboardPath} className="hover:text-white transition-colors">Dashboard</Link>
                    : <Link to="/signup" className="hover:text-white transition-colors">Get Started</Link>
                  }
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-white transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-white transition-colors">Terms of Service</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <a href="tel:+263785948128" className="hover:text-white transition-colors">+263 785 948 128</a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <a href="mailto:admin@parameter.co.zw" className="hover:text-white transition-colors">admin@parameter.co.zw</a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <a href="mailto:admin@bitstudio.co.zw" className="hover:text-white transition-colors">admin@bitstudio.co.zw</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">© {new Date().getFullYear()} Parameter. All rights reserved.</p>
            <p className="text-sm">A product of <span className="font-semibold text-white">Bit Studio ZW</span></p>
          </div>
        </div>
      </footer>

      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}