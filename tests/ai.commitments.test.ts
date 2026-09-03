// What somebody's own training is worth, judged rather than looked up.
//
// The engine decided this with a hardcoded list — gym, bodyweight and climbing
// were "strength", running, cycling and swimming were "endurance". Plausible
// for an average and generic for everybody, which is what the product owner
// finally said out loud: "Personalisiert ist das Stichwort. Es ist alles zu
// generisch." CLAUDE.md now forbids the shape outright.
//
// The tests that matter here are the two boundaries. The judgement must be
// able to overrule the table — otherwise nothing changed — and it must not be
// able to move a safety limit, because a model deciding that five club
// evenings leave room for three more sessions is the failure this whole
// architecture is built to prevent.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { goalSessions } from '@/lib/engine/commitments'
import { ENDURANCE_ACTIVITIES, STRENGTH_ACTIVITIES } from '@/lib/engine/constants'
import { checkCommitmentInsights } from '@/lib/ai/validate'
import { commitmentsTask, commitmentsUserMessage, type CommitmentsContext } from '@/lib/ai/tasks'
import {
  commitmentsSignature, readCommitmentInsights,
} from '@/lib/domain/commitmentInsights'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { Commitment, CommitmentInsight, PlanInput } from '@/lib/domain/types'

const swim: Commitment = {
  label: 'Schwimmtraining',
  weekday: 'tue',
  start: '19:00',
  minutes: 90,
  kind: 'sport',
  activity: 'swimming',
}
const football: Commitment = { ...swim, label: 'Fußballtraining', activity: 'football' }

const says = (label: string, doesGoalWork: boolean): CommitmentInsight => ({
  label,
  doesGoalWork,
  note: 'Eine Einschätzung, lang genug für das Schema und dieses Ziel.',
})

describe('the judgement decides, the table only fills in', () => {
  it('overrules a table that says the sport does not count', () => {
    // Swimming is not on the strength list. For somebody whose sessions are in
    // the pool with paddles, it may well be the strength work — and that is an
    // assessment, not a property of the word "swimming".
    expect(goalSessions([swim], STRENGTH_ACTIVITIES)).toBe(0)
    expect(goalSessions([swim], STRENGTH_ACTIVITIES, [says('Schwimmtraining', true)])).toBe(1)
  })

  it('overrules a table that says it does', () => {
    expect(goalSessions([swim], ENDURANCE_ACTIVITIES)).toBe(1)
    expect(goalSessions([swim], ENDURANCE_ACTIVITIES, [says('Schwimmtraining', false)])).toBe(0)
  })

  it('falls back to the table for anything it did not judge', () => {
    // A partial answer must not silently zero the rest of the week.
    const week = [swim, { ...football, weekday: 'thu' as const }]
    expect(goalSessions(week, ENDURANCE_ACTIVITIES, [says('Fußballtraining', true)])).toBe(2)
  })

  it('ignores a judgement about something that is not sport', () => {
    const shift: Commitment = { ...swim, label: 'Spätschicht', kind: 'work', activity: null }
    expect(goalSessions([shift], STRENGTH_ACTIVITIES, [says('Spätschicht', true)])).toBe(0)
  })

  it('still counts days rather than entries', () => {
    const twice = [swim, { ...swim, start: '07:00' }]
    expect(goalSessions(twice, STRENGTH_ACTIVITIES, [says('Schwimmtraining', true)])).toBe(1)
  })
})

describe('a judgement cannot move a safety limit', () => {
  const everyDay: Commitment[] = (['mon', 'tue', 'wed', 'thu', 'fri'] as const).map((weekday) => ({
    ...football,
    weekday,
  }))

  it('cannot buy extra training days by declaring the week irrelevant', () => {
    // The dangerous direction. "None of this counts" would, if the rest-day
    // budget listened to it, licence five club evenings plus three sessions.
    // Load is counted from the commitments themselves and stays in code.
    const base = makeInput(PROFILES[0], GOALS[1])
    const input: PlanInput = {
      ...base,
      schedule: { ...base.schedule, commitments: everyDay },
      commitmentInsights: everyDay.map((c) => says(c.label, false)),
    }

    const plan = generatePlan(input)
    const trainingDays = new Set(
      plan.items.filter((i) => i.domain === 'training').map((i) => i.scheduledOn),
    )
    // Five days are already taken; the rest-day rule leaves no sixth.
    expect(trainingDays.size).toBe(0)
  })

  it('produces a usable plan anyway, rather than throwing', () => {
    for (const goal of GOALS.slice(0, 3)) {
      const base = makeInput(PROFILES[0], goal)
      expect(() =>
        generatePlan({
          ...base,
          schedule: { ...base.schedule, commitments: everyDay },
          commitmentInsights: everyDay.map((c) => says(c.label, false)),
        }),
        goal.name,
      ).not.toThrow()
    }
  })
})

