// Register service worker
//
// This used to reload the page the moment a new version finished installing.
// Because a deploy is picked up a second or two after load, that reload landed
// while the page was being used — you'd tap a tab, the page would reload, and
// you'd be back where you started. Worse, it could fire in the middle of a
// round and look like the game had frozen.
//
// Now an update only applies when it can't interrupt anything: on the lobby,
// before the first tap. Otherwise the new version is left waiting and takes
// effect on the next natural page load.
if ('serviceWorker' in navigator) {
  let interacted = false
  const markInteracted = () => { interacted = true }
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
    window.addEventListener(ev, markInteracted, { once: true, passive: true })
  }

  const safeToReload = () =>
    !interacted &&
    window.location.pathname === '/' &&   // lobby only — never mid-game
    document.visibilityState === 'visible'

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Check for updates every time the app loads
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            if (!safeToReload()) return   // leave it waiting for the next load
            newSW.postMessage('SKIP_WAITING')
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (safeToReload()) window.location.reload()
            })
          }
        })
      })
    } catch (e) {
      // SW not supported or blocked — app still works online
    }
  })
}
