import { useCallback, useEffect, useRef, useState } from 'react'
import { appUi } from '../../lib/appUi'
import { createRuntimeId } from '../../lib/createRuntimeId'
import ConfirmationDialog from './ConfirmationDialog'
import { ToastStack } from './Toast'

const TOAST_DURATION_MS = 4200
const UNDO_TOAST_DURATION_MS = 10000

export default function AppUiProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toasts, setToasts] = useState([])
  const toastTimers = useRef(new Map())

  const dismissToast = useCallback((id) => {
    const timer = toastTimers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      toastTimers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message, tone = 'info', options = null) => {
    const id = createRuntimeId()
    setToasts((current) => [
      ...current,
      {
        id,
        message,
        tone,
        actionLabel: options?.actionLabel ?? null,
        onAction: options?.onAction ?? null,
      },
    ])

    const duration = options?.durationMs ??
      (options?.actionLabel ? UNDO_TOAST_DURATION_MS : TOAST_DURATION_MS)

    const timer = window.setTimeout(() => {
      dismissToast(id)
    }, duration)

    toastTimers.current.set(id, timer)
  }, [dismissToast])

  const finishDialog = useCallback((confirmed) => {
    setDialog((current) => {
      if (!current) return null
      if (current.showCancel === false) {
        current.resolve?.()
      } else {
        current.resolve?.(Boolean(confirmed))
      }
      return null
    })
  }, [])

  useEffect(() => {
    appUi.register({
      confirm: (options) =>
        new Promise((resolve) => {
          setDialog({
            ...options,
            showCancel: options.showCancel ?? true,
            resolve: (confirmed) => resolve(Boolean(confirmed)),
          })
        }),
      alert: (options) =>
        new Promise((resolve) => {
          setDialog({
            ...options,
            showCancel: false,
            confirmLabel: options.confirmLabel ?? 'OK',
            tone: options.tone ?? 'info',
            resolve: () => resolve(),
          })
        }),
      toast: showToast,
    })

    return () => {
      appUi.register({
        confirm: () => Promise.resolve(false),
        alert: () => Promise.resolve(),
        toast: () => {},
      })
    }
  }, [showToast])

  useEffect(
    () => () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer))
      toastTimers.current.clear()
    },
    [],
  )

  return (
    <>
      {children}
      <ConfirmationDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel ?? 'Confirm'}
        cancelLabel={dialog?.cancelLabel ?? 'Cancel'}
        tone={dialog?.tone ?? 'default'}
        showCancel={dialog?.showCancel ?? true}
        onConfirm={() => finishDialog(true)}
        onCancel={() => finishDialog(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
