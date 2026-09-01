// Plausibility checks.
//
// The schema proves the shape. This proves the content is allowed. A
// schema-valid proposal can still tell someone to skip dinner, and that is the
// failure mode that matters.
//
// Violations are rejected, never repaired. Silently fixing a bad proposal
// would hide that the model produced one.

import type { GoalClassification, IntakeQuestions, WeeklyNote } from './schemas'

export type Violation = { rule: string; detail: string }

/**
 * Restriction framing. Additive advice only — see docs/GOAL_ARCHETYPES.md.
 *
 * `keine[nrs]?` used to miss the bare masculine/neuter `kein`, which let
 * through the exact counter-example PROPOSE_SYSTEM gives the model: rule 2
 * says to write "Handy ab 22 Uhr in einem anderen Raum laden" instead of
 * "kein Handy nach 22 Uhr", and promises such a proposal is discarded whole.
 * It was not. `keine?[nrs]?` covers kein, keine, keinen, keiner, keines.
 *
 * The three additions below close the same shape said differently: "iss abends
 * nichts mehr" and "lass abends das Brot weg" are restrictions that walk past
 * a list looking only for `weglassen` as one word.
 */
const RESTRICTIVE = [
  /\bverzicht/i, /\bverbot/i, /\bweglassen\b/i, /\bstreich/i,
  /\bkeine?[nrs]?\s+\S+\s+mehr\b/i,
  /\bnichts? mehr\s+(essen|trinken|naschen)\b/i,
  /\b(iss|trink|esse|trinke)\b[^.!?]{0,20}\bnichts mehr\b/i,
  /\blass\w*\b[^.!?]{0,25}\bweg\b/i,
  /\bnicht mehr essen\b/i, /\btabu\b/i,
  /\bfasten\b/i, /\bcheat.?day\b/i,
]

/** The app computes numbers. A model that states them is out of its lane. */
const NUMERIC_HEALTH_CLAIM = [
  /\b\d{3,5}\s?(kcal|kalorien)\b/i,
  /\b\d+\s?(g|gramm)\s+(eiweiß|protein|kohlenhydrate|fett)\b/i,
  /\b\d+(\.\d+)?\s?kg\s+(abnehmen|zunehmen|in)\b/i,
]

/**
 * Never, under any goal. The one rule CLAUDE.md states in absolute terms.
 *
 * The previous version claimed to match "both directions" and matched only
 * *adjacent* word pairs, so anything between the sleep word and the reduction
 * word walked through: "Schlaf eine Stunde weniger", "Reduziere deinen
 * Schlaf", "Kürze deine Nachtruhe", "Nimm dir eine Stunde vom Schlaf". Nine
 * such sentences were demonstrated passing the whole gate. The three tests
 * that covered this family all happened to use the two adjacent forms, so it
 * looked covered — which is why a safety family needs its escapes enumerated
 * rather than its happy path asserted.
 *
 * German puts the verb at the end, so the constructions are listed rather than
 * a proximity window used: proximity would also refuse "an den Tagen mit
 * schlechtem Schlaf hast du weniger umgesetzt", which is an observation the
 * weekly note exists to make. Verified in both directions — fifteen refusals
 * that must fire and nine ordinary sentences that must not.
 */
const SLEEP_REDUCTION = [
  /\b(weniger|k(ü|ue)rzer)\s+(zu\s+)?schlaf/i,
  /\bschlaf\w*\s+(k(ü|ue)rzer|k(ü|ue)rzen|reduzieren|opfern|weniger|verk(ü|ue)rzen)\b/i,
  // "Reduziere deinen Schlaf", "Kürze deine Nachtruhe" — verb first.
  /\b(k(ü|ue)rz|verk(ü|ue)rz|reduzier|opfer|streich|beschneid)\w*\s+(dein\w*\s+|den\s+|die\s+|etwas\s+)?(schlaf|nachtruhe)/i,
  // "deinen Schlaf etwas reduzieren" — verb last, as German prefers.
  /\b(schlaf|nachtruhe)\w*\b[^.!?]{0,30}\b(k(ü|ue)rzen|reduzieren|opfern|verk(ü|ue)rzen|streichen)\b/i,
  /\b(stunde|stunden|minuten|zeit)\s+weniger\s+(zu\s+)?schlaf/i,
  /\bschlaf\w*\s+\S+\s+(stunde|stunden|minuten)\s+weniger\b/i,
  /\b(vom|von deinem|beim)\s+schlaf\b[^.!?]{0,30}\b(nehmen|nimm|abzwack|abknapp|hol)/i,
  /\b(nimm|nehmen|hol|klau|zwack|knaps)\w*\b[^.!?]{0,40}\b(vom|von deinem|beim)\s+schlaf/i,
  /\bfr(ü|ue)her\s+auf(stehen|zustehen)\b.{0,40}\b(trainier|sport|laufen)/i,
  // Two halves that are each harmless and together mean less sleep.
  /\bsp(ä|ae)ter\s+ins\s+bett\b[^.!?]{0,60}\bfr(ü|ue)her\s+(auf|raus)/i,
  /\bnachts?\s+(durcharbeiten|wach bleiben)\b/i,
]

