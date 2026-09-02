// Whether this person's data may be sent to a model at all.
//
// Deterministic code in front of every model call, not a line in a prompt and
// not a check in the form. The form can be bypassed — a server action is a
// public HTTP endpoint — and a prompt cannot enforce anything about a request
// that has already been sent.
//
// Health data is a special category under Art. 9 DSGVO. Processing it needs an
// exception, and for a consumer app that exception is explicit consent,
// Art. 9 (2) (a). Explicit rules out an implied yes: no pre-ticked box, no
// consent folded into terms nobody opens, and — because the provider may
// change — no consent that silently carries over to a different one.
//
// The reason this can be a real choice rather than a formality is the
// architecture: without AI the app still classifies goals, still plans, still
// detects patterns, still runs experiments. Art. 7 (4) says consent is not
// freely given when the service is withheld without it. Here refusing costs
// the model, not the product.

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdapter, WithheldAdapter } from './index'
import type { AiAdapter } from './types'

/**
 * Which consent text is current.
 *
 * Bump this whenever what leaves the app materially changes: a different
 * provider, a new field in the payload, a new task that sends something the
 * old text did not describe. Everyone then counts as not having agreed and is
 * asked again — which is the point. Consent is to a specific processing, so
 * quietly widening it under an old yes is the failure mode this number exists
 * to make impossible.
 */
export const CONSENT_VERSION = 2

// Version 1 said the data goes to the provider. It did not say the provider
// may keep it and learn from it, which is a second purpose and the provider's
// own — so a version-1 yes was given for something narrower than what
// actually happens on a free tier. Everyone is asked again rather than being
// carried over, which is the whole reason this number exists.

export type ConsentState = {
  /** True only for the current version. An older yes is not a yes to this. */
  granted: boolean
  /** When they last agreed, for the evidence Art. 7 (1) requires. */
  at: string | null
  /** Set when they agreed to an earlier text, so the UI can say "again". */
  outdated: boolean
}

export const NO_CONSENT: ConsentState = { granted: false, at: null, outdated: false }

export const readConsent = cache(async function readConsent(
  profileId: string,
): Promise<ConsentState> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_consent_at, ai_consent_version')
    .eq('id', profileId)
    .maybeSingle()

  // A failed read is not a yes. The safe answer to "may we send this" is no,
  // and the app is fully usable with that answer.
  if (error || !data?.ai_consent_at) return NO_CONSENT

  const version = data.ai_consent_version ?? 0
  return {
    granted: version >= CONSENT_VERSION,
    at: data.ai_consent_at,
    outdated: version < CONSENT_VERSION,
  }
})

/** The one question every AI call site asks first. */
export async function mayUseAi(profileId: string): Promise<boolean> {
  return (await readConsent(profileId)).granted
}

export async function grantConsent(profileId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ ai_consent_at: new Date().toISOString(), ai_consent_version: CONSENT_VERSION })
    .eq('id', profileId)
  return error === null
}

/**
 * Withdrawal, which Art. 7 (3) requires to be as easy as giving it — one tap
 * in the profile, no email, no reason asked.
 *
 * It stops future calls. It cannot unsend what already went, and the app says
 * so rather than implying an undo it does not have.
 */
export async function withdrawConsent(profileId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ ai_consent_at: null, ai_consent_version: null })
    .eq('id', profileId)
  return error === null
}

/**
 * The only way server code should obtain an adapter.
 *
 * Not `if (await mayUseAi(id)) …` at each call site: that is a branch somebody
 * forgets, and the cost of forgetting is a request that has already left with
 * somebody's health data in it. Here the refusal is the adapter, so a missed
 * check produces a `no_consent` result — the same shape every call site
 * already handles — instead of a leak.
 */
export async function adapterFor(profileId: string, timeoutMs?: number): Promise<AiAdapter> {
  if (!(await mayUseAi(profileId))) return new WithheldAdapter()
  return createAdapter(process.env, timeoutMs)
}
