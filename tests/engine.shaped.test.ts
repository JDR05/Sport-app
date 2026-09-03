// The model naming a session the archetype planned.
//
// The hole this closes was the whole of "die KI versteckt alles". A
// body-composition goal owns training, movement and nutrition — every domain a
// weight-loss proposal naturally lands in — so all three proposed actions on
// the real account, including "45 Minuten Krafttraining im Gym", were filtered
// out before they were ever placed. Insights listed them under "Was die KI
// beiträgt". The plan could not contain one of them, that week or any week.
//
// The fix is narrow on purpose, and these tests are the narrowness. The model
// may say **what** a planned session is; the engine keeps deciding **that**
// there is one, on which day, for how long. Every safety limit counts the same
// items in the same places as before — so the tests below are mostly about what
// shaping must leave alone.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { isAiAuthored, shapeOwnedDomains, unshape } from '@/lib/engine/proposed'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { AiProposal, PlannedItem, PlanInput, ProposedAction } from '@/lib/domain/types'

const GYM: ProposedAction = {
  title: '45 Minuten Krafttraining im Gym absolvieren',
  reasoning: 'Du hast angegeben, dass du gerne ins Gym gehst.',
  effect: 'Krafttraining hält im Defizit die Muskelmasse, sodass das Gewicht aus Fett kommt.',
  domain: 'training',
  minutes: 45,
  timesPerWeek: 2,
  preferredSlot: 'any',
}

const proposal = (actions: ProposedAction[]): AiProposal => ({
  headline: 'Dein Gym-Training',
  reasoning: 'Aus deinen Angaben abgeleitet.',
  mode: 'augment',
  actions,
})

/** A weight-loss goal: the archetype that owns every domain a proposal wants. */
function bodyComposition(withProposal: boolean): PlanInput {
  const base = makeInput(PROFILES[0], GOALS[0])
  return withProposal ? { ...base, aiProposal: proposal([GYM]) } : base
}

const session = (over: Partial<PlannedItem> = {}): PlannedItem => ({
  scheduledOn: '2026-08-17',
  domain: 'training',
  track: 'goal',
  title: 'Krafttraining Ganzkörper',
  plannedDurationMin: 45,
  timeSlot: 'evening',
  rationale: { text: 'Zwei Einheiten halten die Muskelmasse.', basedOn: ['profile.sport'] },
  details: {},
  ...over,
})

describe('the words change', () => {
  it('gives the archetype session the title the model wrote', () => {
    const { items, shaped } = shapeOwnedDomains([session()], [GYM], 'body_composition')
    expect(shaped).toBe(1)
    expect(items[0].title).toBe(GYM.title)
    expect(items[0].rationale.text).toBe(GYM.reasoning)
  })

  it("marks it as the model's, so every screen can say so", () => {
    const { items } = shapeOwnedDomains([session()], [GYM], 'body_composition')
    expect(isAiAuthored(items[0])).toBe(true)
    expect(items[0].details.effect).toBe(GYM.effect)
  })

  it('keeps what the archetype called it, whole', () => {
    // The evidence that the load is still the engine's, and what makes the
    // change reversible when somebody later asks for fewer sessions.
    const { items } = shapeOwnedDomains([session()], [GYM], 'body_composition')
    expect(items[0].details.plannedAs).toEqual({
      title: 'Krafttraining Ganzkörper',
      why: 'Zwei Einheiten halten die Muskelmasse.',
      basedOn: ['profile.sport'],
    })
  })

  it('goes back exactly, so a lowered count leaves nothing behind', () => {
    const before = session()
    const { items } = shapeOwnedDomains([before], [GYM], 'body_composition')
    expect(unshape(items[0])).toEqual(before)
  })

  it('leaves an item it never shaped alone', () => {
    const untouched = session({ details: { kind: 'ai_proposed' } })
    expect(unshape(untouched)).toEqual(untouched)
  })

  it('names both sources, because both are true of the item', () => {
    const { items } = shapeOwnedDomains([session()], [GYM], 'body_composition')
    expect(items[0].rationale.basedOn).toContain('profile.sport')
    expect(items[0].rationale.basedOn).toContain('ai.proposal')
  })
})

