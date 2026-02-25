import { useState, useCallback } from 'react'

type ValidationRule = {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  min?: number
  max?: number
  custom?: (value: any) => string | null
  message?: string
}

type ValidationRules = Record<string, ValidationRule>
type ValidationErrors = Record<string, string>

export function useFormValidation(rules: ValidationRules) {
  const [errors, setErrors] = useState<ValidationErrors>({})

  const validateField = useCallback((name: string, value: any): string | null => {
    const rule = rules[name]
    if (!rule) return null

    const strValue = String(value ?? '')

    if (rule.required && !strValue.trim()) {
      return rule.message || 'This field is required'
    }

    if (rule.minLength && strValue.length < rule.minLength) {
      return `Must be at least ${rule.minLength} characters`
    }

    if (rule.maxLength && strValue.length > rule.maxLength) {
      return `Must be at most ${rule.maxLength} characters`
    }

    if (rule.pattern && !rule.pattern.test(strValue)) {
      return rule.message || 'Invalid format'
    }

    if (rule.min !== undefined && Number(value) < rule.min) {
      return `Must be at least ${rule.min}`
    }

    if (rule.max !== undefined && Number(value) > rule.max) {
      return `Must be at most ${rule.max}`
    }

    if (rule.custom) {
      return rule.custom(value)
    }

    return null
  }, [rules])

  const validate = useCallback((name: string, value: any) => {
    const error = validateField(name, value)
    setErrors(prev => {
      if (error) return { ...prev, [name]: error }
      const next = { ...prev }
      delete next[name]
      return next
    })
    return !error
  }, [validateField])

  const validateAll = useCallback((formData: Record<string, any>): boolean => {
    const newErrors: ValidationErrors = {}
    let isValid = true

    for (const [name, rule] of Object.entries(rules)) {
      const error = validateField(name, formData[name])
      if (error) {
        newErrors[name] = error
        isValid = false
      }
    }

    setErrors(newErrors)
    return isValid
  }, [rules, validateField])

  const handleSubmit = useCallback((formData: Record<string, any>, onValid: () => void) => {
    if (validateAll(formData)) {
      onValid()
    }
  }, [validateAll])

  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  return { errors, validate, validateAll, handleSubmit, clearErrors }
}
