'use server'

// Sign up, sign in, sign out.
//
// Validation is deliberate rather than decorative: the schema below is the
// only thing standing between arbitrary form input and the auth provider, so
// it runs before anything else and rejects rather than repairs.
//
// The error messages never say whether an address is registered. "E-Mail oder
// Passwort stimmt nicht" for both cases is not vagueness, it is what stops the
// login form from being usable as a tool to find out who has an account here —
// which for a health app is information worth protecting on its own.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'
import { isPwned } from '@/lib/auth/pwned'

export type AuthState = { error: string | null }

// Supabase's own minimum is 6; the dashboard can raise it and should.
const MIN_PASSWORD_LENGTH = 10

const credentials = z.object({
  email: z.email({ message: 'Das sieht nicht nach einer E-Mail-Adresse aus.' }),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, {
      message: `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen. Lieber eine lange Wortfolge als ein kurzes Kunstwort.`,
    })
    .max(200, { message: 'Höchstens 200 Zeichen.' }),
})

function read(formData: FormData) {
  return credentials.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
  })
}

/**
 * Where the confirmation link should come back to. Taken from the request, but
 * the actual protection is the redirect allowlist in the Supabase dashboard —
 * without it a forged Host header could point the confirmation mail at someone
 * else's site.
 */
async function origin(): Promise<string> {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = read(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'E-Mail oder Passwort stimmt nicht.' }
  }

  redirect(safeNext(formData.get('weiter')))
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = read(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig.' }
  }

  // Checked before the account exists, so a leaked password is never stored
  // even briefly. Null means the service could not be reached; sign-up then
  // continues rather than blocking someone over a third party's outage.
  if ((await isPwned(parsed.data.password)) === true) {
    return {
      error:
        'Dieses Passwort steht in bekannten Datenlecks und wird bereits automatisiert ' +
        'durchprobiert. Bitte wähl ein anderes — am besten eine lange Wortfolge, die du ' +
        'nirgends sonst benutzt.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/confirm` },
  })

  if (error) {
    // Rate limits and weak-password rejections are worth showing as they are;
    // they tell the person something they can act on.
    return { error: error.message }
  }

  redirect('/signup?bestaetigen=1')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
