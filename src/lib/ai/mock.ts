// The deterministic adapter.
//
// Default whenever no API key is configured, and permanently in tests. It is not
// a stub: it produces real, usable output from the keyword classifier and the
// person's own answers. That is what makes "the product works without AI" a fact
// rather than a claim.

import { classifyGoalText } from '@/lib/engine'
import { ENDURANCE_ACTIVITIES, STRENGTH_ACTIVITIES } from '@/lib/engine/constants'
import type { CommitmentsContext } from './tasks'
import type { AiAdapter, AiResult } from './types'
import type {
  AskAnswer, CommitmentInsights, GoalClassification, IntakeQuestions, PlanProposal, WeeklyNote,
} from './schemas'

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

  /**
   * Answers nothing, deliberately — and this is the least arguable of the
   * four. Classification is a word list's job; answering a sentence nobody
   * anticipated is not. Without a key the question box is not offered, which
   * is honest, where a canned "das kann ich dir nicht sagen" to every question
   * would be an insult dressed as a feature.
   */
  async ask(): Promise<AiResult<AskAnswer>> {
    return { ok: false, reason: 'no_api_key', detail: 'answering a free question needs a model' }
  }

  /**
   * Asks nothing, deliberately, and for the sharpest version of the reason the
   * intake step already gives: a fixed question asked of everybody in week
   * three is not the app taking an interest in one person, it is a survey with
   * a delay on it.
   */
  async followUp(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'no_api_key', detail: 'a fixed question is a survey, not interest' }
  }

  /**
   * The lookup table, and the only place in this adapter that answers rather
   * than declines.
   *
   * It is here on purpose and labelled as what it is. The engine used to
   * consult this table directly and call the result a decision about a person;
   * CLAUDE.md now forbids that, and this is where the table belongs instead —
   * behind the same interface as the judgement, explicitly the worse answer
   * for an account with no model.
   *
   * The note says so rather than inventing personal advice. A generic sentence
   * dressed as insight is exactly what the rule exists to prevent, and the
   * screen showing "ohne KI eingeordnet" is the honest version.
   */
  async judgeCommitments(context: CommitmentsContext): Promise<AiResult<CommitmentInsights>> {
    const counts: readonly string[] =
      context.archetype === 'endurance'
        ? ENDURANCE_ACTIVITIES
        : context.archetype === 'strength' || context.archetype === 'body_composition'
          ? STRENGTH_ACTIVITIES
          : []

    return {
      ok: true,
      source: 'ai',
      value: {
        insights: context.commitments.map((c) => ({
          label: c.label,
          doesGoalWork: c.activity !== null && counts.includes(c.activity),
          note: 'Ohne KI eingeordnet, nur anhand der Sportart — nicht anhand deines Ziels.',
        })),
      },
    }
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
  async ask(): Promise<AiResult<AskAnswer>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
  async followUp(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'disabled', detail: 'AI intentionally disabled' }
  }
  async judgeCommitments(): Promise<AiResult<CommitmentInsights>> {
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
  async ask(): Promise<AiResult<AskAnswer>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
  async followUp(): Promise<AiResult<IntakeQuestions>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
  async judgeCommitments(): Promise<AiResult<CommitmentInsights>> {
    return { ok: false, reason: 'no_consent', detail: 'no consent for AI processing' }
  }
}
