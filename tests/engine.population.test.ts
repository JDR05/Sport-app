// The engine, against a generated population rather than ten chosen people.
//
// The suite had ten fixture profiles and two gates over them. That proves the
// engine personalises *between those ten*; it says nothing about the population
// an app meets. A limit that holds for ten profiles and breaks for one shape in
// a thousand is the bug that ships — and the shapes that break it are never the
// ones somebody thought to write by hand.
//
// `scripts/simulate-population.ts` runs this over thousands and is where the
// findings below came from. This file is the regression: a smaller, fixed
// population, fast enough for every commit, holding the four things that were
// actually wrong.
//
// What it found, measured over 7000 generated people before the fixes:
//
//   | before | after | failure                                              |
//   | -----: | ----: | ---------------------------------------------------- |
//   | 37.1 % |   0 % | an action dated before the day the plan was built on  |
//   |  4.4 % |   0 % | no plan at all — the engine rejecting its own output  |
//   |  4.0 % | 0.1 % | more cards on one day than the brief allows          |
//
// Every one of them is invisible to a suite of ten.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { materialise } from '@/lib/db/item-mapping'
import { MAX_ITEMS_PER_DAY } from '@/lib/engine/constants'
import { startOfWeek, addDays } from '@/lib/engine/dates'
import { ARCHETYPES, makePerson, TODAY } from '../scripts/population'
import type { PlanResult } from '@/lib/domain/types'

/**
 * Seven hundred, and four different days to plan from.
 *
 * The day matters as much as the person: the engine plans only the days a week
 * still has, and this project's two worst bugs both lived in that difference.
 * A population planned only from Mondays would have found neither.
 */
const SIZE = 700
const DAYS = [TODAY, addDays(TODAY, 2), addDays(TODAY, 4), addDays(TODAY, 6)]

type Case = { seed: number; today: string; input: ReturnType<typeof makePerson>; plan: PlanResult }

const population: Case[] = []
const crashes: Array<{ seed: number; archetype: string; today: string; error: string }> = []

for (let i = 0; i < SIZE; i++) {
  const archetype = ARCHETYPES[i % ARCHETYPES.length]
  const today = DAYS[Math.floor(i / ARCHETYPES.length) % DAYS.length]
  const input = makePerson(i, archetype, today)
  try {
    population.push({ seed: i, today, input, plan: generatePlan(input) })
  } catch (error) {
    crashes.push({ seed: i, archetype, today, error: String(error).slice(0, 160) })
  }
}

/** Names the seeds that failed, so a red test points at a person. */
const report = (bad: Array<{ seed: number; detail: string }>) =>
  bad.slice(0, 5).map((b) => `seed ${b.seed}: ${b.detail}`).join('\n')

describe('everybody gets a plan', () => {
  it('never refuses to build one', () => {
    // 4.4 % of generated people used to get "Plan nicht möglich" — the engine
    // building a week and then rejecting it. Three separate causes: a growth
    // rate computed from a starting volume of zero (infinite, then an invalid
    // date), a sleep window invented by pairing somebody's real wake-up with a
    // default bedtime, and three archetypes independently writing
    // `max(FLOOR, min(wanted, cap))` — which applies a hard cap and then
    // raises the result back above it.
    expect(
      crashes.map((c) => `seed ${c.seed} (${c.archetype}, ${c.today}): ${c.error}`).slice(0, 5),
    ).toEqual([])
  })

  it('gives every plan something to do', () => {
    const empty = population.filter((c) => c.plan.items.length === 0)
    expect(empty.map((c) => ({ seed: c.seed, detail: 'no items' }))).toEqual([])
  })
})

describe('nothing is planned into the past', () => {
  it('dates no action before the day the plan was built on', () => {
    // 37 % of mid-week plans did. `materialise` drops those at the storage
    // boundary, so the person is promised something and shown nothing — the
    // same failure as the gym training that never appeared, reached from three
    // different fallbacks that all reset to Monday.
    const bad = population.flatMap((c) =>
      c.plan.items
        .filter((i) => i.cadence !== 'daily' && i.scheduledOn < c.today)
        .map((i) => ({ seed: c.seed, detail: `${i.title} on ${i.scheduledOn}, today ${c.today}` })),
    )
    expect(report(bad)).toBe('')
  })

  it('keeps something after the week is stored', () => {
    // The check that would have caught it. A plan whose every action is dropped
    // on the way into the database is an empty screen with a confident
    // headline over it.
    const bad = population
      .filter((c) => materialise(c.plan.items, startOfWeek(c.today), c.today).length === 0)
      .map((c) => ({ seed: c.seed, detail: `${c.plan.items.length} planned, 0 stored` }))
    expect(report(bad)).toBe('')
  })
})

