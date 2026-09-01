// The one call where the model asks instead of answers.
//
// Two failure modes are tested harder than the happy path, because both turn a
// good idea into a worse onboarding:
//
//   * Asking anything at all when there is nothing worth asking. A model handed
//     a "you may ask questions" slot will fill it, and three obligatory
//     questions at the end of a ten-minute form is where people leave.
//   * Asking for something the app already has, or has no business having.

import { describe, expect, it } from 'vitest'
import { checkQuestions } from '@/lib/ai'
import { intakeQuestionsSchema } from '@/lib/ai/schemas'
import { knownFields, openFields, proposeUserMessage, questionsUserMessage } from '@/lib/ai/tasks'
import { ALL_COMBINATIONS, incompleteInput } from './fixtures/profiles'
import type { IntakeQuestions } from '@/lib/ai/schemas'

const one = (over: Partial<IntakeQuestions['questions'][number]> = {}) => ({
  question: 'Hast du zu Hause Platz für eine Matte, oder fällt alles im Stehen an?',
  why: 'Entscheidet, ob die Einheiten am Boden oder im Stehen aufgebaut werden.',
  options: ['Platz für eine Matte', 'Nur im Stehen'],
  ...over,
})

const asking = (over: Partial<IntakeQuestions> = {}): IntakeQuestions => ({
  needsMore: true,
  questions: [one()],
  ...over,
})

describe('silence is a valid answer', () => {
  it('accepts asking nothing at all', () => {
    expect(checkQuestions({ needsMore: false, questions: [] })).toEqual([])
  })

  it.each([
    ['claims to need nothing but asks anyway', { needsMore: false, questions: [one()] }],
    ['claims to need something but asks nothing', { needsMore: true, questions: [] }],
  ])('refuses a model that %s', (_case, value) => {
    // Taking either half on its own would be picking the answer we prefer, and
    // a model that contradicts itself has not understood the task.
    const violations = checkQuestions(value as IntakeQuestions)
    expect(violations.map((v) => v.rule)).toContain('contradicts_itself')
  })
})

describe('what it may not ask for', () => {
  it.each([
    ['Wie heißt du eigentlich mit Nachnamen?', 'no_identity_data'],
    ['Wie lautet deine E-Mail-Adresse für Erinnerungen?', 'no_identity_data'],
    ['Wo wohnst du, damit ich Wege einplanen kann?', 'no_identity_data'],
    ['Was ist dein Geburtsdatum, für die Belastung?', 'no_identity_data'],
    ['Nimmst du regelmäßig Medikamente, die müde machen?', 'no_medical_questions'],
    ['Hast du schon mal eine Essstörung gehabt?', 'no_medical_questions'],
    ['Bist du schwanger oder planst du es gerade?', 'no_medical_questions'],
    ['Bist du gerade in Therapie oder Behandlung?', 'no_medical_questions'],
    ['Auf welche Lebensmittel möchtest du verzichten?', 'additive_only'],
    ['Könntest du kürzer schlafen, um früher zu trainieren?', 'never_less_sleep'],
    ['Was ist dein Ziel eigentlich genau?', 'not_generic'],
    ['Wie viel Zeit hast du denn pro Woche?', 'not_generic'],
    ['Wie wichtig ist dir dieses Ziel wirklich?', 'not_generic'],
  ])('refuses "%s"', (question, rule) => {
    const violations = checkQuestions(asking({ questions: [one({ question })] }))
    expect(violations.map((v) => v.rule)).toContain(rule)
  })

  it('refuses identity requests hidden in the options rather than the question', () => {
    // The question, the reason and the tap-able answers are all text the person
    // sees and can act on, so all three go through the same gate. A check that
    // only read `question` would be trivially walked around.
    const violations = checkQuestions(
      asking({ questions: [one({ options: ['Meine E-Mail-Adresse ist …'] })] }),
    )
    expect(violations.map((v) => v.rule)).toContain('no_identity_data')
  })

  it('refuses a statement dressed as a question', () => {
    const violations = checkQuestions(
      asking({ questions: [one({ question: 'Erzähl mir mehr über deinen Alltag.' })] }),
    )
    expect(violations.map((v) => v.rule)).toContain('must_be_a_question')
  })
})

describe('asking what the app already knows', () => {
  it('refuses a question about a field that was answered', () => {
    const violations = checkQuestions(
      asking({ questions: [one({ question: 'Wie sind deine Schlafzeiten an Werktagen?' })] }),
      ['Schlafzeiten', 'Kochen'],
    )
    expect(violations.map((v) => v.rule)).toContain('asks_what_it_knows')
  })

  it('allows the same question when that field was left blank', () => {
    // The whole point of the step. A gap is exactly what it is meant to find,
    // so the identical sentence has to be fine when the field is open.
    expect(
      checkQuestions(
        asking({ questions: [one({ question: 'Wie sind deine Schlafzeiten an Werktagen?' })] }),
        ['Kochen'],
      ),
    ).toEqual([])
  })
})

