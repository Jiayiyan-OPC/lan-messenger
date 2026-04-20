import { useEffect } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/**
 * Subscribe to a Tauri event. Automatically unsubscribes on unmount.
 */
export function useEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined

    listen<T>(event, (e) => handler(e.payload)).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])
}
