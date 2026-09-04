// One person from the population, in full.
//
// The simulation reports a seed; this turns the seed back into the person and
// the plan, so a finding can be read rather than guessed at.
//
//   npx tsx scripts/inspect-seed.ts <seed> <archetype> <today>

import { generatePlan } from '../src/lib/engine'
import { assertPlanInvariants } from '../src/lib/engine/safety'
import { makePerson } from './population'
import type { GoalArchetype } from '../src/lib/domain/types'

const seed = Number(process.argv[2])
const archetype = (process.argv[3] ?? 'body_composition') as GoalArchetype
const today = process.argv[4] ?? '2026-08-17'

const input = makePerson(seed, archetype, today)

console.log('--- INPUT ---')
console.log(JSON.stringify({ ...input, personalRules: undefined }, null, 2))

try {
  const plan = generatePlan(input)
  console.log('\n--- HEADLINE ---')
  console.log(plan.strategy.goalTrack.headline)
  console.log(plan.strategy.goalTrack.summary.join(' | '))
  console.log('\n--- ITEMS ---')
  for (const item of plan.items) {
    console.log(
      `${item.scheduledOn} ${item.cadence === 'daily' ? '[daily]' : '       '} ` +
        `${item.domain.padEnd(16)} ${String(item.plannedDurationMin ?? '-').padStart(4)} min  ${item.title}`,
    )
  }
  console.log('\n--- ASSUMPTIONS ---')
  for (const a of plan.assumptions) console.log(`${a.field}: ${a.assumed}`)

  try {
    assertPlanInvariants(plan, input)
    console.log('\ninvariants: ok')
  } catch (error) {
    console.log(`\ninvariants: FAILED — ${error}`)
  }
} catch (error) {
  console.log(`\ngeneratePlan threw: ${error}`)
  if (error instanceof Error && error.stack) console.log(error.stack.split('\n').slice(0, 6).join('\n'))
}
