import { useUiStore } from '../../stores/ui'
import { Toast } from './Toast'

export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts)
  const removeToast = useUiStore((s) => s.removeToast)
  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 flex flex-col gap-2"
      style={{ zIndex: 100 }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