describe('nothing else changes', () => {
  const before = [session({ scheduledOn: '2026-08-17' }), session({ scheduledOn: '2026-08-20' })]
  const { items: after } = shapeOwnedDomains(before, [GYM], 'body_composition')

  it('leaves the day, the duration, the domain and the track alone', () => {
    // The reason every invariant still holds: the same items are still there,
    // in the same places, for the same length of time.
    for (const [i, item] of after.entries()) {
      expect(item.scheduledOn).toBe(before[i].scheduledOn)
      expect(item.plannedDurationMin).toBe(before[i].plannedDurationMin)
      expect(item.domain).toBe(before[i].domain)
      expect(item.track).toBe(before[i].track)
      expect(item.timeSlot).toBe(before[i].timeSlot)
    }
  })

  it('adds nothing and removes nothing', () => {
    expect(after).toHaveLength(before.length)
  })

  it("takes the archetype's duration, never the model's", () => {
    const longer = { ...GYM, minutes: 120 }
    const { items } = shapeOwnedDomains([session({ plannedDurationMin: 45 })], [longer], 'body_composition')
    expect(items[0].plannedDurationMin).toBe(45)
  })

  it('stops at the number of sessions the model asked for', () => {
    const once = { ...GYM, timesPerWeek: 1 }
    const { items, shaped } = shapeOwnedDomains([session(), session()], [once], 'body_composition')
    expect(shaped).toBe(1)
    expect(items[1].title).toBe('Krafttraining Ganzkörper')
  })
})

describe('what may never be renamed', () => {
  it('leaves a standing rule alone', () => {
    // A daily rule is not a session. Renaming "Eiweiß zu jeder Mahlzeit" into
    // a cooking action would turn a rule the person holds every day into an
    // appointment they can miss.
    const rule = session({ domain: 'nutrition', cadence: 'daily', plannedDurationMin: 30 })
    const cook = { ...GYM, domain: 'nutrition' as const, title: 'Kochen' }
    expect(shapeOwnedDomains([rule], [cook], 'body_composition').shaped).toBe(0)
  })

  it('leaves an item that carries a value alone', () => {
    // The calorie corridor has no duration, and its title is a number safety
    // depends on. The model may name a session; it may never rewrite a value.
    const corridor = session({
      domain: 'nutrition',
      title: '1900 kcal Zielkorridor',
      plannedDurationMin: null,
    })
    const cook = { ...GYM, domain: 'nutrition' as const, title: 'Kochen' }
    const { items, shaped } = shapeOwnedDomains([corridor], [cook], 'body_composition')
    expect(shaped).toBe(0)
    expect(items[0].title).toBe('1900 kcal Zielkorridor')
  })

  it('leaves the health baseline alone', () => {
    // The baseline is the floor that runs under every goal. It is not the
    // goal track and is not the model's to rewrite.
    const base = session({ track: 'baseline' })
    expect(shapeOwnedDomains([base], [GYM], 'body_composition').shaped).toBe(0)
  })

  it('does not shape an action the model already added', () => {
    const added = session({ details: { kind: 'ai_proposed' } })
    expect(shapeOwnedDomains([added], [GYM], 'body_composition').shaped).toBe(0)
  })

  it('does not shape twice', () => {
    const { items } = shapeOwnedDomains([session()], [GYM], 'body_composition')
    expect(shapeOwnedDomains(items, [GYM], 'body_composition').shaped).toBe(0)
  })

  it('stays out of a domain the archetype does not own', () => {
    // Those are placed as actions of their own. Shaping there would silently
    // swallow an action the model was allowed to add.
    const mind = session({ domain: 'self_improvement' })
    const action = { ...GYM, domain: 'self_improvement' as const }
    expect(shapeOwnedDomains([mind], [action], 'body_composition').shaped).toBe(0)
  })
})

describe('the whole plan, with and without the model', () => {
  it('reaches a weight-loss plan, which it could not before', () => {
    const plan = generatePlan(bodyComposition(true))
    const authored = plan.items.filter(isAiAuthored)
    expect(authored.length).toBeGreaterThan(0)
    expect(authored.some((i) => i.title.includes('Gym'))).toBe(true)
  })

  it('changes no structure at all — same days, same load', () => {
    // The strongest statement this design can make. If the shaped plan and the
    // plain one differ anywhere but in words, a limit was moved.
    const plain = generatePlan(bodyComposition(false)).items
    const shaped = generatePlan(bodyComposition(true)).items

    const structure = (items: PlannedItem[]) =>
      items
        .map((i) => `${i.scheduledOn}|${i.domain}|${i.track}|${i.plannedDurationMin}|${i.timeSlot}`)
        .sort()

    expect(structure(shaped)).toEqual(structure(plain))
  })

  it('still passes every safety invariant', () => {
    const input = bodyComposition(true)
    expect(() => assertPlanInvariants(generatePlan(input), input)).not.toThrow()
  })
})
