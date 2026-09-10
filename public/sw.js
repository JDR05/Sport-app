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

// The cache key, and it has to change when a deployment does.
//
// This was the literal 'trace-shell-v1' — a constant, forever. The activate
// handler below deletes every cache whose key is not the current one, and its
// comment says "old versions go immediately"; with a key that never changed,
// that line could never delete anything. The comment stated the intent and the
// code did the opposite, which is how an app keeps serving a shell from a
// deployment that is weeks old.
//
// The version arrives in the script URL — the page registers `/sw.js?v=<build>`
// — so a new deployment is a new script URL, which is a new worker, which
// installs, activates, and drops every cache but its own.
const VERSION = `trace-shell-${new URLSearchParams(self.location.search).get('v') || 'dev'}`

// The routes worth having offline: the ones somebody opens in a gym or on a
// run. They are cached as *shells*; their content still needs the network, and
// the app already shows an honest "could not load" state when it is missing.
const SHELL = ['/today', '/muster', '/offline']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // One at a time, and each failure swallowed on its own.
      //
      // This was `cache.addAll(SHELL)`, which is all-or-nothing *and* rejects
      // outright on a redirect. '/plan' became a redirect to '/today' when the
      // tab went away, so addAll rejected, the catch below swallowed it, and
      // the worker installed with an empty cache — offline silently did
      // nothing at all, with no error anywhere. A list where one bad entry
      // costs every good one is the wrong shape for a best-effort cache.
      .then((cache) =>
        Promise.all(
          SHELL.map((path) =>
            fetch(path, { redirect: 'follow' })
              .then((response) =>
                response.ok && response.type === 'basic' ? cache.put(path, response) : undefined,
              )
              .catch(() => {}),
          ),
        ),
      )
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
