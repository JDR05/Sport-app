// The service worker. Hand-written, and short on purpose.
//
// Two jobs: make the app open without a network, and receive a reminder. Both
// are worth having and neither needs a framework — a generated worker would be
// several hundred lines of routing rules for an app with eight screens, and it
// is the one file that keeps running after a bad deploy, so it is the last
// place to want code nobody has read.
//
// What it deliberately does NOT do: cache any response containing somebody's
// data. Health data in the Cache API is health data sitting unencrypted on a
// shared device, readable by anything with access to that origin's storage.
// The plan, the check-ins and the profile all come from Supabase over
// `connect-src` and are never touched here. What is cached is the shell — the
// HTML, the JavaScript, the fonts — which is the same for everybody and
// contains nothing about anyone.

const VERSION = 'trace-shell-v1'

// The routes worth having offline: the ones somebody opens in a gym or on a
// run. They are cached as *shells*; their content still needs the network, and
// the app already shows an honest "could not load" state when it is missing.
const SHELL = ['/today', '/plan', '/offline']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      // A shell that cannot be fetched at install time must not stop the worker
      // installing. Without this, one 404 leaves the app with no worker at all.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Old versions go immediately. A stale shell is how an app keeps showing a
  // screen that no longer exists after a deploy.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever page navigations, and only GET.
  //
  // Everything else — the API calls that carry data, every POST — goes straight
  // to the network untouched. That is what keeps somebody's plan out of the
  // cache, and it is a rule about what this file *never sees*, not one it has
  // to apply correctly each time.
  if (request.method !== 'GET' || request.mode !== 'navigate') return

  event.respondWith(
    // Network first: a screen from the network is current, a screen from the
    // cache is a shell. Falling back the other way round would show yesterday's
    // app to somebody who is online.
    fetch(request)
      .then((response) => {
        // Only the shell is kept, and only when the response is really one.
        // An opaque or errored response cached here is a broken screen served
        // confidently for as long as the cache lives.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          void caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached ?? (await caches.match('/offline')) ?? Response.error()
      }),
  )
})

// ------------------------------------------------------------------ push ---

self.addEventListener('push', (event) => {
  // Everything is defaulted, because a push that arrives malformed still shows
  // a notification on most platforms — an empty one, from an app the person
  // then distrusts.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Trace'
  const body = typeof payload.body === 'string' ? payload.body : 'Wie lief dein Tag?'
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/today'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/apple-icon.png',
      badge: '/apple-icon.png',
      // One reminder at a time. Without a tag, three evenings away produce
      // three stacked notifications, which is the nagging the brief rules out.
      tag: 'trace-reminder',
      renotify: false,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/today'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus a window that is already open rather than opening a second one.
      for (const client of clients) {
        if ('focus' in client) return client.focus().then(() => client.navigate?.(url))
      }
      return self.clients.openWindow(url)
    }),
  )
})
