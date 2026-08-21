// The health baseline.
//
// Runs under every goal, whatever it is: someone working on sleep still gets
// movement and nutrition, someone losing weight still gets sleep and recovery.
// That is the product idea — becoming generally healthier and reaching the one
// goal are not two separate products. See ADR-022.
//
// The baseline gives way where the goal track already works. It may never crowd
// out the goal track, which is why it suppresses its own domains rather than
// competing for the five slots a day.

import { STEP_TARGET } from './constants'
import { dateOf, type PlanContext } from './context'
import { WEEKDAYS, type BaselineTrack, type GoalTrack, type PlanDomain, type PlanInput, type PlannedItem, type Weekday } from '@/lib/domain/types'

/** How many goal-track actions in a domain count as "already covered". */
const SUPPRESSION_THRESHOLD = 2

export function planBaseline(ctx: PlanContext, goalTrack: GoalTrack): BaselineTrack {
  const { input } = ctx

  const goalDomainCounts = new Map<PlanDomain, number>()
  for (const item of goalTrack.items) {
    goalDomainCounts.set(item.domain, (goalDomainCounts.get(item.domain) ?? 0) + 1)
  }

  const suppressed: PlanDomain[] = []
  const covers = (domain: PlanDomain) => {
    const covered = (goalDomainCounts.get(domain) ?? 0) >= SUPPRESSION_THRESHOLD
    if (covered && !suppressed.includes(domain)) suppressed.push(domain)
    return covered
  }

  const items: PlannedItem[] = []

  // ------------------------------------------------------------ movement --
  if (!covers('movement') && !covers('training')) {
    const pattern = input.schedule.workPattern
    const sedentary = pattern === 'office' || pattern === 'remote'
    const days: Weekday[] = sedentary ? ['mon', 'wed', 'fri'] : [...WEEKDAYS]
    const steps =
      goalTrack.items.filter((i) => i.domain === 'training').length >= 3
        ? STEP_TARGET.low
        : STEP_TARGET.medium

    for (const day of days) {
      items.push({
        scheduledOn: dateOf(ctx, day),
        domain: 'movement',
        track: 'baseline',
        title: sedentary ? '2× 15 Min Gehpause' : `${steps} Schritte`,
        plannedDurationMin: sedentary ? 30 : null,
        timeSlot: null,
        rationale: {
          text: sedentary
            ? 'Du arbeitest überwiegend sitzend. Zwei kurze Blöcke sind leichter unterzubringen als ein langer Spaziergang — und sie laufen neben deinem Ziel mit, ohne es zu stören.'
            : `Grundbewegung neben deinem Ziel. ${steps} Schritte sind der Anker, der unabhängig vom Tagesablauf funktioniert.`,
          basedOn: ['schedule.workPattern'],
        },
        details: { baseline: true, steps: sedentary ? null : steps },
      })
    }
  }

  // ----------------------------------------------------------- nutrition --
  if (!covers('nutrition')) {
    const habit = additiveHabit(input)
    items.push({
      scheduledOn: dateOf(ctx, 'mon'),
      domain: 'nutrition',
      track: 'baseline',
      title: habit.title,
      plannedDurationMin: null,
      timeSlot: null,
      rationale: { text: habit.reason, basedOn: [habit.basedOn] },
      details: { baseline: true, additive: true, focus: habit.focus },
    })
  }

  // --------------------------------------------------------------- sleep --
  if (!covers('sleep')) {
    const { usualBedtime: bedtime, quality } = input.profile.sleep

    // Someone who already sleeps well only needs the reminder to keep it that
    // way. Someone who sleeps badly gets an observation instead — the baseline
    // does not try to fix a sleep problem while another goal is running, but it
    // does start collecting what a later sleep goal would need.
    const poor = quality === 'poor'
    items.push({
      scheduledOn: dateOf(ctx, poor ? 'wed' : 'sun'),
      domain: 'sleep',
      track: 'baseline',
      title: poor
        ? 'Eine Woche notieren, wann du wach wirst'
        : bedtime
          ? `Schlafenszeit ${bedtime} halten`
          : 'Feste Schlafenszeit finden',
      plannedDurationMin: poor ? 5 : null,
      timeSlot: 'evening',
      rationale: {
        text: poor
          ? `Du bewertest deinen Schlaf als schlecht${bedtime ? ` bei Schlafenszeit ${bedtime}` : ''}. ` +
            `Solange ein anderes Ziel läuft, ändert die App daran nichts — sie sammelt nur, was ` +
            `ein späteres Schlafziel bräuchte.`
          : bedtime
            ? `Regelmäßigkeit wirkt bei Schlaf stärker als Dauer. Deine ${bedtime} zu halten zahlt auf jedes andere Ziel ein.`
            : 'Noch keine feste Schlafenszeit angegeben. Eine zu haben zahlt auf jedes andere Ziel ein.',
        basedOn: ['profile.sleep.usualBedtime', 'profile.sleep.quality'],
      },
      details: { baseline: true, mode: poor ? 'observe' : 'maintain' },
    })
  }

  return { items, suppressedDomains: suppressed }
}


