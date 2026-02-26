import { useEffect, useCallback, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Warns the user when they try to navigate away with unsaved changes.
 * Handles both in-app navigation (react-router) and browser tab close/refresh.
 */
export function useUnsavedChanges(isDirty: boolean, message: string = 'You have unsaved changes. Are you sure you want to leave?') {
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  // Block in-app navigation via react-router
  const blocker = useBlocker(
    useCallback(() => isDirtyRef.current, [])
  )

  // Handle the blocker state
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmed = window.confirm(message)
      if (confirmed) {
        blocker.proceed()
      } else {
        blocker.reset()
      }
    }
  }, [blocker, message])

  // Block browser close/refresh via beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [message])
}
