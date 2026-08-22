// The date a plan can actually work towards.
//
// Every archetype ends up needing the same three-way answer, and four of them
// used to skip it: whatever the person typed went straight into the strategy,
// unexamined. A date in the past therefore came back as the goal date, marked
// `adjusted: false`, and Progress printed it under the word "wie gewünscht" —
// a deadline that had already passed, presented as the plan working as
// intended. Nobody wished for it. It was a typed year, or a goal picked up
// again months later.
//
// The rate-capped archetypes handled it by accident: a negative number of
// weeks is fewer than the safe number, so the clamp caught it on the way past.
// That is the right outcome reached for the wrong reason, and it stopped
// working the moment there was no rate to cap — an already-reached target
// volume, or no metric at all.
//
// The answer is never a refusal. ADR/K6: the engine says "5 kg bis zum
// 14. November", never "das geht nicht", so a date that cannot be used is
// replaced by one that can and the substitution is said out loud.

import { addDays, formatGermanDate } from './dates'

export type Horizon = {
  targetDate: string
  /** True when a date was given and could not be used as given. */
  adjusted: boolean
  /**
   * A sentence explaining the substitution, or empty when nothing was moved.
   * Meant to be put in front of the archetype's own reason.
   */
  note: string
}

/**
 * @param requested what the person asked for, or null for an open goal
 * @param weeks the archetype's default horizon, used when there is no usable date
 */
export function horizonFor(today: string, requested: string | null, weeks: number): Horizon {
  const fallback = addDays(today, weeks * 7)

  // No date is not a wrong date. An open goal gets the default horizon and
  // nothing is being adjusted, because nothing was asked for.
  if (requested === null) return { targetDate: fallback, adjusted: false, note: '' }

  if (requested > today) return { targetDate: requested, adjusted: false, note: '' }

  return {
    targetDate: fallback,
    adjusted: true,
    note:
      `Dein Zieldatum lag am ${formatGermanDate(requested)} und damit in der Vergangenheit — ` +
      `die App rechnet ab heute neu.`,
  }
}

/** The archetype's own sentence, with the substitution in front of it if there was one. */
export function withNote(note: string, reason: string): string {
  return note === '' ? reason : `${note} ${reason}`
}
