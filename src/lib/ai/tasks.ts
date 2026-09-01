// The two things the app ever asks a model, defined once.
//
// Prompt, context, schema and safety gate live here rather than inside an
// adapter, and that is the whole point of the file: there are two adapters now
// — Claude, and any OpenAI-compatible endpoint — and the gate between "the
// model said something" and "the app believes it" must be the same gate.
//
// Copying this into a second adapter is how the free provider quietly ends up
// with weaker checks than the paid one. It is exactly the wrong place to save
// a few lines: a model that writes "verzichte auf Kohlenhydrate" has to be
// refused identically no matter who hosts it, and a cheaper model will produce
// that sentence more often, not less.

import { goalClassificationSchema, intakeQuestionsSchema, planProposalSchema, weeklyNoteSchema } from './schemas'
import { checkClassification, checkProposal, checkQuestions, checkWeeklyNote } from './validate'
import { CLASSIFY_SYSTEM, PROPOSE_SYSTEM, QUESTIONS_SYSTEM, WEEKLY_NOTE_SYSTEM } from './prompts'
import type { GoalClassification, IntakeQuestions, PlanProposal, WeeklyNote } from './schemas'
import type { PlanInput } from '@/lib/domain/types'

/** What a parse attempt can say. `implausible` means a safety rule fired. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; detail: string; implausible?: boolean }

export type AiTask<T> = {
  /** Which of the four calls this is. Only used to label a failure in the log. */
  name: string
  /** System prompt, identical for every provider. */
  system: string
  /**
   * How hard the model should work. Adapters map this to whatever their
   * provider calls it, or ignore it.
   */
  effort: 'low' | 'high'
  maxTokens: number
  parse: (json: unknown) => ParseResult<T>
}

export const classifyTask: AiTask<GoalClassification> = {
  name: 'classify',
  system: CLASSIFY_SYSTEM,
  // A small, well-defined job: cheap and fast without costing accuracy.
  effort: 'low',
  maxTokens: 1500,
  parse: (json) => {
    const parsed = goalClassificationSchema.safeParse(json)
    if (!parsed.success) return { ok: false, detail: parsed.error.message }
    const violations = checkClassification(parsed.data)
    if (violations.length > 0) {
      return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
    }
    return { ok: true, value: parsed.data }
  },
}

export const proposeTask: AiTask<PlanProposal> = {
  name: 'propose',
  system: PROPOSE_SYSTEM,
  // The hardest thing the model is asked to do, and the one whose quality the
  // user feels most directly.
  effort: 'high',
  maxTokens: 4000,
  parse: (json) => {
    const parsed = planProposalSchema.safeParse(json)
    if (!parsed.success) return { ok: false, detail: parsed.error.message }
    const violations = checkProposal(parsed.data)
    if (violations.length > 0) {
      return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
    }
    return { ok: true, value: parsed.data }
  },
}

export const weeklyNoteTask: AiTask<WeeklyNote> = {
  name: 'weekly-note',
  system: WEEKLY_NOTE_SYSTEM,
  // Reading a week and finding the one thing worth saying is the harder half
  // of this feature; the writing is the easy part.
  effort: 'high',
  maxTokens: 2000,
  parse: (json) => {
    const parsed = weeklyNoteSchema.safeParse(json)
    if (!parsed.success) return { ok: false, detail: parsed.error.message }
    const violations = checkWeeklyNote(parsed.data)
    if (violations.length > 0) {
      return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
    }
    return { ok: true, value: parsed.data }
  },
}

