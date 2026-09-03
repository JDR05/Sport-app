'use client'

// The app asking, rather than waiting to be asked.
//
// Everything else the model does here is triggered by the app's own schedule
// or by the person typing first. This is the direction that was missing, and
// it is the one the product owner named: "das stört mich so arg, dass man
// alles selber aus dem Arsch ziehen muss. Es soll einfach Fragen stellen."
//
// One question, with what the answer would change written underneath it, and
// up to four tappable answers. `why` is not decoration: a question whose
// purpose is invisible reads as a form, and a form is the one thing this app
// is not allowed to feel like. A model that cannot say what an answer would
// change has no business asking, and validate.ts refuses the question.
//
// Skipping is always available and is a real answer — it is stored as one, so
// the app does not come back next week as though it never asked.

import { useEffect, useState } from 'react'
import { loadFollowUp, submitFollowUp } from '@/app/(app)/actions'
import { Card, SectionHeading } from '@/components/ui'
import { TextInput } from '@/components/form'
import type { OpenQuestion } from '@/lib/db/followup'

export function FollowUpCard({ today }: { today: string }) {
  const [question, setQuestion] = useState<OpenQuestion | null>(null)

  useEffect(() => {
    let current = true
    void loadFollowUp(today)
      .then((loaded) => {
        if (current) setQuestion(loaded)
      })
      .catch(() => {
        if (current) setQuestion(null)
      })
    return () => {
      current = false
    }
  }, [today])

  if (!question) return null
  return <FollowUpView question={question} today={today} onDone={() => setQuestion(null)} />
}

/** The card itself. Separate so it can be rendered in a test. */
export function FollowUpView({
  question,
  today,
  onDone,
}: {
  question: OpenQuestion
  today: string
  onDone: () => void
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(answer: string | null) {
    if (busy) return
    setBusy(true)
    setError(null)

    const result = await submitFollowUp(question.id, answer, today).catch(() => null)
    setBusy(false)

    if (!result?.ok) {
      setError('Das konnte gerade nicht gespeichert werden.')
      return
    }
    onDone()
  }

  return (
    <>
      <SectionHeading>Eine Frage an dich</SectionHeading>
      <Card tone="accent">
        <p className="text-[15px] font-semibold leading-snug text-ink">{question.question}</p>
        {/* What the answer would change. Without it this is a form field. */}
        <p className="mt-1 text-sm leading-relaxed text-muted">{question.why}</p>

        {question.options.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => void send(option)}
                className="label min-h-11 rounded-[2px] border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-ink transition-colors duration-[var(--motion-tap)] active:bg-sunken disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-accent/20 pt-3">
          <TextInput
            value={draft}
            onChange={setDraft}
            placeholder="Oder in eigenen Worten"
            maxLength={300}
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy || draft.trim().length === 0}
              onClick={() => void send(draft)}
              className="label min-h-11 flex-1 rounded-[2px] border border-accent bg-accent px-3 py-2 text-[11px] font-semibold text-[color:var(--accent-ink)] transition-colors duration-[var(--motion-tap)] disabled:opacity-40"
            >
              Antworten
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(null)}
              className="label min-h-11 rounded-[2px] border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted transition-colors duration-[var(--motion-tap)] active:bg-sunken disabled:opacity-50"
            >
              Überspringen
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm leading-relaxed text-muted">{error}</p>}
      </Card>
    </>
  )
}
