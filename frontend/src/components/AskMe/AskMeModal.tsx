import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Loader2, MessageSquare, Lightbulb, TrendingUp, DollarSign, Building2, Bot } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { aiApi } from '../../services/api'
import { cn } from '../../lib/utils'

interface AskMeModalProps {
  open: boolean
  onClose: () => void
}

const defaultSuggestions = [
  {
    category: 'Financial Insights',
    icon: DollarSign,
    questions: [
      'What is my current collection rate?',
      'Show me overdue invoices summary',
      'Which tenants have outstanding balances?',
    ]
  },
  {
    category: 'Property Analytics',
    icon: Building2,
    questions: [
      'What is my vacancy rate?',
      'Which properties need attention?',
      'Show me lease expiration forecast',
    ]
  },
  {
    category: 'Performance',
    icon: TrendingUp,
    questions: [
      'Compare this month vs last month',
      'What are my top performing properties?',
      'Generate a landlord payment summary',
    ]
  }
]

export default function AskMeModal({ open, onClose }: AskMeModalProps) {
  const [question, setQuestion] = useState('')
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'ai'; content: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: suggestions } = useQuery({
    queryKey: ['ai-suggestions'],
    queryFn: () => aiApi.suggestions().then(r => r.data),
    enabled: open,
  })

  const askMutation = useMutation({
    mutationFn: (q: string) => aiApi.ask(q).then(r => r.data),
    onSuccess: (data) => {
      setConversation(prev => [
        ...prev,
        { role: 'ai', content: data.answer || data.error || 'I apologize, but I could not process your request. Please try again.' }
      ])
    },
    onError: () => {
      setConversation(prev => [
        ...prev,
        { role: 'ai', content: 'I encountered an error while processing your request. Please try again.' }
      ])
    }
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || askMutation.isPending) return

    setConversation(prev => [...prev, { role: 'user', content: question }])
    askMutation.mutate(question)
    setQuestion('')
  }

  const handleSuggestionClick = (q: string) => {
    setConversation(prev => [...prev, { role: 'user', content: q }])
    askMutation.mutate(q)
  }

  const displaySuggestions = suggestions || defaultSuggestions

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="fixed bottom-6 right-6 w-[480px] max-h-[650px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-purple-600 via-blue-600 to-blue-700">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Parameter AI</h3>
                  <p className="text-xs text-white/70">Ask anything about your data</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[300px]">
              {conversation.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Welcome */}
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
                      <Bot className="w-8 h-8 text-purple-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">How can I help you today?</h4>
                    <p className="text-sm text-gray-500">
                      Ask questions about your properties, finances, or get insights
                    </p>
                  </div>

                  {/* Suggestions Grid */}
                  <div className="space-y-4">
                    {displaySuggestions.slice(0, 2).map((category: any, idx: number) => {
                      const CategoryIcon = category.icon || Lightbulb
                      return (
                        <div key={idx}>
                          <div className="flex items-center gap-2 mb-2">
                            <CategoryIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {category.category}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {category.questions.slice(0, 2).map((q: string, qIdx: number) => (
                              <button
                                key={qIdx}
                                onClick={() => handleSuggestionClick(q)}
                                className="w-full text-left px-4 py-3 text-sm bg-gray-50 hover:bg-purple-50 hover:text-purple-700 rounded-xl transition-all duration-200 border border-transparent hover:border-purple-200"
                              >
                                <span className="flex items-center gap-2">
                                  <MessageSquare className="w-4 h-4 text-gray-400" />
                                  {q}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <>
                  {conversation.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      {msg.role === 'ai' && (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mr-2 flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[80%] px-4 py-3 rounded-2xl',
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}

                  {askMutation.isPending && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-start"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mr-2 flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                          <span className="text-sm text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <form onSubmit={handleSubmit} className="flex gap-3">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about vacancies, revenue, tenants..."
                  className="flex-1 px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  disabled={!question.trim() || askMutation.isPending}
                  className="px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/25"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <p className="text-xs text-gray-400 text-center mt-2">
                AI responses are generated based on your account data
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
