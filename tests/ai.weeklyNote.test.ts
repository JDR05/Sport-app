// The ongoing half of the AI, and the one rule that decides whether it is
// worth having.
//
// A weekly feature that must produce something every week produces filler in
// the weeks where nothing happened — "trink mehr Wasser", "bleib dran" — and
// filler is what turns a measuring instrument into a horoscope. Worse, it is
// exactly what a competitor with no data can also say, so it is the opposite
// of a differentiator.
//
// So two things are tested harder than the happy path: that generic advice is
// refused, and that saying nothing is a supported outcome.

import { describe, expect, it } from 'vitest'
import { checkWeeklyNote } from '@/lib/ai'
import { weeklyNoteSchema } from '@/lib/ai/schemas'
import { weeklyNoteUserMessage, type WeeklyNoteContext } from '@/lib/ai/tasks'
import type { WeeklyNote } from '@/lib/ai/schemas'

const good: WeeklyNote = {
  hasSomethingToSay: true,
  observation:
    'Deine drei ausgefallenen Aktionen liegen alle auf Tagen, an denen du "Rücken" notiert hast. ' +
    'Die restliche Woche ist vollständig.',
  // Deliberately phrased without a word from the RESTRICTIVE family. The rule
  // is a keyword scan and cannot read negation, so even "statt die Einheit zu
  // streichen" — advice *against* dropping it — trips additive_only. That false
  // positive costs one suppressed note; loosening the scan to allow negation
  // would let real "streich die Einheit" through. The blunt rule stays.
  suggestion:
    'Nimm für die nächste Woche an genau diesen Tagen die kurze Mobilisation dazu ' +
    'und leg die lange Einheit auf die Tage ohne Eintrag.',
  question: 'Ist der Rücken morgens schlimmer als abends?',
  basedOn: ['checkin.note.2026-09-03', 'item.abc'],
}

const note = (over: Partial<WeeklyNote>): WeeklyNote => ({ ...good, ...over })

describe('what it refuses to say', () => {
  it.each([
    ['Trink mehr Wasser, das hilft dir beim Abnehmen und ist ohnehin gesund.', 'not_generic'],
    ['Bleib dran, das wird schon — du hast diese Woche gute Ansätze gezeigt.', 'not_generic'],
    ['Schlaf ist wichtig für deine Regeneration, achte diese Woche darauf.', 'not_generic'],
    ['Du schaffst das, glaub an dich und mach einfach so weiter wie bisher.', 'not_generic'],
  ])('rejects generic advice: %s', (suggestion, rule) => {
    // If the sentence would also be true for a stranger, it is wrong here.
    expect(checkWeeklyNote(note({ suggestion })).map((v) => v.rule)).toContain(rule)
  })

  it.each([
    ['Du warst diese Woche schlicht faul und hast dich nicht gerissen.', 'no_verdict_on_the_person'],
    ['Das ist mangelnde Motivation, keine Frage der Umstände.', 'no_verdict_on_the_person'],
  ])('rejects a verdict on the person: %s', (observation, rule) => {
    // A missed day is a circumstance, not a character trait. The whole product
    // falls apart if the weekly note is where that promise breaks.
    expect(checkWeeklyNote(note({ observation })).map((v) => v.rule)).toContain(rule)
  })

  it('applies the same safety rules as a plan proposal', () => {
    // A note is text somebody acts on, so the rules cannot be softer here just
    // because it is not a plan item.
    expect(checkWeeklyNote(note({ suggestion: 'Verzichte nächste Woche abends auf Kohlenhydrate.' })).map((v) => v.rule))
      .toContain('additive_only')
    expect(checkWeeklyNote(note({ suggestion: 'Bleib bei 1400 kcal am Tag, dann klappt es.' })).map((v) => v.rule))
      .toContain('no_numeric_health_claims')
    expect(checkWeeklyNote(note({ suggestion: 'Steh früher auf zum Trainieren, dafür etwas weniger Schlaf.' })).map((v) => v.rule))
      .toContain('never_less_sleep')
    expect(checkWeeklyNote(note({ observation: 'Das klingt nach einer Krankheit, vermutlich Apnoe.' })).map((v) => v.rule))
      .toContain('no_medical_claims')
  })

  it('refuses a statement with nothing behind it', () => {
    // Principle 4, at the one place a model is most tempted to be confident
    // about a week it never read.
    expect(checkWeeklyNote(note({ basedOn: [] })).map((v) => v.rule)).toContain('must_cite_evidence')
  })

  it('refuses a fragment dressed up as an observation', () => {
    expect(checkWeeklyNote(note({ observation: 'Gute Woche.' })).map((v) => v.rule)).toContain('too_thin')
  })
})

