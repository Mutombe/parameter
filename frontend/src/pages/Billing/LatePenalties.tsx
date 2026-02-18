import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  Shield,
  ShieldOff,
  Receipt,
  Percent,
  Play,
  X,
  Settings,
  FileText,
  Clock,
  DollarSign,
  TrendingUp,
  Ban,
} from 'lucide-react'
import { penaltyApi, propertyApi, tenantApi } from '../../services/api'
import { PageHeader, Button, Input, Modal, Badge, EmptyState, ConfirmDialog, Select, Tooltip } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import toast from 'react-hot-toast'
import { cn, formatCurrency } from '../../lib/utils'

interface PenaltyConfig {
  id: number
  property: number | null
  property_name: string | null
  tenant: number | null
  tenant_name: string | null
  penalty_type: 'percentage' | 'flat_fee' | 'both'
  percentage_rate: string
  flat_fee: string
  currency: string
  grace_period_days: number
  max_penalty_amount: string | null
  max_penalties_per_invoice: number
  is_enabled: boolean
}

interface Exclusion {
  id: number
  tenant: number
  tenant_name: string
  reason: string
  excluded_by_name: string
  excluded_until: string | null
  is_active: boolean
}

type ActiveTab = 'configs' | 'exclusions' | 'invoices'

export default function LatePenalties() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ActiveTab>('configs')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showExclusionModal, setShowExclusionModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'config' | 'exclusion'; id: number } | null>(null)
  const [editingConfig, setEditingConfig] = useState<PenaltyConfig | null>(null)
  const [configForm, setConfigForm] = useState({
    property: '',
    tenant: '',
    penalty_type: 'percentage',
    percentage_rate: '5.00',
    flat_fee: '0',
    currency: 'USD',
    grace_period_days: 0,
    max_penalty_amount: '',
    max_penalties_per_invoice: 1,
    is_enabled: true,
  })
  const [exclusionForm, setExclusionForm] = useState({
    tenant: '',
    reason: '',
    excluded_until: '',
  })

  // Queries
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ['penalty-configs'],
    queryFn: () => penaltyApi.listConfigs().then(r => r.data),
  })

  const { data: exclusionsData, isLoading: exclusionsLoading } = useQuery({
    queryKey: ['penalty-exclusions'],
    queryFn: () => penaltyApi.listExclusions().then(r => r.data),
  })

  const { data: penaltyInvoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['penalty-invoices'],
    queryFn: () => penaltyApi.penaltyInvoices().then(r => r.data),
    enabled: activeTab === 'invoices',
  })

  const { data: overdueSummary } = useQuery({
    queryKey: ['overdue-summary'],
    queryFn: () => penaltyApi.overdueSummary().then(r => r.data),
  })

  const { data: properties } = useQuery({
    queryKey: ['properties-select'],
    queryFn: () => propertyApi.list({ page_size: 100 }).then(r => r.data.results || r.data),
  })

  const { data: tenants } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list({ page_size: 200 }).then(r => r.data.results || r.data),
  })

  // Mutations
  const configMutation = useMutation({
    mutationFn: (data: any) =>
      editingConfig
        ? penaltyApi.updateConfig(editingConfig.id, data)
        : penaltyApi.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalty-configs'] })
      toast.success(editingConfig ? 'Configuration updated' : 'Configuration created')
      resetConfigForm()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to save configuration')
    },
  })

  const exclusionMutation = useMutation({
    mutationFn: (data: any) => penaltyApi.createExclusion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalty-exclusions'] })
      queryClient.invalidateQueries({ queryKey: ['overdue-summary'] })
      toast.success('Exclusion added')
      setShowExclusionModal(false)
      setExclusionForm({ tenant: '', reason: '', excluded_until: '' })
    },
    onError: () => toast.error('Failed to add exclusion'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) return Promise.reject()
      return deleteTarget.type === 'config'
        ? penaltyApi.deleteConfig(deleteTarget.id)
        : penaltyApi.deleteExclusion(deleteTarget.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalty-configs'] })
      queryClient.invalidateQueries({ queryKey: ['penalty-exclusions'] })
      queryClient.invalidateQueries({ queryKey: ['overdue-summary'] })
      toast.success('Deleted successfully')
      setShowDeleteDialog(false)
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete'),
  })

  const applyMutation = useMutation({
    mutationFn: () => penaltyApi.applyNow(),
    onSuccess: (res) => {
      const count = res.data.penalties_created || 0
      queryClient.invalidateQueries({ queryKey: ['penalty-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['overdue-summary'] })
      if (count > 0) {
        toast.success(`Applied ${count} late ${count === 1 ? 'penalty' : 'penalties'}`)
        setActiveTab('invoices')
      } else {
        toast.success('No overdue invoices eligible for penalties')
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to apply penalties')
    },
  })

  const configsRaw = configsData?.results || configsData
  const configs = Array.isArray(configsRaw) ? configsRaw : []
  const exclusionsRaw = exclusionsData?.results || exclusionsData
  const exclusions = Array.isArray(exclusionsRaw) ? exclusionsRaw : []
  const penaltyInvoicesRaw = penaltyInvoicesData?.results || penaltyInvoicesData
  const penaltyInvoices = Array.isArray(penaltyInvoicesRaw) ? penaltyInvoicesRaw : []

  const resetConfigForm = () => {
    setShowConfigModal(false)
    setEditingConfig(null)
    setConfigForm({
      property: '', tenant: '', penalty_type: 'percentage', percentage_rate: '5.00',
      flat_fee: '0', currency: 'USD', grace_period_days: 0, max_penalty_amount: '',
      max_penalties_per_invoice: 1, is_enabled: true,
    })
  }

  const handleEditConfig = (config: PenaltyConfig) => {
    setEditingConfig(config)
    setConfigForm({
      property: config.property ? String(config.property) : '',
      tenant: config.tenant ? String(config.tenant) : '',
      penalty_type: config.penalty_type,
      percentage_rate: config.percentage_rate,
      flat_fee: config.flat_fee,
      currency: config.currency,
      grace_period_days: config.grace_period_days,
      max_penalty_amount: config.max_penalty_amount || '',
      max_penalties_per_invoice: config.max_penalties_per_invoice,
      is_enabled: config.is_enabled,
    })
    setShowConfigModal(true)
  }

  const handleSubmitConfig = (e: React.FormEvent) => {
    e.preventDefault()
    configMutation.mutate({
      property: configForm.property ? parseInt(configForm.property) : null,
      tenant: configForm.tenant ? parseInt(configForm.tenant) : null,
      penalty_type: configForm.penalty_type,
      percentage_rate: configForm.percentage_rate,
      flat_fee: configForm.flat_fee,
      currency: configForm.currency,
      grace_period_days: configForm.grace_period_days,
      max_penalty_amount: configForm.max_penalty_amount || null,
      max_penalties_per_invoice: configForm.max_penalties_per_invoice,
      is_enabled: configForm.is_enabled,
    })
  }

  const handleSubmitExclusion = (e: React.FormEvent) => {
    e.preventDefault()
    exclusionMutation.mutate({
      tenant: parseInt(exclusionForm.tenant),
      reason: exclusionForm.reason,
      excluded_until: exclusionForm.excluded_until || null,
    })
  }

  const penaltyTypeLabel: Record<string, string> = {
    percentage: 'Percentage',
    flat_fee: 'Flat Fee',
    both: 'Both',
  }

  const tabs = [
    { key: 'configs' as ActiveTab, label: 'Penalty Rules', count: configs.length },
    { key: 'exclusions' as ActiveTab, label: 'Exclusions', count: exclusions.length },
    { key: 'invoices' as ActiveTab, label: 'Penalty Invoices', count: penaltyInvoices.length },
  ]

  const hasConfigs = configs.length > 0
  const overdueCount = overdueSummary?.eligible_for_penalty || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Late Payment Penalties"
        subtitle="Configure automated penalties for overdue invoices"
        icon={AlertTriangle}
        actions={
          <div className="flex gap-2">
            {hasConfigs && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
              >
                <Play className="w-4 h-4" />
                {applyMutation.isPending ? 'Applying...' : 'Apply Penalties Now'}
              </Button>
            )}
            {activeTab === 'configs' && (
              <Button onClick={() => setShowConfigModal(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Rule
              </Button>
            )}
            {activeTab === 'exclusions' && (
              <Button onClick={() => setShowExclusionModal(true)} className="gap-2">
                <ShieldOff className="w-4 h-4" />
                Add Exclusion
              </Button>
            )}
          </div>
        }
      />

      {/* Overdue Summary Cards */}
      {overdueSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
            title="Total invoices past due date"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <Clock className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Overdue Invoices</p>
                <p className="text-xl font-bold text-gray-900">{overdueSummary.total_overdue}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
            title="Overdue invoices that match penalty rules"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Eligible for Penalty</p>
                <p className="text-xl font-bold text-gray-900">{overdueSummary.eligible_for_penalty}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
            title="Tenants excluded from penalties"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Ban className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Excluded</p>
                <p className="text-xl font-bold text-gray-900">{overdueSummary.excluded}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
            title="Total monetary value of overdue invoices"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Overdue</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(parseFloat(overdueSummary.total_overdue_amount || '0'))}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5',
                activeTab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Configs Tab */}
      {activeTab === 'configs' && (
        <div className="space-y-2">
          {configsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-4 w-64 bg-gray-200 rounded" />
              </div>
            ))}</div>
          ) : configs.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No penalty rules configured"
              description="Create a penalty rule to automatically charge late fees on overdue invoices. Once configured, use 'Apply Penalties Now' to process overdue invoices."
              action={<Button onClick={() => setShowConfigModal(true)}><Plus className="w-4 h-4 mr-2" />Add Rule</Button>}
            />
          ) : (
            configs.map((config: PenaltyConfig, idx: number) => (
              <motion.div
                key={config.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    config.is_enabled ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
                  )}>
                    <Percent className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">
                        {config.tenant_name && config.tenant
                          ? <>Tenant: <button onClick={() => navigate(`/dashboard/tenants/${config.tenant}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{config.tenant_name}</button></>
                          : config.property_name && config.property
                            ? <>Property: <button onClick={() => navigate(`/dashboard/properties/${config.property}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{config.property_name}</button></>
                            : 'System Default'}
                      </h3>
                      <Tooltip content={config.is_enabled ? 'Rule is actively applied' : 'Rule is paused'}>
                        <span>
                          <Badge variant={config.is_enabled ? 'success' : 'secondary'}>
                            {config.is_enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </span>
                      </Tooltip>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {penaltyTypeLabel[config.penalty_type]}
                      {config.penalty_type !== 'flat_fee' && ` - ${config.percentage_rate}%`}
                      {config.penalty_type !== 'percentage' && ` - ${config.currency} ${config.flat_fee}`}
                      {config.grace_period_days > 0 && ` | ${config.grace_period_days} day grace period`}
                      {config.max_penalties_per_invoice === 1 && ' | One-time'}
                      {config.max_penalties_per_invoice === 0 && ' | Recurring'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEditConfig(config)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setDeleteTarget({ type: 'config', id: config.id }); setShowDeleteDialog(true) }}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Exclusions Tab */}
      {activeTab === 'exclusions' && (
        <div className="space-y-2">
          {exclusionsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-4 w-64 bg-gray-200 rounded" />
              </div>
            ))}</div>
          ) : exclusions.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No exclusions"
              description="Add exclusions to exempt specific tenants from late penalties."
              action={<Button onClick={() => setShowExclusionModal(true)}><ShieldOff className="w-4 h-4 mr-2" />Add Exclusion</Button>}
            />
          ) : (
            exclusions.map((exc: Exclusion, idx: number) => (
              <motion.div
                key={exc.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">
                      {exc.tenant ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${exc.tenant}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {exc.tenant_name}
                        </button>
                      ) : exc.tenant_name}
                    </h3>
                    <p className="text-sm text-gray-500">{exc.reason}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {exc.excluded_until ? `Until ${exc.excluded_until}` : 'Permanent'}
                      {exc.excluded_by_name && ` | By ${exc.excluded_by_name}`}
                    </p>
                  </div>
                  <Badge variant={exc.is_active ? 'success' : 'secondary'}>
                    {exc.is_active ? 'Active' : 'Expired'}
                  </Badge>
                  <button onClick={() => { setDeleteTarget({ type: 'exclusion', id: exc.id }); setShowDeleteDialog(true) }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Penalty Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-2">
          {invoicesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-4 w-64 bg-gray-200 rounded" />
              </div>
            ))}</div>
          ) : penaltyInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No penalty invoices"
              description={hasConfigs
                ? "Click 'Apply Penalties Now' to process overdue invoices and generate penalty invoices."
                : "Create penalty rules first, then apply them to generate penalty invoices."
              }
              action={hasConfigs ? (
                <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                  <Play className="w-4 h-4 mr-2" />
                  {applyMutation.isPending ? 'Applying...' : 'Apply Penalties Now'}
                </Button>
              ) : (
                <Button onClick={() => { setActiveTab('configs'); setShowConfigModal(true) }}>
                  <Plus className="w-4 h-4 mr-2" />Add Rule First
                </Button>
              )}
            />
          ) : (
            penaltyInvoices.map((inv: any, idx: number) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">
                      {inv.id ? (
                        <button onClick={() => navigate(`/dashboard/invoices/${inv.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {inv.invoice_number}
                        </button>
                      ) : (
                        <span className="text-gray-900">{inv.invoice_number}</span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {inv.tenant_id ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${inv.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {inv.tenant_name}
                        </button>
                      ) : inv.tenant_name}
                      {' - '}{inv.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{inv.currency} {parseFloat(inv.total_amount).toLocaleString()}</p>
                    <Badge variant={inv.status === 'paid' ? 'success' : 'danger'}>{inv.status}</Badge>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Config Modal */}
      <Modal
        open={showConfigModal}
        onClose={resetConfigForm}
        title={editingConfig ? 'Edit Penalty Rule' : 'Add Penalty Rule'}
        icon={AlertTriangle}
      >
        <form onSubmit={handleSubmitConfig} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <AsyncSelect
              label="Property (optional)"
              placeholder="All Properties"
              value={configForm.property}
              onChange={(val) => setConfigForm({ ...configForm, property: String(val) })}
              options={(properties || []).map((p: any) => ({ value: p.id, label: p.name }))}
              searchable
              clearable
            />
            <AsyncSelect
              label="Tenant Override (optional)"
              placeholder="All Tenants"
              value={configForm.tenant}
              onChange={(val) => setConfigForm({ ...configForm, tenant: String(val) })}
              options={(tenants || []).map((t: any) => ({ value: t.id, label: t.name }))}
              searchable
              clearable
            />
          </div>

          <Select
            label="Penalty Type"
            value={configForm.penalty_type}
            onChange={(e) => setConfigForm({ ...configForm, penalty_type: e.target.value })}
            options={[
              { value: 'percentage', label: 'Percentage of Invoice' },
              { value: 'flat_fee', label: 'Flat Fee' },
              { value: 'both', label: 'Percentage + Flat Fee' },
            ]}
          />

          <div className="grid grid-cols-3 gap-4">
            {configForm.penalty_type !== 'flat_fee' && (
              <Input label="Percentage Rate (%)" type="number" step="0.01" value={configForm.percentage_rate}
                onChange={(e) => setConfigForm({ ...configForm, percentage_rate: e.target.value })} />
            )}
            {configForm.penalty_type !== 'percentage' && (
              <Input label="Flat Fee" type="number" step="0.01" value={configForm.flat_fee}
                onChange={(e) => setConfigForm({ ...configForm, flat_fee: e.target.value })} />
            )}
            <Select
              label="Currency"
              value={configForm.currency}
              onChange={(e) => setConfigForm({ ...configForm, currency: e.target.value })}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZiG', label: 'ZiG' },
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input label="Grace Period (days)" type="number" min="0" value={String(configForm.grace_period_days)}
              onChange={(e) => setConfigForm({ ...configForm, grace_period_days: parseInt(e.target.value) || 0 })} />
            <Input label="Max Penalty Amount" type="number" step="0.01" placeholder="No cap"
              value={configForm.max_penalty_amount}
              onChange={(e) => setConfigForm({ ...configForm, max_penalty_amount: e.target.value })} />
            <Input label="Max Penalties/Invoice" type="number" min="0" value={String(configForm.max_penalties_per_invoice)}
              onChange={(e) => setConfigForm({ ...configForm, max_penalties_per_invoice: parseInt(e.target.value) || 0 })} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={configForm.is_enabled}
              onChange={(e) => setConfigForm({ ...configForm, is_enabled: e.target.checked })}
              className="w-4 h-4 rounded text-primary-600" />
            <span className="text-sm text-gray-700">Enabled</span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={resetConfigForm}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={configMutation.isPending}>
              {configMutation.isPending ? 'Saving...' : editingConfig ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Exclusion Modal */}
      <Modal open={showExclusionModal} onClose={() => setShowExclusionModal(false)} title="Add Exclusion" icon={ShieldOff}>
        <form onSubmit={handleSubmitExclusion} className="space-y-4">
          <AsyncSelect
            label="Tenant"
            placeholder="Select tenant"
            value={exclusionForm.tenant}
            onChange={(val) => setExclusionForm({ ...exclusionForm, tenant: String(val) })}
            options={(tenants || []).map((t: any) => ({ value: t.id, label: t.name }))}
            required
            searchable
          />
          <Input label="Reason" value={exclusionForm.reason}
            onChange={(e) => setExclusionForm({ ...exclusionForm, reason: e.target.value })}
            required placeholder="Reason for exclusion" />
          <Input label="Exclude Until (optional)" type="date" value={exclusionForm.excluded_until}
            onChange={(e) => setExclusionForm({ ...exclusionForm, excluded_until: e.target.value })} />
          <p className="text-xs text-gray-500">Leave empty for permanent exclusion.</p>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowExclusionModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={exclusionMutation.isPending}>
              {exclusionMutation.isPending ? 'Adding...' : 'Add Exclusion'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => { setShowDeleteDialog(false); setDeleteTarget(null) }}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Confirmation"
        description="Are you sure you want to delete this item? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
