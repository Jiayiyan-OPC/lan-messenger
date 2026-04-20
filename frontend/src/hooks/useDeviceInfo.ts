import { useEffect } from 'react'
import { device as deviceApi } from '../api/device'
import { useAppStore } from '../stores/app'
import type { DeviceInfo } from '../types'

/**
 * Fetch `get_device_info` once at mount and populate the app store. Device
 * info is process-lifetime-stable, so a single App-level call is enough;
 * downstream UI reads `deviceInfo` from the store instead of re-invoking.
 */
export function useDeviceInfo(): DeviceInfo | null {
  const deviceInfo = useAppStore((s) => s.deviceInfo)
  const setDeviceInfo = useAppStore((s) => s.setDeviceInfo)

  useEffect(() => {
    let alive = true
    deviceApi
      .getInfo()
      .then((v) => {
        if (!alive) return
        setDeviceInfo(v)
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[useDeviceInfo] get_device_info failed', err)
        }
      })
    return () => {
      alive = false
    }
  }, [setDeviceInfo])

  return deviceInfo
}
