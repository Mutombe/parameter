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
  const [touched, setTouched] = useState<Record<string, boolean>>({})

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

  const handleBlur = useCallback((field: string, value?: any) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    if (value !== undefined) {
      validate(field, value)
    }
  }, [validate])

  const validateAll = useCallback((formData: Record<string, any>): boolean => {
    const newErrors: ValidationErrors = {}
    const newTouched: Record<string, boolean> = {}
    let isValid = true

    for (const [name, rule] of Object.entries(rules)) {
      newTouched[name] = true
      const error = validateField(name, formData[name])
      if (error) {
        newErrors[name] = error
        isValid = false
      }
    }

    setErrors(newErrors)
    setTouched(prev => ({ ...prev, ...newTouched }))
    return isValid
  }, [rules, validateField])

  const handleSubmit = useCallback((formData: Record<string, any>, onValid: () => void) => {
    if (validateAll(formData)) {
      onValid()
    }
  }, [validateAll])

  const clearErrors = useCallback(() => {
    setErrors({})
    setTouched({})
  }, [])

  const isValid = Object.keys(errors).length === 0

  // Helper: get error for a field only if it has been touched
  const getFieldError = useCallback((field: string): string | undefined => {
    return touched[field] ? errors[field] : undefined
  }, [errors, touched])

  return { errors, touched, validate, validateAll, handleSubmit, handleBlur, clearErrors, isValid, getFieldError }
}
