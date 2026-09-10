// Everything the app ever asks a model, defined once.
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

import {
  askAnswerSchema, commitmentInsightsSchema, dailyBriefSchema, goalClassificationSchema,
  intakeQuestionsSchema, planProposalSchema, weeklyNoteSchema,
} from './schemas'
import {
  checkAnswer, checkClassification, checkCommitmentInsights, checkDailyBrief, checkProposal,
  checkQuestions, checkWeeklyNote,
} from './validate'
import {
  ASK_SYSTEM, CLASSIFY_SYSTEM, COMMITMENTS_SYSTEM, DAILY_BRIEF_SYSTEM, FOLLOWUP_SYSTEM,
  PROPOSE_SYSTEM, QUESTIONS_SYSTEM, WEEKLY_NOTE_SYSTEM,
} from './prompts'
import type {
  AskAnswer, CommitmentInsights, DailyBrief, GoalClassification, IntakeQuestions, PlanProposal,
  WeeklyNote,
} from './schemas'
import { skippedAreas, type IntakeArea } from '@/lib/domain/intakeFocus'
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

/**
 * The app asking, weeks after the intake.
 *
 * Shares `checkQuestions` with the intake step rather than growing a second
 * gate, and that is the same reasoning this whole file exists for: a question
 * that asks after somebody's medication is refused identically whether it
 * arrives on day one or in week five. The only thing this adds is the ceiling
 * of one — a person mid-week is not filling in a form and will not work
 * through three.
 */
export function followUpTask(known: string[]): AiTask<IntakeQuestions> {
  const gate = questionsTask(known)
  return {
    ...gate,
    name: 'follow-up',
    system: FOLLOWUP_SYSTEM,
    maxTokens: 1200,
    parse: (json) => {
      const parsed = gate.parse(json)
      if (!parsed.ok) return parsed
      if (parsed.value.questions.length > 1) {
        return {
          ok: false,
          detail: `asked ${parsed.value.questions.length} questions where one is the ceiling`,
          implausible: true,
        }
      }
      return parsed
    },
  }
}

/**
 * What the app knows when it decides whether to ask something.
 *
 * The intake step sees a form. This sees a life: what was planned, what
 * happened, the reasons the person gave, and the fixed points of their week.
 * That is why the bar is higher rather than lower — a question that could have
 * been asked before anything happened has no business arriving in week three.
 */
export type FollowUpContext = {
  goalText: string
  archetype: string
  /** Fields the intake already has. The gate refuses a question about these. */
  known: string[]
  /** Fields nobody filled in. */
  open: string[]
  completion: Array<{ domain: string; done: number; resolved: number }>
  /** Reasons the person gave themselves, tallied. */
  reasons: string[]
  deviations: string[]
  /** The week they already had: football, the late shift, the lecture. */
  commitments: string[]
  notes: Array<{ date: string; text: string }>
  /** Everything the app has asked before, so it cannot ask it twice. */
  alreadyAsked: string[]
}

export function followUpUserMessage(ctx: FollowUpContext): string {
  const lines = [
    `Ziel: ${ctx.goalText} (eingeordnet als ${ctx.archetype})`,
    '',
    'Umsetzung nach Bereich:',
    ...(ctx.completion.length > 0
      ? ctx.completion.map((c) => `- ${c.domain}: ${c.done} von ${c.resolved} bewerteten Aktionen`)
      : ['- noch nichts bewertet']),
  ]

  if (ctx.reasons.length > 0) {
    lines.push('', 'Gründe, die er selbst angegeben hat (keine Vermutung):',
      ...ctx.reasons.map((r) => `- ${r}`))
  }
  if (ctx.deviations.length > 0) {
    lines.push('', 'Muster, die die App erkannt hat:', ...ctx.deviations.map((d) => `- ${d}`))
  }
  if (ctx.commitments.length > 0) {
    lines.push('', 'Feste Termine, die die App schon kennt:', ...ctx.commitments.map((c) => `- ${c}`))
  }
  if (ctx.notes.length > 0) {
    lines.push('', 'Eigene Notizen:', ...ctx.notes.map((n) => `- ${n.date}: ${n.text}`))
  }

  lines.push('', ctx.open.length > 0
    ? `Aus dem Onboarding offen geblieben ist: ${ctx.open.join(', ')}.`
    : 'Aus dem Onboarding ist nichts offen geblieben.')
  lines.push(`Bekannt ist bereits: ${ctx.known.join(', ') || 'nichts'}.`)

  if (ctx.alreadyAsked.length > 0) {
    lines.push('', 'Das hat die App schon einmal gefragt — frag nichts davon noch einmal:',
      ...ctx.alreadyAsked.map((q) => `- ${q}`))
  }

  lines.push('', 'Gibt es genau eine Sache, die du über seinen Alltag wissen müsstest, um besser zu planen? Wenn nicht, sag das — needsMore false, leere Liste.')
  return lines.join('\n')
}

