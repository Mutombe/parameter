import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Modal, Button, Input, Select } from './ui'
import { accountApi } from '../services/api'
import { showToast, parseApiError } from '../lib/toast'

/**
 * Guided New Account wizard (hierarchical chart of accounts).
 *
 * Walks the 6-level hierarchy top-down — Financial Report → Class →
 * Subclass → Type → Subtype → GL code → Name — with each step unlocking
 * the next. The GL code list contains ONLY unused codes from the chosen
 * subclass's reserved range, so an in-use code can never be reassigned
 * and cross-subclass use is impossible by construction.
 */

// Hidden legacy slugs the posting engine/reports still key on — derived,
// never asked of the user.
function legacySubtype(subclass: string, klass: string, typeL4: string, subtypeL5: string): string {
  if (klass === 'contra_asset') return 'accumulated_depreciation'
  switch (subclass) {
    case 'noncurrent_assets':
      return subtypeL5 === 'Movable Asset' ? 'movable_asset' : 'fixed_asset'
    case 'current_assets':
      if (typeL4 === 'Cash & Cash Equivalents') return subtypeL5 === 'Cash' ? 'cash' : 'bank'
      if (typeL4 === 'Accounts Receivable') return 'accounts_receivable'
      if (typeL4 === 'Short-term Investments') return 'investment'
      return 'prepaid'
    case 'current_liabilities':
      if (typeL4 === 'Deferred Revenue') return 'tenant_deposits'
      if (typeL4 === 'Tax Liability') return 'vat_payable'
      return 'accounts_payable'
    case 'longterm_liabilities': return 'accounts_payable'
    case 'equity': return 'capital'
    case 'suspense': return 'retained_earnings'
    case 'property_income': return 'other_income'
    case 'other_income': return 'other_income'
    case 'cost_of_sales': return 'operating_expense'
    default: return 'operating_expense'
  }
}

function derivedBsCategory(klass: string, subclass: string, typeL4: string): string {
  if (['income', 'expense'].includes(klass)) return ''
  if (subclass === 'noncurrent_assets') return 'non_current_assets'
  if (subclass === 'current_assets') {
    if (typeL4 === 'Accounts Receivable') return 'accounts_receivable'
    if (typeL4 === 'Short-term Investments') return 'investments'
    return 'current_assets'
  }
  if (klass === 'equity') return ''
  return 'other_current_liabilities'
}

const EMPTY = {
  report_type: '', account_class: '', account_subclass: '',
  hierarchy_type: '', subtype_l5: '', code: '', name: '',
}

