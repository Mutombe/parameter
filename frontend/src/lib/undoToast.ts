import toast from 'react-hot-toast'

interface UndoToastOptions {
  message: string
  onConfirm: () => void
  onUndo?: () => void
  duration?: number
}

export function undoToast({ message, onConfirm, onUndo, duration = 5000 }: UndoToastOptions) {
  let undone = false

  const toastId = toast(
    (t) => {
      // Build the toast content as a string with HTML
      const container = document.createElement('div')
      container.style.display = 'flex'
      container.style.alignItems = 'center'
      container.style.gap = '12px'

      const text = document.createElement('span')
      text.textContent = message
      container.appendChild(text)

      const btn = document.createElement('button')
      btn.textContent = 'Undo'
      btn.style.cssText = 'font-weight:600;text-decoration:underline;cursor:pointer;background:none;border:none;color:inherit;padding:0;font-size:inherit'
      btn.onclick = () => {
        undone = true
        onUndo?.()
        toast.dismiss(t.id)
      }
      container.appendChild(btn)

      // Return as a React-compatible string
      return `${message}`
    },
    {
      duration,
      position: 'bottom-center',
      style: {
        background: '#1F2937',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
    }
  )

  // Execute the action after the toast expires
  setTimeout(() => {
    if (!undone) {
      onConfirm()
    }
  }, duration)

  return toastId
}

// Simpler version: show toast with undo button, execute immediately but allow undo to revert
export function undoableAction({
  message,
  action,
  undoAction,
  duration = 5000,
}: {
  message: string
  action: () => Promise<void> | void
  undoAction?: () => Promise<void> | void
  duration?: number
}) {
  let cancelled = false

  const toastId = toast(message, {
    duration,
    position: 'bottom-center',
    style: {
      background: '#1F2937',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '500',
    },
  })

  // Execute after delay, allowing undo
  const timer = setTimeout(async () => {
    if (!cancelled) {
      await action()
    }
  }, duration)

  return {
    toastId,
    undo: () => {
      cancelled = true
      clearTimeout(timer)
      toast.dismiss(toastId)
      undoAction?.()
      toast.success('Action undone', {
        duration: 2000,
        position: 'bottom-center',
        style: {
          background: '#10B981',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: '500',
        },
      })
    },
  }
}
