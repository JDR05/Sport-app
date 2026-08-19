// The fallback.
//
// Reached when the goal matched no archetype. It must never feel like a
// failure: the user gets a real, usable plan built from the health baseline
// plus a small goal-shaped nudge, and the AI layer supplies the specifics that
// deterministic code cannot. Never an error, never a refusal.

import { DEFAULT_HORIZON_WEEKS } from '../constants'
import { addDays, formatGermanDate } from '../dates'
import { dateOf, type PlanContext } from '../context'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type { GoalTrack, PlannedItem } from '@/lib/domain/types'

export const generalHealth: ArchetypeStrategy = {
  archetype: 'general_health',
  label: 'Allgemeine Gesundheit',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const targetDate =
      ctx.input.goal.targetDate ?? addDays(ctx.input.today, DEFAULT_HORIZON_WEEKS * 7)
    return {
      adjusted: false,
      targetDate,
      reason:
        `Dein Ziel lässt sich noch nicht eindeutig einordnen. Bis zum ${formatGermanDate(targetDate)} ` +
        `startest du mit der Gesundheitsbasis — und sobald klarer wird, worauf es hinausläuft, ` +
        `wird der Plan spezifischer.`,
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const raw = ctx.input.goal.rawText.trim()
    ctx.rationale.push({ text: this.clampGoal(ctx).reason, basedOn: ['goal.rawText'] })

    const items: PlannedItem[] = [
      {
        scheduledOn: dateOf(ctx, 'sun'),
        domain: 'priority',
        track: 'goal',
        title: 'Ziel schärfen',
        plannedDurationMin: 10,
        timeSlot: 'evening',
        rationale: {
          text:
            raw.length > 0
              ? `Du hast „${raw}" eingegeben. Zehn Minuten überlegen, woran du merken würdest, ` +
                `dass es klappt — daraus wird eine messbare Zielgröße.`
              : 'Noch kein Ziel formuliert. Zehn Minuten überlegen, was sich konkret ändern soll.',
          basedOn: ['goal.rawText'],
        },
        details: { kind: 'refine_goal', rawGoal: raw },
      },
    ]

    return {
      archetype: 'general_health',
      headline: 'Gesundheitsbasis · Ziel wird geschärft',
      summary: ['Basis aus Bewegung, Ernährung und Schlaf', 'Ziel wird diese Woche konkretisiert'],
      items,
      signature: {
        mode: 'baseline_only',
        hasRawGoal: raw.length > 0 ? 'yes' : 'no',
      },
    }
  },

  assertInvariants(): void {
    // The fallback carries no goal-specific limits of its own — the shared
    // invariants and the health baseline's own limits cover it entirely.
  },
}
