// When the app is allowed to ask something.
//
// The model asks once, after the intake, and then never again (ADR-084).
// Everything it learns after that it has to infer from ticks, so a person's
// actual life reaches the app only if they think to type it in — "das stört
// mich so arg, dass man alles selber aus dem Arsch ziehen muss".
//
// The fix is not "ask more". An app that asks whenever it is curious is an
// interview, and the product rules forbid the second job. So the gate is here,
// deterministic and separate from the model: whether asking is *allowed* is a
// count over days, and only what to ask is a judgement.
//
// Three conditions, and all three have to hold.

/** Days between one question being resolved and the next being asked. */
export const MIN_DAYS_BETWEEN_QUESTIONS = 3

/**
 * Days with real data before the app asks anything at all.
 *
 * The onboarding just asked this person a lot of questions. Following that
 * with another one before they have seen a single plan through would read as a
 * form that never ends — and the app would have nothing to ground the question
 * in, which is what separates "wann kommst du abends heim?" from a survey.
 */
export const MIN_DAYS_WITH_DATA_BEFORE_ASKING = 3

/**
 * Questions the app may ask in one week, however much happens.
 *
 * Belt and braces next to the gap above: a person who answers instantly every
 * time could otherwise be asked twice a week for ever, and the point is a
 * quiet interest rather than a running conversation.
 */
export const MAX_QUESTIONS_PER_WEEK = 1

export type FollowUpGate = {
  today: string
  /** Is there already a question waiting? Then nothing may be asked. */
  hasOpenQuestion: boolean
  /** Days the person has actually answered something on. */
  daysWithData: number
  /** When the app last asked, resolved or not. Null if it never has. */
  lastAskedOn: string | null
  /** Questions asked since the start of this week. */
  askedThisWeek: number
}

export type GateVerdict =
  | { mayAsk: true }
  | { mayAsk: false; because: 'open_question' | 'too_soon' | 'too_early' | 'weekly_cap' }

export function mayAskFollowUp(gate: FollowUpGate): GateVerdict {
  // One at a time. Two open questions is a queue, and a queue is homework.
  if (gate.hasOpenQuestion) return { mayAsk: false, because: 'open_question' }

  if (gate.daysWithData < MIN_DAYS_WITH_DATA_BEFORE_ASKING) {
    return { mayAsk: false, because: 'too_early' }
  }

  if (gate.askedThisWeek >= MAX_QUESTIONS_PER_WEEK) {
    return { mayAsk: false, because: 'weekly_cap' }
  }

  if (gate.lastAskedOn && daysApart(gate.lastAskedOn, gate.today) < MIN_DAYS_BETWEEN_QUESTIONS) {
    return { mayAsk: false, because: 'too_soon' }
  }

  return { mayAsk: true }
}

/**
 * Whole days from `from` to `to`, signed, and deliberately so.
 *
 * A question stamped with a date in the future means the clock went backwards
 * — a device set wrong, a timezone change over a flight. Taking the absolute
 * value there would read the confusion as a long silence and let the app ask
 * again at once; the signed difference is negative, which is below every
 * threshold, so it waits. That is the safe direction, and it heals itself the
 * moment the calendar catches up.
 *
 * An unparseable date yields 0, which blocks rather than permits, for the same
 * reason.
 */
function daysApart(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  if (!Number.isFinite(ms)) return 0
  return Math.round(ms / 86_400_000)
}
