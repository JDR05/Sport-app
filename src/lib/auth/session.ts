// Where authentication is actually decided.
//
// The Next docs are explicit that the proxy is an optimistic check and must not
// be the only line of defence — it runs on prefetches and reads a cookie.
// This module runs next to the data instead, and `cache` makes it free to call
// from every component that needs it rather than passing a user down through
// props and hoping nobody forgets a check.
//
// getClaims, not getSession: getSession returns whatever is in the cookie
// without verifying it, which on the server means trusting a value the client
// controls. getClaims verifies the token signature every time.
//
// Behind both of these sits row level security. Even a bug here cannot expose
// another person's rows, because Postgres filters them on auth.uid().

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SessionUser = {
  id: string
  email: string | null
}

/** The signed-in user, or null. Never throws — callers decide what null means. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  const claims = data?.claims
  if (error || !claims || typeof claims.sub !== 'string') return null

  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
  }
})

/** The signed-in user, or a redirect to the login screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) redirect('/login')
  return user
}
