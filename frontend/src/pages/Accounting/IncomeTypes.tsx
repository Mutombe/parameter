import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  DollarSign,
  Percent,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { incomeTypeApi } from '../../services/api'
import { cn } from '../../lib/utils'
import { showToast } from '../../lib/toast'

interface IncomeType {
  id: number
  code: string
  name: string
  description: string
  gl_account: number
  gl_account_name: string
  is_commissionable: boolean
  is_taxable: boolean
  default_rate: string
  is_active: boolean
}

export default function IncomeTypes() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['income-types'],
    queryFn: () => incomeTypeApi.list().then(r => r.data.results || r.data),
  })

  const incomeTypes: IncomeType[] = data || []

  const filteredTypes = incomeTypes.filter(type =>
    type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    type.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getTypeColor = (code: string) => {
    const colors: Record<string, string> = {
      'RENT': 'bg-blue-100 text-blue-600',
      'LEVY': 'bg-purple-100 text-purple-600',
      'SPECIAL_LEVY': 'bg-indigo-100 text-indigo-600',
      'RATES': 'bg-amber-100 text-amber-600',
      'PARKING': 'bg-green-100 text-green-600',
      'VAT': 'bg-red-100 text-red-600',
    }
    return colors[code] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Income Types</h1>
          <p className="text-gray-500 mt-1">Manage income categories for billing</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Income Type
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search income types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Types Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : filteredTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No income types</h3>
          <p className="text-gray-500 mb-4">Add income types to categorize your billing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTypes.map((type) => (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", getTypeColor(type.code))}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-semibold text-gray-900">{type.name}</h3>
              <p className="text-sm text-gray-500">{type.code}</p>
              {type.description && (
                <p className="text-xs text-gray-400 mt-1">{type.description}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Commissionable</span>
                  {type.is_commissionable ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Taxable</span>
                  {type.is_taxable ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
                  )}
                </div>
                {type.gl_account_name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">GL Account</span>
                    <span className="text-gray-700 font-medium">{type.gl_account_name}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  type.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                )}>
                  {type.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