/** Everything the weekly note is allowed to see. Assembled by the caller. */
export type WeeklyNoteContext = {
  goalText: string
  archetype: string
  weekStart: string
  /** Per domain: how much of what was planned actually happened. */
  completion: Array<{ domain: string; done: number; resolved: number }>
  /** What deterministic detection already found, so the model adds rather than repeats. */
  deviations: string[]
  strengths: string[]
  /** Confirmed personal rules, so it does not propose what is already true. */
  rules: string[]
  /**
   * The free text. The reason this feature exists.
   *
   * Collected every day since the check-in shipped and read by nothing until
   * now — so somebody could type "war krank" and the engine would see three
   * missed actions and start forming a pattern about Wednesdays.
   */
  notes: Array<{ date: string; text: string }>
  /** Last week's observation, so it does not say the same thing twice. */
  previous: string | null
}

export function weeklyNoteUserMessage(ctx: WeeklyNoteContext): string {
  const lines = [
    `Ziel: ${ctx.goalText} (eingeordnet als ${ctx.archetype})`,
    `Woche ab ${ctx.weekStart}`,
    '',
    'Umsetzung nach Bereich:',
    ...(ctx.completion.length > 0
      ? ctx.completion.map((c) => `- ${c.domain}: ${c.done} von ${c.resolved} bewerteten Aktionen`)
      : ['- nichts bewertet']),
  ]

  if (ctx.deviations.length > 0) {
    lines.push('', 'Was die App selbst schon erkannt hat (nicht wiederholen, ergänzen):',
      ...ctx.deviations.map((d) => `- ${d}`))
  }
  if (ctx.strengths.length > 0) {
    lines.push('', 'Was zuverlässig läuft:', ...ctx.strengths.map((s) => `- ${s}`))
  }
  if (ctx.rules.length > 0) {
    lines.push('', 'Bereits bestätigte persönliche Regeln (nicht erneut vorschlagen):',
      ...ctx.rules.map((r) => `- ${r}`))
  }

  lines.push('', ctx.notes.length > 0
    ? 'Eigene Notizen aus den Check-ins — das ist der Teil, den sonst nichts liest:'
    : 'Keine eigenen Notizen in dieser Woche.')
  for (const note of ctx.notes) lines.push(`- ${note.date}: ${note.text}`)

  if (ctx.previous) {
    lines.push('', `Letzte Woche stand hier: „${ctx.previous}" — sag etwas anderes.`)
  }

  lines.push('', 'Eine Beobachtung, ein Vorschlag. Findest du nichts Belastbares, setz hasSomethingToSay auf false.')
  return lines.join('\n')
}


/**
 * The one task where the model asks instead of answers.
 *
 * The task itself carries `known` into its parse step, which is unlike the
 * others: whether a question is allowed depends on what this particular person
 * already told us, so the gate is not a constant. Built per call rather than
 * exported as a constant for exactly that reason.
 */
export function questionsTask(known: string[]): AiTask<IntakeQuestions> {
  return {
    name: 'questions',
    system: QUESTIONS_SYSTEM,
    // Deciding what is missing from an intake is a judgement, and the whole
    // value of the step is that the judgement is good enough to be worth
    // interrupting somebody for.
    effort: 'high',
    maxTokens: 1500,
    parse: (json) => {
      const parsed = intakeQuestionsSchema.safeParse(json)
      if (!parsed.success) return { ok: false, detail: parsed.error.message }
      const violations = checkQuestions(parsed.data, known)
      if (violations.length > 0) {
        return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
      }
      return { ok: true, value: parsed.data }
    },
  }
}

/**
 * What the person left blank, in the words the question step would use.
 *
 * Deterministic and handed to the model rather than left for it to infer,
 * because the intake it is shown is deliberately coarsened (see
 * `proposeUserMessage`) and a coarse answer looks exactly like a missing one.
 * Without this list the most likely question is one whose answer is already in
 * the database — which is the fastest way to make an app feel like it was not
 * listening.
 *
 * Doubles as the gate: `checkQuestions` refuses any question mentioning a field
 * that is *not* in here.
 */
