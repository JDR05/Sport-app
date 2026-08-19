// Prints plans for every profile and every goal.
//
// The tests prove the plans differ. This shows whether they also make sense,
// which no assertion can decide. Run it before accepting a change to the engine.
//
//   npm run plans            all ten profiles, one goal each (rotating)
//   npm run plans -- matrix  one profile against all seven goals

import { generatePlan, planSignature, signatureDistance } from '../src/lib/engine'
import { GOALS, PROFILES, makeInput } from '../tests/fixtures/profiles'

const matrix = process.argv.includes('matrix')

function show(label: string, input: ReturnType<typeof makeInput>) {
  const plan = generatePlan(input)
  const s = plan.strategy
  console.log(`\n${'='.repeat(78)}\n${label}`)
  console.log(`  [${s.archetype}] ${s.goalTrack.headline}`)
  console.log(`  Ziel      ${s.targetDate}${s.targetDateAdjusted ? '  (angepasst)' : ''}`)
  for (const line of s.goalTrack.summary) console.log(`            ${line}`)
  for (const r of plan.rationale) console.log(`  → ${r.text}`)
  for (const a of plan.assumptions) console.log(`  ~ Annahme ${a.field}: ${a.assumed}`)

  const goal = plan.items.filter((i) => i.track === 'goal')
  const base = plan.items.filter((i) => i.track === 'baseline')
  console.log(`  Zielspur (${goal.length}):`)
  for (const item of goal.slice(0, 5)) {
    console.log(`    [${item.domain}] ${item.title}`)
    console.log(`        ${item.rationale.text}`)
  }
  if (goal.length > 5) console.log(`    … und ${goal.length - 5} weitere`)
  console.log(`  Gesundheitsbasis (${base.length}):`)
  for (const item of base.slice(0, 3)) console.log(`    [${item.domain}] ${item.title}`)
  if (base.length > 3) console.log(`    … und ${base.length - 3} weitere`)
}

if (matrix) {
  const profile = PROFILES[0]
  console.log(`Ein Profil, sieben Ziele: ${profile.name}`)
  for (const goal of GOALS) show(`${profile.name} · ${goal.name}`, makeInput(profile, goal))

  const sigs = GOALS.map((g) => planSignature(generatePlan(makeInput(profile, g))))
  const distances: number[] = []
  for (let i = 0; i < sigs.length; i++)
    for (let j = i + 1; j < sigs.length; j++) distances.push(signatureDistance(sigs[i], sigs[j]))
  console.log(`\n${'='.repeat(78)}`)
  console.log(`Zielorientierung über ${distances.length} Paare`)
  console.log(`  Mittlere Distanz ${(distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(3)}  (Gate >= 0.60)`)
  console.log(`  Minimale Distanz ${Math.min(...distances).toFixed(3)}  (Gate >= 0.30)`)
} else {
  PROFILES.forEach((profile, index) => {
    const goal = GOALS[index % GOALS.length]
    show(`${profile.name} · ${goal.name}`, makeInput(profile, goal))
  })
}
