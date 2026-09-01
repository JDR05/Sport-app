// Does the configured provider actually answer?
//
// Written because the alternative is deploying and hoping. Every failure in
// this app's AI layer is designed to fall back to the deterministic path
// silently — which is right in production and useless while setting a key up:
// a typo in the base URL, a model the key cannot see, a parameter the provider
// rejects all look identical from the outside, namely "the AI never runs".
//
// This makes exactly two real calls and prints what came back. Run it locally
// with the key in .env.local; nothing here needs deploying.
//
//   npm run ai:check
//
// It lists the models the key can actually see first, because "which model ID
// do I put in" is the question that costs the most time, and the key knows the
// answer better than any documentation does.

import { readFileSync } from 'node:fs'
import { readCompatibleConfig, createAdapter } from '../src/lib/ai'

/** Minimal .env parser — a dependency for this would be silly. */
function loadEnv(path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.log(`(${path} nicht gefunden — es zählt, was in der Umgebung steht)`)
    return
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (value && !process.env[match[1]]) process.env[match[1]] = value
  }
}

async function listModels(baseUrl: string, apiKey: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } })
    if (!response.ok) {
      console.log(`  Modell-Liste nicht abrufbar (${response.status}). Kein Problem — nicht jeder Anbieter bietet sie an.`)
      return
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> }
    const ids = (body.data ?? []).map((m) => m.id).filter(Boolean) as string[]
    if (ids.length === 0) {
      console.log('  Der Anbieter nennt keine Modelle.')
      return
    }
    console.log(`  ${ids.length} Modelle sichtbar. Auszug:`)
    for (const id of ids.slice(0, 12)) console.log(`    ${id}`)
    if (ids.length > 12) console.log(`    … und ${ids.length - 12} weitere`)
  } catch (error) {
    console.log(`  Modell-Liste nicht abrufbar: ${String(error).slice(0, 120)}`)
  }
}

async function main(): Promise<void> {
  loadEnv('.env.local')

  console.log('\n── Konfiguration ──────────────────────────────────────────')
  const adapter = createAdapter()
  console.log(`  Aktiver Adapter: ${adapter.name}`)

  if (adapter.name === 'mock' || adapter.name === 'null') {
    console.log('\n  Es ist kein Modell konfiguriert. Die App läuft rein deterministisch —')
    console.log('  das ist ein gültiger Zustand, aber vermutlich nicht der, den du prüfen wolltest.')
    console.log('  Setz AI_COMPAT_BASE_URL, AI_COMPAT_KEY und AI_COMPAT_MODEL in .env.local.\n')
    process.exit(1)
  }

  const compat = readCompatibleConfig(process.env, 20000)
  if (compat) {
    console.log(`  Endpunkt:  ${compat.baseUrl}`)
    console.log(`  Modell:    ${compat.proposeModel}`)
    console.log(`  Key:       gesetzt (${compat.apiKey.length} Zeichen, wird nicht ausgegeben)`)
    console.log('\n── Modelle, die dieser Key sehen darf ─────────────────────')
    await listModels(compat.baseUrl, compat.apiKey)
  }

  console.log('\n── Test 1: Ziel einordnen ─────────────────────────────────')
  const goal = 'Ich bin ständig erschöpft und will endlich besser schlafen'
  console.log(`  Eingabe: „${goal}"`)
  const classified = await adapter.classifyGoal(goal)
  if (classified.ok) {
    console.log(`  ✓ ${classified.value.archetype} (Sicherheit ${classified.value.confidence})`)
    console.log(`    „${classified.value.restated}"`)
  } else {
    console.log(`  ✗ ${classified.reason}: ${classified.detail}`)
    console.log('    Die App würde hier auf den Schlüsselwort-Klassifikator zurückfallen.')
  }

  console.log('\n── Test 2: Plan vorschlagen ───────────────────────────────')
  const { GOALS, PROFILES, makeInput } = await import('../tests/fixtures/profiles')
  const proposed = await adapter.proposePlan(makeInput(PROFILES[0], GOALS[3]))
  if (proposed.ok) {
    console.log(`  ✓ „${proposed.value.headline}"`)
    for (const action of proposed.value.actions) {
      console.log(`    · ${action.title} (${action.minutes} min, ${action.timesPerWeek}×/Woche)`)
    }
  } else {
    console.log(`  ✗ ${proposed.reason}: ${proposed.detail}`)
    if (proposed.reason === 'implausible') {
      console.log('    Das Modell hat etwas geschrieben, das die Sicherheitsprüfung ablehnt.')
      console.log('    Genau dafür ist sie da — aber wenn das häufig passiert, taugt das Modell nicht.')
    } else {
      console.log('    Die App würde hier ohne Vorschlag planen, rein deterministisch.')
    }
  }

  console.log('\n── Test 3: Rückfragen vor dem Plan ────────────────────────')
  // Two intakes on purpose. The interesting number is not whether the model
  // *can* ask — any model will — but whether it keeps quiet when there is
  // nothing to ask about. A model that asks three questions of a complete
  // intake makes the onboarding longer for everyone and is the wrong model
  // for this job, however good its questions read.
  const { incompleteInput } = await import('../tests/fixtures/profiles')
  const cases: Array<[string, Parameters<typeof adapter.askQuestions>[0]]> = [
    ['vollständiges Onboarding', makeInput(PROFILES[0], GOALS[3])],
    ['abgebrochenes Onboarding', incompleteInput],
  ]

  let asked = true
  for (const [label, input] of cases) {
    const questions = await adapter.askQuestions(input)
    if (!questions.ok) {
      asked = false
      console.log(`  ✗ ${label}: ${questions.reason} — ${questions.detail}`)
      if (questions.reason === 'implausible') {
        console.log('    Die Frage hat die Prüfung nicht bestanden (Identität, Medizin oder zu allgemein).')
      }
      continue
    }
    const list = questions.value.questions
    console.log(`  ✓ ${label}: ${list.length === 0 ? 'keine Rückfrage' : `${list.length} Rückfrage(n)`}`)
    for (const q of list) console.log(`    · ${q.question}\n      → ${q.why}`)
  }
  console.log('    Erwartung: beim vollständigen Onboarding eher keine, beim abgebrochenen eher welche.')

  const ok = classified.ok && proposed.ok && asked
  console.log(`\n${ok ? '✓ Alle Aufrufe haben funktioniert.' : '✗ Mindestens ein Aufruf ist gescheitert — siehe oben.'}\n`)
  process.exit(ok ? 0 : 1)
}

void main()
