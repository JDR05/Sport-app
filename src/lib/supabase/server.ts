// Supabase on the server, for Server Components, Server Actions and route
// handlers.
//
// A new client per request, never a module-level one: the client is configured
// with *this* request's cookies, and sharing it across requests would serve one
// user's data to another. That is the single most dangerous mistake available
// in this file, so it is not made possible.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabasePublishableKey, supabaseUrl } from './env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, which may not set cookies. Safe to
          // ignore: the proxy refreshes the session on every request anyway.
        }
      },
    },
  })
}
