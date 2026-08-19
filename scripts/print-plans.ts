// Prints the ten fixture plans side by side.
//
// The tests prove the plans differ. This shows whether they also make sense,
// which no assertion can decide. Run it before accepting a change to the engine.

import { generatePlan, planSignature, signatureDistance } from '../src/lib/engine'
import { SIGNATURE_FEATURES } from '../src/lib/engine/signature'
import { ALL_PROFILES } from '../tests/fixtures/profiles'

const plans = ALL_PROFILES.map((p) => ({ name: p.name, plan: generatePlan(p.input) }))

for (const { name, plan } of plans) {
  const s = plan.strategy
  console.log(`\n${'='.repeat(78)}\n${name}`)
  console.log(
    `  Ziel      ${s.targetDate}${s.targetDateAdjusted ? '  (angepasst)' : ''}` +
      `  ·  ${s.ratePerWeekKg} kg/Woche  ·  ${s.deficitTier}`,
  )
  console.log(
    `  Energie   Bedarf ${s.dailyNeedKcal} kcal  ·  Ziel ${s.targetIntakeKcal} kcal` +
      `  ·  Defizit ${s.deficitKcal} kcal`,
  )
  console.log(
    `  Training  ${s.trainingSessions}× ${s.trainingModality}, ${s.sessionMinutes} min` +
      `  ·  ${s.trainingWeekdays.join(', ') || '—'}  ·  Ruhe: ${s.restWeekdays.join(', ')}`,
  )
  console.log(`  Ernährung ${s.nutritionApproach}  ·  Bewegung ${s.movementApproach}` +
      `${s.dailyStepTarget ? ` (${s.dailyStepTarget} Schritte)` : ''}`)

  for (const r of plan.rationale) console.log(`  → ${r.text}`)
  if (plan.assumptions.length > 0) {
    for (const a of plan.assumptions) console.log(`  ~ Annahme ${a.field}: ${a.assumed}`)
  }

  console.log('  Aktionen:')
  for (const item of plan.items.slice(0, 6)) {
    console.log(`    [${item.domain}] ${item.title}`)
    console.log(`        ${item.rationale.text}`)
  }
  if (plan.items.length > 6) console.log(`    … und ${plan.items.length - 6} weitere`)
}

// ---------------------------------------------------------- distances -----

const signatures = plans.map((p) => ({ name: p.name, sig: planSignature(p.plan) }))
const distances: number[] = []
for (let i = 0; i < signatures.length; i++) {
  for (let j = i + 1; j < signatures.length; j++) {
    distances.push(signatureDistance(signatures[i].sig, signatures[j].sig))
  }
}
const mean = distances.reduce((a, b) => a + b, 0) / distances.length

console.log(`\n${'='.repeat(78)}`)
console.log(`Paare: ${distances.length}`)
console.log(`Mittlere Distanz: ${mean.toFixed(3)}  (Gate: >= 0.45)`)
console.log(`Minimale Distanz: ${Math.min(...distances).toFixed(3)}  (Gate: >= 0.20)`)

console.log('\nMerkmalsverteilung:')
for (const feature of SIGNATURE_FEATURES) {
  const values = new Set(signatures.map((s) => s.sig[feature]))
  console.log(`  ${feature.padEnd(22)} ${values.size} verschiedene: ${[...values].join(' | ')}`)
}
