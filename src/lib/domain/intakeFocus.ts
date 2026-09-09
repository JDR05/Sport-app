// Which intake questions this goal actually needs.
//
// The intake asked everyone the same twenty-one profile questions. Somebody
// whose goal is "besser schlafen" was asked how many portions of vegetables
// they eat, how long they have to cook, and how many meals a day they have —
// three of the seven nutrition questions, none of which any part of the app
// reads for a sleep goal. The app's own prompt file admitted it in writing:
// "Das Onboarding stellt allen dieselben Fragen."
//
// This module is not a table of opinions about what matters for a goal. It is
// a map of **which code reads which field**, measured against the engine, and
// the question set is derived from it: a field is asked when something that
// runs for this goal will actually read it. That distinction is the whole
// point — an opinion drifts away from the code silently, a derivation cannot,
// and `intake.focus.test.ts` proves the plans come out identical either way.
//
// Nothing is lost by not asking. A field nobody fills is `unknown`, which is a
// supported state everywhere in this product, it can still be filled later,
// and the model may ask for it at the end of the intake if it decides the goal
// needs it (ADR-034's split: the code holds the floor, the model judges).

import { GOAL_ARCHETYPES, type GoalArchetype } from './types'

/** The steps of the intake that ask about the person rather than the goal. */
export const INTAKE_AREAS = ['body', 'sport', 'nutrition', 'sleep', 'mind'] as const
export type IntakeArea = (typeof INTAKE_AREAS)[number]

export type IntakeField =
  | 'birthYear' | 'heightCm' | 'weightKg' | 'sexAtBirth'
  | 'preferredActivities' | 'equipment' | 'experience'
  | 'sessionsPerWeekTarget' | 'preferredSessionMinutes'
  | 'cooksAtHome' | 'timeForCookingMin' | 'eatsOutPerWeek' | 'dietaryPattern'
  | 'mealsPerDay' | 'vegetablePortionsPerDay' | 'sugaryDrinksPerDay'
  | 'usualBedtime' | 'usualWakeTime' | 'sleepQuality' | 'wakesAtNight' | 'screenBeforeBed'
  | 'screenTimeHoursPerDay' | 'focusStruggle' | 'existingRoutines'

/** Which step asks for each field, in the order the step asks them. */
export const AREA_FIELDS: Record<IntakeArea, readonly IntakeField[]> = {
  body: ['birthYear', 'heightCm', 'weightKg', 'sexAtBirth'],
  sport: ['preferredActivities', 'equipment', 'experience', 'sessionsPerWeekTarget', 'preferredSessionMinutes'],
  nutrition: ['cooksAtHome', 'timeForCookingMin', 'eatsOutPerWeek', 'dietaryPattern', 'mealsPerDay', 'vegetablePortionsPerDay', 'sugaryDrinksPerDay'],
  sleep: ['usualBedtime', 'usualWakeTime', 'sleepQuality', 'wakesAtNight', 'screenBeforeBed'],
  mind: ['screenTimeHoursPerDay', 'focusStruggle', 'existingRoutines'],
}

/**
 * Two readers that are not an archetype.
 *
 * `baseline` is the health track, which runs for **every** goal — so a field it
 * reads is asked no matter what the person wrote. `always` is the rest of the
 * engine outside the archetypes: `context.ts` reads `experience` to decide how
 * hard anybody may start, for all seven.
 */
type Reader = GoalArchetype | 'baseline' | 'always'

/**
 * Who reads what. Measured against `src/lib/engine`, not assumed.
 *
 * The method: for each field name, every file under `engine/` and `adaptive/`
 * that mentions it at all — the name, not `profile.<field>`, because the
 * archetypes destructure (`const { sleep, nutrition } = input.profile`) and a
 * search for the dotted path misses every one of those. That mistake was made
 * here first and the plan-equality test below caught it: `general_health` reads
 * `wakesAtNight` and `sessionsPerWeekTarget` through a destructured binding,
 * both were scored as unread, and ten plans changed.
 *
 * Matching a bare name over-approximates, and that is the right direction to
 * err in: one question too many costs a tap, one too few costs a worse plan.
 * The two false positives were checked by hand — `constants.ts` names the
 * height and weight *defaults* used when the answer is missing, which is not a
 * read of the person's value, and `proposed.ts` contains the word "quality" in
 * a sentence.
 *
 * A helper is attributed to its **callers**, not to the file it happens to sit
 * in — the third mistake this map made, and the third one the test caught.
 * `pickSessionMinutes` and `pickModality` live in `bodyComposition.ts` and are
 * imported by `strength.ts`, so the three fields they read belong to strength
 * too; eight plans changed until they did.
 *
 * `energy.ts` is attributed to `body_composition` because that is its only
 * caller — which is also why the calorie floor, and the four fields it needs,
 * are a safety requirement there and nowhere else.
 *
 * A field with an empty list would be a field the intake asks for and nothing
 * uses; `intake.focus.test.ts` fails if one appears.
 */
