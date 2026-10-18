import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../generatedVersion'

const CHECK_EVERY_MS = 60 * 1000

export default function VersionAlert() {
  const [latestVersion, setLatestVersion] = useState(null)
  const [updating, setUpdating] = useState(false)
  const lastCheckRef = useRef(0)

  const checkVersion = useCallback(async ({ force = false } = {}) => {
    const now = Date.now()
    if (!force && now - lastCheckRef.current < CHECK_EVERY_MS) return
    lastCheckRef.current = now

    try {
      const res = await fetch(`/version.json?t=${now}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data?.version && data.version !== APP_VERSION) {
        setLatestVersion(data.version)
      }
    } catch {
      // Offline or temporarily unreachable: never interrupt the game.
    }
  }, [])

  useEffect(() => {
    checkVersion({ force: true })

    const interval = window.setInterval(() => checkVersion(), CHECK_EVERY_MS)
    const onFocus = () => checkVersion({ force: true })
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion({ force: true })
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkVersion])

  const updateNow = async () => {
    if (updating) return
    setUpdating(true)

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          await reg.update().catch(() => {})
          if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING')
        }
      }
    } finally {
      // The service worker is network-first. A reload now fetches the newest
      // index/assets while preserving the current URL. If an installed mobile
      // PWA still holds the old process, the message tells the player to fully
      // close and reopen it.
      window.setTimeout(() => window.location.reload(), 350)
    }
  }

  if (!latestVersion) return null

  return (
    <div className="version-alert" role="alert" aria-live="assertive">
      <div className="version-alert__copy">
        <strong>Update required</strong>
        <span>
          A newer Dekabess version is available. Refresh now to get the latest fixes.
          If the old version remains, fully close and reopen the game.
        </span>
      </div>
      <button type="button" onClick={updateNow} disabled={updating}>
        {updating ? 'Updating…' : 'Update Now'}
      </button>
    </div>
  )
}
