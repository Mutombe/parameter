import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Image,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Copy,
} from 'lucide-react'
import { aiApi } from '../../services/api'
import toast from 'react-hot-toast'
import { cn, getErrorMessage } from '../../lib/utils'
import { RiClaudeFill } from "react-icons/ri";

type DocumentType = 'lease' | 'invoice' | 'id'

interface ExtractedData {
  [key: string]: any
}

interface DocumentUploadProps {
  type: DocumentType
  onDataExtracted?: (data: ExtractedData) => void
  className?: string
}

const typeConfig = {
  lease: {
    title: 'Lease Agreement',
    description: 'Upload a lease agreement to extract tenant, property, and term details',
    icon: FileText,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
    },
    color: 'blue',
  },
  invoice: {
    title: 'Invoice',
    description: 'Upload an invoice to extract line items, amounts, and payment details',
    icon: FileText,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
    },
    color: 'green',
  },
  id: {
    title: 'ID Document',
    description: 'Upload an ID card or passport to extract identity information',
    icon: Image,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    color: 'purple',
  },
}

export default function DocumentUpload({ type, onDataExtracted, className }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const config = typeConfig[type]

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0]
    if (selectedFile) {
      setFile(selectedFile)
      setExtractedData(null)
      setError(null)

      // Create preview URL for images
      if (selectedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(selectedFile)
        setPreviewUrl(url)
      } else {
        setPreviewUrl(null)
      }
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: config.accept,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  const handleProcess = async () => {
    if (!file) return

    setProcessing(true)
    setError(null)

    try {
      let response
      switch (type) {
        case 'lease':
          response = await aiApi.ocrLease(file)
          break
        case 'invoice':
          response = await aiApi.ocrInvoice(file)
          break
        case 'id':
          response = await aiApi.ocrId(file)
          break
      }

      const data = response.data.extracted_data || response.data
      setExtractedData(data)
      onDataExtracted?.(data)
      toast.success('Document processed successfully!')
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to process document')
      setError(message)
      toast.error(message)
    } finally {
      setProcessing(false)
    }
  }

  const clearFile = () => {
    setFile(null)
    setExtractedData(null)
    setError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  const copyToClipboard = () => {
    if (extractedData) {
      navigator.clipboard.writeText(JSON.stringify(extractedData, null, 2))
      toast.success('Copied to clipboard!')
    }
  }

  const colorStyles = {
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      activeBorder: 'border-blue-400',
      icon: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      activeBorder: 'border-green-400',
      icon: 'text-green-600',
      button: 'bg-green-600 hover:bg-green-700',
    },
    purple: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      activeBorder: 'border-purple-400',
      icon: 'text-purple-600',
      button: 'bg-purple-600 hover:bg-purple-700',
    },
  }

  const styles = colorStyles[config.color as keyof typeof colorStyles]
  const Icon = config.icon

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Area */}
      {!file && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            isDragActive
              ? `${styles.bg} ${styles.activeBorder}`
              : `border-gray-200 hover:border-gray-300 hover:bg-gray-50`
          )}
        >
          <input {...getInputProps()} />
          <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4', styles.bg)}>
            <Icon className={cn('w-7 h-7', styles.icon)} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{config.title}</h3>
          <p className="text-sm text-gray-500 mb-4">{config.description}</p>
          <p className="text-xs text-gray-400">
            {isDragActive ? (
              'Drop the file here...'
            ) : (
              <>Drag & drop or click to select • PDF, PNG, JPG up to 10MB</>
            )}
          </p>
        </div>
      )}

      {/* File Preview */}
      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="border border-gray-200 rounded-xl overflow-hidden"
          >
            {/* File Header */}
            <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', styles.bg)}>
                  {file.type.startsWith('image/') ? (
                    <Image className={cn('w-5 h-5', styles.icon)} />
                  ) : (
                    <FileText className={cn('w-5 h-5', styles.icon)} />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={clearFile}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview */}
            {previewUrl && (
              <div className="p-4 bg-gray-100">
                <img
                  src={previewUrl}
                  alt="Document preview"
                  className="max-h-64 mx-auto rounded-lg shadow-sm"
                />
              </div>
            )}

            {/* Process Button */}
            {!extractedData && !error && (
              <div className="p-4">
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-3 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    styles.button
                  )}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing with AI...
                    </>
                  ) : (
                    <>
                      <RiClaudeFill className="w-5 h-5" />
                      Extract Data with AI
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 bg-red-50 border-t border-red-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-red-900">Processing Failed</p>
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                  <button
                    onClick={handleProcess}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Extracted Data */}
            {extractedData && (
              <div className="border-t border-gray-200">
                <div className="flex items-center justify-between p-4 bg-green-50 border-b border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-green-900">Data Extracted Successfully</p>
                      <p className="text-sm text-green-600">
                        {Object.keys(extractedData).length} fields found
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>

                <div className="p-4 max-h-96 overflow-y-auto">
                  <ExtractedDataView data={extractedData} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Component to render extracted data in a nice format
function ExtractedDataView({ data }: { data: ExtractedData }) {
  const renderValue = (value: any, depth: number = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">N/A</span>
    }

    if (typeof value === 'boolean') {
      return (
        <span className={value ? 'text-green-600' : 'text-red-600'}>
          {value ? 'Yes' : 'No'}
        </span>
      )
    }

    if (typeof value === 'number') {
      return <span className="text-blue-600 font-mono">{value}</span>
    }

    if (typeof value === 'string') {
      return <span className="text-gray-900">{value}</span>
    }

    if (Array.isArray(value)) {
      return (
        <div className="space-y-1 mt-1">
          {value.map((item, index) => (
            <div key={index} className="pl-4 border-l-2 border-gray-200">
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      )
    }

    if (typeof value === 'object') {
      return (
        <div className={cn('space-y-2', depth > 0 && 'mt-2 pl-4 border-l-2 border-gray-200')}>
          {Object.entries(value).map(([key, val]) => (
            <div key={key}>
              <span className="text-sm text-gray-500 capitalize">
                {key.replace(/_/g, ' ')}:
              </span>
              <div className="ml-2">{renderValue(val, depth + 1)}</div>
            </div>
          ))}
        </div>
      )
    }

    return String(value)
  }

  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {key.replace(/_/g, ' ')}
          </h4>
          <div className="text-sm">{renderValue(value)}</div>
        </div>
      ))}
    </div>
  )
}

// Export individual type components for convenience
export function LeaseUpload(props: Omit<DocumentUploadProps, 'type'>) {
  return <DocumentUpload type="lease" {...props} />
}

export function InvoiceUpload(props: Omit<DocumentUploadProps, 'type'>) {
  return <DocumentUpload type="invoice" {...props} />
}

export function IdUpload(props: Omit<DocumentUploadProps, 'type'>) {
  return <DocumentUpload type="id" {...props} />
}
