import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Info,
  ArrowRight,
} from 'lucide-react'
import { importsApi } from '../../services/api'
import { PageHeader, Button, Modal, TimeAgo } from '../../components/ui'
import toast from 'react-hot-toast'
import { TbDatabaseImport } from "react-icons/tb"

// Status badge styling
const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  validating: 'bg-blue-100 text-blue-700',
  validated: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-gray-100 text-gray-600',
}

const statusIcons: Record<string, any> = {
  pending: Clock,
  validating: Loader2,
  validated: CheckCircle,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: XCircle,
}

const statusTooltips: Record<string, string> = {
  pending: 'Import is queued and waiting to be processed',
  validating: 'File is being validated for errors',
  validated: 'File validated successfully and ready to import',
  processing: 'Data is currently being imported',
  completed: 'Import finished successfully',
  failed: 'Import encountered errors and could not complete',
  cancelled: 'Import was cancelled before completion',
}

interface ImportTemplate {
  type: string
  name: string
  required_columns: string[]
  optional_columns: string[]
  download_url: string
}

interface ValidationEntity {
  count: number
  errors: Array<{ row: number; field: string; message: string }>
  warnings?: Array<{ row: number; field: string; message: string }>
  column_mappings?: Array<{ original: string; mapped_to: string }>
  preview: any[]
}

interface ValidationResult {
  valid: boolean
  can_import?: boolean
  entities: Record<string, ValidationEntity>
  total_rows: number
  error_count: number
  warning_count?: number
}

interface ImportJob {
  id: number
  import_type: string
  status: string
  file_name: string
  total_rows: number
  processed_rows: number
  success_count: number
  error_count: number
  preview_data: ValidationResult
  error_message: string
  progress_percent: number
  created_at: string
  completed_at: string
}

