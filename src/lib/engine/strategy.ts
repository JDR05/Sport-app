// Assembles a week plan from the two tracks.
//
// The orchestrator owns nothing goal-specific: it builds the shared context,
// asks the archetype for the goal track, asks the baseline for what should run
// underneath, and enforces the one rule that spans both — the baseline may never
// crowd the goal track out of the day.

import { MAX_ITEMS_PER_DAY } from './constants'
import { buildContext, type PlanContext } from './context'
import { planBaseline } from './baseline'
import { strategyFor } from './archetypes'
import type {
  Assumption, BaselineTrack, PlanDomain, PlanInput, PlannedItem, Rationale, WeekStrategy,
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

  const goalTrack = archetype.planGoalTrack(ctx)
  const clamped = archetype.clampGoal(ctx)
  const baseline = thinLightDomains(ctx, planBaseline(ctx, goalTrack))

  const items = capPerDay([...goalTrack.items, ...baseline.items])

  const strategy: WeekStrategy = {
    weekStart: ctx.weekStart,
    archetype: goalTrack.archetype,
    targetDate: clamped.targetDate,
    targetDateAdjusted: clamped.adjusted,
    goalTrack,
    baseline,
  }

  return { strategy, items, assumptions: ctx.assumptions, rationale: ctx.rationale }
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
