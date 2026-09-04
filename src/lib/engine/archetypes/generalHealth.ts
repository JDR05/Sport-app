// The fallback.
//
// Reached when the goal matched no archetype — "ich will mich einfach besser
// fühlen". It must never feel like a failure: the person gets a real, usable
// plan built from the health baseline plus a goal-shaped nudge, and the AI
// layer supplies the specifics deterministic code cannot.
//
// It is also the archetype most likely to be somebody's first impression,
// because the undecided land here. Measured over 7000 generated people it was
// by far the least personal of the seven — 0.26 mean signature distance against
// this project's own 0.45 threshold, with 7.6 % of pairs producing *identical*
// plans. Two things caused that, and both were the same mistake in different
// clothes: a fixed order that decided for the majority, and a plan shape that
// did not read the person's week at all.

import { DEFAULT_HORIZON_WEEKS } from '../constants'
import { formatGermanDate } from '../dates'
import { dateOf, pickDays, slotOf, type PlanContext } from '../context'
import { horizonFor, withNote } from '../horizon'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type {
  GoalTrack, PlanDomain, PlanInput, PlannedItem, TimeSlot, Weekday,
} from '@/lib/domain/types'

export const generalHealth: ArchetypeStrategy = {
  archetype: 'general_health',
  label: 'Allgemeine Gesundheit',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const { targetDate, adjusted, note } = horizonFor(
      ctx.input.today, ctx.input.goal.targetDate, DEFAULT_HORIZON_WEEKS,
    )
    return {
      adjusted,
      targetDate,
      reason: withNote(
        note,
        `Dein Ziel lässt sich noch nicht eindeutig einordnen. Bis zum ${formatGermanDate(targetDate)} ` +
          `startest du mit der Gesundheitsbasis — und sobald klarer wird, worauf es hinausläuft, ` +
          `wird der Plan spezifischer.`,
      ),
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const raw = ctx.input.goal.rawText.trim()
    ctx.rationale.push({ text: this.clampGoal(ctx).reason, basedOn: ['goal.rawText'] })

    const { point: focus, confidence } = startingPoint(ctx.input)

    // Placed where this person actually has time, and repeated as often as the
    // thing is worth repeating.
    //
    // The old version put two items on two hard-coded weekdays at two
    // hard-coded times, for everybody. Every other archetype asks the week
    // where something fits; this one now does too, which is both more personal
    // and more likely to actually happen.
    const focusDays = pickDays(ctx, focus.repeats, focus.minutes ?? 0)

    // Sharpening the goal goes on the last day the week still has: it is worth
    // more once the week has produced something to sharpen it with.
    const refineDay = lastDay(ctx)

    const items: PlannedItem[] = [
      ...focusDays.map((day) => ({
        scheduledOn: dateOf(ctx, day),
        domain: focus.domain,
        track: 'goal' as const,
        title: focus.title,
        plannedDurationMin: fitMinutes(ctx, day, focus.minutes),
        // This person's own slot on that day, falling back to the one the
        // starting point prefers — an evening habit is still an evening habit
        // for somebody who recorded no free time.
        timeSlot: slotOf(ctx.input, day, focus.slot) ?? focus.slot,
        rationale: {
          // How sure the app is, said out loud.
          //
          // A weak signal and a screaming one produced the same confident
          // sentence before. That is the app pretending to know something, and
          // it is the sentence somebody remembers when the suggestion turns out
          // not to fit. Saying "das ist der deutlichste Hinweis" only when it
          // is one costs nothing and is the difference between a suggestion and
          // an assertion.
          text:
            confidence === 'clear'
              ? focus.reason
              : `${focus.reason} Der Hinweis darauf ist in deinen Angaben allerdings nicht ` +
                `sehr deutlich — wenn es sich falsch anfühlt, sag es, dann sucht die App weiter.`,
          basedOn: [focus.basedOn],
        },
        details: { kind: 'starting_point', focus: focus.key, confidence },
      })),
      {
        scheduledOn: dateOf(ctx, refineDay),
        domain: 'priority' as const,
        track: 'goal' as const,
        title: 'Ziel schärfen',
        plannedDurationMin: 10,
        timeSlot: 'evening' as const,
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
        focusDays.length > 1 ? `${focus.summary}, ${focusDays.length}× diese Woche` : focus.summary,
        'Basis aus Bewegung, Ernährung und Schlaf',
        'Ziel wird diese Woche konkretisiert',
      ],
      items,
      signature: {
        // Three genuinely different weeks — a clear signal to act on, a faint
        // one worth trying, and nothing to go on yet — and the app says which
        // it is rather than sounding equally sure in all three. The old value
        // here was the constant 'starting_point', which described nobody and
        // still counted as a share of every comparison.
        mode: confidence,
        startingPoint: focus.key,
        // All three now follow the person's week rather than the source code,
        // which is the point of the change above.
        focusDays: focusDays.join('-'),
        focusTimes: String(focusDays.length),
        focusLength: bucketMinutes(fitMinutes(ctx, focusDays[0], focus.minutes)),
      },
    }
  },

  assertInvariants(): void {
    // The fallback carries no goal-specific limits of its own — the shared
    // invariants and the health baseline's own limits cover it entirely.
  },
}