const MEDICAL = [
  /\bdiagnos/i, /\bheil(t|en|ung)\b/i, /\bkrankheit\b/i, /\bmedikament/i,
  /\bnahrungsergänzung/i, /\bsupplement/i, /\bpräparat/i,
]

function scan(text: string, patterns: RegExp[], rule: string): Violation[] {
  return patterns
    .filter((p) => p.test(text))
    .map((p) => ({ rule, detail: `"${text.slice(0, 80)}" matched ${p.source}` }))
}

/**
 * Plausibility for a plan proposal — the only path by which model-written text
 * reaches a person.
 *
 * A proposed action becomes something they are asked to *do* every week, which
 * is why the effort and frequency limits sit here rather than being left to
 * the reader's judgement.
 */
export function checkProposal(proposal: {
  headline: string
  reasoning: string
  actions: Array<{ title: string; reasoning: string; minutes: number; timesPerWeek: number }>
}): Violation[] {
  const violations: Violation[] = []

  const texts = [
    proposal.headline,
    proposal.reasoning,
    ...proposal.actions.flatMap((a) => [a.title, a.reasoning]),
  ]
  for (const text of texts) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
  }

  for (const [index, action] of proposal.actions.entries()) {
    const where = `action[${index}]`

    if (action.minutes > 45) {
      violations.push({
        rule: 'realistic_effort',
        detail: `${where}: ${action.minutes} min is more than someone keeps up weekly`,
      })
    }

    // Something demanded every single day is the first thing dropped, and its
    // failure then reads as a behavioural pattern that is really a planning one.
    if (action.timesPerWeek > 5) {
      violations.push({ rule: 'too_frequent', detail: `${where}: ${action.timesPerWeek}×/week` })
    }
  }

  return violations
}

/**
 * Advice that is generic is not advice.
 *
 * The whole claim of this feature is that it says something only this person's
 * data could produce. "Trink mehr Wasser", "bleib dran", "Schlaf ist wichtig"
 * are true of everyone, which makes them worthless here and indistinguishable
 * from a horoscope. A model under pressure to produce something every week
 * produces exactly these, so they are refused rather than trusted to the
 * prompt.
 *
 * Deliberately a short list of the actual offenders rather than a cleverness
 * detector: it catches the filler, and anything subtler is what `basedOn` and
 * the reviewer are for.
 */
const GENERIC_FILLER = [
  /\btrink(e)? (mehr|ausreichend|genug) wasser\b/i,
  /\bbleib dran\b/i, /\bdranbleiben lohnt\b/i,
  /\bschlaf ist wichtig\b/i, /\bbewegung ist wichtig\b/i,
  /\bjeder schritt z(ä|ae)hlt\b/i,
  /\bdu schaffst das\b/i, /\bsei stolz\b/i, /\bglaub an dich\b/i,
  /\bkleine schritte f(ü|ue)hren zum ziel\b/i,
  /\bh(ö|oe)r auf deinen k(ö|oe)rper\b/i,
]

/** Judging the person rather than naming what was different. */
const VERDICT = [
  /\bdisziplinlos\b/i, /\bfaul\b/i, /\bkeine disziplin\b/i,
  /\bdu musst dich\b/i, /\breiß dich\b/i, /\bausrede/i,
  /\bmangelnde motivation\b/i, /\bwillensschw/i,
]

/**
 * Plausibility for the weekly note.
 *
 * Same four families as a plan proposal — a note is text a person acts on, so
 * the rules cannot be softer just because it is not a plan item — plus the two
 * above, which only apply here: a proposal cannot be filler (it has to be an
 * action with minutes on it), and it is not written in the second person about
 * how the week went.
 */
