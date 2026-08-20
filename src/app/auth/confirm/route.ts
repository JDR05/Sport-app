// Where the confirmation link in the sign-up mail lands.
//
// Two shapes arrive here, because Supabase has two flows and which one is in
// use depends on the email template — see ADR-036.
//
//   1. `?token_hash=…&type=…` — the server-side (PKCE) flow. The token is
//      exchanged for a session here and is then spent. This is the target
//      state and needs the custom template, which needs custom SMTP.
//
//   2. No parameters at all — the default template's implicit flow. Supabase
//      already verified the address on its own domain and sent the session in
//      the URL *fragment*, which by definition never reaches a server. The
//      account is confirmed; there is simply no session to pick up here.
//
// Treating case 2 as a broken link would be the worst possible answer: it
// tells someone their confirmation failed at the exact moment it succeeded.
// So the absence of a token is reported as "confirmed, please sign in".

import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<void> {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type) redirect('/login?bestaetigt=1')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  redirect(error ? '/login?fehler=link' : '/')
}
