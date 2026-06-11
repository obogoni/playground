import { useEffect } from 'react'
import type { JSX } from 'react'
import './Toast.css'

interface ToastProps {
  message: string
  onDismiss: () => void
}

/** Transient bottom-center notice — handoff §Interactions (~2.2s, toastIn). */
export function Toast({ message, onDismiss }: ToastProps): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2200)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return <div className="toast">{message}</div>
}
