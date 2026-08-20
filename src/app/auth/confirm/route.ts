// Where the confirmation link in the sign-up mail lands.
//
// The token arrives in the URL, is exchanged once for a session, and is then
// spent. On failure the person goes back to the login screen with a plain
// message rather than a stack trace — a broken link is usually an expired one,
// not an attack.

import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<void> {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type) redirect('/login?fehler=link')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  redirect(error ? '/login?fehler=link' : '/')
}
