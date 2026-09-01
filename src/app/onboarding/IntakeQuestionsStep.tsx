'use client'

// The one screen where the app asks rather than tells.
//
// It only ever appears when the model actually had something to ask, which is
// the minority of intakes. That is deliberate: a step that always appears is a
// longer form, and this is already a ten-minute one. The prompt is told that
// asking nothing is the good answer and checkQuestions enforces it.
//
// Three things are non-negotiable on this screen:
//
//   * Every question can be skipped, without explanation. A skipped answer is
//     `unknown`, which is a supported state everywhere else in this product —
//     principle 6 — so it has to be supported here too.
//   * Every question says what the answer would change. Without that it is a
//     form field, and a form field at the end of an intake is where people
//     leave.
//   * The tap-able options are suggestions, never a closed list. Typing
//     something the model did not think of is the entire reason this exists.

import { useState } from 'react'
import { Field, TextArea } from '@/components/form'
import { Button, Card, Note, Screen, ScreenTitle } from '@/components/ui'
import type { IntakeQuestion } from '@/lib/ai/schemas'
import type { IntakeAnswer } from '@/lib/domain/types'

export function IntakeQuestionsStep({
  questions,
  onDone,
  saving,
  error,
}: {
  questions: IntakeQuestion[]
  onDone: (answers: IntakeAnswer[]) => void
  saving: boolean
  error: string | null
}) {
  const [answers, setAnswers] = useState<Array<string | null>>(() => questions.map(() => null))

  const set = (index: number, value: string | null) =>
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)))

  const submit = () =>
    onDone(
      questions.map((q, i) => ({
        question: q.question,
        // Empty is the same as skipped. A stored "" would read as an answer
        // later and quietly stop the app treating it as unknown.
        answer: answers[i]?.trim() ? answers[i]!.trim() : null,
      })),
    )

  return (
    <Screen>
      <ScreenTitle
        title={questions.length === 1 ? 'Eine Rückfrage' : 'Kurze Rückfragen'}
        subtitle="Alles ist gespeichert. Das hier würde den Plan noch genauer machen — du kannst jede Frage überspringen."
      />

      {questions.map((q, index) => (
        <div key={q.question} className="mb-6">
          <Card>
            <p className="text-[15px] font-semibold leading-snug text-ink">{q.question}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{q.why}</p>

            {q.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const on = answers[index] === option
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={on}
                      // Tapping the chosen option again clears it, so a
                      // mis-tap does not become an answer somebody is stuck
                      // with on a screen that has no "undo".
                      onClick={() => set(index, on ? null : option)}
                      className={`rounded-[2px] border px-3 py-2 text-sm font-medium transition select-none ${
                        on
                          ? 'border-accent bg-accent text-accent-ink'
                          : 'border-line bg-surface text-ink active:bg-sunken'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="mt-2">
            <Field label="Oder in eigenen Worten" hint="Optional.">
              <TextArea
                value={
                  answers[index] !== null && !q.options.includes(answers[index]!)
                    ? answers[index]!
                    : ''
                }
                onChange={(v) => set(index, v.length > 0 ? v : null)}
                placeholder="…"
                rows={2}
              />
            </Field>
          </div>
        </div>
      ))}

      {error && (
        <p role="alert" className="mt-6 rounded-[2px] bg-warn-soft px-3 py-2.5 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Plan wird gebaut …' : 'Plan erstellen'}
        </Button>
        {/* Same action, different words. Skipping everything must not look
            like a second-class path — it leads to exactly the same plan the
            app would have built a minute ago. */}
        <Button variant="quiet" onClick={() => onDone([])} disabled={saving}>
          Überspringen
        </Button>
      </div>

      <Note>
        Diese Fragen kommen nicht aus einer Liste — sie entstehen aus dem, was du geschrieben
        hast, und aus dem, was du offen gelassen hast. Deshalb sind es mal keine und mal drei.
      </Note>
    </Screen>
  )
}