/** The last day this week still has. Never a day that has gone. */
function lastDay(ctx: PlanContext): Weekday {
  return ctx.weekDays[ctx.weekDays.length - 1] ?? 'sun'
}

/** The wanted length, or what the day can actually hold. Null stays null. */
function fitMinutes(ctx: PlanContext, day: Weekday, wanted: number | null): number | null {
  if (wanted === null) return null
  const room = ctx.roomPerDay[day] ?? 0
  return room > 0 ? Math.min(wanted, room) : wanted
}

function bucketMinutes(minutes: number | null): string {
  if (minutes === null) return 'none'
  return minutes <= 15 ? 'short' : 'long'
}

type StartingPoint = {
  key: string
  domain: PlanDomain
  /** A preference, not a placement — the week decides the day. */
  slot: TimeSlot | null
  minutes: number | null
  /**
   * How often this is worth doing in a week, at most.
   *
   * Not decoration. "20 Minuten am Stück gehen" once is close to pointless — it
   * is a thing that only becomes anything by repeating — while "eine Woche
   * mitzählen, was du trinkst" is by definition done once, and counting it
   * three times would be nonsense. The old version planned exactly two items
   * for everybody regardless, which is part of why two different people came
   * out with the same week. What actually fits is still the week's decision.
   */
  repeats: number
  title: string
  headline: string
  summary: string
  reason: string
  basedOn: string
}

/**
 * The one thing worth starting with, for this person.
 *
 * This used to be a ranked chain of ifs that stopped at the first match. That
 * is a lookup table wearing a conditional, and it failed the way lookup tables
 * fail: **57 % of generated people got "Schlaf"**, because the first condition
 * — sleeping badly — is the one most people meet. Five branches shared what was
 * left, and the fallback became the least personal archetype in the app.
 *
 * So the order no longer decides. Each signal is scored from *this person's own
 * numbers* and the strongest wins: somebody drinking six sugary drinks a day
 * and sleeping merely "ok" is a drinks case, not a sleep case, and the previous
 * version could not say so at any strength of evidence.
 *
 * The old order survives as the tie-break, because the judgement in it is
 * sound — sleep first because everything else is harder without it, then
 * movement as the cheapest real change, then the two eating signals somebody
 * can act on today, screen time last because it is the one most people name
 * first and the one that moves least on its own. It settles a draw now instead
 * of deciding the answer.
 *
 * One change at a time still holds: only the strongest signal becomes an
 * action. Somebody whose goal is still vague is the last person who should be
 * handed four of them.
 */
type Confidence = 'clear' | 'tentative' | 'observe'