export function openFields(input: PlanInput): string[] {
  const p = input.profile
  const open: string[] = []

  if (p.sport.experience === null) open.push('Leistungsstand')
  if (p.sport.preferredActivities.length === 0) open.push('bevorzugte Sportarten')
  if (input.schedule.workPattern === null) open.push('Arbeitsform')
  if (input.schedule.freeSlots.length === 0) open.push('freie Zeitfenster')
  if (p.nutrition.cooksAtHome === null) open.push('Kochen')
  if (p.nutrition.dietaryPattern === null) open.push('Ernährungsform')
  if (p.sleep.usualBedtime === null) open.push('Schlafzeiten')
  if (p.sleep.quality === null) open.push('Schlafqualität')
  if (p.mind.screenTimeHoursPerDay === null) open.push('Bildschirmzeit')
  if (p.mind.focusStruggle === null) open.push('Konzentration')
  if (p.mind.existingRoutines.length === 0) open.push('bestehende Routinen')
  if (input.goal.targetDate === null) open.push('Zieldatum')

  return open
}

/** The mirror of openFields: everything the model must not ask about again. */
export function knownFields(input: PlanInput): string[] {
  const open = new Set(openFields(input))
  return ALL_FIELDS.filter((field) => !open.has(field))
}

const ALL_FIELDS = [
  'Leistungsstand', 'bevorzugte Sportarten', 'Arbeitsform', 'freie Zeitfenster',
  'Kochen', 'Ernährungsform', 'Schlafzeiten', 'Schlafqualität',
  'Bildschirmzeit', 'Konzentration', 'bestehende Routinen', 'Zieldatum',
] as const

export function questionsUserMessage(input: PlanInput): string {
  const open = openFields(input)

  return [
    // The same coarsened picture the proposal gets. The question step must not
    // be the back door through which exact times and counts leave the machine.
    proposeUserMessage(input).replace(
      'Entwirf zwei bis fünf Aktionen, die genau dieses Ziel bearbeiten. Keine Wochentage, keine Uhrzeiten.',
      '',
    ).trimEnd(),
    '',
    open.length > 0
      ? `Offen geblieben ist: ${open.join(', ')}.`
      : 'Er hat alles ausgefüllt, wonach das Onboarding fragt.',
    '',
    'Brauchst du etwas davon oder etwas ganz anderes, um für dieses Ziel besser zu planen? Wenn nicht, sag das — needsMore false, leere Liste.',
  ].join('\n')
}

export function classifyUserMessage(rawText: string): string {
  return `Ziel des Nutzers: ${rawText.trim().slice(0, 500)}`
}

/**
 * The context a proposal is built from.
 *
 * Deliberately coarse. This leaves the machine and, on a free tier, is very
 * likely used to train somebody's model — so it says "geht spät ins Bett"
 * rather than "23:47", and "kocht selten" rather than a count. The plan does
 * not get worse for it: the archetype does the arithmetic, and the model is
 * being asked what to do, not when. Exact times stay in the database, where
 * the deterministic engine reads them.
 */
