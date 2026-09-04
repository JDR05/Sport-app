// Session refresh, coarse route protection, and the per-request CSP nonce.
//
// Three jobs in one place because all three need the raw request before any
// page renders. The important caveat, straight from the Next docs: this is an
// *optimistic* check, not the security boundary. It runs on prefetches and it
// only reads a cookie. The real guarantees live further in — `requireUser()`
// verifies the token at the data layer, and row level security enforces
// ownership in Postgres even if both were bypassed.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from './env'

/** Reachable without a session. Everything else needs one. */
// The legal pages belong here and not behind the sign-in.
//
// § 5 DDG wants an Impressum "leicht erkennbar, unmittelbar erreichbar und
// ständig verfügbar", and Art. 13 DSGVO wants the privacy notice available
// *before* somebody hands over any data. Both are addressed to people who have
// not signed up — including the person deciding whether to. Behind
// `requireUser` they would be reachable only by those who already agreed,
// which is the wrong way round.
const PUBLIC_PATHS = ['/login', '/signup', '/auth', '/impressum', '/datenschutz', '/offline']

export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets Next's bootstrap load its own chunks, so no chunk
    // hash has to be listed here. In development React uses eval to rebuild
    // server stacks; production does not.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Stylesheets stay locked to this origin. Inline *attributes* are allowed,
    // and that is a considered trade rather than a gap.
    //
    // A nonce does not cover a `style=""` attribute — CSP checks those under
    // style-src-attr, which falls back to style-src — so the strict version
    // silently blocked the app's own layout. Verified in a browser: the
    // Playbook progress bar rendered at full width instead of its real
    // percentage, which is a false statement on screen, and the ring and chart
    // lost their dimensions.
    //
    // What is given up is small and what is kept is the part that matters:
    // scripts remain nonce-plus-strict-dynamic, connect-src still names the one
    // origin data could be sent to, and the app renders no user-supplied HTML,
    // so there is no path by which someone else's markup reaches this page to
    // exploit the relaxation.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The one external origin this app talks to. Anything else — an injected
    // script trying to exfiltrate a plan — has nowhere to send it.
    `connect-src 'self' ${supabaseUrl()}`,
    // Without this, `worker-src` falls back to `script-src` — which carries
    // 'strict-dynamic' and a per-request nonce, neither of which a worker
    // script can present. The registration is then refused and the app has no
    // service worker at all, silently.
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const csp = contentSecurityPolicy(nonce)

  // Rebuilt rather than captured, so that cookies Supabase writes onto the
  // request during a token refresh are carried through to the render.
  const withNonce = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    // Next reads the nonce back out of this header to stamp its own inline
    // bootstrap script. Without it the page loads no JavaScript at all.
    headers.set('Content-Security-Policy', csp)
    return NextResponse.next({ request: { headers } })
  }

  let response = withNonce()

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = withNonce()
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Nothing between creating the client and this call. getClaims verifies the
  // token signature; getSession would only read the cookie and believe it.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)

  const { pathname } = request.nextUrl

  if (!signedIn && !isPublic(pathname)) {
    // An API route gets an honest status code. Redirecting a fetch to an HTML
    // login page produces a confusing parse error instead of "not allowed" —
    // and this is what closes the open AI endpoint.
    if (pathname.startsWith('/api/')) {
      const denied = NextResponse.json({ error: 'authentication required' }, { status: 401 })
      denied.headers.set('Content-Security-Policy', csp)
      return denied
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // So the user lands back where they were heading after signing in.
    if (pathname !== '/') url.searchParams.set('weiter', pathname)
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  // Someone already signed in has no business on the login screen.
  if (signedIn && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  response.headers.set('Content-Security-Policy', csp)
  return response
}
