// A plan is more than sport, and it says what it is for.
//
// Two complaints from the product owner, and they are the same complaint:
//
//   "Wenn ich Yoga machen will oder Meditation … solche Sachen können dann an
//    diesen anderen Tagen eingefügt werden … das ist ja nicht richtig Sport."
//
//   "Es soll sich erklären … auch biologische Ansätze erklären, warum man das
//    macht. Sonst wirkt das wirklich wie jede zweite KI App."
//
// One is about what a plan may contain, the other about whether it explains
// itself. Both decide whether this is a companion or a list of instructions.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { checkProposal } from '@/lib/ai'
import { proposedActionSchema } from '@/lib/ai/schemas'
import { buildContext } from '@/lib/engine/context'
import { MIN_LIGHT_MINUTES } from '@/lib/engine/constants'
import { PROFILES, GOALS, makeInput } from './fixtures/profiles'
import type { AiProposal, Commitment, PlanInput, ProposedAction } from '@/lib/domain/types'

const FOOTBALL: Commitment[] = ['tue', 'thu'].map((weekday) => ({
  label: 'Fußballtraining',
  weekday: weekday as Commitment['weekday'],
  start: '19:00',
  minutes: 90,
  kind: 'sport',
  activity: 'football',
}))

const MEDITATION: ProposedAction = {
  title: 'Vor dem Schlafen fünf Minuten ruhig atmen',
  reasoning: 'Du hast angegeben, dass du abends schlecht abschaltest.',
  effect:
    'Langsames Ausatmen verlängert die Ausatemphase gegenüber der Einatmung, was den ' +
    'Puls senkt und den Übergang in den Schlaf erleichtert.',
  domain: 'self_improvement',
  minutes: 5,
  timesPerWeek: 5,
  preferredSlot: 'evening',
}

const READING: ProposedAction = {
  ...MEDITATION,
  title: 'Zehn Seiten lesen statt Handy',
  domain: 'sleep',
  minutes: 15,
  timesPerWeek: 4,
}

function withProposal(base: PlanInput, actions: ProposedAction[], commitments: Commitment[]) {
  const proposal: AiProposal = {
    headline: 'Drei Anker für deinen Abend',
    reasoning: 'Aus deinen Angaben zum Abend abgeleitet.',
    mode: 'augment',
    actions,
  }
  return {
    ...base,
    schedule: { ...base.schedule, commitments },
    aiProposal: proposal,
  }
}

describe('the quiet things fit on a day that already has sport', () => {
  // This is the whole ask. A five-minute breathing exercise is not load, so
  // the rest-day and recovery rules that keep a second session off football
  // Tuesday have no business keeping this off it too.
  it('places a short mind action on a football day', () => {
    const input = withProposal(makeInput(PROFILES[0], GOALS[0]), [MEDITATION], FOOTBALL)
    const plan = generatePlan(input)

    const days = plan.items
      .filter((i) => i.title === MEDITATION.title)
      .map((i) => new Date(`${i.scheduledOn}T00:00:00Z`).getUTCDay())

    expect(days.length).toBeGreaterThan(0)
    // 2 = Tuesday, 4 = Thursday: the two days football is on.
    expect(days.some((d) => d === 2 || d === 4)).toBe(true)
  })

  it('still keeps a real session off it', () => {
    // The rule that must not be lost in widening the other one: football
    // Tuesday does not need a second training session on top.
    const session: ProposedAction = {
      ...MEDITATION,
      title: 'Ganzkörper ohne Geräte',
      domain: 'training',
      minutes: 40,
      timesPerWeek: 3,
    }
    const input = withProposal(makeInput(PROFILES[0], GOALS[0]), [session], FOOTBALL)
    const plan = generatePlan(input)

    const sessionDays = plan.items
      .filter((i) => i.title === session.title)
      .map((i) => new Date(`${i.scheduledOn}T00:00:00Z`).getUTCDay())

    expect(sessionDays).not.toContain(2)
    expect(sessionDays).not.toContain(4)
  })

  it('carries the explanation onto the action itself', () => {
    const input = withProposal(makeInput(PROFILES[0], GOALS[0]), [MEDITATION], FOOTBALL)
    const plan = generatePlan(input)

    const item = plan.items.find((i) => i.title === MEDITATION.title)
    expect(item).toBeDefined()
    expect((item!.details as Record<string, unknown>).effect).toBe(MEDITATION.effect)
  })

  it('plans a week that still holds together with both kinds in it', () => {
    // The invariants are the real test here: a plan that puts mind actions
    // everywhere must not breach the per-day ceiling or the rest days.
    for (const profile of PROFILES.slice(0, 5)) {
      const input = withProposal(makeInput(profile, GOALS[0]), [MEDITATION, READING], FOOTBALL)
      expect(() => generatePlan(input), profile.name).not.toThrow()
    }
  })
})