export function proposeUserMessage(input: PlanInput): string {
  const p = input.profile
  const slots = input.schedule.freeSlots
  const totalMinutes = slots.reduce((sum, s) => sum + s.minutes, 0)

  return [
    `Ziel in eigenen Worten: ${input.goal.rawText}`,
    `Von der App eingeordnet als: ${input.goal.archetype}`,
    input.goal.targetDate ? 'Es gibt ein Zieldatum.' : 'Kein Zieldatum genannt.',
    '',
    'Was dieser Mensch angegeben hat:',
    `- Alltag: ${p.sport.experience ?? 'kein Leistungsstand angegeben'}, Arbeitsform ${input.schedule.workPattern ?? 'keine Angabe'}`,
    `- Zeit pro Woche: ${slots.length} freie Zeitfenster, zusammen etwa ${roundTo(totalMinutes, 30)} Minuten`,
    `- Sport: mag ${p.sport.preferredActivities.join(', ') || 'keine Angabe'}; ausgeschlossen: ${p.sport.dislikedActivities.join(', ') || 'nichts'}`,
    `- Ernährung: kocht ${p.nutrition.cooksAtHome ?? 'keine Angabe'}, isst ${band(p.nutrition.eatsOutPerWeek, ['selten', 'gelegentlich', 'oft'], [1, 4])} auswärts, ${p.nutrition.dietaryPattern ?? 'keine Angabe'}`,
    `- Schlaf: ${sleepPhrase(p.sleep.usualBedtime)}, Qualität ${p.sleep.quality ?? 'keine Angabe'}`,
    `- Kopf: Bildschirmzeit ${band(p.mind.screenTimeHoursPerDay, ['wenig', 'mittel', 'viel'], [3, 6])}, Fokus ${p.mind.focusStruggle ?? 'keine Angabe'}`,
    p.mind.existingRoutines.length > 0
      ? `- Bestehende Routinen, an die sich anknüpfen lässt: ${p.mind.existingRoutines.map(coarsenRoutine).join(', ')}`
      : '- Keine bestehenden Routinen genannt.',
    ...answered(input),
    '',
    'Entwirf zwei bis fünf Aktionen, die genau dieses Ziel bearbeiten. Keine Wochentage, keine Uhrzeiten.',
  ].join('\n')
}

/**
 * What the model itself asked for, in its own words, with what came back.
 *
 * The point of the question step is lost if the answers do not reach the
 * proposal — the person would have been interrupted for nothing. Skipped
 * questions are included rather than dropped: "asked, chose not to say" tells
 * the model something, and hiding it invites the same ground being covered
 * again in the plan's reasoning.
 */
function answered(input: PlanInput): string[] {
  const answers = input.intakeAnswers ?? []
  if (answers.length === 0) return []

  return [
    '',
    'Auf deine eigenen Rückfragen hat er geantwortet:',
    ...answers.map((a) =>
      a.answer === null
        ? `- ${a.question} — übersprungen`
        : `- ${a.question} — ${a.answer.slice(0, 200)}`,
    ),
  ]
}


/**
 * A routine label with the clock taken out of it.
 *
 * The only free text in this message, and it was the one hole in the
 * coarsening this file claims to do: people write "Kaffee um 6:45", and that
 * is an exact daily timestamp leaving the machine — on a free tier, into
 * somebody's training set. Caught by the test that asserts no `HH:MM` survives.
 *
 * The useful part is the anchor, not the minute: "there is a morning routine
 * to hang something on" is what the model needs, and "6:45" tells it nothing
 * more than "morgens" does. The hour is read before it is dropped, so the
 * signal survives the redaction.
 */
function coarsenRoutine(label: string): string {
  const trimmed = label.trim().slice(0, 60)
  return trimmed.replace(/\b([01]?\d|2[0-3])[:.][0-5]\d\b/g, (_match, hour: string) =>
    partOfDay(Number(hour)),
  )
}

function partOfDay(hour: number): string {
  if (hour < 11) return 'morgens'
  if (hour < 15) return 'mittags'
  if (hour < 19) return 'nachmittags'
  return 'abends'
}

/** A number as one of three words, so no exact value leaves the machine. */
function band(
  value: number | null | undefined,
  words: [string, string, string],
  [low, high]: [number, number],
): string {
  if (value === null || value === undefined) return 'keine Angabe'
  if (value <= low) return words[0]
  if (value <= high) return words[1]
  return words[2]
}

function sleepPhrase(bedtime: string | null | undefined): string {
  if (!bedtime) return 'keine Schlafzeiten angegeben'
  const hour = Number(bedtime.slice(0, 2))
  if (Number.isNaN(hour)) return 'keine Schlafzeiten angegeben'
  if (hour >= 23 || hour < 4) return 'geht spät ins Bett'
  return 'geht früh ins Bett'
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

/** Models are told not to wrap the JSON, but a fence is the most common slip. */
export function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1] : text
}