describe('the safety limits hold for everybody', () => {
  it('passes its own invariants on every plan', () => {
    const bad: Array<{ seed: number; detail: string }> = []
    for (const c of population) {
      try {
        assertPlanInvariants(c.plan, c.input)
      } catch (error) {
        bad.push({ seed: c.seed, detail: String(error).slice(0, 120) })
      }
    }
    expect(report(bad)).toBe('')
  })

  it('never plans a session longer than the person said they can manage', () => {
    // A hard constraint is not the engine's opinion — it is something somebody
    // stated about their own life. Where it conflicts with the engine's own
    // minimum session length, the person wins and the session is dropped.
    const bad: Array<{ seed: number; detail: string }> = []
    for (const c of population) {
      const caps = c.input.constraints
        .filter((x) => x.hard && x.value.type === 'max_session_minutes')
        .map((x) => (x.value as { minutes: number }).minutes)
      if (caps.length === 0) continue
      const cap = Math.min(...caps)
      for (const item of c.plan.items) {
        if ((item.plannedDurationMin ?? 0) > cap) {
          bad.push({ seed: c.seed, detail: `${item.plannedDurationMin} min over a ${cap} min cap` })
          break
        }
      }
    }
    expect(report(bad)).toBe('')
  })
})

describe('no action asks for nothing', () => {
  it('never plans zero of anything', () => {
    // "Langer Lauf, 0,0 km" is not a small action, it is a broken one — a zero
    // that reached a formula assuming a positive number. Read off the title,
    // because that is what the person is actually shown.
    const bad = population.flatMap((c) =>
      c.plan.items
        .filter((i) => /(^|[^\d,.])0([,.]0)?\s*(km|Min|Minuten|kcal|Schritte)/.test(i.title))
        .map((i) => ({ seed: c.seed, detail: i.title })),
    )
    expect(report(bad)).toBe('')
  })

  it('gives every action a reason', () => {
    // Principle 4. An action that cannot point at what it came from must not
    // exist, and at this scale a single missing one is a template with a hole.
    const bad = population.flatMap((c) =>
      c.plan.items
        .filter((i) => i.rationale.text.trim().length === 0)
        .map((i) => ({ seed: c.seed, detail: i.title })),
    )
    expect(report(bad)).toBe('')
  })
})

describe('a day stays readable', () => {
  it('keeps a day within the card ceiling for all but a handful', () => {
    // Counted as Heute counts it: every dated action is its own card and all
    // the standing rules collapse into one. Not zero, and deliberately so —
    // the remaining cases are short weeks where the alternative is dropping
    // somebody's actions, which is worse than a sixth card.
    const over = population.filter((c) => {
      const perDay = new Map<string, { actions: number; rules: number }>()
      for (const item of materialise(c.plan.items, startOfWeek(c.today), c.today)) {
        const day = perDay.get(item.scheduledOn) ?? { actions: 0, rules: 0 }
        if (item.cadence === 'daily') day.rules++
        else day.actions++
        perDay.set(item.scheduledOn, day)
      }
      return [...perDay.values()].some((d) => d.actions + (d.rules > 0 ? 1 : 0) > MAX_ITEMS_PER_DAY)
    })
    expect(over.length / SIZE).toBeLessThan(0.02)
  })
})

// ---------------------------------------------------------------------------
// The fallback archetype, which is most people's first impression.
//
// "general_health" is where somebody lands who typed "ich will mich einfach
// besser fühlen" — the undecided, which is a large share of any first session.
// It was measurably the least personal of the seven: 0.26 mean signature
// distance against this project's 0.45 threshold, and 7.6 % of pairs producing
// *identical* plans.
//
// Two causes, one mistake in different clothes. A ranked chain of ifs that
// stopped at the first match, so 57 % of people got "Schlaf" because sleeping
// badly is the condition most people meet. And a plan shape that read the
// person's week not at all: two items, two hard-coded weekdays, two hard-coded
// times, for everybody.

describe('the fallback reads the person', () => {
  const fallback = population.filter((c) => c.input.goal.archetype === 'general_health')

  it('has enough of them to say anything', () => {
    expect(fallback.length).toBeGreaterThan(50)
  })

  it('does not hand the majority the same starting point', () => {
    // The number that gave the game away. No single starting point may take
    // more than half the population — if one does, the ranking has gone back
    // to deciding for people instead of reading them.
    const counts = new Map<string, number>()
    for (const c of fallback) {
      const key = String(c.plan.strategy.goalTrack.signature.startingPoint)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const [top, share] = [...counts].sort((a, b) => b[1] - a[1])[0]
    expect(share / fallback.length, `"${top}" got ${share}/${fallback.length}`).toBeLessThan(0.5)
  })

  it('places the starting point on more than one weekday across people', () => {
    // It used to be Monday for everybody with poor sleep, Wednesday for every
    // beginner. The day now comes from the person's own free time.
    const days = new Set(fallback.map((c) => c.plan.strategy.goalTrack.signature.focusDays))
    expect(days.size).toBeGreaterThan(3)
  })

  it('says how sure it is rather than sounding equally certain to everybody', () => {
    const modes = new Set(fallback.map((c) => c.plan.strategy.goalTrack.signature.mode))
    expect(modes.size).toBeGreaterThan(1)
  })
})