const READ_BY: Record<IntakeField, readonly Reader[]> = {
  // Only the energy calculation, and that runs only for body composition.
  birthYear: ['body_composition'],
  heightCm: ['body_composition'],
  weightKg: ['body_composition'],
  sexAtBirth: ['body_composition'],

  preferredActivities: ['strength', 'body_composition'],
  equipment: ['strength', 'body_composition'],
  // context.ts, for every goal: it sets how hard anybody may start.
  experience: ['always'],
  sessionsPerWeekTarget: ['strength', 'endurance', 'nutrition_quality', 'general_health', 'body_composition'],
  preferredSessionMinutes: ['strength', 'body_composition'],

  cooksAtHome: ['baseline', 'nutrition_quality', 'body_composition'],
  timeForCookingMin: ['body_composition'],
  eatsOutPerWeek: ['baseline', 'general_health', 'nutrition_quality', 'body_composition'],
  dietaryPattern: ['baseline', 'nutrition_quality'],
  mealsPerDay: ['nutrition_quality', 'body_composition'],
  vegetablePortionsPerDay: ['baseline', 'nutrition_quality'],
  sugaryDrinksPerDay: ['baseline', 'general_health', 'nutrition_quality'],

  usualBedtime: ['baseline', 'sleep_recovery'],
  usualWakeTime: ['sleep_recovery', 'habit_routine'],
  sleepQuality: ['baseline', 'general_health', 'sleep_recovery'],
  wakesAtNight: ['general_health', 'sleep_recovery'],
  screenBeforeBed: ['sleep_recovery'],

  screenTimeHoursPerDay: ['general_health', 'habit_routine'],
  focusStruggle: ['habit_routine'],
  existingRoutines: ['habit_routine'],
}

/**
 * The fields worth asking somebody with this goal.
 *
 * Everything the health track reads, everything the engine reads for all goals,
 * and everything this particular archetype reads. Nothing else — because
 * nothing else would change a single line of the plan.
 */
export function fieldsFor(archetype: GoalArchetype): Set<IntakeField> {
  const asked = new Set<IntakeField>()
  for (const [field, readers] of Object.entries(READ_BY) as [IntakeField, readonly Reader[]][]) {
    if (readers.some((r) => r === 'baseline' || r === 'always' || r === archetype)) asked.add(field)
  }
  return asked
}

/** Whether a step has anything left to ask. An empty step is not shown at all. */
export function areaIsAsked(area: IntakeArea, asked: Set<IntakeField>): boolean {
  return AREA_FIELDS[area].some((f) => asked.has(f))
}

/** The steps this goal skips entirely — what the model is told it does not know. */
export function skippedAreas(archetype: GoalArchetype): IntakeArea[] {
  const asked = fieldsFor(archetype)
  return INTAKE_AREAS.filter((area) => !areaIsAsked(area, asked))
}

/**
 * The floor, as code rather than as care.
 *
 * Throws when a question set would leave the plan reading a field nobody was
 * asked for. It exists because this is exactly the change that goes wrong
 * quietly: someone adds a field to an archetype, the intake stops asking a
 * question it still needs, and the plan degrades for one archetype in a way no
 * screen shows. The same assertion guards whatever the model suggests, so a
 * model can widen the intake and never narrow it.
 */
export function assertCovers(archetype: GoalArchetype, asked: Set<IntakeField>): void {
  const missing: IntakeField[] = []
  for (const [field, readers] of Object.entries(READ_BY) as [IntakeField, readonly Reader[]][]) {
    const needed = readers.some((r) => r === 'baseline' || r === 'always' || r === archetype)
    if (needed && !asked.has(field)) missing.push(field)
  }
  if (missing.length > 0) {
    throw new Error(`Intake for ${archetype} would not ask for: ${missing.join(', ')}`)
  }
}

/**
 * What the model may change: it may ask for more, never for less.
 *
 * The judgement of "this goal needs to know about their sleep even though the
 * archetype does not read it" is a good one and belongs to the model. Dropping
 * a question the engine reads is not a judgement, it is a defect, and no
 * amount of confidence makes it one.
 */
export function widen(archetype: GoalArchetype, extra: readonly IntakeField[]): Set<IntakeField> {
  // The union with the required set *is* the guarantee — there is no path
  // through this function that removes anything, so whatever the model says,
  // the engine's fields survive. An `assertCovers` call stood here at first
  // and a mutation test walked straight through it: it could never fire, which
  // made it decoration in the shape of a safety check. The invariant is
  // enforced by construction, and `assertCovers` guards the map itself.
  const asked = fieldsFor(archetype)
  for (const field of extra) if (field in READ_BY) asked.add(field)
  return asked
}

/** Every archetype, for tests and for the population run. */
export const ALL_ARCHETYPES: readonly GoalArchetype[] = GOAL_ARCHETYPES