describe('what it accepts', () => {
  it('accepts something only this person’s data could produce', () => {
    expect(checkWeeklyNote(good)).toEqual([])
  })

  it('treats silence as a complete answer, not as a failed one', () => {
    // The most important line in the feature. A quiet week gets no note, and
    // the checks do not then complain that the empty fields are too thin.
    const quiet: WeeklyNote = {
      hasSomethingToSay: false,
      observation: '',
      suggestion: '',
      question: null,
      basedOn: [],
    }
    expect(checkWeeklyNote(quiet)).toEqual([])
  })
})

describe('what the model is shown', () => {
  const context: WeeklyNoteContext = {
    goalText: 'Ich will endlich besser schlafen',
    archetype: 'sleep_recovery',
    weekStart: '2026-09-07',
    completion: [{ domain: 'Schlaf', done: 4, resolved: 7 }],
    deviations: ['Mittwochs: 3 von 4 ausgefallen, sonst 10 %'],
    strengths: ['Samstags: 5 von 5 umgesetzt'],
    rules: ['avoid_weekday'],
    reasons: ['Zu müde — 3× bei Training'],
    notes: [{ date: '2026-09-09', text: 'war krank, kaum geschlafen' }],
    occasion: null,
    previous: 'Letzte Woche lief der Abend besser als der Morgen.',
  }

  it('includes the free text, which is the entire reason this exists', () => {
    // Collected every day since the check-in shipped and read by nothing.
    // Without it the engine sees three missed actions and starts forming a
    // pattern about Wednesdays.
    const message = weeklyNoteUserMessage(context)
    expect(message).toContain('war krank, kaum geschlafen')
    expect(message).toContain('2026-09-09')
  })

  it('shows what the app already found, so the model adds instead of repeating', () => {
    const message = weeklyNoteUserMessage(context)
    expect(message).toContain('Mittwochs')
    expect(message).toContain('Samstags')
    expect(message).toContain('nicht wiederholen')
  })

  it('separates what the person said from what the app inferred', () => {
    // Both reach the model, and the model must not treat them as the same
    // kind of evidence: one is a statement, the other is a guess from a
    // calendar. If they arrive in one undifferentiated list, the guess borrows
    // the authority of the statement.
    const message = weeklyNoteUserMessage(context)
    expect(message).toContain('Zu müde — 3× bei Training')
    expect(message).toContain('keine Vermutung')
    expect(message.indexOf('Zu müde')).not.toBe(message.indexOf('Mittwochs'))
  })

  it('says nothing about reasons when nobody gave one', () => {
    const message = weeklyNoteUserMessage({ ...context, reasons: [] })
    expect(message).not.toContain('keine Vermutung')
  })

  it('puts the occasion first when there is one', () => {
    // An impulse triggered by three "zu müde" taps that then reviews the week
    // in general is the filler the whole feature is built to avoid. The
    // occasion leads, where a model will not lose it.
    const message = weeklyNoteUserMessage({
      ...context,
      occasion: 'Diese Woche 3× „Zu müde" bei Training — selbst angegeben, nicht abgeleitet.',
    })
    expect(message.startsWith('Anlass: Diese Woche 3×')).toBe(true)
    expect(message).toContain('zu genau diesem Anlass')
  })

  it('says nothing about an occasion on the ordinary weekly rhythm', () => {
    const message = weeklyNoteUserMessage(context)
    expect(message).not.toContain('Anlass')
  })

  it('shows last week, so it cannot say the same thing twice', () => {
    expect(weeklyNoteUserMessage(context)).toContain('Letzte Woche lief der Abend besser')
  })

  it('names the confirmed rules, so it does not propose what is already true', () => {
    expect(weeklyNoteUserMessage(context)).toContain('avoid_weekday')
  })

  it('says outright that silence is allowed', () => {
    expect(weeklyNoteUserMessage(context)).toContain('hasSomethingToSay auf false')
  })

  it('holds up when there is nothing to show', () => {
    const bare: WeeklyNoteContext = {
      ...context, completion: [], deviations: [], strengths: [], rules: [], notes: [], previous: null,
    }
    const message = weeklyNoteUserMessage(bare)
    expect(message).toContain('Keine eigenen Notizen')
    expect(message).toContain('nichts bewertet')
  })
})

describe('the schema', () => {
  it('rejects a note without the silence flag', () => {
    expect(weeklyNoteSchema.safeParse({ ...good, hasSomethingToSay: undefined }).success).toBe(false)
  })

  it('caps how much it may say', () => {
    // Two to three sentences. A weekly essay is a screen nobody reads.
    expect(weeklyNoteSchema.safeParse({ ...good, observation: 'x'.repeat(401) }).success).toBe(false)
  })
})
