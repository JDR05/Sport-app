// Deterministic goal classification.
//
// The fallback for the AI classifier: keyword matching over the user's own
// words. Deliberately conservative — an unmatched goal becomes `general_health`
// and gets the health baseline plus suggestions, never a refusal.
//
// This runs whenever no API key is configured or the model returned something
// that failed validation, which is what keeps the product usable without AI.
//
// It was measured against twenty-five goals phrased the way people actually
// write them, and it placed eleven. Twelve fell through to the baseline —
// "weniger prokrastinieren", "wieder in meine alte Jeans passen", "beim
// Treppensteigen nicht aus der Puste sein". Every one of those is a goal this
// app has an archetype for; the word list simply did not contain the word.
//
// So the list below is deliberately written from how people talk rather than
// from what the domain is called. Nobody types "Ausdauer"; they type that the
// stairs are hard. The point of a fallback is that someone without an API key
// still gets a real goal track, and a fallback that only recognises the
// textbook word for a thing is a fallback in name only.
//
// It will still lose to a model on genuinely novel phrasing, and that is fine:
// unmatched means the health baseline, which is a real plan, not a failure.

import type { GoalArchetype } from '@/lib/domain/types'

type Rule = { archetype: GoalArchetype; patterns: RegExp[] }

// Order matters: the first archetype with a match wins, so the more specific
// phrasings sit above the broader ones.
//
// Two orderings here are load-bearing and were wrong before. Substance habits
// ("weniger Alkohol", "mit dem Rauchen aufhören") are habits, not nutrition —
// `trinken` in the nutrition list was catching them. And the gym belongs to
// strength, not to routine, even though "regelmäßig" appears in the sentence.
const RULES: Rule[] = [
  {
    // Above nutrition and routine on purpose: these read as eating or as
    // regularity, and they are neither.
    archetype: 'habit_routine',
    patterns: [
      /\balkohol\b/i, /\bbier\b/i, /\bwein\b/i, /\btrinken aufhören\b/i,
      /\brauch(en|er|st)\b/i, /\bzigarett/i, /\bnikotin\b/i, /\bvape/i,
    ],
  },
  {
    archetype: 'sleep_recovery',
    patterns: [
      /\bschlaf/i, /\bschlafen\b/i, /\bausgeruht/i, /\berholung\b/i,
      /\bregeneration\b/i, /\bmüde\b/i, /\bdurchschlafen\b/i, /\beinschlafen\b/i,
      // How exhaustion is actually described.
      /\berschöpft\b/i, /\bausgelaugt\b/i, /\bkaputt\b/i, /\bgerädert\b/i,
      /\bkeine energie\b/i, /\bnicht ausgeschlafen\b/i, /\bbettzeit\b/i,
      /\bnachts? wach\b/i, /\bzu spät ins bett\b/i,
    ],
  },
  {
    archetype: 'endurance',
    patterns: [
      /\blaufen\b/i, /\bjoggen\b/i, /marathon/i, /\bausdauer\b/i,
      /\d+\s*km\b/i, /\bradfahren\b/i, /\bschwimmen\b/i, /\bkondition\b/i,
      /\bcardio\b/i,
      // The everyday symptom, which is how most people phrase this goal.
      /\bpuste\b/i, /\baußer atem\b/i, /\btreppe/i, /\bfahrrad\b/i,
      /\brennen\b/i, /\b5k\b/i, /\bwandern\b/i, /\bschnell müde beim\b/i,
    ],
  },
  {
    archetype: 'strength',
    patterns: [
      /\bkraft\b/i, /\bstärker\b/i, /\bmuskel/i, /\bklimmzüge\b/i,
      /\bliegestütze\b/i, /\bbankdrücken\b/i, /\bkniebeugen\b/i, /\baufbauen\b/i,
      // The gym belongs here even when the sentence is about regularity.
      /\bfitnessstudio\b/i, /\bfitness.?studio\b/i, /\bgym\b/i, /\bhanteln?\b/i,
      /\btrainieren\b/i, /\bkrafttraining\b/i,
      // Back and posture are a strength problem the app can actually plan for.
      // Deliberately not a diagnosis: the plan is movement, never treatment.
      /\brücken/i, /\bhaltung\b/i, /\bverspann/i, /\bstabil(er|ität)\b/i,
    ],
  },
  {
    archetype: 'body_composition',
    patterns: [
      /\babnehmen\b/i, /\bzunehmen\b/i, /\bgewicht\b/i, /\bkörperfett\b/i,
      /\d+\s*kg\b/i, /\bschlanker\b/i, /\bdefinierter\b/i, /\bbauch\b/i,
      // How people describe it without ever saying "Gewicht".
      /\bjeans\b/i, /\bhose\b/i, /\bkleidergröße\b/i, /\bkonfektionsgröße\b/i,
      /\bwaage\b/i, /\bspeck\b/i, /\bpfunde\b/i, /\bfigur\b/i,
      /\bschlank\b/i, /\bkilo\b/i,
    ],
  },
  {
    archetype: 'nutrition_quality',
    patterns: [
      /gesünder (essen|ernähr)/i, /ernähr/i, /\bgemüse\b/i, /\bzucker\b/i,
      /\bfertiggericht/i, /\bausgewogen/i, /\bmeal.?prep\b/i, /\btrinken\b/i,
      // What people name instead of "Ernährung".
      /\bsüßkram\b/i, /\bsüßigkeit/i, /\bnaschen\b/i, /\bsnack/i,
      /\bchips\b/i, /\bschokolade\b/i, /\bfast.?food\b/i, /\blieferando\b/i,
      /\bkochen\b/i, /\bobst\b/i, /\beiweiß\b/i, /\bprotein\b/i,
      /\bheißhunger\b/i, /\bregelmäßig essen\b/i,
    ],
  },
  {
    archetype: 'habit_routine',
    patterns: [
      /\bhandy\b/i, /\bbildschirm/i, /\bmeditier/i, /\broutine\b/i,
      /\bgewohnheit/i, /\bfokus\b/i, /\blesen\b/i, /\bdisziplin\b/i,
      /\bfrüher aufstehen\b/i, /\bregelmäßig\b/i, /\bscreen.?time\b/i,
      // Procrastination, stress and follow-through, in the words people use.
      /\bprokrastin/i, /\baufschieb/i, /\bhinauszöger/i, /\bschieb.* auf\b/i,
      /\bstress\b/i, /\bgestresst\b/i, /\brunterkommen\b/i, /\bentspann/i,
      /\bvorsätz/i, /\bkonsequent/i, /\bdranbleiben\b/i, /\bdurchhalten\b/i,
      /\bsnooze\b/i, /\baufstehen\b/i, /\bstruktur\b/i, /\bplanen\b/i,
      /\bzeit für mich\b/i, /\bsocial.?media\b/i, /\binstagram\b/i,
      /\btiktok\b/i, /\bnetflix\b/i, /\bpausen\b/i, /\bachtsam/i,
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
