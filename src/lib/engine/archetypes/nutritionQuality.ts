// Eating better, without a weight target.
//
// The defining rule is that every recommendation is additive. Nothing is
// forbidden, nothing is eliminated, and there are no calorie targets — those
// belong to body composition. Framing food as forbidden is the mechanism behind
// most disordered eating, and this archetype must not reach for it.

import { DEFAULT_HORIZON_WEEKS, MAX_NUTRITION_ADDITIONS_PER_WEEK } from '../constants'
import { addDays, formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import { dateOf, pickDays, type PlanContext } from '../context'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type { GoalTrack, PlannedItem, PlanResult } from '@/lib/domain/types'

type Addition = {
  key: string
  title: string
  reason: (ctx: PlanContext) => string
  basedOn: string[]
  applies: (ctx: PlanContext) => boolean
  /** The number this addition puts in front of the user, when it has one. */
  scale?: (ctx: PlanContext) => string
  /**
   * How much this addition is worth to this particular person. Ranking by
   * relevance rather than by list order is what stops two people with the same
   * cooking habit from receiving the same two suggestions regardless of
   * everything else about them.
   */
  weight: (ctx: PlanContext) => number
}

/**
 * Ordered by leverage. At most three are used in a week — more additions at once
 * is the same mistake as more habits at once.
 */
const ADDITIONS: Addition[] = [
  {
    key: 'vegetables',
    scale: (ctx) => String(ctx.input.profile.nutrition.vegetablePortionsPerDay ?? 'n'),
    weight: (ctx) => 3 * (3 - Math.min(3, ctx.input.profile.nutrition.vegetablePortionsPerDay ?? 0)),
    title: 'Zu jedem Abendessen eine Portion Gemüse dazu',
    applies: (ctx) => (ctx.input.profile.nutrition.vegetablePortionsPerDay ?? 0) < 3,
    reason: (ctx) => {
      const now = ctx.input.profile.nutrition.vegetablePortionsPerDay
      return now === null
        ? 'Dazulegen statt weglassen — die einfachste Veränderung, die sich sofort umsetzen lässt.'
        : `Du kommst aktuell auf etwa ${now} Portionen am Tag. Eine dazu, ohne etwas wegzunehmen.`
    },
    basedOn: ['profile.nutrition.vegetablePortionsPerDay'],
  },
  {
    key: 'drinks',
    scale: (ctx) => String(ctx.input.profile.nutrition.sugaryDrinksPerDay ?? 'n'),
    weight: (ctx) => 2 * (ctx.input.profile.nutrition.sugaryDrinksPerDay ?? 0),
    title: 'Ein Glas Wasser vor jeder Mahlzeit',
    applies: (ctx) => (ctx.input.profile.nutrition.sugaryDrinksPerDay ?? 0) >= 1,
    reason: (ctx) =>
      `Du trinkst etwa ${ctx.input.profile.nutrition.sugaryDrinksPerDay} gesüßte Getränke am Tag. ` +
      `Das Wasser kommt dazu — was du sonst trinkst, bleibt deine Entscheidung.`,
    basedOn: ['profile.nutrition.sugaryDrinksPerDay'],
  },
  {
    // Vegan and vegetarian get separate entries because the advice genuinely
    // differs — B12 and iron are a vegan concern, protein completeness a
    // vegetarian one. Collapsing them would hand two different people the same
    // sentence.
    key: 'vegan_coverage',
    weight: () => 9,
    title: 'B12, Eisen und Eiweiß bewusst abdecken',
    applies: (ctx) => ctx.input.profile.nutrition.dietaryPattern === 'vegan',
    reason: () =>
      'Bei veganer Ernährung sind B12 und Eisen die beiden Punkte, die man aktiv abdecken muss — ' +
      'alles andere ergibt sich. Hülsenfrüchte, Tofu und Nüsse über den Tag verteilt erledigen den Rest.',
    basedOn: ['profile.nutrition.dietaryPattern'],
  },
  {
    key: 'vegetarian_protein',
    weight: () => 6,
    title: 'Eine bewusste Eiweißquelle pro Hauptmahlzeit',
    applies: (ctx) => ctx.input.profile.nutrition.dietaryPattern === 'vegetarian',
    reason: () =>
      'Vegetarisch heißt nicht automatisch eiweißarm, aber es passiert leicht. ' +
      'Eine bewusste Quelle pro Hauptmahlzeit reicht völlig.',
    basedOn: ['profile.nutrition.dietaryPattern'],
  },
  {
    key: 'fuel_training',
    scale: (ctx) => String(ctx.input.profile.sport.sessionsPerWeekTarget ?? 'n'),
    weight: (ctx) => 1.5 * (ctx.input.profile.sport.sessionsPerWeekTarget ?? 0),
    title: 'Rund ums Training essen',
    applies: (ctx) => (ctx.input.profile.sport.sessionsPerWeekTarget ?? 0) >= 3,
    reason: (ctx) =>
      `Du trainierst ${ctx.input.profile.sport.sessionsPerWeekTarget}× pro Woche. ` +
      `Eine Kleinigkeit davor und etwas Eiweiß danach macht mehr Unterschied als alles andere auf dieser Liste.`,
    basedOn: ['profile.sport.sessionsPerWeekTarget'],
  },
  {
    key: 'eating_out_prep',
    scale: (ctx) => String(ctx.input.profile.nutrition.eatsOutPerWeek ?? 'n'),
    weight: (ctx) => 1.5 * (ctx.input.profile.nutrition.eatsOutPerWeek ?? 0),
    title: 'Vor dem Auswärtsessen kurz entscheiden',
    applies: (ctx) => (ctx.input.profile.nutrition.eatsOutPerWeek ?? 0) >= 3,
    reason: (ctx) =>
      `Du isst ${ctx.input.profile.nutrition.eatsOutPerWeek}× pro Woche auswärts. ` +
      `Vorher zu entscheiden ist wirksamer als am Tisch zu widerstehen — und verbietet dir nichts.`,
    basedOn: ['profile.nutrition.eatsOutPerWeek'],
  },
  {
    key: 'protein_breakfast',
    scale: (ctx) => String(ctx.input.profile.nutrition.mealsPerDay ?? 'n'),
    weight: (ctx) => (ctx.input.profile.nutrition.mealsPerDay ?? 3),
    title: 'Eiweißquelle zum Frühstück ergänzen',
    applies: (ctx) => (ctx.input.profile.nutrition.mealsPerDay ?? 3) >= 3,
    reason: (ctx) =>
      `Bei ${ctx.input.profile.nutrition.mealsPerDay} Mahlzeiten am Tag trägt das Frühstück viel — ` +
      `Eiweiß am Morgen hält bis mittags satt.`,
    basedOn: ['profile.nutrition.mealsPerDay'],
  },
  {
    key: 'cooking',
    weight: (ctx) => (ctx.input.profile.nutrition.cooksAtHome === 'never' ? 7 : 4),
    title: 'Einmal mehr selbst kochen als sonst',
    applies: (ctx) => ctx.input.profile.nutrition.cooksAtHome !== 'often',
    reason: (ctx) =>
      ctx.input.profile.nutrition.cooksAtHome === 'never'
        ? 'Du kochst nicht — ein einziges Mal pro Woche ist ein realistischer Anfang, kein Umsturz.'
        : 'Du kochst gelegentlich. Einmal mehr als sonst, mehr nicht.',
    basedOn: ['profile.nutrition.cooksAtHome'],
  },
  {
    key: 'water',
    weight: () => 0.5,
    title: 'Eine Flasche Wasser sichtbar hinstellen',
    applies: () => true,
    reason: () =>
      'Die kleinste mögliche Veränderung — sie steht hier, weil bei dir keine der größeren nötig ist.',
    basedOn: ['profile.nutrition.sugaryDrinksPerDay'],
  },
]

export const nutritionQuality: ArchetypeStrategy = {
  archetype: 'nutrition_quality',
  label: 'Ernährungsqualität',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const targetDate =
      ctx.input.goal.targetDate ?? addDays(ctx.input.today, DEFAULT_HORIZON_WEEKS * 7)
    return {
      adjusted: false,
      targetDate,
      reason:
        `Bis zum ${formatGermanDate(targetDate)} — und zwar durch Dazulegen, nicht durch Weglassen. ` +
        `Die App verbietet dir kein Lebensmittel und setzt dir kein Kalorienziel.`,
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    // Ranked by relevance to this person, then capped — not the other way round.
    const applicable = ADDITIONS.filter((a) => a.applies(ctx)).sort(
      (a, b) => b.weight(ctx) - a.weight(ctx) || a.key.localeCompare(b.key),
    )

    // How much someone can take on at once depends on how much they already
    // cook: starting from nothing, one change is plenty.
    const cooks = ctx.input.profile.nutrition.cooksAtHome
    const capacity = cooks === 'often' ? MAX_NUTRITION_ADDITIONS_PER_WEEK : cooks === 'never' ? 1 : 2
    const chosen = applicable.slice(0, capacity)
    const used = chosen.length > 0 ? chosen : [ADDITIONS[0]]

    // Placed on days this person is actually free, not on fixed weekdays.
    const days = pickDays(ctx, used.length)

    ctx.rationale.push({ text: this.clampGoal(ctx).reason, basedOn: ['goal.targetDate'] })

    const items: PlannedItem[] = used.map((addition, index) => ({
      scheduledOn: dateOf(ctx, days[index % days.length]),
      domain: 'nutrition' as const,
      track: 'goal' as const,
      title: addition.title,
      plannedDurationMin: null,
      timeSlot: null,
      rationale: { text: addition.reason(ctx), basedOn: addition.basedOn },
      details: { additive: true, key: addition.key },
    }))

    return {
      archetype: 'nutrition_quality',
      headline: `${used.length} ${used.length === 1 ? 'Ergänzung' : 'Ergänzungen'} diese Woche`,
      summary: used.map((a) => a.title),
      items,
      signature: {
        additionCount: String(used.length),
        additions: used.map((a) => a.key).sort().join('+'),
        primary: used[0]?.key ?? 'none',
        dayPattern: days.join('-'),
        capacity: String(capacity),
        primaryScale: used[0]?.scale?.(ctx) ?? 'none',
        fuelScale: used.some((a) => a.key === 'fuel_training')
          ? String(ctx.input.profile.sport.sessionsPerWeekTarget ?? 0)
          : 'none',
      },
    }
  },

  assertInvariants(plan: PlanResult): void {
    const items = plan.strategy.goalTrack.items

    if (items.length > MAX_NUTRITION_ADDITIONS_PER_WEEK) {
      throw new PlanInvariantError(
        `nutrition_quality: ${items.length} additions exceeds the cap of ${MAX_NUTRITION_ADDITIONS_PER_WEEK}`,
      )
    }

    for (const item of items) {
      if (item.details.additive !== true) {
        throw new PlanInvariantError(
          `nutrition_quality: "${item.title}" is not marked additive — this archetype must never remove foods`,
        )
      }
      if (/verzicht|verbot|weglassen|streichen|keine .*mehr/i.test(item.title)) {
        throw new PlanInvariantError(
          `nutrition_quality: "${item.title}" is phrased as a restriction`,
        )
      }
      if ('targetIntakeKcal' in item.details) {
        throw new PlanInvariantError(
          `nutrition_quality: "${item.title}" carries a calorie target, which belongs to body_composition`,
        )
      }
    }
  },
}
