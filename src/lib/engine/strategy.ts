// Assembles a week plan from the two tracks.
//
// The orchestrator owns nothing goal-specific: it builds the shared context,
// asks the archetype for the goal track, asks the baseline for what should run
// underneath, and enforces the one rule that spans both — the baseline may never
// crowd the goal track out of the day.

import { MAX_ITEMS_PER_DAY, MAX_WEEKLY_EXERTION_MIN } from './constants'
import { isExertion, weeklyMinutes } from './safety'
import { buildContext, type PlanContext } from './context'
import { planBaseline } from './baseline'
import { strategyFor } from './archetypes'
import { isOpenDomain, MAX_AUGMENT_ACTIONS, scheduleProposed, trainingDaysOf } from './proposed'
import type {
  Assumption, BaselineTrack, GoalTrack, PlanDomain, PlanInput, PlannedItem, Rationale,
  WeekStrategy,
} from '@/lib/domain/types'

export type StrategyResult = {
  strategy: WeekStrategy
  items: PlannedItem[]
  assumptions: Assumption[]
  rationale: Rationale[]
}

export function buildStrategy(input: PlanInput): StrategyResult {
  const ctx: PlanContext = buildContext(input)
  const archetype = strategyFor(input.goal.archetype)

  const planned = archetype.planGoalTrack(ctx)
  const goalTrack = withProposed(ctx, planned)
  const clamped = archetype.clampGoal(ctx)
  const baseline = thinLightDomains(ctx, planBaseline(ctx, goalTrack))
  const trimmed = withinExertionCeiling(goalTrack, baseline)

  const items = capPerDay([...trimmed.items, ...baseline.items])

  const strategy: WeekStrategy = {
    weekStart: ctx.weekStart,
    archetype: goalTrack.archetype,
    targetDate: clamped.targetDate,
    targetDateAdjusted: clamped.adjusted,
    goalTrack: trimmed,
    baseline,
  }

  return { strategy, items, assumptions: ctx.assumptions, rationale: ctx.rationale }
}

/**
 * Folds the model's proposal into the goal track.
 *
 * Two modes, from the product owner's decision: `augment` puts a few proposed
 * actions on top of what the archetype planned, so a common goal keeps the
 * tested deterministic plan and still gets something specific to this person.
 * `takeover` replaces the goal track entirely, for a goal no archetype fits —
 * "weniger prokrastinieren" is not a body, sleep or endurance problem, and
 * general_health used to answer it with a single action.
 *
 * Either way the result is ordinary PlannedItems facing the ordinary
 * invariants. The archetype still supplies the safety regime; a takeover
 * changes what is planned, never what is allowed.
 */
/**
 * Drops proposed actions from the end until the week's exertion is under the
 * ceiling the shared invariant enforces.
 *
 * Trimmed rather than refused, and that trade is deliberate. A proposal asking
 * for twenty-two hours of running is the model being over-eager, not the
 * person being in danger — and refusing the whole week would take the
 * deterministic track down with it, leaving somebody with no plan at all
 * because a model got carried away. So the proposal loses its tail and
 * everything that was already safe survives.
 *
 * Only AI items are dropped. If the archetype's own track ever exceeded the
 * ceiling that would be a bug in the archetype, and silently trimming it here
 * would hide it — the invariant then throws, which is what should happen.
 *
 * Runs after the baseline is built because the baseline carries exertion too:
 * a daily walk is real minutes, and trimming against a guess at them would
 * either shrink the model's room for nothing or leave the invariant to fire.
 */
function withinExertionCeiling(track: GoalTrack, baseline: BaselineTrack): GoalTrack {
  // The same predicate the invariant uses, imported rather than restated.
  //
  // These two were written separately and drifted apart the moment one of them
  // stopped trusting the domain: the trimmer computed 0 for four of the six
  // domains, returned the track untouched, and the invariant then refused the
  // whole week — the exact opposite of this function's stated contract. Two
  // copies of one rule is one copy too many.
  const minutesOf = (item: PlannedItem) => (isExertion(item) ? weeklyMinutes(item) : 0)

  let total =
    track.items.reduce((sum, i) => sum + minutesOf(i), 0) +
    baseline.items.reduce((sum, i) => sum + minutesOf(i), 0)
  if (total <= MAX_WEEKLY_EXERTION_MIN) return track

  const kept: PlannedItem[] = []
  // Reversed, so the last actions the model asked for are the first to go —
  // the model puts what it considers most important first.
  for (const item of [...track.items].reverse()) {
    const isProposed = item.details.kind === 'ai_proposed'
    if (isProposed && total > MAX_WEEKLY_EXERTION_MIN) {
      total -= minutesOf(item)
      continue
    }
    kept.unshift(item)
  }
  return { ...track, items: kept }
}