export function checkWeeklyNote(value: WeeklyNote): Violation[] {
  const violations: Violation[] = []
  if (!value.hasSomethingToSay) return violations

  const texts = [value.observation, value.suggestion, value.question ?? '']
  for (const text of texts) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
    violations.push(...scan(text, GENERIC_FILLER, 'not_generic'))
    violations.push(...scan(text, VERDICT, 'no_verdict_on_the_person'))
  }

  // Saying something means having something to point at. Without this the
  // model can produce a confident sentence about a week it never read.
  if (value.basedOn.length === 0) {
    violations.push({ rule: 'must_cite_evidence', detail: 'basedOn is empty' })
  }
  if (value.observation.trim().length < 20 || value.suggestion.trim().length < 20) {
    violations.push({ rule: 'too_thin', detail: 'observation or suggestion is a fragment' })
  }

  return violations
}

export function checkClassification(value: GoalClassification): Violation[] {
  const violations: Violation[] = []
  violations.push(...scan(value.restated, MEDICAL, 'no_medical_claims'))
  violations.push(...scan(value.reasoning, MEDICAL, 'no_medical_claims'))

  // A metric without a unit, or a unit without a metric, is half an answer.
  if ((value.metricKey === null) !== (value.unit === null)) {
    violations.push({
      rule: 'metric_pair',
      detail: `metricKey=${value.metricKey} unit=${value.unit}`,
    })
  }

  return violations
}

// ------------------------------------------------- what it may not ask for ---

/**
 * Identity, contact details, and anything that turns an intake into a file.
 *
 * The consent text (ADR-083) promises that no name, e-mail address or date of
 * birth leaves the app. A question is the one place the model could ask for
 * exactly those and have the person type them in — after which they would be
 * in the answer, and the answer goes back to the model with the next request.
 * The promise has to be enforced on the way out too, not only on the way in.
 */
const IDENTITY = [
  /\bwie hei(ß|ss)t du\b/i, /\b(name|nachname|vorname)n?\b/i,
  /\bwie (darf|soll|kann) ich dich (nennen|ansprechen)\b/i,
  /\be-?mail/i, /\btelefon/i, /\bhandynummer\b/i, /\badresse\b/i,
  /\bwo (wohnst|lebst|arbeitest) du\b/i,
  // "In welcher Stadt lebst du?" walked past a list that only knew "wo".
  /\bwelche[rmn]?\s+(stadt|ort|land|region|plz)\b/i,
  /\bgeburtsdatum\b/i, /\bgeboren\b/i, /\bwie alt bist du\b/i,
  /\bpostleitzahl\b/i, /\bversicher(t|ung)\b/i, /\barbeitgeber\b/i,
]

/**
 * Questions that ask a person to diagnose themselves.
 *
 * "Hast du eine Essstörung?", "Nimmst du Antidepressiva?" — a model has no
 * business asking, this app has no business storing the answer, and the answer
 * would not change a plan it is allowed to build anyway. MEDICAL catches the
 * vocabulary; these catch the question forms that avoid it.
 */
const MEDICAL_QUESTION = [
  // Anchored on the *subject*, not on one sentence frame. The first version
  // keyed on "hast du … störung" and "nimmst du … medikamente", so
  // "Leidest du unter einer Essstörung?" — the reworded form of the comment's
  // own example — walked straight through, as did "Nimmst du Antidepressiva?".
  /\b\w*(st(ö|oe)rung|erkrankung|krankheit|diagnose|syndrom)\b/i,
  /\b(depress|angstzust|magersucht|bulimie|essst(ö|oe)rung|burnout|adhs|diabetes)/i,
  /\b(antidepressiva|psychopharmaka|tabletten|medikament|arznei|therapeut)/i,
  /\bleidest du\b/i,
  /\bnimmst du\b[^.!?]{0,30}\b(ein|etwas|regelm(ä|ae)(ß|ss)ig)\b/i,
  /\bbist du (schwanger|krank|depressiv|magers(ü|ue)chtig|in behandlung)\b/i,
  /\bin (therapie|behandlung)\b/i,
  /\b(arzt|(ä|ae)rztin|klinik|rezept|befund)\b/i,
]

/**
 * Questions any app could ask anybody.
 *
 * The whole justification for interrupting somebody at the end of a long
 * intake is that the model found a specific gap. "Was ist dein Ziel?" is not a
 * gap — it is the first thing they typed. A generic question is worse than no
 * question, because it spends the one moment of attention this step gets.
 */
