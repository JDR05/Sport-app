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

import { goalClassificationSchema, planProposalSchema, weeklyNoteSchema } from './schemas'
import { checkClassification, checkProposal, checkWeeklyNote } from './validate'
import { CLASSIFY_SYSTEM, PROPOSE_SYSTEM, WEEKLY_NOTE_SYSTEM } from './prompts'
import type { GoalClassification, PlanProposal, WeeklyNote } from './schemas'
import type { PlanInput } from '@/lib/domain/types'

/** What a parse attempt can say. `implausible` means a safety rule fired. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; detail: string; implausible?: boolean }

export type AiTask<T> = {
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
      ? `- Bestehende Routinen, an die sich anknüpfen lässt: ${p.mind.existingRoutines.join(', ')}`
      : '- Keine bestehenden Routinen genannt.',
    '',
    'Entwirf zwei bis fünf Aktionen, die genau dieses Ziel bearbeiten. Keine Wochentage, keine Uhrzeiten.',
  ].join('\n')
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
