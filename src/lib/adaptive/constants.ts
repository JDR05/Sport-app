// Detection and evaluation thresholds.
//
// Fixed here BEFORE the detection code exists, for the same reason ADR-014 fixes
// the personalisation gate in advance: a threshold chosen after seeing the data
// is not a threshold, it is a rationalisation. If the engine turns out to be too
// quiet or too eager, these numbers change deliberately and the change is
// recorded — they are never nudged to make a run look good.

/**
 * Below this many resolved instances in a bucket, nothing is a pattern. Three
 * would let a single bad week speak for the person; four forces the signal to
 * survive more than one context.
 */
export const MIN_RESOLVED_INSTANCES = 4

/**
 * The deviation has to show up in at least this many distinct calendar weeks.
 * This is the rule that stops "one rough week" from becoming a personal truth,
 * and it is the reason detection stays silent for the whole of week 1.
 */
export const MIN_DISTINCT_WEEKS = 2

/** At least this many actual misses, however good the rate looks. */
export const MIN_MISSES = 2

/** Share of resolved instances in the bucket that must be missed. */
export const MIN_MISS_RATE = 0.5

/**
 * The bucket has to be worse than the rest of the week by this margin. Without
 * it, someone who misses everything would be told they have a Wednesday
 * problem — the honest reading there is that the plan is too big, not that
 * Wednesday is cursed.
 */
export const MIN_CONTRAST = 0.3

/**
 * How far back detection looks, in weeks.
 *
 * Six is enough for the two-distinct-weeks rule to have something to work
 * with, and short enough that a pattern from January stops describing someone
 * in March. People change, and ADR-033 says the model has to be able to change
 * with them; a window is the simplest way to mean it.
 */
export const ANALYSIS_WEEKS = 6

/** Sessions at or above this length count as "long" for the duration pattern. */
export const LONG_SESSION_MINUTES = 45

// ------------------------------------------------------------ experiment ----

/** Runtime of a proposed experiment, in days. One week, fixed in advance. */
export const EXPERIMENT_DAYS = 14

/**
 * Fewer resolved instances than this and the experiment cannot be decided;
 * the outcome is `continue`, never a guess.
 */
export const MIN_EXPERIMENT_INSTANCES = 3

/**
 * Noise floor. Compliance measured over two weeks moves by a tenth on its own.
 * An improvement below this counts as "no effect", not as success — see
 * docs/ADAPTIVE_ENGINE.md, Schritt 5.
 */
export const MIN_EFFECT = 0.15

// ---------------------------------------------------------- personal rule ---

/** Confidence of a rule from a single confirmed experiment. */
export const INITIAL_RULE_CONFIDENCE = 0.6

/** Ceiling: no amount of agreeing evidence makes a behavioural rule certain. */
export const MAX_RULE_CONFIDENCE = 0.9

/** Confirming evidence adds this much, contrary evidence subtracts it. */
export const CONFIDENCE_STEP = 0.15

/** Below this a rule stops influencing the plan — the person has changed. */
export const MIN_RULE_CONFIDENCE = 0.3