export default function NewAccountWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ ...EMPTY })

  useEffect(() => { if (open) setForm({ ...EMPTY }) }, [open])

  const { data: tax } = useQuery({
    queryKey: ['coa-taxonomy'],
    queryFn: () => accountApi.taxonomy().then(r => r.data),
    staleTime: 60 * 60 * 1000,
    enabled: open,
  })

  const { data: codesData, isLoading: codesLoading } = useQuery({
    queryKey: ['coa-available-codes', form.account_subclass],
    queryFn: () => accountApi.availableCodes(form.account_subclass).then(r => r.data),
    enabled: open && !!form.account_subclass,
    staleTime: 30_000,
  })

  const classOptions = useMemo(() => {
    if (!tax || !form.report_type) return []
    return Object.keys(tax.taxonomy[form.report_type] || {})
  }, [tax, form.report_type])

  const subclassOptions = useMemo(() => {
    if (!tax || !form.report_type || !form.account_class) return []
    return tax.taxonomy[form.report_type]?.[form.account_class] || []
  }, [tax, form.report_type, form.account_class])

  const typeOptions: string[] = (tax && form.account_subclass && tax.types_by_subclass[form.account_subclass]) || []
  const subtypeOptions: string[] = (tax && form.hierarchy_type && tax.subtypes_by_type[form.hierarchy_type]) || []
  const range = tax && form.account_subclass ? tax.subclass_ranges[form.account_subclass] : null

  const createMutation = useMutation({
    mutationFn: () => accountApi.create({
      code: form.code,
      name: form.name.trim(),
      report_type: form.report_type,
      account_class: form.account_class,
      account_subclass: form.account_subclass,
      hierarchy_type: form.hierarchy_type,
      description: form.subtype_l5,
      account_subtype: legacySubtype(form.account_subclass, form.account_class, form.hierarchy_type, form.subtype_l5),
      account_type: ({ asset: 'asset', contra_asset: 'asset', liability: 'liability', equity: 'equity', income: 'revenue', expense: 'expense' } as any)[form.account_class],
      balance_sheet_category: derivedBsCategory(form.account_class, form.account_subclass, form.hierarchy_type),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['coa-available-codes'] })
      showToast.success(`Account ${form.code} · ${form.name} activated`)
      onClose()
    },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to create account')),
  })

  const canSave = !!(form.report_type && form.account_class && form.account_subclass
    && form.code && form.name.trim()
    && (typeOptions.length === 0 || form.hierarchy_type)
    && (subtypeOptions.length === 0 || form.subtype_l5))

  if (!tax) {
    return (
      <Modal open={open} onClose={onClose} title="New Account" icon={Plus}>
        <div className="space-y-3 p-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="New Account" icon={Plus}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSave) createMutation.mutate() }}
        className="space-y-4"
      >
        {/* 1 — Financial Report */}
        <Select
          label="1 · Financial Report"
          value={form.report_type}
          onChange={(e) => setForm({ ...EMPTY, report_type: e.target.value })}
          required
          hint="Which report the account belongs to"
        >
          <option value="">Select report…</option>
          {Object.entries(tax.report_types).map(([v, l]: any) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>

        {/* 2 — Account Class */}
        {form.report_type && (
          <Select
            label="2 · Account Class"
            value={form.account_class}
            onChange={(e) => setForm({ ...form, account_class: e.target.value, account_subclass: '', hierarchy_type: '', subtype_l5: '', code: '' })}
            required
            hint="Determines the section of the report where the account appears"
          >
            <option value="">Select class…</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>{tax.account_classes[c]}</option>
            ))}
          </Select>
        )}

        {/* 3 — Account Subclass */}
        {form.account_class && (
          <Select
            label="3 · Account Subclass"
            value={form.account_subclass}
            onChange={(e) => setForm({ ...form, account_subclass: e.target.value, hierarchy_type: '', subtype_l5: '', code: '' })}
            required
            hint={range ? `Reserved GL code range: ${range.low}–${range.high}` : 'Owns a reserved GL code range'}
          >
            <option value="">Select subclass…</option>
            {subclassOptions.map((sc: string) => (
              <option key={sc} value={sc}>{tax.subclass_ranges[sc]?.label || sc}</option>
            ))}
          </Select>
        )}

        {/* 4 — Account Type */}
        {form.account_subclass && typeOptions.length > 0 && (
          <Select
            label="4 · Account Type"
            value={form.hierarchy_type}
            onChange={(e) => setForm({ ...form, hierarchy_type: e.target.value, subtype_l5: '' })}
            required
          >
            <option value="">Select type…</option>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}

        {/* 5 — Account Subtype */}
        {form.hierarchy_type && subtypeOptions.length > 0 && (
          <Select
            label="5 · Account Subtype"
            value={form.subtype_l5}
            onChange={(e) => setForm({ ...form, subtype_l5: e.target.value })}
            required
          >
            <option value="">Select subtype…</option>
            {subtypeOptions.map((st) => <option key={st} value={st}>{st}</option>)}
          </Select>
        )}

        {/* 6 — GL Account Code (available codes only) */}
        {form.account_subclass && (typeOptions.length === 0 || form.hierarchy_type) && (
          <Select
            label="6 · GL Account Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
            hint="Only unused codes from this subclass's reserved range are offered — a code can never be reused or borrowed across subclasses"
          >
            <option value="">{codesLoading ? 'Loading available codes…' : 'Select available code…'}</option>
            {(codesData?.codes || []).map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}

        {/* 7 — Account Name */}
        {form.code && (
          <Input
            label="7 · GL Account Name"
            placeholder="e.g. Garden Equipment"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        )}

        <div className="flex gap-3 pt-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={!canSave || createMutation.isPending}>
            {createMutation.isPending ? 'Saving…' : 'Save & Activate'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
