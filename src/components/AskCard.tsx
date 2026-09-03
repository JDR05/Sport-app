'use client'

// The one place the person asks and the app answers.
//
// Every other AI call in this product is started by the app: classify this
// goal, propose these actions, write this week's note. All of them are the app
// talking. This is the direction that makes it a counterpart rather than a
// form that occasionally speaks — and it is the answer to "warum sollte man
// die App öffnen?" on a Tuesday, when nothing is due and nothing has failed.
//
// Three deliberate restraints, and each one is the difference between a tool
// and a chat toy:
//
//   * Three tappable openers, drawn from this person's real week, so the first
//     use costs no typing. An empty text field on a phone is a wall.
//   * Five questions a day. Not for cost — the provider is free — but because
//     an app that answers unlimited typing becomes the second job the product
//     rules forbid.
//   * The answer never claims to have changed anything. It cannot: this
//     screen has no write path into the plan, and validate.ts refuses an
//     answer that says otherwise.
//
// Hidden entirely when no model can answer. An input box that replies "das
// weiß ich nicht" to everything is worse than no input box.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { loadAskState, submitQuestion } from '@/app/(app)/actions'
import { Card, SectionHeading } from '@/components/ui'
import { QUESTION_MAX_CHARS } from '@/lib/ai/ask'
import type { AskState, Exchange } from '@/lib/db/ask'

/**
 * Loads its own state and draws nothing until it has it.
 *
 * Today already waits on one round trip for the week; this must not add a
 * second one in front of it. So the card appears when its data arrives and the
 * actions above it are never held up — and on an account with no model it
 * simply never appears, which is the right amount of explanation for a feature
 * that is not there.
 */
export function AskCard({ today }: { today: string }) {
  const [state, setState] = useState<AskState | null>(null)

  useEffect(() => {
    let current = true
    void loadAskState(today)
      .then((loaded) => {
        if (current) setState(loaded)
      })
      .catch(() => {
        // A failed load means no box. There is nothing useful to say about it
        // on a screen whose job is today's three actions.
        if (current) setState(null)
      })
    return () => {
      current = false
    }
  }, [today])

  if (!state) return null
  return <AskView state={state} today={today} />
}

/** The card itself, given its state. Separate so it can be rendered in a test. */
export function AskView({ state, today }: { state: AskState; today: string }) {
  const [history, setHistory] = useState<Exchange[]>(state.history)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState<string | null>(state.exhausted)

  if (!state.available) return null

  async function send(question: string) {
    if (busy || question.trim().length === 0) return
    setBusy(true)
    setError(null)

    const result = await submitQuestion(question, today).catch(() => null)
    setBusy(false)

    if (!result) {
      setError('Das hat gerade nicht geklappt.')
      return
    }
    if (!result.ok) {
      if (result.reason === 'limit') setExhausted(result.message)
      else setError(result.message)
      return
    }

    setHistory((current) => [...current, result.exchange])
    setDraft('')
  }

  return (
    <Framed>
        {history.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            Frag mich etwas zu deinem Plan, deiner Woche oder deinem Ziel. Ich antworte aus
            deinen eigenen Daten — und sage es, wenn etwas nicht darin steht.
          </p>
        )}

        {history.map((exchange) => (
          <div key={exchange.id} className="mb-3 last:mb-0">
            <p className="text-sm font-semibold leading-snug text-ink">{exchange.question}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{exchange.answer}</p>
            {/* The honest half. Not an error state and not styled like one:
                "dafür müsste ich wissen, wann du abends nach Hause kommst" is
                the app taking an interest, which is the whole reason this
                field is in the schema. */}
            {!exchange.canAnswer && exchange.needs && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                Dafür müsste ich wissen: {exchange.needs}
              </p>
            )}
            {exchange.evidence.length > 0 && (
              // Principle 4, on screen rather than in a comment: every
              // statement points at the rows it came from.
              <p className="num mt-1.5 text-[11px] text-faint">
                aus: {exchange.evidence.join(' · ')}
              </p>
            )}
          </div>
        ))}

        {exhausted ? (
          <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">
            {exhausted}
          </p>
        ) : (
          <>
            {history.length === 0 && state.suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(suggestion.question)}
                    className="label min-h-11 rounded-[2px] border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted transition-colors duration-[var(--motion-tap)] active:bg-sunken disabled:opacity-50"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 border-t border-line pt-3">
              <textarea
                rows={2}
                value={draft}
                maxLength={QUESTION_MAX_CHARS}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Deine Frage …"
                className="w-full resize-none rounded-[2px] border border-line bg-surface px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void send(draft)}
                className="label mt-2 min-h-11 w-full rounded-[2px] border border-accent bg-accent px-4 py-3 text-[11px] font-semibold text-[color:var(--accent-ink)] transition-colors duration-[var(--motion-tap)] disabled:opacity-40"
              >
                {busy ? 'Ich schau nach …' : 'Fragen'}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-2 text-sm leading-relaxed text-muted">{error}</p>}
    </Framed>
  )
}

/** The heading and the card, for every place this is not already inside one. */
function Framed({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionHeading>Frag nach</SectionHeading>
      <Card>{children}</Card>
    </>
  )
}
