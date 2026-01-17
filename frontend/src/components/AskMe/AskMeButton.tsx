import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'

export default function AskMeButton() {
  const { toggleAskMe } = useUIStore()

  return (
    <motion.button
      onClick={toggleAskMe}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <motion.div
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
      >
        <Sparkles className="w-5 h-5" />
      </motion.div>
      <span className="font-medium">Ask Me</span>
    </motion.button>
  )
}