/**
 * What this person's own training is worth, for the goal they actually have.
 *
 * The task that exists because the engine answered this with a lookup table.
 * The gate is built per call, like `questionsTask`, because "did it invent a
 * commitment" depends on which commitments this person has.
 */
export function commitmentsTask(known: string[]): AiTask<CommitmentInsights> {
  return {
    name: 'commitments',
    system: COMMITMENTS_SYSTEM,
    // Judging what somebody's sport contributes to a goal it was not chosen
    // for is the kind of reasoning the cheap setting is worst at, and the
    // answer shapes every week from here on.
    effort: 'high',
    maxTokens: 1500,
    parse: (json) => {
      const parsed = commitmentInsightsSchema.safeParse(json)
      if (!parsed.success) return { ok: false, detail: parsed.error.message }
      const violations = checkCommitmentInsights(parsed.data, known)
      if (violations.length > 0) {
        return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
      }
      return { ok: true, value: parsed.data }
    },
  }
}

/** What the model sees when it judges somebody's existing training. */
export type CommitmentsContext = {
  goalText: string
  archetype: string
  /** What the goal track would otherwise plan, in words. */
  planWouldPlan: string
  experience: string
  /** The person's own week, one line each. */
  commitments: Array<{ label: string; weekday: string; minutes: number; activity: string | null }>
  /** Sports they said they dislike, so nothing is suggested around them. */
  disliked: string[]
}

export function commitmentsUserMessage(ctx: CommitmentsContext): string {
  return [
    `Ziel: ${ctx.goalText} (eingeordnet als ${ctx.archetype})`,
    `Was die App für dieses Ziel sonst plant: ${ctx.planWouldPlan}`,
    `Leistungsstand: ${ctx.experience}`,
    ...(ctx.disliked.length > 0 ? [`Mag er nicht: ${ctx.disliked.join(', ')}`] : []),
    '',
    'Seine festen Termine:',
    ...ctx.commitments.map(
      (c) =>
        `- ${c.label} (${c.weekday}, ${c.minutes} min` +
        (c.activity ? `, Sportart: ${c.activity}` : '') +
        ')',
    ),
    '',
    'Beurteile jeden Termin: ersetzt er eine Einheit für dieses Ziel, und wie holt er das Meiste daraus?',
  ].join('\n')
}

export const askTask: AiTask<AskAnswer> = {
  name: 'ask',
  system: ASK_SYSTEM,
  // Somebody is waiting for this with the screen open, which is the one place
  // in the app where that is true of a model call. Still `high`: a fast wrong
  // answer about their own week is worse than a slow right one, and the
  // budget below is small enough that the difference is seconds.
  effort: 'high',
  maxTokens: 1200,
  parse: (json) => {
    const parsed = askAnswerSchema.safeParse(json)
    if (!parsed.success) return { ok: false, detail: parsed.error.message }
    const violations = checkAnswer(parsed.data)
    if (violations.length > 0) {
      return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
    }
    return { ok: true, value: parsed.data }
  },
}

/**
 * Everything the model may see when answering a question.
 *
 * Wider than the weekly note's context, and deliberately so: the note looks
 * back at one finished week, while a question can be about today, this
 * evening, or why Tuesday looks the way it does. Narrower than "the database",
 * equally deliberately — this is somebody's health data going to a third
 * party, and every field here had to earn its place by being the answer to a
 * question people actually ask.
 */
export type AskContext = {
  question: string
  goalText: string
  archetype: string
  today: string
  /** What is on today, with what became of it. */
  todayItems: Array<{
    title: string
    domain: string
    minutes: number | null
    status: string
    rationale: string
  }>
  /** The rest of the week as shape rather than detail: how full each day is. */
  weekShape: Array<{ date: string; planned: number; done: number }>
  completion: Array<{ domain: string; done: number; resolved: number }>
  /** What deterministic detection found, so an answer does not contradict it. */
  deviations: string[]
  /** Reasons the person gave themselves. Outrank anything inferred. */
  reasons: string[]
  rules: string[]
  notes: Array<{ date: string; text: string }>
  /** Earlier questions today, so it neither repeats itself nor loses the thread. */
  history: Array<{ question: string; answer: string }>
}

