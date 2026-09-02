// The question box, where the model is least constrained and therefore most
// dangerous.
//
// Every other AI output in this product is a proposal rendered next to a
// button: a plan action, a weekly note, three intake questions. An answer is
// prose in the first person, written to whatever somebody typed. So the gate
// in front of it is the same six families as everywhere else plus one that
// exists only here — a model may not claim to have changed a plan it has no
// way to change.

import { describe, expect, it } from 'vitest'
import { checkAnswer } from '@/lib/ai/validate'
import {
  allowanceFor, MAX_QUESTIONS_PER_DAY, normaliseQuestion, QUESTION_MAX_CHARS, suggestionsFor,
} from '@/lib/ai/ask'
import { askTask, askUserMessage, type AskContext } from '@/lib/ai/tasks'
import type { AskAnswer } from '@/lib/ai/schemas'

function answer(overrides: Partial<AskAnswer> = {}): AskAnswer {
  return {
    canAnswer: true,
    answer: 'Dienstag ist dein freier Abend, deshalb liegt das Training dort.',
    needs: null,
    basedOn: ['item.2026-09-08.training'],
    ...overrides,
  }
}

describe('the model may not claim to have acted', () => {
  // The one rule with no counterpart in any other prompt, and the reason it
  // exists: asked "kannst du das verschieben?", a model answers "ich habe es
  // auf Samstag gelegt". Nothing moved. The person then does not do it, and
  // the app has lied about the single kind of fact it exists to keep straight.
  it.each([
    ['a move in the past tense', 'Ich habe dein Training für Mittwoch auf Samstag verschoben.'],
    ['a shortening', 'Ich hab die Einheit am Dienstag gekürzt.'],
    ['a vague adjustment', 'Ich habe das für dich angepasst, schau morgen nochmal rein.'],
    ['verb-first word order', 'Habe ich dein Krafttraining auf den Abend verschoben.'],
    ['the passive dodge', 'Das ist jetzt verschoben.'],
    ['the passive dodge, inflected', 'Deine Einheit ist jetzt gekürzt.'],
    ['the present tense', 'Ich verschiebe das auf Samstag.'],
    ['the present tense, shortening', 'Ich kürze die Einheit auf 20 Minuten.'],
    ['a colloquial claim', 'Das hab ich für dich erledigt.'],
    ['a removal', 'Ich habe deinen Lauf am Sonntag entfernt.'],
  ])('refuses %s', (_case, text) => {
    const violations = checkAnswer(answer({ answer: text }))
    expect(violations.map((v) => v.rule)).toContain('must_not_claim_to_have_acted')
  })

  it.each([
    ['telling the person how to do it themselves', 'Du kannst die Einheit auf Samstag legen — tipp sie an und wähl „Verschoben".'],
    ['a suggestion in the imperative', 'Wenn du magst, verschieb sie selbst auf Samstag; da hast du zuletzt beides geschafft.'],
    ['the safe sleep advice', 'Nach einer Nacht mit wenig Schlaf kannst du die Einheit kürzen.'],
    ['saying it found nothing', 'Ich habe in deinen Daten nichts dazu gefunden.'],
    ['reporting what it read', 'Ich habe gesehen, dass du dreimal „zu müde" angegeben hast.'],
    ['naming a rest day', 'Am Mittwoch ist nichts geplant — das ist ein Ruhetag, kein Versäumnis.'],
    ['explaining a placement', 'Ich habe keine Angaben zu deinem Feierabend, deshalb liegt das Training um 19:30.'],
    ['a plain description of the week', 'Zweimal Training diese Woche, beide am Abend. Das passt zu dem, was du angegeben hast.'],
  ])('lets through %s', (_case, text) => {
    expect(checkAnswer(answer({ answer: text }))).toEqual([])
  })
})

