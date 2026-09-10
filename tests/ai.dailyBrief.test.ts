// The one AI output that runs every day, and the one that changes something.
//
// Two failure modes are specific to it and are what this file is mostly about.
//
// The first is filler. A card that appears every morning with something clever
// to say is a horoscope, and one empty sentence is enough for somebody to stop
// reading the next thirty — so `hasSomethingToSay: false` has to be a
// first-class outcome and the generic families have to bite here exactly as
// hard as they do on the weekly note.
//
// The second is new. Every other output in this product is prose next to a
// button that does nothing until it is tapped; this one describes a change to
// somebody's day. A model that writes "ich habe es auf mittags gelegt" has
// described a world that does not exist yet — they read it, believe the day is
// rearranged, and do not tap.

import { describe, expect, it } from 'vitest'
import { checkDailyBrief } from '@/lib/ai'
import { dailyBriefSchema } from '@/lib/ai/schemas'
import { dailyBriefTask, dailyBriefUserMessage, type DailyBriefContext } from '@/lib/ai/tasks'
import type { DailyBrief } from '@/lib/ai/schemas'

const good: DailyBrief = {
  hasSomethingToSay: true,
  focusItemId: 'a1',
  line: 'Die Einheit am Abend ist dreimal hintereinander ausgefallen, heute steht sie wieder abends.',
  adjust: {
    itemId: 'a1',
    kind: 'move',
    toSlot: 'midday',
    reason: 'Mittags hast du diese Woche zweimal trainiert, abends keinmal.',
  },
  basedOn: ['item.2026-09-08.training', 'checkin.2026-09-09.energy'],
}

const brief = (over: Partial<DailyBrief>): DailyBrief => ({ ...good, ...over })

describe('what it refuses to say', () => {
  it.each([
    ['Bleib dran, das wird schon, du schaffst das mit der Zeit bestimmt.', 'not_generic'],
    ['Steh morgen eine Stunde früher auf, dann passt das Training in den Tag.', 'never_less_sleep'],
    ['Verzichte heute auf Kohlenhydrate, dann läuft die Einheit leichter.', 'additive_only'],
    ['Du warst diese Woche ziemlich undiszipliniert, das musst du ändern.', 'no_verdict_on_the_person'],
  ])('refuses %s', (line, rule) => {
    const rules = checkDailyBrief(brief({ line })).map((v) => v.rule)
    expect(rules).toContain(rule)
  })

  it('refuses a reason that claims the change has already happened', () => {
    // The whole point of the card is that the change happens on a tap. A
    // reason in the past tense is the app lying about the one kind of fact it
    // exists to keep straight.
    const rules = checkDailyBrief(
      brief({
        adjust: { ...good.adjust!, reason: 'Ich habe die Einheit auf mittags verschoben.' },
      }),
    ).map((v) => v.rule)
    expect(rules).toContain('claims_an_action_it_did_not_take')
  })

  it('refuses a sentence with nothing behind it', () => {
    const rules = checkDailyBrief(brief({ basedOn: [] })).map((v) => v.rule)
    expect(rules).toContain('must_cite_evidence')
  })

  it('refuses a fragment', () => {
    const rules = checkDailyBrief(brief({ line: 'Heute Training.' })).map((v) => v.rule)
    expect(rules).toContain('too_thin')
  })

  it('refuses a move with no destination rather than guessing one', () => {
    const rules = checkDailyBrief(
      brief({ adjust: { ...good.adjust!, toSlot: null } }),
    ).map((v) => v.rule)
    expect(rules).toContain('move_without_slot')
  })

  it('refuses a reason that only repeats the line', () => {
    // One thought and two fields to fill. The card then costs twice the
    // attention for one idea.
    const rules = checkDailyBrief(
      brief({ adjust: { ...good.adjust!, reason: good.line } }),
    ).map((v) => v.rule)
    expect(rules).toContain('reason_repeats_line')
  })

  it('sees through punctuation and case when comparing the two', () => {
    const rules = checkDailyBrief(
      brief({ adjust: { ...good.adjust!, reason: good.line.toUpperCase().replace(/,/g, '') } }),
    ).map((v) => v.rule)
    expect(rules).toContain('reason_repeats_line')
  })
})

describe('saying nothing', () => {
  it('is a clean outcome, not a violation', () => {
    // The expected answer on an ordinary day. Nothing is checked because
    // nothing is claimed.
    const silent: DailyBrief = {
      hasSomethingToSay: false,
      focusItemId: null,
      line: '',
      adjust: null,
      basedOn: [],
    }
    expect(checkDailyBrief(silent)).toEqual([])
    expect(dailyBriefTask.parse(silent)).toEqual({ ok: true, value: silent })
  })
})

