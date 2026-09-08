// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Check for updates every time the app loads
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — reload automatically
            newSW.postMessage('SKIP_WAITING')
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload()
            })
          }
        })
      })
    } catch (e) {
      // SW not supported or blocked — app still works online
    }
  })
}
