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
import { WEEKDAYS, type BaselineTrack, type GoalTrack, type PlanDomain, type PlannedItem, type Weekday } from '@/lib/domain/types'

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
    const veg = input.profile.nutrition.vegetablePortionsPerDay
    items.push({
      scheduledOn: dateOf(ctx, 'mon'),
      domain: 'nutrition',
      track: 'baseline',
      title: 'Zu einer Mahlzeit täglich Gemüse dazu',
      plannedDurationMin: null,
      timeSlot: null,
      rationale: {
        text:
          veg === null
            ? 'Gesundheitsbasis: eine additive Ernährungsgewohnheit, die neben jedem Ziel läuft.'
            : `Du kommst auf etwa ${veg} Portionen am Tag. Eine dazu — dazulegen, nicht weglassen.`,
        basedOn: ['profile.nutrition.vegetablePortionsPerDay'],
      },
      details: { baseline: true, additive: true },
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
