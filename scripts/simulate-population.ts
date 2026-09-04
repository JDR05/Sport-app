// Thousands of people, one engine.
//
// Runs the real `generatePlan` over a generated population and asserts the
// things that must hold for everybody. Deliberately not a vitest file: it takes
// minutes rather than seconds and is a question asked of the engine, not a
// regression to run on every commit — the findings it produces become tests,
// which is the point.
//
//   npx tsx scripts/simulate-population.ts [count]

import { generatePlan } from '../src/lib/engine'
import { assertPlanInvariants } from '../src/lib/engine/safety'
import { planSignature, signatureDistance } from '../src/lib/engine/signature'
import { materialise } from '../src/lib/db/item-mapping'
import { startOfWeek, addDays } from '../src/lib/engine/dates'
import { INTAKE_FLOOR_KCAL, MAX_ITEMS_PER_DAY } from '../src/lib/engine/constants'
import { ARCHETYPES, makePerson, TODAY } from './population'
import type { GoalArchetype, PlanInput } from '../src/lib/domain/types'

// ---------------------------------------------------------------- checking --

type Failure = { seed: number; archetype: GoalArchetype; today: string; kind: string; detail: string }

const failures: Failure[] = []
const record = (f: Failure) => {
  if (failures.length < 4000) failures.push(f)
}

function check(input: PlanInput, seed: number) {
  const archetype = input.goal.archetype
  const base = { seed, archetype, today: input.today }

  let plan
  try {
    plan = generatePlan(input)
  } catch (error) {
    record({ ...base, kind: 'crash', detail: String(error).slice(0, 200) })
    return null
  }

  // 1. The safety limits, as the app itself enforces them.
  try {
    assertPlanInvariants(plan, input)
  } catch (error) {
    record({ ...base, kind: 'invariant', detail: String(error).slice(0, 200) })
  }

  // 2. Nothing dated before the day the plan was made. A plan that puts work on
  //    a day already gone is dropped at the storage boundary and the person
  //    simply never sees it (ADR-106).
  for (const item of plan.items) {
    if (item.cadence !== 'daily' && item.scheduledOn < input.today) {
      record({ ...base, kind: 'before_today', detail: `${item.title} on ${item.scheduledOn}` })
      break
    }
  }

  // 3. The week has to survive storage. This is the check that would have
  //    caught the missing gym training on the real account.
  const weekStart = startOfWeek(input.today)
  const stored = materialise(plan.items, weekStart, input.today)
  if (stored.length === 0) {
    record({ ...base, kind: 'empty_after_storage', detail: `${plan.items.length} planned, 0 stored` })
  }

  // 4. Every action must carry a reason. Principle 4, and the thing that
  //    separates this from a list of instructions.
  for (const item of plan.items) {
    if (item.rationale.text.trim().length === 0) {
      record({ ...base, kind: 'no_rationale', detail: item.title })
      break
    }
  }

  // 5. Today shows three to five actions. More than five on one day is the
  //    "zwanzig Karten pro Screen" the brief rules out.
  //
  //    Counted as the screen counts it, not as the table does: Heute renders
  //    every dated action as its own card and collapses *all* the standing
  //    rules into one. Counting stored rows instead reports a six-card day for
  //    somebody looking at four, which is a measurement inventing a bug.
  const perDay = new Map<string, { actions: number; rules: number }>()
  for (const item of stored) {
    const day = perDay.get(item.scheduledOn) ?? { actions: 0, rules: 0 }
    if (item.cadence === 'daily') day.rules++
    else day.actions++
    perDay.set(item.scheduledOn, day)
  }
  for (const [date, day] of perDay) {
    const cards = day.actions + (day.rules > 0 ? 1 : 0)
    if (cards > MAX_ITEMS_PER_DAY) {
      record({ ...base, kind: 'day_overloaded', detail: `${date}: ${cards} cards` })
      break
    }
  }

  // 6. The headline must not promise training the week does not contain.
  const promises = /(\d+)×\s*(Training|Kraft|Lauf|Einheit)/i.exec(plan.strategy.goalTrack.headline)
  if (promises) {
    const promised = Number(promises[1])
    const sessions = stored.filter(
      (i) => (i.domain === 'training' || i.domain === 'movement') && i.plannedDurationMin !== null,
    ).length
    if (sessions === 0 && promised > 0) {
      record({
        ...base,
        kind: 'headline_lies',
        detail: `"${plan.strategy.goalTrack.headline}" over a week with no session`,
      })
    }
  }

  // 7. No action may ask for nothing.
  //
  //    "Langer Lauf, 0,0 km" and "0 Min Krafttraining" are not small actions,
  //    they are broken ones — and they come from a zero reaching a formula that
  //    assumed a positive number. Reading the title is deliberate: this is what
  //    the person is actually shown.
  for (const item of plan.items) {
    if (/(^|[^\d,.])0([,.]0)?\s*(km|Min|Minuten|kcal|Schritte|×)/.test(item.title)) {
      record({ ...base, kind: 'asks_for_nothing', detail: item.title })
      break
    }
  }

  // 8. The calorie floor, read straight off the item the person sees rather
  //    than off the number the engine computed. A floor honoured internally and
  //    lost in the title is a floor nobody is protected by.
  for (const item of plan.items) {
    const kcal = /(\d{3,5})\s*kcal/.exec(item.title)
    if (kcal && Number(kcal[1]) < INTAKE_FLOOR_KCAL.female) {
      record({ ...base, kind: 'kcal_below_floor', detail: item.title })
      break
    }
  }

  return plan
}

