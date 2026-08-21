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
import type { GoalTrack, PlanDomain, PlanInput, PlannedItem } from '@/lib/domain/types'

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

    const focus = startingPoint(ctx.input)

    const items: PlannedItem[] = [
      {
        scheduledOn: dateOf(ctx, focus.weekday),
        domain: focus.domain,
        track: 'goal',
        title: focus.title,
        plannedDurationMin: focus.minutes,
        timeSlot: focus.slot,
        rationale: { text: focus.reason, basedOn: [focus.basedOn] },
        details: { kind: 'starting_point', focus: focus.key },
      },
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
      headline: `${focus.headline} · Ziel wird geschärft`,
      summary: [
        focus.summary,
        'Basis aus Bewegung, Ernährung und Schlaf',
        'Ziel wird diese Woche konkretisiert',
      ],
      items,
      signature: {
        mode: 'starting_point',
        startingPoint: focus.key,
        hasRawGoal: raw.length > 0 ? 'yes' : 'no',
      },
    }
  },

  assertInvariants(): void {
    // The fallback carries no goal-specific limits of its own — the shared
    // invariants and the health baseline's own limits cover it entirely.
  },
}

type StartingPoint = {
  key: string
  domain: PlanDomain
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  slot: 'early' | 'midday' | 'evening' | null
  minutes: number | null
  title: string
  headline: string
  summary: string
  reason: string
  basedOn: string
}

/**
 * The one thing worth starting with, for this person.
 *
 * The fallback used to hand everybody the same single action — "Ziel schärfen"
 * — which meant two people with nothing in common received identical plans.
 * That is the exact failure this product is built to avoid, and it was hiding
 * in the one archetype the personalisation gate did not measure.
 *
 * So: read the profile and name the clearest thing. Ranked, and it stops at the
 * first hit, because one change at a time holds here too — someone whose goal
 * is still vague is the last person who should be handed four of them.
 *
 * Order is not arbitrary. Sleep first because everything else is harder without
 * it and the check-in data keeps showing it as the factor other patterns depend
 * on. Then movement, which is the cheapest real change. Then the two eating
 * signals someone can act on today. Screen time last: it is the one most people
 * name first and the one that moves least on its own.
 */
function startingPoint(input: PlanInput): StartingPoint {
  const { sleep, nutrition, mind, sport } = input.profile

  if (sleep.quality === 'poor' || sleep.wakesAtNight === true) {
    return {
      key: 'sleep',
      domain: 'sleep',
      weekday: 'mon',
      slot: 'evening',
      minutes: null,
      title: 'Eine Woche gleiche Aufstehzeit',
      headline: 'Schlaf zuerst',
      summary: 'Startpunkt: eine feste Aufstehzeit',
      reason:
        'Du schläfst im Moment schlecht. Eine feste Aufstehzeit ist der einzige Hebel, der ' +
        'ohne Umstellung des restlichen Tages wirkt — und sie macht alles andere leichter, ' +
        'was du dir später vornimmst.',
      basedOn: 'profile.sleep.quality',
    }
  }

  if (sport.sessionsPerWeekTarget === 0 || sport.experience === 'beginner') {
    return {
      key: 'movement',
      domain: 'movement',
      weekday: 'wed',
      slot: 'midday',
      minutes: 20,
      title: '20 Minuten am Stück gehen',
      headline: 'Bewegung zuerst',
      summary: 'Startpunkt: ein Spaziergang, der zählt',
      reason:
        'Du fängst gerade an. Zwanzig Minuten am Stück sind niedrig genug, dass sie an einem ' +
        'schlechten Tag noch stattfinden — und das ist der einzige Maßstab, der in Woche eins ' +
        'zählt.',
      basedOn: 'profile.sport.experience',
    }
  }

  if (nutrition.sugaryDrinksPerDay !== null && nutrition.sugaryDrinksPerDay >= 2) {
    return {
      key: 'drinks',
      domain: 'nutrition',
      weekday: 'mon',
      slot: null,
      minutes: null,
      title: 'Eine Woche mitzählen, was du trinkst',
      headline: 'Getränke zuerst',
      summary: 'Startpunkt: sehen, was zusammenkommt',
      reason:
        `Etwa ${nutrition.sugaryDrinksPerDay} süße Getränke am Tag sind die größte einzelne ` +
        `Stellschraube in deinen Angaben. Diese Woche nur mitzählen — nichts weglassen, erst ` +
        `sehen.`,
      basedOn: 'profile.nutrition.sugaryDrinksPerDay',
    }
  }

  if (nutrition.eatsOutPerWeek !== null && nutrition.eatsOutPerWeek >= 4) {
    return {
      key: 'eating_out',
      domain: 'nutrition',
      weekday: 'sun',
      slot: 'midday',
      minutes: 30,
      title: 'Eine Mahlzeit für die Woche vorbereiten',
      headline: 'Eine Mahlzeit zuerst',
      summary: 'Startpunkt: eine Mahlzeit selbst in der Hand',
      reason:
        `Du isst ${nutrition.eatsOutPerWeek}× die Woche auswärts. Eine einzige vorbereitete ` +
        `Mahlzeit ändert die Bilanz kaum — sie ändert, dass es überhaupt eine Alternative gibt.`,
      basedOn: 'profile.nutrition.eatsOutPerWeek',
    }
  }

  if (mind.screenTimeHoursPerDay !== null && mind.screenTimeHoursPerDay >= 5) {
    return {
      key: 'screen',
      domain: 'self_improvement',
      weekday: 'tue',
      slot: 'evening',
      minutes: 15,
      title: 'Eine Stunde am Abend ohne Bildschirm',
      headline: 'Abende zuerst',
      summary: 'Startpunkt: eine bildschirmfreie Stunde',
      reason:
        `Rund ${mind.screenTimeHoursPerDay} Stunden am Tag am Bildschirm. Eine Stunde am Abend ` +
        `ist kein Verzicht, sondern der einzige Zeitblock, in dem später überhaupt etwas ` +
        `anderes Platz hätte.`,
      basedOn: 'profile.mind.screenTimeHoursPerDay',
    }
  }

  return {
    key: 'observe',
    domain: 'priority',
    weekday: 'wed',
    slot: 'evening',
    minutes: 10,
    title: 'Eine Woche notieren, was dir Energie nimmt',
    headline: 'Erst beobachten',
    summary: 'Startpunkt: eine Woche beobachten',
    reason:
      'In deinen Angaben sticht nichts hervor, und das ist ein gutes Zeichen. Eine Woche ' +
      'beobachten liefert die Daten, aus denen ein konkretes Ziel wird — geraten wäre hier ' +
      'schlechter als abwarten.',
    basedOn: 'profile',
  }
}