describe('the gap list handed to the model', () => {
  it.each(ALL_COMBINATIONS.map((c) => [c.name, c.input] as const))(
    'never lists a field as both known and open for %s',
    (_name, input) => {
      // These two are each other's complement by construction. If they ever
      // overlap, checkQuestions would refuse a question about a genuine gap —
      // silently turning the feature off for that person.
      const open = new Set(openFields(input))
      expect(knownFields(input).filter((f) => open.has(f))).toEqual([])
    },
  )

  it('finds real gaps in an abandoned onboarding', () => {
    // The case the feature exists for. Somebody who filled in almost nothing
    // should give the model plenty to ask about — if this came back empty, the
    // gap detection would be reporting a complete intake for an empty one.
    expect(openFields(incompleteInput).length).toBeGreaterThan(4)
  })

  it('reports nothing open for a fully answered intake', () => {
    // The other end, and the one that matters more: on a complete intake the
    // list has to be empty, or the model is invited to ask about a field that
    // is already filled in.
    const complete = ALL_COMBINATIONS.map((c) => openFields(c.input))
    expect(complete.some((open) => open.length === 0)).toBe(true)
  })

  it('never sends an exact time, in any of the ways people write one', () => {
    // The question step must not become the back door through which exact
    // values leave the machine — it is built on the same coarsened text the
    // proposal gets, and this is what proves that stayed true.
    //
    // The first version of this test only looked for HH:MM, which structurally
    // could not see a bare hour — and "Kaffee um 7, Hund um 18 Uhr" is the
    // literal placeholder the onboarding shows people, so the format the app
    // teaches was the one format the guard could not catch. Every spelling of
    // a clock time is checked now.
    const CLOCK = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*Uhr\b|\b(?:um|gegen)\s+\d{1,2}\b/i
    const ROUTINES = ['Kaffee um 7', 'Hund um 18 Uhr', 'Aufstehen 6:45', 'Lesen um 22.30']

    for (const { input } of ALL_COMBINATIONS) {
      const withRoutines = {
        ...input,
        profile: {
          ...input.profile,
          mind: { ...input.profile.mind, existingRoutines: ROUTINES },
        },
      }
      expect(questionsUserMessage(withRoutines)).not.toMatch(CLOCK)
      expect(proposeUserMessage(withRoutines)).not.toMatch(CLOCK)
    }
  })

  it('keeps the part of a routine that is worth knowing', () => {
    // Redaction that removes the signal is not redaction, it is deletion. The
    // model needs "there is a morning routine to hang something on"; the
    // minute tells it nothing more.
    const input = {
      ...ALL_COMBINATIONS[0].input,
      profile: {
        ...ALL_COMBINATIONS[0].input.profile,
        mind: {
          ...ALL_COMBINATIONS[0].input.profile.mind,
          existingRoutines: ['Kaffee um 7', 'Hund um 18 Uhr', 'Krafttraining 3 Sätze'],
        },
      },
    }
    const message = proposeUserMessage(input)
    expect(message).toContain('Kaffee morgens')
    expect(message).toContain('Hund nachmittags')
    // A count that is not a clock time is not a secret and must survive.
    expect(message).toContain('3 Sätze')
  })

  it('does not carry the proposal instruction into a question prompt', () => {
    // Copied text is how the two prompts quietly become one. Asking the model
    // to design actions AND to say what it is missing gets neither done well.
    for (const { input } of ALL_COMBINATIONS) {
      expect(questionsUserMessage(input)).not.toContain('Entwirf zwei bis fünf Aktionen')
    }
  })
})

describe('the schema itself', () => {
  it('refuses more than three questions', () => {
    // The ceiling is in the schema rather than the prompt, so a model that
    // ignores the instruction is stopped by the parser instead of by nothing.
    const parsed = intakeQuestionsSchema.safeParse({
      needsMore: true,
      questions: [one(), one(), one(), one()],
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses more than four tap-able options', () => {
    const parsed = intakeQuestionsSchema.safeParse({
      needsMore: true,
      questions: [one({ options: ['a', 'b', 'c', 'd', 'e'] })],
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses a question with no stated purpose', () => {
    const parsed = intakeQuestionsSchema.safeParse({
      needsMore: true,
      questions: [one({ why: '' })],
    })
    expect(parsed.success).toBe(false)
  })
})
