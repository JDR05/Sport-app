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
 * How long an experiment may stay open before it is given up on.
 *
 * `continue` extends by another fortnight whenever too little happened, and
 * nothing stopped it doing that for ever. Someone who put the app down for
 * four months came back to an experiment still running, still holding the
 * only slot — one at a time is the rule — and still shaping every plan
 * through its trial rule, on evidence that no longer existed: the fortnight
 * it was meant to measure had fallen out of the readable window entirely.
 *
 * Twelve weeks is that window. Past it the experiment cannot be read against
 * its own baseline any more, so the honest end is to abandon it and let a new
 * one start from where the person actually is.
 */
export const MAX_EXPERIMENT_WEEKS = 12

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

/**
 * How far the recent weeks have to lean before a re-check says anything about
 * an existing rule. Fifteen points of completion rate, in either direction.
 *
 * Below the detection threshold on purpose: detection is looking for a pattern
 * nobody knew about and has to clear a high bar, while a re-check already has
 * a belief in front of it and only asks whether it still holds. The protection
 * against a noisy fortnight is not this number — it is that fading a rule out
 * takes three contradicting re-checks at CONFIDENCE_STEP each.
 */
export const RULE_RECHECK_MARGIN = 0.15

// ------------------------------------------------------- context factors --
//
// Fixed here, before the code that uses them exists, for the same reason as
// every other threshold in this file: a number chosen after seeing the result
// is not a threshold, it is a justification.

/**
 * Rated days needed on each side of a comparison. Three is the point at which
 * one unusual day stops deciding the answer, and it is reachable inside two
 * weeks for a weekday pattern.
 */
export const MIN_CONTEXT_DAYS = 3

/**
 * How much less sleep counts as a real difference: 45 minutes. Below that it is
 * within the error of someone estimating their own night.
 */
export const SLEEP_GAP_HOURS = 0.75

/**
 * How far apart two averages on the 1..5 scales have to be. 0.6 is a bit over
 * half a step — smaller gaps are how people happen to tap on a given day.
 */
export const SCALE_GAP = 0.6

/**
 * How much more often late caffeine has to occur on the affected days: on
 * roughly half of them more than elsewhere.
 *
 * A yes/no answer carries less information than a scale, so the bar is higher
 * than for the others. Two coffees over six weeks is a coincidence.
 */
export const CAFFEINE_SHARE_GAP = 0.5

/**
 * How much more alcohol counts as a real difference, in standard drinks per
 * day. One is the smallest amount anybody reports at all, so a gap below it is
 * rounding rather than a pattern.
 */
export const ALCOHOL_GAP_UNITS = 1

/**
 * When a commitment counts as running late: it ends at 20:30 or after. Past
 * that, getting home, eating and winding down runs into the night for anyone
 * who has to be up early, which is the case the product owner described.
 */
export const LATE_END_MINUTES = 20 * 60 + 30