function withProposed(ctx: PlanContext, track: GoalTrack): GoalTrack {
  const proposal = ctx.input.aiProposal
  if (!proposal || proposal.actions.length === 0) return track

  const archetype = track.archetype

  // A takeover is only ever offered where nothing was fitted in the first
  // place. Replacing a strength or body-composition track would discard the
  // rate caps and recovery rules that make those archetypes safe — and those
  // stay enforced regardless, so the plan would simply be refused.
  if (proposal.mode === 'takeover' && archetype === 'general_health') {
    const items = scheduleProposed(ctx, proposal.actions, proposal.actions.length)
    // An empty result would mean a goal with nothing in it, which is worse than
    // the thin deterministic plan it would have replaced.
    if (items.length === 0) return track

    ctx.rationale.push({ text: proposal.reasoning, basedOn: ['ai.proposal', 'goal.rawText'] })
    return {
      ...track,
      headline: proposal.headline,
      summary: proposal.actions.map((a) => a.title),
      items,
      signature: { ...track.signature, source: 'ai' },
    }
  }

  const open = proposal.actions.filter((a) => isOpenDomain(archetype, a.domain))
  const extra = scheduleProposed(ctx, open, MAX_AUGMENT_ACTIONS, trainingDaysOf(track.items))
  if (extra.length === 0) return track

  ctx.rationale.push({ text: proposal.reasoning, basedOn: ['ai.proposal', 'goal.rawText'] })
  return {
    ...track,
    items: [...track.items, ...extra],
    signature: { ...track.signature, source: 'engine+ai' },
  }
}

/**
 * A `lighter_domain` rule says a whole area was consistently too much as
 * planned. It thins the **baseline** only, down to one action a week: the goal
 * track is what the person came for, and a learned rule must not quietly erode
 * it. Reducing is also the only safe direction — fewer actions can never push
 * a plan through a safety limit.
 */
function thinLightDomains(ctx: PlanContext, baseline: BaselineTrack): BaselineTrack {
  const light = ctx.rules.lightDomains
  if (light.length === 0) return baseline

  const kept: PlannedItem[] = []
  const seen = new Set<PlanDomain>()
  const thinned = new Set<PlanDomain>()

  for (const item of baseline.items) {
    if (!light.includes(item.domain)) {
      kept.push(item)
      continue
    }
    if (seen.has(item.domain)) {
      thinned.add(item.domain)
      continue
    }
    seen.add(item.domain)
    kept.push(item)
  }

  for (const domain of thinned) {
    ctx.rationale.push({
      text:
        `Der Bereich ${DOMAIN_LABEL[domain]} war dir in dieser Menge zu viel — das hat ein ` +
        `abgeschlossenes Experiment gezeigt. Er läuft weiter, aber deutlich kleiner.`,
      basedOn: ['personalRules.lighter_domain'],
    })
  }

  return { ...baseline, items: kept }
}

const DOMAIN_LABEL: Record<PlanDomain, string> = {
  training: 'Training',
  nutrition: 'Ernährung',
  movement: 'Bewegung',
  sleep: 'Schlaf',
  self_improvement: 'Persönliche Entwicklung',
  priority: 'Priorität',
}

/**
 * Today shows three to five actions. When a day would hold more, baseline items
 * are dropped first — the goal track is the reason the user is here, and the
 * baseline is what runs alongside it, not the other way round.
 */
function capPerDay(items: PlannedItem[]): PlannedItem[] {
  const byDay = new Map<string, PlannedItem[]>()
  for (const item of items) {
    const list = byDay.get(item.scheduledOn) ?? []
    list.push(item)
    byDay.set(item.scheduledOn, list)
  }

  const kept: PlannedItem[] = []
  for (const list of byDay.values()) {
    const goal = list.filter((i) => i.track === 'goal')
    const baseline = list.filter((i) => i.track === 'baseline')
    kept.push(...goal.slice(0, MAX_ITEMS_PER_DAY))
    kept.push(...baseline.slice(0, Math.max(0, MAX_ITEMS_PER_DAY - goal.length)))
  }

  return kept.sort((a, b) =>
    a.scheduledOn === b.scheduledOn
      ? Number(a.track === 'baseline') - Number(b.track === 'baseline')
      : a.scheduledOn.localeCompare(b.scheduledOn),
  )
}