describe('the same safety families as everywhere else', () => {
  it.each([
    ['a restriction', 'Lass abends das Brot weg, dann klappt es besser.', 'additive_only'],
    ['a calorie target', 'Bleib bei 1400 kcal am Tag, dann passt das.', 'no_numeric_health_claims'],
    ['less sleep', 'Steh einfach eine Stunde früher auf, dann hast du Zeit.', 'never_less_sleep'],
    ['a diagnosis', 'Das klingt nach einem Eisenmangel, lass das abklären.', 'no_medical_claims'],
    ['filler', 'Trink mehr Wasser und bleib dran.', 'not_generic'],
    ['a verdict', 'Da fehlt dir die Disziplin, sei ehrlich.', 'no_verdict_on_the_person'],
  ])('refuses %s', (_case, text, rule) => {
    expect(checkAnswer(answer({ answer: text })).map((v) => v.rule)).toContain(rule)
  })

  it('checks the refusal text too, not only the answer', () => {
    // `needs` is a sentence a person reads, so it goes through the same gate.
    // Without this, everything above could be said in the one field nobody
    // thought to check.
    const violations = checkAnswer(
      answer({ canAnswer: false, answer: '', needs: 'Ob du auf Kohlenhydrate verzichtest.' }),
    )
    expect(violations.map((v) => v.rule)).toContain('additive_only')
  })
})

describe('an answer has to be grounded, and a refusal has to be useful', () => {
  it('refuses an answer that cites nothing', () => {
    const violations = checkAnswer(answer({ basedOn: [] }))
    expect(violations.map((v) => v.rule)).toContain('must_cite_evidence')
  })

  it('refuses a fragment', () => {
    expect(checkAnswer(answer({ answer: 'Ja.' })).map((v) => v.rule)).toContain('too_thin')
  })

  it('accepts a refusal that says what is missing', () => {
    expect(
      checkAnswer({
        canAnswer: false,
        answer: 'Das steht nicht in deinen Daten.',
        needs: 'Wann du abends nach Hause kommst.',
        basedOn: [],
      }),
    ).toEqual([])
  })

  it('refuses a refusal that just shrugs', () => {
    // Declining is allowed and often right. Declining without saying what
    // would have helped is exactly the shrug this feature replaces.
    for (const needs of [null, '', '   ', 'keine']) {
      const violations = checkAnswer({
        canAnswer: false,
        answer: 'Weiß ich nicht.',
        needs,
        basedOn: [],
      })
      expect(violations.map((v) => v.rule)).toContain('must_say_what_is_missing')
    }
  })

  it('does not demand evidence from a refusal', () => {
    // A refusal claims nothing, so it cites nothing. Requiring `basedOn` here
    // would push the model to invent a citation for "I do not know".
    const violations = checkAnswer({
      canAnswer: false,
      answer: 'Dazu habe ich nichts.',
      needs: 'Wie viele Abende du unter der Woche frei hast.',
      basedOn: [],
    })
    expect(violations.map((v) => v.rule)).not.toContain('must_cite_evidence')
  })
})