export function askUserMessage(ctx: AskContext): string {
  const lines = [
    `Frage: ${ctx.question}`,
    '',
    `Ziel: ${ctx.goalText} (eingeordnet als ${ctx.archetype})`,
    `Heute ist der ${ctx.today}.`,
    '',
    'Heute geplant:',
    ...(ctx.todayItems.length > 0
      ? ctx.todayItems.map(
          (i) =>
            `- ${i.title} (${i.domain}${i.minutes ? `, ${i.minutes} min` : ''}, Status: ${i.status})` +
            (i.rationale ? ` — geplant, weil: ${i.rationale}` : ''),
        )
      : ['- nichts (Ruhetag)']),
  ]

  if (ctx.weekShape.length > 0) {
    lines.push('', 'Die Woche im Überblick (Datum: geplant/erledigt):',
      ...ctx.weekShape.map((d) => `- ${d.date}: ${d.planned} geplant, ${d.done} erledigt`))
  }
  if (ctx.completion.length > 0) {
    lines.push('', 'Umsetzung nach Bereich:',
      ...ctx.completion.map((c) => `- ${c.domain}: ${c.done} von ${c.resolved} bewerteten Aktionen`))
  }
  if (ctx.reasons.length > 0) {
    lines.push('', 'Gründe, die die Person selbst angegeben hat (keine Vermutung):',
      ...ctx.reasons.map((r) => `- ${r}`))
  }
  if (ctx.deviations.length > 0) {
    lines.push('', 'Muster, die die App selbst erkannt hat:', ...ctx.deviations.map((d) => `- ${d}`))
  }
  if (ctx.rules.length > 0) {
    lines.push('', 'Bestätigte persönliche Regeln:', ...ctx.rules.map((r) => `- ${r}`))
  }
  if (ctx.notes.length > 0) {
    lines.push('', 'Eigene Notizen:', ...ctx.notes.map((n) => `- ${n.date}: ${n.text}`))
  }
  if (ctx.history.length > 0) {
    lines.push('', 'Was heute schon gefragt und beantwortet wurde:',
      ...ctx.history.map((h) => `- Frage: ${h.question}\n  Antwort: ${h.answer}`))
  }

  lines.push('', 'Antworte auf die Frage oben. Steht die Antwort nicht in diesen Daten, sag das und schreib in needs, was du wissen müsstest.')
  return lines.join('\n')
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
   * Why actions did not happen, said by the person rather than inferred.
   *
   * The difference between this and `deviations` is the difference between
   * knowing somebody and recognising a pattern. "Drei Mittwoche verpasst" is
   * an inference from a calendar; "zu müde, dreimal, alles Training" is a
   * statement. Where both exist, this one is the evidence.
   */
  reasons: string[]
  /**
   * The free text. The reason this feature exists.
   *
   * Collected every day since the check-in shipped and read by nothing until
   * now — so somebody could type "war krank" and the engine would see three
   * missed actions and start forming a pattern about Wednesdays.
   */
  notes: Array<{ date: string; text: string }>
  /**
   * Why it is being asked *now*.
   *
   * Null used to be the only case, because there was only one occasion: it was
   * Thursday. Now an impulse can be triggered by something that happened — the
   * same reason given three times, a domain going nowhere, a run going well —
   * and an impulse that ignores its own occasion and reviews the week in
   * general is the filler this feature was built to avoid.
   */
  occasion: string | null
  /** Last week's observation, so it does not say the same thing twice. */
  previous: string | null
}