describe('the explanation is optional, and old plans keep working', () => {
  it('accepts an action with no explanation at all', () => {
    // Proposals written before `effect` existed are stored in goals.ai_proposal
    // and must keep parsing. A missing sentence is not a broken plan.
    const without = { ...MEDITATION, effect: undefined }
    expect(proposedActionSchema.safeParse(without).success).toBe(true)
    expect(proposedActionSchema.safeParse({ ...without, effect: null }).success).toBe(true)
  })

  it('plans the same week with or without it', () => {
    const without = { ...MEDITATION, effect: undefined }
    const base = makeInput(PROFILES[0], GOALS[0])
    const withIt = generatePlan(withProposal(base, [MEDITATION], FOOTBALL))
    const withoutIt = generatePlan(withProposal(base, [without], FOOTBALL))

    expect(withIt.items.map((i) => `${i.scheduledOn} ${i.title}`)).toEqual(
      withoutIt.items.map((i) => `${i.scheduledOn} ${i.title}`),
    )
  })
})

describe('a mechanism is not a promise', () => {
  const proposal = (effect: string) => ({
    headline: 'Ein Plan für dich',
    reasoning: 'Aus deinen Angaben abgeleitet.',
    actions: [{ title: 'Aktion', reasoning: 'Aus deinen Angaben.', effect, minutes: 10, timesPerWeek: 3 }],
  })

  it.each([
    ['an outcome promised to this person', 'Das verbessert deinen Schlaf.'],
    ['a bodily guarantee', 'Das senkt deinen Blutdruck.'],
    ['a prediction', 'Du wirst in zwei Wochen deutlich besser schlafen.'],
    ['a certainty', 'Das wirkt garantiert.'],
  ])('refuses %s', (_case, effect) => {
    // CLAUDE.md forbids presenting results as certain, and an explanatory
    // sentence is exactly where that slips in unnoticed — it sounds like
    // teaching rather than claiming.
    expect(checkProposal(proposal(effect)).map((v) => v.rule)).toContain(
      'no_promise_about_this_person',
    )
  })

  it.each([
    ['a general mechanism', 'Langsames Ausatmen senkt die Herzfrequenz und erleichtert das Einschlafen.'],
    ['a behavioural one', 'Eine vorab getroffene Entscheidung spart den Moment, in dem man sich neu entscheiden muss.'],
    ['one about bodies in general', 'Regelmäßige Bewegung verbessert die Schlaftiefe.'],
    ['a plain description', 'Zehn Minuten ohne Bildschirm machen den Übergang in den Abend ruhiger.'],
  ])('allows %s', (_case, effect) => {
    expect(checkProposal(proposal(effect))).toEqual([])
  })

  it('runs the explanation through every other family too', () => {
    // The field most likely to drift into a health claim is the one that
    // exists to explain a mechanism. It is not trusted because it sounds
    // educational.
    expect(checkProposal(proposal('Das heilt eine Entzündung im Darm.')).length).toBeGreaterThan(0)
    expect(checkProposal(proposal('Dafür musst du auf Kohlenhydrate verzichten.')).length)
      .toBeGreaterThan(0)
  })
})

describe('the night is not five minutes of free time either', () => {
  // The one place this widening could have gone wrong. Making short actions
  // fit into small gaps means measuring the week against a five-minute floor
  // — and the gap between a late commitment and an early alarm is not a gap,
  // it is the night. Carving breathing exercises out of it would be the app
  // recommending less sleep, which CLAUDE.md forbids outright.
  //
  // The case is the product owner's own: football until nine on Tuesday, up at
  // five on Wednesday.
  const lateFootball: Commitment = {
    label: 'Fußballtraining',
    weekday: 'tue',
    start: '19:00',
    minutes: 120,
    kind: 'sport',
    activity: 'football',
  }

  const base = makeInput(PROFILES[0], GOALS[0])
  const input: PlanInput = {
    ...base,
    schedule: {
      ...base.schedule,
      commitments: [lateFootball],
      wakeTimes: { ...base.schedule.wakeTimes, wed: '05:00' },
      // The evening *after* football, which is the night rather than free
      // time: 21:00 to 23:00, with the alarm at five.
      freeSlots: [
        { weekday: 'tue', start: '21:00', minutes: 120 },
        { weekday: 'sat', start: '10:00', minutes: 120 },
      ],
    },
  }

  it('leaves no room on the protected evening, at any floor', () => {
    const ctx = buildContext(input)
    expect(ctx.roomPerDay.tue).toBe(0)
  })

  it('still finds the ordinary evenings', () => {
    // The control: without it, a rule that zeroed every day would pass the
    // assertion above and silently empty the week.
    const ctx = buildContext(input)
    expect(ctx.roomPerDay.sat).toBeGreaterThanOrEqual(MIN_LIGHT_MINUTES)
  })

  it('puts nothing into it that costs time, however short', () => {
    const plan = generatePlan({
      ...input,
      aiProposal: {
        headline: 'Ein Anker für den Abend',
        reasoning: 'Aus deinen Angaben abgeleitet.',
        mode: 'augment',
        actions: [{ ...MEDITATION, minutes: MIN_LIGHT_MINUTES, timesPerWeek: 5 }],
      },
    })

    // Anything with minutes on it occupies part of an evening, and this
    // evening is the night. A step count is not that — it is a standing rule
    // over the whole day with no slot and no duration — so it may stay.
    const onTuesday = plan.items.filter(
      (i) =>
        new Date(`${i.scheduledOn}T00:00:00Z`).getUTCDay() === 2 &&
        (i.plannedDurationMin ?? 0) > 0,
    )
    expect(onTuesday).toEqual([])
  })
})