const GENERIC_QUESTION = [
  /\bwas (ist|sind) dein\w*\s+(ziel|wunsch|traum)/i,
  /\bwie geht('|e)?s dir\b/i,
  /\bwas motiviert dich\b/i,
  /\bwie (wichtig|ernst) ist dir\b/i,
  /\bbist du bereit\b/i,
  /\bwie viel zeit hast du\b/i,
]

/**
 * Plausibility for the questions asked before a plan is built.
 *
 * @param known plain-language names of things the person already answered.
 *   Re-asking is not a safety problem but it is the fastest way to make the
 *   app feel like it was not listening — and it is the specific failure a
 *   model is most prone to here, because the intake it is shown is coarsened
 *   and a coarse answer reads like a missing one.
 */
export function checkQuestions(value: IntakeQuestions, known: string[] = []): Violation[] {
  const violations: Violation[] = []

  // The two halves have to agree. A model that says it needs nothing and then
  // asks three questions has not understood what it was asked, and taking
  // either half on its own would be picking the answer we prefer.
  if (!value.needsMore && value.questions.length > 0) {
    violations.push({
      rule: 'contradicts_itself',
      detail: `needsMore is false but ${value.questions.length} questions were asked`,
    })
  }
  if (value.needsMore && value.questions.length === 0) {
    violations.push({ rule: 'contradicts_itself', detail: 'needsMore is true with no question' })
  }

  for (const [index, q] of value.questions.entries()) {
    const where = `question[${index}]`
    const texts = [q.question, q.why, ...q.options]

    for (const text of texts) {
      violations.push(...scan(text, IDENTITY, 'no_identity_data'))
      violations.push(...scan(text, MEDICAL, 'no_medical_questions'))
      violations.push(...scan(text, MEDICAL_QUESTION, 'no_medical_questions'))
      violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
      violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    }

    violations.push(...scan(q.question, GENERIC_QUESTION, 'not_generic'))

    // A question is only worth asking if the model can say what the answer
    // would change. Without that the screen has nothing honest to show under
    // it, and the person is being asked to trust a form.
    if (!q.question.trim().endsWith('?')) {
      violations.push({ rule: 'must_be_a_question', detail: `${where}: no question mark` })
    }

    // Matched on what the field is about, not on its label.
    //
    // This used to be `asked.includes(field)`, so with "Schlafzeiten" already
    // answered, "Wann gehst du normalerweise ins Bett?" counted as a new
    // question — the one rewording anybody would actually write. A label is a
    // string the app chose; the person asks in their own words and so does the
    // model.
    const asked = q.question.toLowerCase()
    // The label OR the topic. Replacing the label check with a topic one lost
    // the plainest case — a question that names the field outright — which is
    // the kind of regression a widening is most likely to cause.
    const repeat = known.find(
      (field) =>
        asked.includes(field.toLowerCase()) || (FIELD_TOPICS[field]?.test(asked) ?? false),
    )
    if (repeat !== undefined) {
      violations.push({
        rule: 'asks_what_it_knows',
        detail: `${where}: "${repeat}" was already answered`,
      })
    }
  }

  return violations
}

/**
 * What each intake field is *about*, so a reworded question still counts as
 * already answered.
 *
 * Keyed by the same German labels `openFields` produces, so the two cannot
 * drift apart silently: a field with no entry here falls back to matching its
 * own label, which is the old behaviour and no worse.
 */
const FIELD_TOPICS: Record<string, RegExp> = {
  Leistungsstand: /\b(erfahr|anf(ä|ae)nger|fortgeschritten|leistungsstand|trainingsstand|wie lange trainierst)/i,
  'bevorzugte Sportarten': /\b(sportart|welchen sport|welche sportarten|trainierst du gern|magst du.*sport)/i,
  Arbeitsform: /\b(arbeit|beruf|job|schicht|homeoffice|b(ü|ue)ro|studium|studierst)/i,
  'freie Zeitfenster': /\b(zeit hast|wann hast du|freie? (zeit|tage|abende)|zeitfenster|wie viel zeit)/i,
  Kochen: /\b(koch|selbst zubereit|essen zubereit|am herd)/i,
  Ernährungsform: /\b(ern(ä|ae)hr|vegan|vegetarisch|isst du fleisch|ern(ä|ae)hrungsform)/i,
  Schlafzeiten: /\b(schlafzeit|schlafenszeit|ins bett|aufsteh|stehst du\b|wann.*schl(ä|ae)fst|weckerzeit|wecker)/i,
  Schlafqualität: /\b(schl(ä|ae)fst du (gut|schlecht)|schlafqualit(ä|ae)t|durchschlaf|wachst du.*nachts)/i,
  Bildschirmzeit: /\b(bildschirm|handy|display|screen|am telefon)/i,
  Konzentration: /\b(konzentr|fokus|ablenk|aufmerksam)/i,
  'bestehende Routinen': /\b(routine|gewohnheit|machst du (schon|bereits) (jeden|t(ä|ae)glich))/i,
  Zieldatum: /\b(bis wann|zieldatum|deadline|frist|wann willst du.*erreicht)/i,
}