/**
 * The one thing worth adding to how this person already eats.
 *
 * Always additive — something put in, never something taken away. That is not a
 * stylistic choice: the safety rules forbid compensatory logic and anything
 * that could encourage disordered eating, and "eat less of X" as a standing
 * background instruction is exactly the shape those rules are guarding against.
 *
 * Ordered most specific first, and it stops at the first match: one habit at a
 * time is the rule everywhere else in this product, and a baseline that runs
 * beside a real goal has even less licence to ask for three things.
 *
 * This used to be a single sentence for everybody. Telling someone who eats out
 * five times a week to add vegetables to a meal they are not cooking is the
 * generic health-app advice the product exists to avoid — it is not wrong, it
 * is just not about them.
 */
function additiveHabit(input: PlanInput): {
  title: string
  reason: string
  basedOn: string
  focus: string
} {
  const n = input.profile.nutrition

  if (n.sugaryDrinksPerDay !== null && n.sugaryDrinksPerDay >= 2) {
    return {
      title: 'Zu jedem süßen Getränk ein Glas Wasser',
      reason:
        `Du trinkst etwa ${n.sugaryDrinksPerDay} süße Getränke am Tag. Das Glas Wasser ` +
        `kommt dazu, nichts wird gestrichen — meistens verschiebt sich das Verhältnis dann ` +
        `von allein.`,
      basedOn: 'profile.nutrition.sugaryDrinksPerDay',
      focus: 'water',
    }
  }

  if (n.eatsOutPerWeek !== null && n.eatsOutPerWeek >= 4) {
    return {
      title: 'Auswärts eine Beilage mitbestellen',
      reason:
        `Du isst ${n.eatsOutPerWeek}× die Woche auswärts. Da nützt dir kein Kochtipp — ` +
        `eine Beilage dazu ist das, was in dieser Situation tatsächlich geht.`,
      basedOn: 'profile.nutrition.eatsOutPerWeek',
      focus: 'side_dish',
    }
  }

  if (n.dietaryPattern === 'vegan' || n.dietaryPattern === 'vegetarian') {
    return {
      title: 'Zu jeder Hauptmahlzeit eine Eiweißquelle',
      reason:
        n.dietaryPattern === 'vegan'
          ? 'Pflanzlich essen und genug Eiweiß bekommen ist Planung, kein Zufall. Hülsenfrüchte, ' +
            'Tofu oder Seitan zu jeder Hauptmahlzeit — dazulegen, nicht weglassen.'
          : 'Vegetarisch wird das Eiweiß leicht zur Lücke. Eine Quelle zu jeder Hauptmahlzeit ' +
            'schließt sie, ohne dass du etwas streichen musst.',
      basedOn: 'profile.nutrition.dietaryPattern',
      focus: 'protein',
    }
  }

  if (n.cooksAtHome === 'never') {
    return {
      title: 'Einmal die Woche selbst kochen',
      reason:
        'Du kochst im Moment nicht. Einmal ist kein Umbau deines Alltags, aber es ist der ' +
        'Unterschied zwischen „kann ich nicht" und „mache ich manchmal".',
      basedOn: 'profile.nutrition.cooksAtHome',
      focus: 'cooking',
    }
  }

  const veg = n.vegetablePortionsPerDay
  return {
    title: 'Zu einer Mahlzeit täglich Gemüse dazu',
    reason:
      veg === null
        ? 'Gesundheitsbasis: eine additive Ernährungsgewohnheit, die neben jedem Ziel läuft.'
        : `Du kommst auf etwa ${veg} Portionen am Tag. Eine dazu — dazulegen, nicht weglassen.`,
    basedOn: 'profile.nutrition.vegetablePortionsPerDay',
    focus: 'vegetables',
  }
}
