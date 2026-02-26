import { cn } from '../../lib/utils'
import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

interface Step {
  label: string
  description?: string
}

interface FormStepperProps {
  steps: Step[]
  currentStep: number
  className?: string
}

export function FormStepper({ steps, currentStep, className }: FormStepperProps) {
  return (
    <nav className={cn('mb-8', className)} aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isLast = index === steps.length - 1

          return (
            <li
              key={step.label}
              className={cn('flex items-center', !isLast && 'flex-1')}
            >
              <div className="flex items-center gap-3">
                {/* Step circle */}
                <motion.div
                  initial={false}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                  }}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors',
                    isCompleted && 'bg-emerald-600 text-white',
                    isCurrent && 'bg-primary-600 text-white ring-4 ring-primary-100',
                    !isCompleted && !isCurrent && 'bg-gray-200 text-gray-500'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </motion.div>

                {/* Step label */}
                <div className="hidden sm:block">
                  <p className={cn(
                    'text-sm font-medium',
                    isCompleted && 'text-emerald-700',
                    isCurrent && 'text-primary-700',
                    !isCompleted && !isCurrent && 'text-gray-500'
                  )}>
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-gray-500">{step.description}</p>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-4 h-0.5 rounded-full overflow-hidden bg-gray-200">
                  <motion.div
                    initial={false}
                    animate={{
                      width: isCompleted ? '100%' : '0%',
                    }}
                    transition={{ duration: 0.3 }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