describe('the task refuses what the checks refuse', () => {
  it('rejects a schema-valid answer that breaks a rule', () => {
    const result = askTask.parse({
      canAnswer: true,
      answer: 'Ich habe das Training auf Samstag verschoben.',
      needs: null,
      basedOn: ['item.1'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.implausible).toBe(true)
  })

  it('rejects anything that is not the shape', () => {
    for (const bad of [null, 42, {}, { canAnswer: 'ja' }, { canAnswer: true, answer: 5 }]) {
      expect(askTask.parse(bad).ok).toBe(false)
    }
  })

  it('accepts a good answer', () => {
    const result = askTask.parse(answer())
    expect(result.ok).toBe(true)
  })
})

describe('the daily allowance', () => {
  it('allows the first question and counts down', () => {
    expect(allowanceFor(0)).toEqual({ allowed: true, left: MAX_QUESTIONS_PER_DAY })
    expect(allowanceFor(MAX_QUESTIONS_PER_DAY - 1)).toEqual({ allowed: true, left: 1 })
  })

  it('stops at the ceiling, and says why rather than just refusing', () => {
    const spent = allowanceFor(MAX_QUESTIONS_PER_DAY)
    expect(spent.allowed).toBe(false)
    if (!spent.allowed) expect(spent.message).toMatch(/zweiter Job/i)
  })

  it('cannot be talked past by an impossible count', () => {
    expect(allowanceFor(MAX_QUESTIONS_PER_DAY + 99).allowed).toBe(false)
  })
})

describe('what actually reaches the model', () => {
  it('refuses a mis-tap', () => {
    for (const raw of ['', ' ', 'a', 'ab', '  ?  ', null, 42, undefined, {}]) {
      expect(normaliseQuestion(raw)).toBeNull()
    }
  })

  it('collapses whitespace so a paste does not spend the budget on newlines', () => {
    expect(normaliseQuestion('  Warum   steht\n\ndas heute?  ')).toBe('Warum steht das heute?')
  })

  it('caps the length rather than refusing a long question', () => {
    const long = normaliseQuestion('Warum '.repeat(200))
    expect(long).not.toBeNull()
    expect(long!.length).toBeLessThanOrEqual(QUESTION_MAX_CHARS)
  })
})

describe('the openers', () => {
  it('always offers something to tap, even in an empty first week', () => {
    const empty = suggestionsFor({ todayTitles: [], missedDomains: [], hasWeekData: false })
    expect(empty.length).toBeGreaterThan(0)
  })

  it('names the actual action when there is one', () => {
    const [first] = suggestionsFor({
      todayTitles: ['Ganzkörper ohne Geräte'],
      missedDomains: [],
      hasWeekData: false,
    })
    expect(first.question).toContain('Ganzkörper ohne Geräte')
  })

  it('offers the make-good question only when something was missed', () => {
    const clean = suggestionsFor({ todayTitles: ['X'], missedDomains: [], hasWeekData: true })
    const missed = suggestionsFor({ todayTitles: ['X'], missedDomains: ['training'], hasWeekData: true })
    expect(clean.some((s) => /ausgefallen/.test(s.question))).toBe(false)
    expect(missed.some((s) => /ausgefallen/.test(s.question))).toBe(true)
  })

  it('never offers more than three', () => {
    const all = suggestionsFor({
      todayTitles: ['A', 'B', 'C'],
      missedDomains: ['training', 'nutrition'],
      hasWeekData: true,
    })
    expect(all.length).toBeLessThanOrEqual(3)
  })

  it('asks nothing that presumes failure', () => {
    // "Warum hast du das nicht geschafft?" is a question this app must never
    // put in somebody's mouth. Setbacks are a signal, not a charge.
    const all = suggestionsFor({
      todayTitles: ['A'],
      missedDomains: ['training'],
      hasWeekData: true,
    })
    for (const s of all) {
      expect(s.question).not.toMatch(/warum hast du|wieso hast du|nicht geschafft/i)
    }
  })
})

describe('what the model is shown', () => {
  const context: AskContext = {
    question: 'Warum steht heute Training?',
    goalText: 'Ich will endlich besser schlafen',
    archetype: 'sleep_recovery',
    today: '2026-09-09',
    todayItems: [
      {
        title: 'Ganzkörper ohne Geräte',
        domain: 'Training',
        minutes: 40,
        status: 'unknown',
        rationale: 'Mittwoch 19:30, nach deiner Vorlesung.',
      },
    ],
    weekShape: [{ date: 'Montag 2026-09-07', planned: 3, done: 2 }],
    completion: [{ domain: 'Schlaf', done: 4, resolved: 7 }],
    deviations: ['Mittwochs: 3 von 4 ausgefallen, sonst 10 %'],
    reasons: ['Zu müde — 3× bei Training'],
    rules: ['avoid_weekday'],
    notes: [{ date: '2026-09-08', text: 'war krank' }],
    history: [{ question: 'Wie läuft es?', answer: 'Vier von sieben.' }],
  }

  it('puts the question first, where a model will not lose it', () => {
    expect(askUserMessage(context).startsWith('Frage: Warum steht heute Training?')).toBe(true)
  })

  it('carries the reasoning the engine wrote, which is what "warum" asks about', () => {
    expect(askUserMessage(context)).toContain('Mittwoch 19:30, nach deiner Vorlesung.')
  })

  it('separates what the person said from what the app inferred', () => {
    const message = askUserMessage(context)
    expect(message).toContain('keine Vermutung')
    expect(message).toContain('Zu müde — 3× bei Training')
  })

  it('shows what was already answered today, so it does not repeat itself', () => {
    expect(askUserMessage(context)).toContain('Vier von sieben.')
  })

  it('says plainly that a rest day is a rest day', () => {
    // Without this the model sees an empty list and fills it in.
    const restDay = askUserMessage({ ...context, todayItems: [] })
    expect(restDay).toContain('Ruhetag')
  })

  it('leaves out every section it has nothing for', () => {
    const bare = askUserMessage({
      ...context,
      weekShape: [],
      completion: [],
      deviations: [],
      reasons: [],
      rules: [],
      notes: [],
      history: [],
    })
    expect(bare).not.toContain('keine Vermutung')
    expect(bare).not.toContain('Bestätigte persönliche Regeln')
    expect(bare).not.toContain('Eigene Notizen')
  })
})