export default function DataImport() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload')
  const [dragActive, setDragActive] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    job_id: number
    import_type: string
    validation: ValidationResult
  } | null>(null)
  const [expandedEntities, setExpandedEntities] = useState<string[]>([])
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null)

  // Queries
  const { data: templates } = useQuery<{ templates: ImportTemplate[] }>({
    queryKey: ['import-templates'],
    queryFn: () => importsApi.templates().then(r => r.data),
  })

  const { data: jobs, isLoading: jobsLoading } = useQuery<{ results?: ImportJob[] } | ImportJob[]>({
    queryKey: ['import-jobs'],
    queryFn: () => importsApi.list().then(r => r.data),
    refetchInterval: uploadResult ? 5000 : false, // Poll while processing
  })

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: (file: File) => importsApi.upload(file),
    onSuccess: (response) => {
      setUploadResult(response.data)
      const v = response.data.validation
      if (v.valid) {
        toast.success('File validated successfully — ready to import')
      } else if (v.can_import) {
        toast.success(`File validated with ${v.warning_count || 0} warning(s) — you can still import`)
      } else {
        toast.error(`Found ${v.error_count} error(s) that must be fixed before importing`)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to upload file')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (jobId: number) => importsApi.confirm(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] })
      toast.success('Import started processing')
      setUploadResult(null)
      setActiveTab('history')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to start import')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (jobId: number) => importsApi.cancel(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] })
      setUploadResult(null)
      toast.success('Import cancelled')
    },
  })

  // File upload handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadMutation.mutate(e.dataTransfer.files[0])
    }
  }, [uploadMutation])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadMutation.mutate(e.target.files[0])
    }
  }

  const handleDownloadTemplate = async (templateType: string) => {
    try {
      const response = await importsApi.downloadTemplate(templateType)
      const blob = response.data as Blob
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `import_template_${templateType}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download template')
    }
  }

  const toggleEntity = (entity: string) => {
    setExpandedEntities(prev =>
      prev.includes(entity)
        ? prev.filter(e => e !== entity)
        : [...prev, entity]
    )
  }

  const canConfirmImport = uploadResult?.validation?.valid || uploadResult?.validation?.can_import

  const jobList = (jobs as any)?.results || jobs || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Import"
        description="Import landlords, properties, tenants, and leases from CSV or Excel"
        icon={TbDatabaseImport}
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload Data
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Import History ({jobList.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'upload' ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Template Downloads */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Download Templates</h3>
              <p className="text-sm text-gray-500 mb-4">
                Download Excel templates with the correct column headers. Your columns don't have
                to match exactly — the importer recognizes common variations like "Phone Number",
                "Telephone", "Mobile", etc.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <button
                  onClick={() => handleDownloadTemplate('combined')}
                  className="flex items-center gap-2 px-4 py-3 bg-primary-50 text-primary-700 rounded-xl hover:bg-primary-100 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="font-medium text-sm">All-in-One</span>
                </button>
                {templates?.templates.map((template) => (
                  <button
                    key={template.type}
                    onClick={() => handleDownloadTemplate(template.type)}
                    className="flex items-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span className="font-medium text-sm">{template.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Upload Area */}
            {!uploadResult && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative bg-white rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                  dragActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {uploadMutation.isPending ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
                    <p className="text-gray-600 font-medium">Validating file...</p>
                    <p className="text-sm text-gray-400">Checking columns, formats, and data integrity</p>
                  </div>
                ) : (
                  <>
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium mb-2">
                      Drag and drop your file here, or click to browse
                    </p>
                    <p className="text-sm text-gray-400 mb-4">
                      Supports CSV and Excel (.xlsx) files up to 10MB
                    </p>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="relative pointer-events-none">
                      <Upload className="w-4 h-4 mr-2" />
                      Select File
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Validation Results */}
            {uploadResult && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Validation Results</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {uploadResult.validation.total_rows} rows found across{' '}
                        {Object.keys(uploadResult.validation.entities).length} entity type(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(uploadResult.validation.warning_count || 0) > 0 && (
                        <span
                          className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700"
                          title="Warnings are non-blocking — you can still import"
                        >
                          {uploadResult.validation.warning_count} Warning{(uploadResult.validation.warning_count || 0) !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          uploadResult.validation.valid
                            ? 'bg-emerald-100 text-emerald-700'
                            : canConfirmImport
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                        title={
                          uploadResult.validation.valid
                            ? 'All rows passed validation and are ready to import'
                            : canConfirmImport
                            ? 'Warnings found but import can proceed'
                            : `${uploadResult.validation.error_count} validation error(s) found that must be fixed`
                        }
                      >
                        {uploadResult.validation.valid
                          ? 'Ready to Import'
                          : canConfirmImport
                          ? 'Import with Warnings'
                          : `${uploadResult.validation.error_count} Error${uploadResult.validation.error_count !== 1 ? 's' : ''}`
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Entity Breakdown */}
                <div className="divide-y divide-gray-100">
                  {Object.entries(uploadResult.validation.entities).map(([entity, data]) => {
                    const warningCount = data.warnings?.length || 0
                    const errorCount = data.errors.length
                    return (
                      <div key={entity}>
                        <button
                          onClick={() => toggleEntity(entity)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {expandedEntities.includes(entity) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900 capitalize">{entity}</span>
                            <span className="text-sm text-gray-500">({data.count} rows)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {warningCount > 0 && (
                              <span className="flex items-center gap-1 text-sm text-amber-600">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {warningCount} warning{warningCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {errorCount > 0 && (
                              <span className="flex items-center gap-1 text-sm text-rose-600">
                                <XCircle className="w-3.5 h-3.5" />
                                {errorCount} error{errorCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {errorCount === 0 && warningCount === 0 && (
                              <span className="flex items-center gap-1 text-sm text-emerald-600">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Valid
                              </span>
                            )}
                          </div>
                        </button>

                        <AnimatePresence>
                          {expandedEntities.includes(entity) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 pb-4 pl-14 space-y-3">
                                {/* Column Mappings */}
                                {data.column_mappings && data.column_mappings.length > 0 && (
                                  <div className="p-3 bg-blue-50 rounded-lg">
                                    <p className="font-medium text-blue-700 text-sm mb-2 flex items-center gap-1.5">
                                      <Info className="w-3.5 h-3.5" />
                                      Column Mapping
                                    </p>
                                    <div className="space-y-1">
                                      {data.column_mappings.map((m, i) => (
                                        <p key={i} className="text-sm text-blue-600 flex items-center gap-1.5">
                                          <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-xs">{m.original}</span>
                                          <ArrowRight className="w-3 h-3" />
                                          <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-xs">{m.mapped_to}</span>
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Errors */}
                                {errorCount > 0 && (
                                  <div className="p-3 bg-rose-50 rounded-lg">
                                    <p className="font-medium text-rose-700 text-sm mb-2 flex items-center gap-1.5">
                                      <XCircle className="w-3.5 h-3.5" />
                                      Errors (must fix before importing):
                                    </p>
                                    <ul className="space-y-1 text-sm text-rose-600">
                                      {data.errors.slice(0, 15).map((err, i) => (
                                        <li key={i} className="flex items-start gap-1">
                                          <span className="mt-0.5 shrink-0">&#8226;</span>
                                          <span>{err.message}</span>
                                        </li>
                                      ))}
                                      {data.errors.length > 15 && (
                                        <li className="font-medium mt-1">
                                          ...and {data.errors.length - 15} more errors
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                )}

                                {/* Warnings */}
                                {warningCount > 0 && (
                                  <div className="p-3 bg-amber-50 rounded-lg">
                                    <p className="font-medium text-amber-700 text-sm mb-2 flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      Warnings (import can still proceed):
                                    </p>
                                    <ul className="space-y-1 text-sm text-amber-600">
                                      {(data.warnings || []).slice(0, 15).map((warn, i) => (
                                        <li key={i} className="flex items-start gap-1">
                                          <span className="mt-0.5 shrink-0">&#8226;</span>
                                          <span>{warn.message}</span>
                                        </li>
                                      ))}
                                      {(data.warnings || []).length > 15 && (
                                        <li className="font-medium mt-1">
                                          ...and {(data.warnings || []).length - 15} more warnings
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                )}

                                {/* Preview */}
                                {data.preview && data.preview.length > 0 && (
                                  <div>
                                    <p className="font-medium text-gray-700 text-sm mb-2">Preview (first rows):</p>
                                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                                      <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                          <tr>
                                            {Object.keys(data.preview[0] || {}).slice(0, 8).map((col) => (
                                              <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                {col}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {data.preview.slice(0, 5).map((row: any, i: number) => (
                                            <tr key={i}>
                                              {Object.entries(row).slice(0, 8).map(([key, val]) => (
                                                <td key={key} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                                  {String(val ?? '—').substring(0, 40)}
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      cancelMutation.mutate(uploadResult.job_id)
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setUploadResult(null)}
                    >
                      Upload Different File
                    </Button>
                    <Button
                      onClick={() => confirmMutation.mutate(uploadResult.job_id)}
                      disabled={!canConfirmImport || confirmMutation.isPending}
                      className="gap-2"
                    >
                      {confirmMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {confirmMutation.isPending ? 'Processing...' : 'Confirm Import'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {jobsLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-500">Loading import history...</p>
              </div>
            ) : jobList.length === 0 ? (
              <div className="p-12 text-center">
                <TbDatabaseImport className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No imports yet</p>
                <p className="text-sm text-gray-400 mt-1">Upload a file to get started</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">File</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Progress</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jobList.map((job: ImportJob) => {
                    const StatusIcon = statusIcons[job.status] || Clock
                    const isProcessing = ['pending', 'validating', 'processing'].includes(job.status)
                    return (
                      <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                            <div>
                              <p className="font-medium text-gray-900">{job.file_name}</p>
                              <p className="text-sm text-gray-500">{job.total_rows} rows</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg capitalize" title={`Import type: ${job.import_type}`}>
                            {job.import_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${statusColors[job.status]}`}
                            title={statusTooltips[job.status] || 'Import status'}
                          >
                            <StatusIcon className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {job.status === 'completed' ? (
                            <div className="text-sm">
                              <span className="text-emerald-600">{job.success_count} success</span>
                              {job.error_count > 0 && (
                                <span className="text-rose-600 ml-2">{job.error_count} failed</span>
                              )}
                            </div>
                          ) : isProcessing ? (
                            <div className="flex items-center gap-2" title={`Processing: ${job.processed_rows} of ${job.total_rows} rows (${job.progress_percent}%)`}>
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary-500 transition-all duration-300"
                                  style={{ width: `${job.progress_percent}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{job.progress_percent}%</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <TimeAgo date={job.created_at} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          {job.status === 'validated' && (
                            <Button
                              size="sm"
                              onClick={() => confirmMutation.mutate(job.id)}
                              disabled={confirmMutation.isPending}
                              title="Start processing the validated import"
                            >
                              Process
                            </Button>
                          )}
                          {isProcessing && job.status !== 'validated' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelMutation.mutate(job.id)}
                              title="Cancel this import job"
                            >
                              Cancel
                            </Button>
                          )}
                          {(job.status === 'completed' || job.status === 'failed') && job.error_count > 0 && (
                            <button
                              onClick={() => setSelectedJob(job)}
                              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                              title="View detailed error information for this import"
                            >
                              View Errors
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Details Modal */}
      <Modal
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title={`Import Errors - ${selectedJob?.file_name}`}
      >
        {selectedJob && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div title="Total number of data rows in the imported file">
                  <p className="text-gray-500">Total Rows</p>
                  <p className="font-semibold text-gray-900">{selectedJob.total_rows}</p>
                </div>
                <div title="Number of rows successfully imported">
                  <p className="text-gray-500">Successful</p>
                  <p className="font-semibold text-emerald-600">{selectedJob.success_count}</p>
                </div>
                <div title="Number of rows that failed to import">
                  <p className="text-gray-500">Failed</p>
                  <p className="font-semibold text-rose-600">{selectedJob.error_count}</p>
                </div>
              </div>
            </div>

            {selectedJob.error_message && (
              <div className="p-4 bg-rose-50 rounded-lg">
                <p className="text-rose-700 font-medium text-sm">Error:</p>
                <p className="text-rose-600 text-sm mt-1">{selectedJob.error_message}</p>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setSelectedJob(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