// -------------------------------------------------------------------- run ---

const COUNT = Number(process.env.SIM_COUNT ?? process.argv[2] ?? 10000)
// Four days of the week, so the partial-week paths are exercised as heavily as
// the Monday one. The engine plans only what a week still has (ADR-106), and
// most of this project's worst bugs lived in exactly that difference.
const DAYS = [TODAY, addDays(TODAY, 2), addDays(TODAY, 4), addDays(TODAY, 6)]

console.log(`Simulating ${COUNT} people across ${ARCHETYPES.length} archetypes and ${DAYS.length} start days …\n`)

const signatures = new Map<GoalArchetype, Array<ReturnType<typeof planSignature>>>()
let planned = 0
let actions = 0
let emptyGoalTrack = 0

for (let i = 0; i < COUNT; i++) {
  const archetype = ARCHETYPES[i % ARCHETYPES.length]
  const today = DAYS[Math.floor(i / ARCHETYPES.length) % DAYS.length]
  const input = makePerson(i, archetype, today)
  const plan = check(input, i)
  if (!plan) continue

  planned++
  actions += plan.items.length
  if (plan.strategy.goalTrack.items.length === 0) emptyGoalTrack++

  // Signatures only from the full week, so the distance measures the person
  // and not how much of the week was left.
  if (today === TODAY) {
    const list = signatures.get(archetype) ?? []
    if (list.length < 120) list.push(planSignature(plan))
    signatures.set(archetype, list)
  }
}

// ------------------------------------------------------------------ report --

console.log(`Plans built:        ${planned} / ${COUNT}`)
console.log(`Actions per plan:   ${(actions / Math.max(1, planned)).toFixed(1)} average`)
console.log(`Empty goal track:   ${emptyGoalTrack}`)
console.log()

const byKind = new Map<string, Failure[]>()
for (const f of failures) {
  const list = byKind.get(f.kind) ?? []
  list.push(f)
  byKind.set(f.kind, list)
}

if (byKind.size === 0) {
  console.log('No failures.\n')
} else {
  console.log('FAILURES')
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const share = ((list.length / COUNT) * 100).toFixed(2)
    console.log(`\n  ${kind}: ${list.length} (${share}%)`)
    const seen = new Set<string>()
    for (const f of list) {
      const key = `${f.archetype}|${f.detail.slice(0, 70)}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(`    seed ${f.seed} · ${f.archetype} · ${f.today} · ${f.detail}`)
      if (seen.size >= 6) break
    }
  }
  console.log()
}

// Personalisation, measured per archetype rather than across all of them:
// two people with different goals differing is not the claim being tested.
console.log('PERSONALISATION (pairwise signature distance, same archetype)')
for (const archetype of ARCHETYPES) {
  const list = signatures.get(archetype) ?? []
  if (list.length < 2) {
    console.log(`  ${archetype.padEnd(18)} — too few`)
    continue
  }
  const distances: number[] = []
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) distances.push(signatureDistance(list[a], list[b]))
  }
  distances.sort((x, y) => x - y)
  const mean = distances.reduce((s, d) => s + d, 0) / distances.length
  const identical = distances.filter((d) => d === 0).length
  console.log(
    `  ${archetype.padEnd(18)} mean ${mean.toFixed(2)}  min ${distances[0].toFixed(2)}  ` +
      `identical pairs ${((identical / distances.length) * 100).toFixed(1)}%`,
  )
}

console.log()
process.exit(byKind.size > 0 ? 1 : 0)
