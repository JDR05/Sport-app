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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
