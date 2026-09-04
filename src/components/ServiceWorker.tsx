'use client'

// Registers the service worker, once, after the app is usable.
//
// Deliberately not during render and not on the critical path: registration
// costs a request and a worker install, and neither helps the screen somebody
// is currently looking at. `load` is the honest moment — everything that
// matters has already happened.

import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      // Failure is silent on purpose. A worker is an enhancement: offline
      // reading and reminders. An app that shows an error because it could not
      // install one is an app complaining about a feature the person never
      // asked about.
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
