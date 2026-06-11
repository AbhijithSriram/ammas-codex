import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Check, Close } from '../components/icons'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err'
}

interface ToastApi {
  ok: (text: string) => void
  err: (text: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((text: string, kind: 'ok' | 'err') => {
    const id = ++seq
    setToasts((t) => [...t, { id, text, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 4200 : 2200)
  }, [])

  const api: ToastApi = {
    ok: (t) => push(t, 'ok'),
    err: (t) => push(t, 'err'),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-wrap" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '')}>
              {t.kind === 'ok' ? <Check s={16} /> : <Close s={16} />}
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
