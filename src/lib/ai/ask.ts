// The rules around asking, as opposed to the asking itself.
//
// Pure and free of both the database and the model, because these are product
// decisions rather than plumbing, and product decisions that live inside a
// query are product decisions nobody can find again.
//
// Two of them:
//
//   * There is a daily ceiling. Not to save money — the whole point of the
//     provider choice was that it costs nothing — but because an app that
//     answers unlimited typing becomes the second job CLAUDE.md forbids. Five
//     is enough to use it properly and few enough that it stays a tool.
//   * The box is never empty. An empty text field on a phone is a wall, and
//     the suggestions below come from this person's actual week, so the first
//     tap already produces something true.

import type { PlanDomain } from '@/lib/domain/types'

export const MAX_QUESTIONS_PER_DAY = 5

/** Long enough for a real question, short enough that it is not an essay. */
export const QUESTION_MAX_CHARS = 300

export type Allowance =
  | { allowed: true; left: number }
  | { allowed: false; message: string }

export function allowanceFor(askedToday: number): Allowance {
  const left = MAX_QUESTIONS_PER_DAY - askedToday
  if (left > 0) return { allowed: true, left }
  return {
    allowed: false,
    message:
      'Für heute sind die Fragen aufgebraucht. Das ist Absicht: diese App soll sich nicht ' +
      'wie ein zweiter Job anfühlen. Morgen wieder.',
  }
}

/**
 * The question actually reaching the model, or nothing.
 *
 * Trimmed, capped, and refused when it is too short to mean anything. Two
 * characters is not a question, and sending it would spend one of five on a
 * mis-tap.
 */
export function normaliseQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length < 4) return null
  return trimmed.slice(0, QUESTION_MAX_CHARS)
}

export type Suggestion = { label: string; question: string }

/**
 * Three questions worth tapping, chosen from what is actually true today.
 *
 * Deterministic on purpose, and not a fallback for the model: these are the
 * doorway, and a doorway that needs a model call before it can be drawn is a
 * doorway people watch a spinner in front of. Which three appear depends on
 * the week — "warum steht das heute" only exists when something does, and
 * "woran lag es" only when something did not.
 */
export function suggestionsFor(state: {
  /** Titles of today's actions, in order. */
  todayTitles: string[]
  /** Domains that had a missed action this week. */
  missedDomains: PlanDomain[]
  /** True once the week has enough answered actions to be worth summarising. */
  hasWeekData: boolean
}): Suggestion[] {
  const out: Suggestion[] = []

  const first = state.todayTitles[0]
  if (first) {
    out.push({
      label: 'Warum heute das?',
      question: `Warum steht „${first}" heute auf meinem Plan?`,
    })
  }

  if (state.missedDomains.length > 0) {
    out.push({
      label: 'Was tue ich dagegen?',
      question:
        'Diese Woche ist etwas ausgefallen. Was könnte ich nächste Woche anders machen, ' +
        'ohne mir mehr aufzuhalsen?',
    })
  }

  if (state.hasWeekData) {
    out.push({ label: 'Wie läuft es?', question: 'Wie läuft meine Woche im Vergleich zu meinem Ziel?' })
  }

  // Always something to tap, even in week one on a rest day.
  if (out.length === 0) {
    out.push({
      label: 'Wie fange ich an?',
      question: 'Womit fange ich am besten an, wenn ich mein Ziel erreichen will?',
    })
  }

  return out.slice(0, 3)
}
