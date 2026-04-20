import { useEffect, useState } from 'react'
import { device as deviceApi } from '../api/device'
import { useAppStore } from '../stores/app'
import type { DeviceInfo } from '../types'

/**
 * Fetch `get_device_info` once at mount and mirror id/name into the app store.
 * Returns `null` until the call resolves (or if it fails — downstream UI falls
 * back gracefully).
 */
export function useDeviceInfo(): DeviceInfo | null {
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const setDevice = useAppStore((s) => s.setDevice)

  useEffect(() => {
    let alive = true
    deviceApi
      .getInfo()
      .then((v) => {
        if (!alive) return
        setInfo(v)
        setDevice(v.id, v.name)
      })
      .catch((err) => {
        // Swallow — surface a console warning ONLY in dev, per quality
        // constraint ("No console errors during normal usage"). Production
        // builds stay silent; downstream UI falls back gracefully.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[useDeviceInfo] get_device_info failed', err)
        }
      })
    return () => {
      alive = false
    }
  }, [setDevice])

  return info
}
