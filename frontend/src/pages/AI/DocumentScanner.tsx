import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, CreditCard, User, Sparkles, Info, ArrowRight } from 'lucide-react'
import DocumentUpload from '../../components/OCR/DocumentUpload'
import { cn } from '../../lib/utils'

type DocumentCategory = 'lease' | 'invoice' | 'id'

const categories = [
  {
    id: 'lease' as const,
    name: 'Lease Agreement',
    description: 'Extract tenant info, property details, rent amounts, and lease terms',
    icon: FileText,
    color: 'blue',
    features: [
      'Tenant & landlord names',
      'Property address',
      'Monthly rent amount',
      'Lease start & end dates',
      'Security deposit',
      'Payment terms',
    ],
  },
  {
    id: 'invoice' as const,
    name: 'Invoice',
    description: 'Extract line items, amounts, due dates, and payment details',
    icon: CreditCard,
    color: 'green',
    features: [
      'Invoice number',
      'Line items & amounts',
      'Tax calculations',
      'Total amount due',
      'Due date',
      'Payment instructions',
    ],
  },
  {
    id: 'id' as const,
    name: 'ID Document',
    description: 'Extract identity information from ID cards, passports, or driver licenses',
    icon: User,
    color: 'purple',
    features: [
      'Full name',
      'Date of birth',
      'ID/Passport number',
      'Address',
      'Issue & expiry dates',
      'Nationality',
    ],
  },
]

export default function DocumentScanner() {
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null)
  const [, setExtractedData] = useState<any>(null)

  const selectedCategoryInfo = categories.find(c => c.id === selectedCategory)

  const handleDataExtracted = (data: any) => {
    setExtractedData(data)
  }

  const handleBack = () => {
    setSelectedCategory(null)
    setExtractedData(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Document Scanner</h1>
            <p className="text-gray-500">Extract data from documents using AI-powered OCR</p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-900">
              <strong>How it works:</strong> Upload a document and our AI will automatically extract key information.
              The extracted data can be used to auto-fill forms when creating leases, invoices, or tenant records.
            </p>
          </div>
        </div>
      </div>

      {!selectedCategory ? (
        // Category Selection
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {categories.map((category, index) => {
            const Icon = category.icon
            const colorStyles = {
              blue: 'from-blue-500 to-blue-600 group-hover:from-blue-600 group-hover:to-blue-700',
              green: 'from-green-500 to-green-600 group-hover:from-green-600 group-hover:to-green-700',
              purple: 'from-purple-500 to-purple-600 group-hover:from-purple-600 group-hover:to-purple-700',
            }

            return (
              <motion.button
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => setSelectedCategory(category.id)}
                className="group text-left bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-gray-300 transition-all"
              >
                <div className={cn(
                  'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4 transition-all',
                  colorStyles[category.color as keyof typeof colorStyles]
                )}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{category.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{category.description}</p>

                <div className="space-y-1.5">
                  {category.features.slice(0, 3).map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-1 h-1 bg-gray-400 rounded-full" />
                      {feature}
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">
                    +{category.features.length - 3} more fields
                  </p>
                </div>

                <div className="flex items-center gap-1 mt-4 text-sm font-medium text-primary-600 group-hover:gap-2 transition-all">
                  Select
                  <ArrowRight className="w-4 h-4" />
                </div>
              </motion.button>
            )
          })}
        </div>
      ) : (
        // Upload Interface
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Back Button & Category Info */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to categories
            </button>
            <div className="flex items-center gap-2">
              {selectedCategoryInfo && (
                <>
                  <selectedCategoryInfo.icon className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-gray-900">{selectedCategoryInfo.name}</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Area */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <DocumentUpload
                  type={selectedCategory}
                  onDataExtracted={handleDataExtracted}
                />
              </div>
            </div>

            {/* Info Sidebar */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Extractable Fields</h3>
                <div className="space-y-2">
                  {selectedCategoryInfo?.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h4 className="font-medium text-amber-900 mb-2">Tips for best results</h4>
                <ul className="space-y-1.5 text-sm text-amber-800">
                  <li>• Ensure the document is clearly visible</li>
                  <li>• Avoid blurry or low-resolution images</li>
                  <li>• Make sure all text is readable</li>
                  <li>• PDF format usually works best</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
