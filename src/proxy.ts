// Next 16 renamed the middleware convention to `proxy`. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.

import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets. Without the exclusions the auth
    // redirect would also swallow CSS and JavaScript, and the login page
    // would render unstyled and dead.
    //
    // .webmanifest belongs in that list for a reason that is easy to miss: a
    // browser fetches the manifest before anyone has signed in, and often
    // without credentials even when they have. Redirecting it to /login means
    // the install prompt never appears and the app cannot be added to a home
    // screen at all — which is exactly what it did.
    //
    // sw.js is the same lesson, missed the second time it applied. Fetching it
    // returned the login page as text/html — a service worker script that is
    // not a script, so registration is rejected, and the catch beside
    // `register()` swallows that as silently as everything else here. It is
    // re-fetched by the browser on its own schedule to check for an update,
    // which is a moment nobody controls and the session may well have lapsed.
    //
    // Nothing is lost by making it public: the worker holds no user data, it
    // is the same file for everybody, and everything it goes on to fetch is
    // still behind this proxy.
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
