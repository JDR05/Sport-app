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
      // Versioned, and that is the whole point of the query string: the
      // browser compares script URLs, so an unchanged '/sw.js' is a worker it
      // never replaces — and the cache it holds is never dropped either.
      const build = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'dev'
      void navigator.serviceWorker.register(`/sw.js?v=${build}`).catch(() => {})
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
