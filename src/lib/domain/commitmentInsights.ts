// Reading a judgement back, and knowing when it has gone stale.
//
// Pure, and separate from the module that asks for one, because three callers
// need these and only one of them is allowed near a database: the plan input,
// the week the screens read, and the tests. A `server-only` marker on the
// asking side is right; on the parsing side it would only mean the parsing
// cannot be tested.

import { commitmentInsightSchema } from '@/lib/ai/schemas'
import type { Commitment, CommitmentInsight } from './types'

/**
 * What a stored judgement was made about.
 *
 * Commitments are editable, and an insight about a training somebody has since
 * dropped is worse than none — it would keep shaping the plan invisibly.
 * Sorted, so reordering the same week is not a change: re-asking for that
 * would spend a model call to replace a good answer with a different one.
 */
export function commitmentsSignature(commitments: Commitment[]): string {
  return commitments
    .map((c) => `${c.label}|${c.weekday}|${c.start}|${c.minutes}|${c.activity ?? '-'}`)
    .sort()
    .join(';')
}

/**
 * Judgements that do not parse are dropped, not guessed at.
 *
 * The column is jsonb and a row survives a deployment, so the shape may move.
 * An unreadable judgement becomes no judgement, and the activity tables decide
 * — the same fallback as no model at all.
 */
export function readCommitmentInsights(value: unknown): CommitmentInsight[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = commitmentInsightSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}
