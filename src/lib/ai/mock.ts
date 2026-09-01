// The deterministic adapter.
//
// Default whenever no API key is configured, and permanently in tests. It is not
// a stub: it produces real, usable output from the keyword classifier and the
// person's own answers. That is what makes "the product works without AI" a fact
// rather than a claim.

import { classifyGoalText } from '@/lib/engine'
import type { AiAdapter, AiResult } from './types'
import type { GoalClassification, IntakeQuestions, PlanProposal, WeeklyNote } from './schemas'

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
  readonly usesModel = false

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

  /**
   * Nothing, deliberately.
   *
   * A deterministic weekly "tip" would have to be assembled from a fixed list,
   * and a sentence from a fixed list is true of everyone — which is exactly
   * the filler checkWeeklyNote refuses from the model. Without a key the
   * weekly note simply does not appear, and the deterministic insights, which
   * are grounded in real counts, stand on their own.
   */
  async weeklyNote(): Promise<AiResult<WeeklyNote>> {
    return { ok: false, reason: 'disabled', detail: 'no deterministic stand-in for advice' }
  }

  /**
   * Asks nothing, deliberately.
   *
   * A deterministic set of extra questions is just a longer onboarding form —
   * the same three asked of everybody, which is the opposite of a model
   * noticing a gap in this particular intake. Without a key the intake is what
   * it is, and the archetypes plan from it. ADR-084.
   */
  async askQuestions(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'no_api_key', detail: 'a fixed question list is just a longer form' }
  }
}

/** Proves the product is usable with no AI at all. Used by the QA gate. */
export class NullAdapter implements AiAdapter {
  readonly name = 'null'
  readonly usesModel = false
  async classifyGoal(): Promise<AiResult<GoalClassification>> {
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

  async weeklyNote(): Promise<AiResult<WeeklyNote>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
  async askQuestions(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
}

/**
 * Nobody agreed, so nothing is sent.
 *
 * A separate class from NullAdapter, which means "switched off in
 * configuration". This one means "this person said no", and the distinction
 * matters twice: the app can offer them the checkbox instead of shrugging, and
 * a `no_consent` in a log is a working system respecting a choice rather than
 * a misconfiguration somebody should go and fix.
 *
 * Its existence is also what makes the gate hard to get wrong. The call sites
 * do not branch on a boolean — they ask for an adapter and get one that
 * refuses, so a forgotten `if` cannot turn into a request that goes out.
 */
export class WithheldAdapter implements AiAdapter {
  readonly name = 'withheld'
  readonly usesModel = false
  async classifyGoal(): Promise<AiResult<GoalClassification>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
  async proposePlan(): Promise<AiResult<PlanProposal>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
  async weeklyNote(): Promise<AiResult<WeeklyNote>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
  async askQuestions(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
}
