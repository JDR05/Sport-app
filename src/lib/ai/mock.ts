// The deterministic adapter.
//
// Default whenever no API key is configured, and permanently in tests. It is not
// a stub: it produces real, usable output from the keyword classifier and the
// person's own answers. That is what makes "the product works without AI" a fact
// rather than a claim.

import { classifyGoalText } from '@/lib/engine'
import type { AiAdapter, AiResult } from './types'
import type { GoalClassification, PlanProposal, Suggestions } from './schemas'
import type { PlanInput, PlanResult } from '@/lib/domain/types'

const METRIC_FOR: Record<string, { key: string; unit: string } | null> = {
  body_composition: { key: 'weight_kg', unit: 'kg' },
  endurance: { key: 'distance_km', unit: 'km' },
  strength: { key: 'load_kg', unit: 'kg' },
  sleep_recovery: { key: 'sleep_hours', unit: 'h' },
  nutrition_quality: null,
  habit_routine: null,
  general_health: null,
}

export class MockAdapter implements AiAdapter {
  readonly name = 'mock'

  async classifyGoal(rawText: string): Promise<AiResult<GoalClassification>> {
    const result = classifyGoalText(rawText)
    const metric = METRIC_FOR[result.archetype] ?? null

    return {
      ok: true,
      source: 'ai',
      value: {
        archetype: result.archetype,
        confidence: result.confidence,
        metricKey: metric?.key ?? null,
        unit: metric?.unit ?? null,
        restated: rawText.trim().slice(0, 160) || 'Allgemein gesünder werden',
        reasoning:
          result.matched.length > 0
            ? `Ohne KI erkannt, anhand von Schlüsselwörtern im Zieltext.`
            : `Kein eindeutiges Schlüsselwort gefunden — die App startet mit der Gesundheitsbasis.`,
      },
    }
  }

  async suggest(input: PlanInput, plan: PlanResult): Promise<AiResult<Suggestions>> {
    // Built from the person's own answers, not invented: the same discipline the
    // real adapter is held to.
    const suggestions: Suggestions['suggestions'] = []

    if (input.profile.sleep.screenBeforeBed === true) {
      suggestions.push({
        title: 'Handy 30 Min vor dem Schlafen weglegen',
        reasoning:
          'Du hast angegeben, vor dem Schlafen noch am Bildschirm zu sein. Das ist der Hebel mit dem besten Verhältnis von Aufwand zu Wirkung.',
        domain: 'sleep',
        effortMinutes: 0,
      })
    }
    if ((input.profile.nutrition.vegetablePortionsPerDay ?? 3) < 3) {
      suggestions.push({
        title: 'Eine Portion Gemüse dazulegen',
        reasoning:
          'Nach deinen Angaben kommst du auf wenige Portionen am Tag. Dazulegen ist einfacher als umstellen.',
        domain: 'nutrition',
        effortMinutes: 5,
      })
    }
    if (suggestions.length === 0) {
      suggestions.push({
        title: 'Eine Woche beobachten, was dazwischenkommt',
        reasoning:
          'Dein Profil gibt noch wenig her. Eine Woche mitschreiben, was den Plan stört, macht den nächsten deutlich besser.',
        domain: 'priority',
        effortMinutes: 5,
      })
    }

    return {
      ok: true,
      source: 'ai',
      value: {
        headline: plan.strategy.goalTrack.headline,
        suggestions: suggestions.slice(0, 3),
      },
    }
  }
  /**
   * Returns nothing, deliberately.
   *
   * The keyword classifier is a real answer — sorting a sentence into seven
   * buckets is something a word list can genuinely do. Inventing plan actions
   * for a goal nobody anticipated is not: any deterministic stand-in would be
   * a fixed list dressed up as personalisation, which is exactly what this
   * product claims not to be.
   *
   * So without a key there is no proposal, the archetype plans alone, and the
   * app says so rather than pretending. ADR-041.
   */
  async proposePlan(): Promise<AiResult<PlanProposal>> {
    return {
      ok: false,
      reason: 'no_api_key',
      detail: 'plan proposals need a model; the deterministic path cannot invent actions',
    }
  }

}

/** Proves the product is usable with no AI at all. Used by the QA gate. */
export class NullAdapter implements AiAdapter {
  readonly name = 'null'
  async classifyGoal(): Promise<AiResult<GoalClassification>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
  async suggest(): Promise<AiResult<Suggestions>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
  /**
   * Returns nothing, deliberately.
   *
   * The keyword classifier is a real answer — sorting a sentence into seven
   * buckets is something a word list can genuinely do. Inventing plan actions
   * for a goal nobody anticipated is not: any deterministic stand-in would be
   * a fixed list dressed up as personalisation, which is exactly what this
   * product claims not to be.
   *
   * So without a key there is no proposal, the archetype plans alone, and the
   * app says so rather than pretending. ADR-041.
   */
  async proposePlan(): Promise<AiResult<PlanProposal>> {
    return {
      ok: false,
      reason: 'disabled',
      detail: 'plan proposals need a model; the deterministic path cannot invent actions',
    }
  }

}