describe('what the model may say about somebody’s training', () => {
  const insights = (note: string) => ({ insights: [{ label: 'Fußballtraining', doesGoalWork: false, note }] })

  it.each([
    ['a promise about their body', 'Das macht dich schneller und ausdauernder.', 'no_promise_about_this_person'],
    ['a verdict', 'Zweimal die Woche ist zu wenig, da fehlt dir die Disziplin.', 'no_verdict_on_the_person'],
    ['a diagnosis', 'Die Schmerzen danach klingen nach einer Entzündung.', 'no_medical_claims'],
    ['filler', 'Hör einfach auf deinen Körper.', 'not_generic'],
    ['less sleep', 'Steh am Spieltag eine Stunde früher auf.', 'never_less_sleep'],
    ['a calorie number', 'Iss danach 800 kcal extra.', 'no_numeric_health_claims'],
  ])('refuses %s', (_case, note, rule) => {
    expect(checkCommitmentInsights(insights(note)).map((v) => v.rule)).toContain(rule)
  })

  it.each([
    ['a plain observation that is not a promise', 'Das Spiel macht dich müde — leg die Krafteinheit nicht auf den Tag danach.'],
    ['ordinary soreness, named without diagnosing it', 'Die Schmerzen danach sind normal nach einem intensiven Spiel.'],
    ['what a sport does and does not load', 'Klettern belastet Rücken und Griffkraft stark, Beine kaum.'],
    ['saying what it does not replace', 'Fußball hält deine Grundlagenausdauer hoch, ersetzt aber kein Krafttraining für die Beine.'],
    ['a concrete suggestion', 'Leg die Krafteinheit nicht auf den Tag danach — die Beine sind vom Spiel schon vorbelastet.'],
    ['a mechanism', 'Die Sprints im Spiel trainieren genau die schnellen Fasern, die dein Ziel braucht.'],
    ['a plain fact about the week', 'Zweimal 90 Minuten sind ein guter Ausdaueranteil für deine Woche.'],
  ])('allows %s', (_case, note) => {
    expect(checkCommitmentInsights(insights(note))).toEqual([])
  })

  it('refuses a judgement about a commitment the person does not have', () => {
    // Matched against the real week by label, so an invented one either does
    // nothing or shadows a real entry.
    const violations = checkCommitmentInsights(insights('Ein Satz über ein Training, das es gibt.'), [
      'Schwimmtraining',
    ])
    expect(violations.map((v) => v.rule)).toContain('unknown_commitment')
  })

  it('refuses two judgements about the same one', () => {
    const twice = {
      insights: [
        { label: 'Fußballtraining', doesGoalWork: true, note: 'Ein Satz über dieses Training.' },
        { label: 'Fußballtraining', doesGoalWork: false, note: 'Ein anderer Satz darüber.' },
      ],
    }
    expect(checkCommitmentInsights(twice).map((v) => v.rule)).toContain('duplicate_commitment')
  })

  it('lets a good answer through the whole task', () => {
    const result = commitmentsTask(['Fußballtraining']).parse({
      insights: [
        {
          label: 'Fußballtraining',
          doesGoalWork: false,
          note: 'Fußball hält deine Ausdauer hoch, ersetzt aber kein Krafttraining für die Beine.',
        },
      ],
    })
    expect(result.ok).toBe(true)
  })
})

describe('what the model is shown', () => {
  const context: CommitmentsContext = {
    goalText: 'Ich will stärker werden',
    archetype: 'strength',
    planWouldPlan: 'Krafteinheiten nach Muskelgruppen',
    experience: 'intermediate',
    commitments: [
      { label: 'Fußballtraining', weekday: 'Dienstag', minutes: 90, activity: 'football' },
    ],
    disliked: ['running'],
  }

  it('says what the plan would otherwise do, so there is something to compare against', () => {
    // Without it, "does this replace a session" has no session in it.
    expect(commitmentsUserMessage(context)).toContain('Krafteinheiten nach Muskelgruppen')
  })

  it('names the training, the day and the sport', () => {
    const message = commitmentsUserMessage(context)
    expect(message).toContain('Fußballtraining')
    expect(message).toContain('Dienstag')
    expect(message).toContain('football')
  })

  it('leaves out what it has nothing for', () => {
    expect(commitmentsUserMessage({ ...context, disliked: [] })).not.toContain('Mag er nicht')
  })
})

describe('a judgement stops applying when the week changes', () => {
  it('changes signature when a commitment is added, removed or moved', () => {
    const base = [football]
    expect(commitmentsSignature(base)).toBe(commitmentsSignature([...base]))
    expect(commitmentsSignature(base)).not.toBe(commitmentsSignature([football, swim]))
    expect(commitmentsSignature(base)).not.toBe(
      commitmentsSignature([{ ...football, weekday: 'wed' }]),
    )
    expect(commitmentsSignature(base)).not.toBe(
      commitmentsSignature([{ ...football, minutes: 60 }]),
    )
  })

  it('does not change when the same week is merely reordered', () => {
    // Reordering is not a change, and re-asking for it would spend a model
    // call and replace a good answer with a different good answer.
    expect(commitmentsSignature([football, swim])).toBe(commitmentsSignature([swim, football]))
  })

  it('drops a stored judgement that does not parse rather than guessing', () => {
    expect(readCommitmentInsights('nonsense')).toEqual([])
    expect(readCommitmentInsights([{ label: 'X' }])).toEqual([])
    expect(readCommitmentInsights([says('Fußballtraining', true)])).toHaveLength(1)
  })
})