describe('the shape the schema will accept', () => {
  it('takes the good one', () => {
    expect(dailyBriefSchema.safeParse(good).success).toBe(true)
    expect(dailyBriefTask.parse(good)).toEqual({ ok: true, value: good })
  })

  it.each(['add', 'extend', 'harder', 'reschedule'])(
    'has no vocabulary for %s',
    (kind) => {
      // The vocabulary is capped at move and drop because every other verb
      // raises load, and load is what the archetype limits are drawn around.
      // A model that can only shrink or reshuffle a day cannot talk anybody
      // into overtraining, whatever it believes.
      const parsed = dailyBriefSchema.safeParse({
        ...good,
        adjust: { ...good.adjust, kind },
      })
      expect(parsed.success).toBe(false)
    },
  )

  it('has no vocabulary for a slot that is another day', () => {
    const parsed = dailyBriefSchema.safeParse({
      ...good,
      adjust: { ...good.adjust, toSlot: 'tomorrow' },
    })
    expect(parsed.success).toBe(false)
  })

  it('reports an unusable answer rather than throwing', () => {
    expect(dailyBriefTask.parse({ line: 'nur ein Satz' })).toMatchObject({ ok: false })
    expect(dailyBriefTask.parse('nicht mal JSON-Objekt')).toMatchObject({ ok: false })
  })

  it('marks a safety failure as implausible, not as a bad shape', () => {
    // The two are handled differently upstream: a bad shape is a provider
    // problem worth retrying, a refused answer is not.
    const result = dailyBriefTask.parse(
      brief({ line: 'Schlaf heute eine Stunde weniger, dann bekommst du beides unter.' }),
    )
    expect(result).toMatchObject({ ok: false, implausible: true })
  })
})

const context: DailyBriefContext = {
  goalText: 'Ich will regelmäßiger trainieren',
  archetype: 'strength',
  today: '2026-09-10',
  weekday: 'Donnerstag',
  items: [
    { id: 'a1', title: 'Ganzkörper, 40 min', domain: 'Training', track: 'goal', slot: 'evening', durationMin: 40 },
    { id: 'b7', title: '20 Minuten gehen', domain: 'Bewegung', track: 'baseline', slot: null, durationMin: 20 },
  ],
  availableSlots: ['midday', 'evening'],
  recent: [
    { date: '2026-09-08', weekday: 'Dienstag', title: 'Ganzkörper, 40 min', domain: 'Training', status: 'missed', reason: 'zu müde' },
  ],
  checkIns: [
    { date: '2026-09-09', energy: 2, stress: 4, sleepHours: 5.5, note: 'lange gearbeitet' },
  ],
  rules: ['prefers_midday'],
  commitments: ['Fußballtraining, 19:00, 90 min'],
  previous: 'Gestern war der Tag schon voll, bevor du angefangen hast.',
}

describe('what the model is told', () => {
  const message = dailyBriefUserMessage(context)

  it('hands over the ids it is allowed to name', () => {
    // Without them every adjustment would be a guess at a uuid, and the gate
    // would refuse all of them.
    expect(message).toContain('a1:')
    expect(message).toContain('b7:')
  })

  it('says which parts of the day this person actually has', () => {
    // The reason a move can be checked at all. Without it the model reasons
    // about early/midday/evening as if everybody had all three.
    expect(message).toMatch(/Tageszeiten.*mittags, abends/)
    expect(message).not.toMatch(/Tageszeiten.*frueh/)
  })

  it("carries the person's own words about a missed action", () => {
    expect(message).toContain('zu müde')
  })

  it('carries the check-in note, which nothing else on that screen reads', () => {
    expect(message).toContain('lange gearbeitet')
  })

  it('names the fixed appointment, so a move does not land on top of it', () => {
    expect(message).toContain('Fußballtraining')
  })

  it('repeats yesterday and asks for something else', () => {
    expect(message).toContain('Gestern stand hier')
  })

  it('offers silence as the way out', () => {
    expect(message).toMatch(/hasSomethingToSay auf false/)
  })

  it('says nothing about a day with no outcomes rather than inventing a summary', () => {
    const empty = dailyBriefUserMessage({ ...context, recent: [], checkIns: [] })
    expect(empty).toContain('In den letzten sieben Tagen wurde nichts bewertet.')
    expect(empty).not.toContain('Check-ins der letzten Tage')
  })
})
