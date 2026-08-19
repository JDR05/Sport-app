// Deterministic goal classification.
//
// The fallback for the AI classifier: keyword matching over the user's own
// words. Deliberately conservative — an unmatched goal becomes `general_health`
// and gets the health baseline plus suggestions, never a refusal.
//
// This runs whenever no API key is configured or the model returned something
// that failed validation, which is what keeps the product usable without AI.

import type { GoalArchetype } from '@/lib/domain/types'

type Rule = { archetype: GoalArchetype; patterns: RegExp[] }

// Order matters: the first archetype with a match wins, so the more specific
// phrasings sit above the broader ones.
const RULES: Rule[] = [
  {
    archetype: 'sleep_recovery',
    patterns: [
      /\bschlaf/i, /\bschlafen\b/i, /\bausgeruht/i, /\berholung\b/i,
      /\bregeneration\b/i, /\bmüde\b/i, /\bdurchschlafen\b/i, /\beinschlafen\b/i,
    ],
  },
  {
    archetype: 'endurance',
    patterns: [
      /\blaufen\b/i, /\bjoggen\b/i, /marathon/i, /\bausdauer\b/i,
      /\d+\s*km\b/i, /\bradfahren\b/i, /\bschwimmen\b/i, /\bkondition\b/i,
      /\bcardio\b/i,
    ],
  },
  {
    archetype: 'strength',
    patterns: [
      /\bkraft\b/i, /\bstärker\b/i, /\bmuskel/i, /\bklimmzüge\b/i,
      /\bliegestütze\b/i, /\bbankdrücken\b/i, /\bkniebeugen\b/i, /\baufbauen\b/i,
    ],
  },
  {
    archetype: 'body_composition',
    patterns: [
      /\babnehmen\b/i, /\bzunehmen\b/i, /\bgewicht\b/i, /\bkörperfett\b/i,
      /\d+\s*kg\b/i, /\bschlanker\b/i, /\bdefinierter\b/i, /\bbauch\b/i,
    ],
  },
  {
    archetype: 'nutrition_quality',
    patterns: [
      /gesünder (essen|ernähr)/i, /ernähr/i, /\bgemüse\b/i, /\bzucker\b/i,
      /\bfertiggericht/i, /\bausgewogen/i, /\bmeal.?prep\b/i, /\btrinken\b/i,
    ],
  },
  {
    archetype: 'habit_routine',
    patterns: [
      /\bhandy\b/i, /\bbildschirm/i, /\bmeditier/i, /\broutine\b/i,
      /\bgewohnheit/i, /\bfokus\b/i, /\blesen\b/i, /\bdisziplin\b/i,
      /\bfrüher aufstehen\b/i, /\bregelmäßig\b/i, /\bscreen.?time\b/i,
    ],
  },
]

export type Classification = {
  archetype: GoalArchetype
  /** 0..1. Keyword matching is never fully confident; the AI can do better. */
  confidence: number
  matched: string[]
}

export function classifyGoalText(text: string): Classification {
  const normalised = text.trim()
  if (normalised.length === 0) {
    return { archetype: 'general_health', confidence: 0, matched: [] }
  }

  for (const rule of RULES) {
    const matched = rule.patterns
      .filter((p) => p.test(normalised))
      .map((p) => p.source)
    if (matched.length > 0) {
      // More independent signals means more confidence, but keyword matching
      // never claims certainty — that is what the AI classifier is for.
      return {
        archetype: rule.archetype,
        confidence: Math.min(0.4 + 0.2 * matched.length, 0.8),
        matched,
      }
    }
  }

  return { archetype: 'general_health', confidence: 0.2, matched: [] }
}