export function weeklyNoteUserMessage(ctx: WeeklyNoteContext): string {
  const lines = [
    // First, where a model will not lose it. The occasion is what this impulse
    // is about; everything below is the context it is about it *in*.
    ...(ctx.occasion ? [`Anlass: ${ctx.occasion}`, ''] : []),
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
  if (ctx.reasons.length > 0) {
    lines.push('', 'Was die Person selbst als Grund angegeben hat (keine Vermutung — das hat sie getippt):',
      ...ctx.reasons.map((r) => `- ${r}`))
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

  lines.push('', ctx.occasion
    ? 'Eine Beobachtung zu genau diesem Anlass, ein Vorschlag. Findest du nichts Belastbares, setz hasSomethingToSay auf false.'
    : 'Eine Beobachtung, ein Vorschlag. Findest du nichts Belastbares, setz hasSomethingToSay auf false.')
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

/**
 * The intake steps this goal never showed, in the words the model already uses.
 *
 * Only whole steps, not single fields: "wir haben ihn nicht nach Körperdaten
 * gefragt" is something a model can act on, a list of twelve field names is
 * noise it will pick from at random.
 */
const AREA_LABEL: ReadonlyArray<readonly [IntakeArea, string]> = [
  ['body', 'Körperdaten'],
  ['sport', 'bevorzugte Sportarten'],
  ['nutrition', 'Ernährungsform'],
  ['sleep', 'Schlafzeiten'],
  ['mind', 'Bildschirmzeit'],
]

const ALL_FIELDS = [
  'Leistungsstand', 'bevorzugte Sportarten', 'Arbeitsform', 'freie Zeitfenster',
  'Kochen', 'Ernährungsform', 'Schlafzeiten', 'Schlafqualität',
  'Bildschirmzeit', 'Konzentration', 'bestehende Routinen', 'Zieldatum',
] as const

export function questionsUserMessage(input: PlanInput): string {
  const skipped = new Set(skippedAreas(input.goal.archetype))
  const notAsked = ([...AREA_LABEL] as [IntakeArea, string][])
    .filter(([area]) => skipped.has(area))
    .map(([, label]) => label)
  const open = openFields(input).filter((f) => !notAsked.includes(f))

  return [
    // The same coarsened picture the proposal gets. The question step must not
    // be the back door through which exact times and counts leave the machine.
    proposeUserMessage(input).replace(
      'Entwirf zwei bis fünf Aktionen, die genau dieses Ziel bearbeiten. Keine Wochentage, keine Uhrzeiten.',
      '',
    ).trimEnd(),
    '',
    // Two different silences, and telling them apart is the whole point of
    // this step now. "Nicht gefragt" is the app's decision: the intake only
    // asks what the plan for *this* goal reads, so somebody working on their
    // sleep was never asked how long they have to cook. "Offen" is the
    // person's: they were asked and skipped it. The first is the gap the model
    // is here to close if it thinks the goal needs it; the second is a
    // preference to respect rather than a hole to fill.
    notAsked.length > 0
      ? `Nicht gefragt, weil der Plan für dieses Ziel es nicht liest: ${notAsked.join(', ')}. Wenn du eines davon für dieses Ziel doch brauchst, frag danach.`
      : '',
    open.length > 0
      ? `Gefragt, aber offen gelassen: ${open.join(', ')}.`
      : 'Er hat alles ausgefüllt, wonach das Onboarding gefragt hat.',
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
  // Ranges are the case the first version missed: in "von 18 bis 19 Uhr" only
  // the second hour sits behind a preposition or an `Uhr`, so the first left
  // the machine verbatim. And the `Uhr` pattern used to swallow the hour while
  // abandoning its minutes, turning "Wecker 5 Uhr 30" into "Wecker morgens 30".
  //
  // So: the longest forms first, each consuming everything it replaces.
  const HOUR = '([01]?\\d|2[0-3])'
  const rules: Array<[RegExp, (hour: string) => string]> = [
    // 5 Uhr 30 — the word sits between the hour and its minutes.
    [new RegExp(`\\b(?:um|gegen|ab|nach|vor)?\\s*${HOUR}\\s*Uhr\\s*[0-5]\\d\\b`, 'gi'), (h) => partOfDay(Number(h))],
    // 18:30 Uhr · 6.45 Uhr — hour, minutes and the word together.
    [new RegExp(`\\b(?:um|gegen|ab|nach|vor)?\\s*${HOUR}\\s*[:.]\\s*[0-5]\\d\\s*(?:Uhr)?\\b`, 'gi'), (h) => partOfDay(Number(h))],
    // von 18 bis 19 Uhr · zwischen 18 und 19 Uhr — both ends at once.
    [new RegExp(`\\b(?:von|zwischen)\\s+${HOUR}\\s+(?:bis|und)\\s+(?:[01]?\\d|2[0-3])\\s*(?:Uhr)?\\b`, 'gi'), (h) => partOfDay(Number(h))],
    // 17-18 Uhr
    [new RegExp(`\\b${HOUR}\\s*[–-]\\s*(?:[01]?\\d|2[0-3])\\s*(?:Uhr)?\\b`, 'gi'), (h) => partOfDay(Number(h))],
    // 18 Uhr · 19h
    [new RegExp(`\\b(?:um|gegen|ab|nach|vor)?\\s*${HOUR}\\s*(?:Uhr|h)\\b`, 'gi'), (h) => partOfDay(Number(h))],
    // um 7 — a bare number is only a clock time behind a preposition, so
    // "3 Sätze" and "20 Minuten" survive as themselves.
    [new RegExp(`\\b(?:um|gegen|ab|nach|vor)\\s+${HOUR}\\b(?!\\s*(?:min|minuten|km|kg|x|×|%|s(ä|ae)tze))`, 'gi'), (h) => partOfDay(Number(h))],
  ]

  let out = label.trim().slice(0, 60)
  for (const [pattern, replace] of rules) {
    out = out.replace(pattern, (match, hour: string) => {
      // Keep a leading space the optional preposition group may have eaten, or
      // "Aufstehen 6:45" becomes "Aufstehenmorgens".
      const lead = /^\s/.test(match) ? ' ' : ''
      return `${lead}${replace(hour)}`
    })
  }
  return out.replace(/\s{2,}/g, ' ').trim()
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

/**
 * The JSON inside whatever the model actually sent.
 *
 * `stripCodeFence` handled the slip everybody predicts — a fence around the
 * whole answer — and nothing else. The first day the daily brief ran against
 * the configured provider it failed with `invalid_json`, and the logged body
 * was German prose containing a self-correction with arrows: the model had
 * written out its reasoning, revised one sentence, and put the object
 * somewhere in the middle. Every rule about bare JSON was in the prompt
 * already. A prompt is not a parser.
 *
 * So three attempts, cheapest first:
 *
 *   1. A fence anywhere in the text, not only around all of it.
 *   2. A bare array, passed through whole — no task here asks for one.
 *   3. The first balanced object, found by scanning.
 *
 * The scan tracks string literals and their escapes, which is the whole reason
 * it is a scan rather than a regex. `text.indexOf('{')` to `text.lastIndexOf('}')`
 * looks equivalent and is not: a reason field containing a brace, or a second
 * object in a trailing explanation, both make it capture too much and produce
 * an error message pointing at the wrong place.
 *
 * Returns the original when nothing looks like an object, so the caller's
 * `JSON.parse` still throws and still reports what actually came back.
 */
export function extractJson(text: string): string {
  const fenced = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/)
  const source = fenced ? fenced[1].trim() : text.trim()

  // No task in this file asks for a bare array, so one is passed through
  // whole rather than scanned. There is nothing to find inside it.
  if (source.startsWith('[')) return source

  // Scanned even when the text already starts with `{`, which is the bug the
  // first version of this function had: an answer that opens with the object
  // and closes with a sentence of commentary starts with a brace, so the fast
  // path returned the commentary along with it and JSON.parse failed on an
  // answer that was there all along.
  return firstBalancedObject(source) ?? source
}

/**
 * The first `{ … }` whose braces balance, ignoring braces inside strings.
 *
 * Returns null rather than a best guess when the object never closes — a
 * truncated answer is a failure, and half of one parsed as if it were whole is
 * worse than the failure.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && inString) {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

// ------------------------------------------------------- the day, every day ---

export const dailyBriefTask: AiTask<DailyBrief> = {
  name: 'daily-brief',
  system: DAILY_BRIEF_SYSTEM,
  // Reading a day and deciding there is nothing to say is the hard half. A
  // model given a low budget here fills the field, and the filled field is the
  // failure mode this whole feature is one bad day away from.
  effort: 'high',
  maxTokens: 1200,
  parse: (json) => {
    const parsed = dailyBriefSchema.safeParse(json)
    if (!parsed.success) return { ok: false, detail: parsed.error.message }
    const violations = checkDailyBrief(parsed.data)
    if (violations.length > 0) {
      return { ok: false, detail: violations.map((v) => v.rule).join(', '), implausible: true }
    }
    return { ok: true, value: parsed.data }
  },
}

/**
 * Today, as the model is allowed to see it.
 *
 * The narrowest context of any task in this file, and narrow on purpose: this
 * call happens every day, so the difference between "a week" and "a day plus
 * seven days of outcomes" is the difference between a bill that scales with
 * use and one that scales with use squared.
 *
 * `availableSlots` is the field that keeps a `move` honest. Without it the
 * model would be reasoning about early/midday/evening as if everyone had all
 * three, and would cheerfully move a session into a slot this person has
 * already said they do not have. It is still re-checked in code — a context
 * field is information, not a guarantee.
 */
export type DailyBriefContext = {
  goalText: string
  archetype: string
  /** ISO date, plus the weekday spelled out because a model reads it faster. */
  today: string
  weekday: string
  /** Today's actions that are still open, in the order the screen shows them. */
  items: Array<{
    id: string
    title: string
    domain: string
    /** Goal track or health baseline — a move that empties the goal track is worse. */
    track: string
    slot: string | null
    durationMin: number | null
  }>
  /** The slots this person has today. A move may not leave this set. */
  availableSlots: string[]
  /**
   * The last seven days, resolved actions only.
   *
   * `unknown` is left out rather than sent as a third state, because ADR-011
   * says an untouched action is not evidence of anything — and a model handed
   * fifty "unknown" rows will read them as fifty failures.
   */
  recent: Array<{
    date: string
    weekday: string
    title: string
    domain: string
    /** 'done' or 'missed'. */
    status: string
    /** What the person themselves said, when they said anything. */
    reason: string | null
  }>
  /** The last seven check-ins. The half nothing else on this screen reads. */
  checkIns: Array<{
    date: string
    energy: number | null
    stress: number | null
    sleepHours: number | null
    note: string | null
  }>
  /** Confirmed personal rules, so it does not propose what is already true. */
  rules: string[]
  /** Fixed appointments today, so a move does not land on top of one. */
  commitments: string[]
  /** Yesterday's line, so two days do not read the same. */
  previous: string | null
}

export function dailyBriefUserMessage(ctx: DailyBriefContext): string {
  const lines = [
    `Ziel: ${ctx.goalText} (eingeordnet als ${ctx.archetype})`,
    `Heute: ${ctx.weekday}, ${ctx.today}`,
    '',
    ctx.items.length > 0
      ? 'Heute offen — nur diese ids darfst du verwenden:'
      : 'Heute ist nichts mehr offen.',
    ...ctx.items.map((i) => {
      const parts = [i.domain, i.track === 'goal' ? 'Zielspur' : 'Basis']
      if (i.slot) parts.push(SLOT_WORDS[i.slot] ?? i.slot)
      if (i.durationMin) parts.push(`${i.durationMin} min`)
      return `- ${i.id}: ${i.title} (${parts.join(', ')})`
    }),
    '',
    `Tageszeiten, die dieser Mensch heute hat: ${
      ctx.availableSlots.map((s) => SLOT_WORDS[s] ?? s).join(', ') || 'keine angegeben'
    }`,
  ]

  if (ctx.commitments.length > 0) {
    lines.push('', 'Feste Termine heute:', ...ctx.commitments.map((c) => `- ${c}`))
  }

  lines.push('', ctx.recent.length > 0
    ? 'Die letzten sieben Tage, nur was bewertet wurde:'
    : 'In den letzten sieben Tagen wurde nichts bewertet.')
  for (const r of ctx.recent) {
    const said = r.reason ? ` — angegebener Grund: ${r.reason}` : ''
    lines.push(`- ${r.weekday} ${r.date}: ${r.title} (${r.domain}) ${
      r.status === 'done' ? 'geschafft' : 'nicht geschafft'
    }${said}`)
  }

  if (ctx.checkIns.length > 0) {
    lines.push('', 'Check-ins der letzten Tage:')
    for (const c of ctx.checkIns) {
      const parts: string[] = []
      if (c.energy !== null) parts.push(`Energie ${c.energy}`)
      if (c.stress !== null) parts.push(`Stress ${c.stress}`)
      if (c.sleepHours !== null) parts.push(`Schlaf ${c.sleepHours} h`)
      if (c.note) parts.push(`Notiz: ${c.note}`)
      lines.push(`- ${c.date}: ${parts.join(', ') || 'nichts eingetragen'}`)
    }
  }

  if (ctx.rules.length > 0) {
    lines.push('', 'Bereits bestaetigte persoenliche Regeln (nicht erneut vorschlagen):',
      ...ctx.rules.map((r) => `- ${r}`))
  }

  if (ctx.previous) {
    lines.push('', `Gestern stand hier: „${ctx.previous}" — sag etwas anderes.`)
  }

  lines.push('', 'Ein Satz zu heute, hoechstens eine Aenderung. Gibt es keinen Anlass, setz hasSomethingToSay auf false.')
  return lines.join('\n')
}

const SLOT_WORDS: Record<string, string> = {
  early: 'frueh',
  midday: 'mittags',
  evening: 'abends',
}