function startingPoint(input: PlanInput): { point: StartingPoint; confidence: Confidence } {
  const { sleep, nutrition, mind, sport } = input.profile

  const candidates: Array<{ score: number; point: StartingPoint }> = []
  const consider = (score: number, point: StartingPoint) => {
    if (score > 0) candidates.push({ score, point })
  }

  // Scores answer "how loudly does this person's own answer say this", on one
  // shared scale so they can be compared: a 5 means the input was extreme, a 1
  // means it barely cleared the threshold.
  consider(
    (sleep.quality === 'poor' ? 3 : sleep.quality === 'ok' ? 1 : 0) +
      (sleep.wakesAtNight === true ? 2 : 0),
    {
      key: 'sleep',
      domain: 'sleep',
      slot: 'evening',
      minutes: null,
      repeats: 1,
      title: 'Eine Woche gleiche Aufstehzeit',
      headline: 'Schlaf zuerst',
      summary: 'Startpunkt: eine feste Aufstehzeit',
      reason:
        'Du schläfst im Moment schlecht. Eine feste Aufstehzeit ist der einzige Hebel, der ' +
        'ohne Umstellung des restlichen Tages wirkt — und sie macht alles andere leichter, ' +
        'was du dir später vornimmst.',
      basedOn: 'profile.sleep.quality',
    },
  )

  consider(
    (sport.sessionsPerWeekTarget === 0 ? 3 : 0) + (sport.experience === 'beginner' ? 2 : 0),
    {
      key: 'movement',
      domain: 'movement',
      slot: 'midday',
      minutes: 20,
      repeats: 3,
      title: '20 Minuten am Stück gehen',
      headline: 'Bewegung zuerst',
      summary: 'Startpunkt: ein Spaziergang, der zählt',
      reason:
        'Du fängst gerade an. Zwanzig Minuten am Stück sind niedrig genug, dass sie an einem ' +
        'schlechten Tag noch stattfinden — und das ist der einzige Maßstab, der in Woche eins ' +
        'zählt.',
      basedOn: 'profile.sport.experience',
    },
  )

  const drinks = nutrition.sugaryDrinksPerDay
  consider(drinks !== null && drinks >= 2 ? Math.min(5, drinks) : 0, {
    key: 'drinks',
    domain: 'nutrition',
    slot: null,
    minutes: null,
    repeats: 1,
    title: 'Eine Woche mitzählen, was du trinkst',
    headline: 'Getränke zuerst',
    summary: 'Startpunkt: sehen, was zusammenkommt',
    reason:
      `Etwa ${drinks} süße Getränke am Tag sind die größte einzelne Stellschraube in deinen ` +
      `Angaben. Diese Woche nur mitzählen — nichts weglassen, erst sehen.`,
    basedOn: 'profile.nutrition.sugaryDrinksPerDay',
  })

  const out = nutrition.eatsOutPerWeek
  consider(out !== null && out >= 4 ? Math.min(5, out - 1) : 0, {
    key: 'eating_out',
    domain: 'nutrition',
    slot: 'midday',
    minutes: 30,
    repeats: 1,
    title: 'Eine Mahlzeit für die Woche vorbereiten',
    headline: 'Eine Mahlzeit zuerst',
    summary: 'Startpunkt: eine Mahlzeit selbst in der Hand',
    reason:
      `Du isst ${out}× die Woche auswärts. Eine einzige vorbereitete Mahlzeit ändert die ` +
      `Bilanz kaum — sie ändert, dass es überhaupt eine Alternative gibt.`,
    basedOn: 'profile.nutrition.eatsOutPerWeek',
  })

  const screen = mind.screenTimeHoursPerDay
  consider(screen !== null && screen >= 5 ? Math.min(5, screen - 3) : 0, {
    key: 'screen',
    domain: 'self_improvement',
    slot: 'evening',
    minutes: 15,
    repeats: 3,
    title: 'Eine Stunde am Abend ohne Bildschirm',
    headline: 'Abende zuerst',
    summary: 'Startpunkt: eine bildschirmfreie Stunde',
    reason:
      `Rund ${screen} Stunden am Tag am Bildschirm. Eine Stunde am Abend ist kein Verzicht, ` +
      `sondern der einzige Zeitblock, in dem später überhaupt etwas anderes Platz hätte.`,
    basedOn: 'profile.mind.screenTimeHoursPerDay',
  })

  // Highest score wins; a draw falls back to the order above, which is where
  // the product judgement about what matters most now lives.
  const best = candidates.reduce<{ score: number; point: StartingPoint } | null>(
    (top, c) => (top === null || c.score > top.score ? c : top),
    null,
  )
  // Three is where an answer stops being "just over the line": poor sleep, no
  // sessions at all, three sugary drinks a day. Below it the app has a hunch
  // rather than a finding, and it now says so.
  if (best) return { point: best.point, confidence: best.score >= 3 ? 'clear' : 'tentative' }

  return { confidence: 'observe', point: {
    key: 'observe',
    domain: 'priority',
    slot: 'evening',
    minutes: 10,
    repeats: 1,
    title: 'Eine Woche notieren, was dir Energie nimmt',
    headline: 'Erst beobachten',
    summary: 'Startpunkt: eine Woche beobachten',
    reason:
      'In deinen Angaben sticht nichts hervor, und das ist ein gutes Zeichen. Eine Woche ' +
      'beobachten liefert die Daten, aus denen ein konkretes Ziel wird — geraten wäre hier ' +
      'schlechter als abwarten.',
    basedOn: 'profile',
  } }
}
