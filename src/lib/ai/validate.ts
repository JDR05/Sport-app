// Plausibility checks.
//
// The schema proves the shape. This proves the content is allowed. A
// schema-valid proposal can still tell someone to skip dinner, and that is the
// failure mode that matters.
//
// Violations are rejected, never repaired. Silently fixing a bad proposal
// would hide that the model produced one.

import type {
  AskAnswer, CommitmentInsights, GoalClassification, IntakeQuestions, WeeklyNote,
} from './schemas'

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
  /\bverzicht/i, /\bverbot/i, /\bweglassen\b/i,
  // Striking food is a restriction; striking a session after a bad night is
  // the safe advice a sleep-aware planner must be able to give.
  // Requires the object, rather than trying to exclude the safe one.
  //
  // Two attempts failed the other way round. A bare /streich/ refused "das
  // Training streichen", which is the correct advice after a bad night. A
  // lookbehind-plus-lookahead was worse: German puts the object first and the
  // verb last, so the commonest safe sentence fell in the dead zone between
  // the two windows — and appending "…, dann läuft dein Training besser"
  // defeated the rule on any restriction.
  //
  // What the rule is actually about is removing *food*. Food words are a small
  // closed list; the verbs that remove things are open. So the closed half is
  // what gets matched, in either order, and a session may be cut freely.
  /\b(streich|gestrichen|weglass|weggelassen)\w*\b[^.!?]{0,40}\b\w*(zucker|s(ü|ue)(ß|ss)|kohlenhydrat|brot|alkohol|snack|chips|nudeln|reis|essen|mahlzeit|kalorien|fett|limo|dessert|nachtisch)\w*/i,
  /\b\w*(zucker|s(ü|ue)(ß|ss)|kohlenhydrat|brot|alkohol|snack|chips|nudeln|reis|essen|mahlzeit|dessert|nachtisch)\w*\b[^.!?]{0,40}\b(streich|gestrichen|weglass|weggelassen)\w*/i,
  /\bvermeide\b/i, /\breduzier\w*\s+(dein|deinen|deine|den|die)?\s*\w*(konsum|zucker|alkohol|portion|menge)/i,
  /\bhalbier\w*/i, /\bschr(ä|ae)nk\w*\b[^.!?]{0,25}\bein\b/i, /\beinschr(ä|ae)nk\w*/i,
  /\bersetz\w*\b[^.!?]{0,30}\bdurch\b/i,
  /\bnur\s+noch\s+\w+(mal)?\s+(am tag|t(ä|ae)glich|pro tag)\b/i,
  /\bfinger\s+weg\b/i, /\bvom\s+speiseplan\b/i,
  /\blass\w*\b[^.!?]{0,35}\b\w*(zucker|s(ü|ue)(ß|ss)|kohlenhydrat|brot|alkohol|snack|chips|nudeln|reis|dessert)\w*\b[^.!?]{0,20}\b(weg|aus)\b/i,
  /\b(trink|iss|esse)\w*\s+weniger\s+\w*(zucker|alkohol|s(ü|ue)(ß|ss)|kohlenhydrat|brot|fleisch|kalorien)/i,
  /\bweniger\s+(alkohol|zucker|s(ü|ue)(ß|ss)igkeiten|kohlenhydrate|brot)\b/i,
  // "kein X mehr" — but not the observations, which are about capacity, not food
  // Also object-first rather than exception-list-first. A stop list was always
  // going to be incomplete: it refused "du hattest diese Woche keine Ausfälle
  // mehr, das ist neu" and "es gab keine Rückschläge mehr" — sentences the
  // weekly note exists to be able to say.
  /\bkeine?[nrs]?\s+\w*(zucker|s(ü|ue)(ß|ss)|kohlenhydrat|brot|alkohol|snack|chips|nudeln|reis|kaffee|koffein|handy|bildschirm|nikotin|zigarett)\w*\s+mehr\b/i,
  /\bnichts? mehr\s+(essen|trinken|naschen)\b/i,
  /\b(iss|trink|esse|trinke)\b[^.!?]{0,20}\bnichts mehr\b/i,
  /\bnicht mehr essen\b/i, /\btabu\b/i, /\bfasten\b/i, /\bcheat.?day\b/i,
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
  /\b(k(ü|ue)rz|verk(ü|ue)rz|reduzier|opfer|beschneid)\w*\s+(deine[nr]?\s+|den\s+|die\s+|etwas\s+)?(schlaf|nachtruhe|nacht\b)/i,
  /\b(deine[nr]?|den|die|dein)\s+(schlaf|nachtruhe)\w*\s+(etwas\s+|ein\s+bisschen\s+|deutlich\s+)?(k(ü|ue)rzen|reduzieren|opfern|verk(ü|ue)rzen)/i,
  /\b(stunde|stunden|minuten|zeit)\s+weniger\s+(zu\s+)?schlaf/i,
  // Was a fixed four-slot pattern, so "Schlaf einfach eine Stunde weniger"
  // broke it with one adverb. The gap is elastic now, and bounded by clause.
  /\bschlaf\w*\b[^.!?]{0,30}\b(stunde|stunden|minuten)\b[^.!?]{0,10}\bweniger\b/i,
  // The reduction word has to end its clause, or the sleep noun is not what it
  // governs: in "an den Tagen mit schlechtem Schlaf hast du weniger umgesetzt"
  // the object of `weniger` is the doing, and that sentence is an observation
  // the weekly note exists to make.
  /\bschlaf\w*\b[^.!?]{0,25}\b(k(ü|ue)rzer|weniger)\b(?=\s*[.,!?;]|\s+(und|als|dafür)\b|\s*$)/i,
  // Verb-last forms, which is how German actually says it.
  /\b(bettzeit|schlafenszeit|nachtruhe)\b[^.!?]{0,40}\b(nach hinten|sp(ä|ae)ter|verschieb|k(ü|ue)rz|herunter|reduzier)/i,
  /\b(verschieb|zieh|setz|nimm)\w*\b[^.!?]{0,40}\b(vom|die|deine)?\s*(schlaf|nachtruhe|bettzeit)\w*\b[^.!?]{0,25}\b(ab|herunter|nach hinten|weg)\b/i,
  /\b(stunde|stunden|minuten)\s+(schlaf|nachtruhe)\w*\s+weniger\b/i,
  /\b(vom|von deinem|beim)\s+schlaf\b[^.!?]{0,30}\b(nehmen|nimm|abzwack|abknapp|hol)/i,
  /\b(nimm|nehmen|hol|klau|zwack|knaps)\w*\b[^.!?]{0,40}\b(vom|von deinem|beim)\s+schlaf/i,
  // prescribing a number of hours below the floor
  /\b(vier|f(ü|ue)nf|sechs|4|5|6)\s*(bis\s+\w+\s*)?stunden?\b[^.!?]{0,25}\b(schlaf|nacht)/i,
  // Gated on the number, because the sentence is only unsafe when the number
  // is. "Acht Stunden Schlaf reichen dir offensichtlich völlig" is an
  // observation the note should be able to make, and "nach der Nacht reicht
  // die Energie nicht" is about energy, not about sleeping less.
  /\b(vier|f(ü|ue)nf|sechs|4|5|6)\s+stunden?\b[^.!?]{0,25}\b(reich(en|t)|gen(ü|ue)g(en|t))\b/i,
  /\b(reich(en|t)|gen(ü|ue)g(en|t))\b[^.!?]{0,25}\b(vier|f(ü|ue)nf|sechs)\s+stunden?\b/i,
  /\bbegn(ü|ue)g\w*\b[^.!?]{0,30}\b(stunden|schlaf|nachtruhe)/i,
  /\bbrauchst\s+(du\s+)?nicht\s+so\s+viel\s+schlaf/i,
  // separable verbs, which is how an imperative is actually written
  // `steh`, not `steh\w*`: the imperative "Steh früher auf" is advice, while
  // the indicative "Du stehst am Wochenende früher auf" is an observation
  // about this person that the note is there to make.
  /\bsteh\b[^.!?]{0,30}\bfr(ü|ue)her\b[^.!?]{0,15}\bauf\b/i,
  /\bm(u|ü)sst\s+du\b[^.!?]{0,25}\bfr(ü|ue)her\b[^.!?]{0,15}\bauf\b/i,
  /\bfr(ü|ue)her\s+auf(stehen|zustehen)\b/i,
  /\bwecker\b[^.!?]{0,30}\bfr(ü|ue)her/i,
  // Bare "später ins Bett" would also refuse the observation "du kommst
  // abends später ins Bett, wenn du spät trainierst". An imperative frame, or
  // the two harmless halves that together mean less sleep.
  /\b(geh|gehe|leg\s+dich|bleib)\w*\s+(ruhig\s+|erst\s+)?sp(ä|ae)ter\s+ins\s+bett/i,
  /\bsp(ä|ae)ter\s+ins\s+bett\b[^.!?]{0,60}\bfr(ü|ue)her\s+(auf|raus)/i,
  /\b(weniger|wenig)\s+nachtruhe/i,
  /\bnutz\w*\s+die\s+nacht\b/i,
  /\bnachts?\s+(durcharbeiten|wach bleiben)\b/i,
  /\bm(u|ü)sst?\s+(du\s+)?eben\s+(eher|fr(ü|ue)her)\s+raus/i,
  /\b(eher|fr(ü|ue)her)\s+raus\b/i,
]

const MEDICAL = [
  /\bdiagnos/i, /\bheil(t|en|ung)\b/i, /\bkrankheit\b/i, /\bmedikament/i,
  /\bnahrungsergänzung/i, /\bsupplement/i, /\bpräparat/i,

  // Naming a condition is a diagnosis whether or not the word "Diagnose"
  // appears. The list above caught the vocabulary of medicine and missed
  // medicine itself: "das klingt nach einem Eisenmangel" contains none of
  // those seven and is the single most likely unsafe sentence this product can
  // produce — somebody types "ich bin immer müde, woran liegt das?" and a
  // model speculates.
  //
  // The nutrient list is enumerated rather than matched on `\w*mangel`,
  // because "Schlafmangel" and "Zeitmangel" are ordinary German this app has
  // to be able to say: "nach Schlafmangel läuft es schlechter" is exactly the
  // observation the weekly note exists to make. The clinical nouns below do
  // take a compound prefix — "Schlafstörung" has no word boundary before
  // "störung", and a rule that misses it misses the commonest form.
  /\b(eisen|vitamin[\s-]?[a-d]?\d*[\s-]?|magnesium|n(ä|ae)hrstoff|hormon|schilddr(ü|ue)sen)mangel\b/i,
  /\b(depression|burnout|burn-out|an(ä|ae)mie|diabetes|reizdarm|migr(ä|ae)ne|schlafapnoe|apnoe|hashimoto|erschöpfungssyndrom)\b/i,
  // Attributing a condition, not merely naming one. The distinction is
  // deliberate and it is the prompt's own rule: a person who wrote "war krank"
  // must be able to hear "nach dem Infekt letzte Woche" back, because
  // acknowledging a circumstance they reported is different from telling them
  // what they have.
  /\b(hast|h(ä|ae)ttest|hat)\b[^.!?]{0,30}\b\w*(st(ö|oe)rung|syndrom|entz(ü|ue)ndung|infekt|erkrankung)\b/i,
  /\b(ist|w(ä|ae)re|k(ö|oe)nnte)\b[^.!?]{0,25}\bein(e|en|er)?\b[^.!?]{0,20}\b\w*(st(ö|oe)rung|syndrom|entz(ü|ue)ndung|infekt|erkrankung)\b/i,
  // Speculating towards a condition, without ever naming one outright.
  // "klingen nach" as well as "klingt nach": the plural is the likelier form,
  // because the subject is usually symptoms rather than a symptom.
  /\bkling(t|en) nach\b(?=[^.!?]*\b\w*(mangel|st(ö|oe)rung|syndrom|infekt|entz(ü|ue)ndung|erkrankung|problem)\b)/i,
  /\bdeutet\b[^.!?]{0,40}\b\w*(mangel|st(ö|oe)rung|syndrom|infekt|erkrankung)\b/i,
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
  actions: Array<{
    title: string
    reasoning: string
    /** What the action does. Optional: proposals predate it. */
    effect?: string | null
    minutes: number
    timesPerWeek: number
  }>
}): Violation[] {
  const violations: Violation[] = []

  const texts = [
    proposal.headline,
    proposal.reasoning,
    // `effect` explains a mechanism, which is exactly the sentence most likely
    // to drift into a health claim — "senkt deinen Blutdruck" is one word away
    // from "erklärt, was Bewegung mit dem Kreislauf macht". It goes through the
    // same four families as everything else here rather than being trusted
    // because it sounds educational.
    ...proposal.actions.flatMap((a) => [a.title, a.reasoning, a.effect ?? '']),
  ]
  for (const text of texts) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
  }

  for (const [index, action] of proposal.actions.entries()) {
    const where = `action[${index}]`

    // A mechanism is general; a promise is personal. "Regelmäßige Bewegung
    // verbessert die Schlaftiefe" is something the app may say. "Das verbessert
    // deinen Schlaf" is a guarantee about one person's body, and this product
    // does not make those — the whole feature would otherwise become the
    // health-claim machine it exists not to be.
    if (action.effect) {
      violations.push(...scan(action.effect, PERSONAL_PROMISE, 'no_promise_about_this_person'))
    }

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
 * A guarantee about one person's body, dressed as an explanation.
 *
 * Only ever applied to `effect`, the field that exists to explain a mechanism.
 * The distinction it draws is between "regelmäßige Bewegung verbessert die
 * Schlaftiefe" — a general statement the app may make — and "das verbessert
 * deinen Schlaf", which promises an outcome to a particular person. CLAUDE.md
 * forbids presenting results as certain, and an explanatory sentence is
 * precisely where that slips in unnoticed, because it sounds like teaching
 * rather than claiming.
 */
const PERSONAL_PROMISE = [
  /\b(verbessert|senkt|erh(ö|oe)ht|steigert|reduziert|st(ä|ae)rkt|repariert|beschleunigt)\b[^.!?]{0,20}\bdein(e|en|em|er)?\b/i,
  /\bdu wirst\b[^.!?]{0,40}\b(abnehmen|zunehmen|schlafen|schaffen|erreichen|merken)\b/i,
  // "Das macht dich schneller" is the same guarantee in four words, and it is
  // the form a model reaches for when the subject is somebody's own training.
  //
  // Narrowed to the adjectives that claim an improvement, because the same
  // three words carry a plain observation just as often: "das Spiel macht dich
  // müde" is a true and useful thing to say about a Tuesday, and refusing it
  // would cost the feature more than the rule protects.
  /\bmacht dich\b[^.!?]{0,15}\b(schneller|st(ä|ae)rker|fitter|ausdauernder|schlanker|ges(ü|ue)nder|besser|leistungsf(ä|ae)higer)\b/i,
  /\bgarantiert\b/i,
  /\bin \d+ (tagen|wochen|monaten)\b[^.!?]{0,30}\b(wirst|hast|bist)\b/i,
]

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
  // The filler survives an adverb: "hör einfach auf deinen Körper" is the same
  // empty sentence with one more word in it.
  /\bh(ö|oe)r\b[^.!?]{0,15}\bauf deinen k(ö|oe)rper\b/i,
]

/**
 * Judging the person rather than naming what was different.
 *
 * The first line covers the words somebody would use to insult themselves. The
 * second covers the same verdict phrased as a diagnosis of character — "da
 * fehlt dir die Disziplin" contains none of the words above and is the more
 * likely sentence, because it sounds constructive.
 */
const VERDICT = [
  /\bdisziplinlos\b/i, /\bfaul\b/i, /\bkeine disziplin\b/i,
  /\bdu musst dich\b/i, /\breiß dich\b/i, /\bausrede/i,
  /\bmangelnde motivation\b/i, /\bwillensschw/i,

  /\b(fehlt dir|fehlt es dir|dir fehlt)\b[^.!?]{0,25}\b(disziplin|willenskraft|durchhalteverm(ö|oe)gen|motivation|ehrgeiz|konsequenz)\b/i,
  /\bzu bequem\b/i,
  /\b(du willst|willst du) es (gar )?nicht (genug|wirklich|richtig)\b/i,
  /\bnimmst du (es|das) nicht ernst\b/i,
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

/**
 * Claiming to have done something the app did not do.
 *
 * This family exists only for the answer task, and it is the one risk that is
 * specific to it. Every other AI output in this product is a proposal shown
 * next to a button; an answer is prose in the first person, and a model asked
 * "kann ich das Training verschieben?" will happily reply "ich habe es auf
 * Samstag gelegt". Nothing was moved. The person then does not do it, and the
 * app has lied about the one kind of fact it exists to keep straight.
 *
 * Written as verb-first rather than as whole sentences because German puts the
 * participle at the end of the clause: "ich habe dein Training für morgen
 * abend verschoben" has eight words between the two halves.
 */
const FALSE_ACTION_CLAIM = [
  /\bich habe\b(?=[^.!?]*\b(verschoben|ge(ä|ae)ndert|angepasst|gel(ö|oe)scht|entfernt|hinzugef(ü|ue)gt|eingetragen|gek(ü|ue)rzt|umgeplant)\b)/i,
  /\bich hab\b(?=[^.!?]*\b(verschoben|ge(ä|ae)ndert|angepasst|gel(ö|oe)scht|entfernt|hinzugef(ü|ue)gt|eingetragen|gek(ü|ue)rzt|umgeplant)\b)/i,
  /\bhabe (ich )?(das|dein|deine|deinen|die|den)\b(?=[^.!?]*\b(verschoben|ge(ä|ae)ndert|angepasst|gek(ü|ue)rzt)\b)/i,
  /\bist (jetzt )?(verschoben|ge(ä|ae)ndert|angepasst|gek(ü|ue)rzt|eingetragen)\b/i,
  /\bich (verschiebe|(ä|ae)ndere|passe .{0,20}an|k(ü|ue)rze|trage .{0,20}ein) (das|dein|deine|deinen|die|den|es)\b/i,
  /\b(hab|habe) ich (f(ü|ue)r dich )?(erledigt|gemacht|umgestellt)\b/i,
]

/**
 * Plausibility for a free answer.
 *
 * The same six families as the weekly note — an answer is text a person acts
 * on, and the rules cannot be softer because the person asked for it — plus
 * the one above, which nothing else needs.
 *
 * `canAnswer: false` is checked too, unlike `hasSomethingToSay: false` on the
 * weekly note. The difference is that a declined note shows nothing at all,
 * while a declined answer still puts `needs` on screen: "dafür müsste ich
 * wissen, wie viel du abends noch isst" is a sentence a person reads, so it
 * goes through the same gate as any other.
 */
export function checkAnswer(value: AskAnswer): Violation[] {
  const violations: Violation[] = []

  for (const text of [value.answer, value.needs ?? '']) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
    violations.push(...scan(text, GENERIC_FILLER, 'not_generic'))
    violations.push(...scan(text, VERDICT, 'no_verdict_on_the_person'))
    violations.push(...scan(text, FALSE_ACTION_CLAIM, 'must_not_claim_to_have_acted'))
  }

  if (value.canAnswer) {
    // An answer is a statement about this person's data, so it has to name
    // which part. Without this the model can produce a fluent paragraph about
    // a week it never read — the failure mode `basedOn` exists to prevent
    // everywhere else in this file.
    if (value.basedOn.length === 0) {
      violations.push({ rule: 'must_cite_evidence', detail: 'basedOn is empty' })
    }
    if (value.answer.trim().length < 15) {
      violations.push({ rule: 'too_thin', detail: 'the answer is a fragment' })
    }
  } else if (value.needs === null || value.needs.trim().length < 10) {
    // Declining is allowed and often right. Declining without saying what
    // would have helped is a shrug, and a shrug is what this feature is
    // supposed to replace.
    violations.push({ rule: 'must_say_what_is_missing', detail: 'needs is empty' })
  }

  return violations
}

/**
 * Plausibility for a judgement about somebody's own training.
 *
 * The families are the ones every other output here goes through, plus
 * `PERSONAL_PROMISE`, which matters more in this task than anywhere else: the
 * note is advice about training, and "das macht dich schneller" is exactly the
 * sentence a model reaches for.
 *
 * `RESTRICTIVE` is deliberately absent, and this is the one place that is
 * right. That family exists to refuse food restriction — "verzichte auf",
 * "lass das Brot weg" — and it fires on the shape "kein <thing>". Half the
 * honest answers here have that shape: "das ersetzt kein Krafttraining" is a
 * factual statement about what a session is, not an instruction to give
 * something up. The food-restriction risk is covered because the note is about
 * sport and the model is told so; a nutrition instruction here would still be
 * caught by the numeric and medical families.
 */
export function checkCommitmentInsights(
  value: CommitmentInsights,
  /** The labels the model was given. It may not invent a commitment. */
  known: string[] = [],
): Violation[] {
  const violations: Violation[] = []

  for (const [index, insight] of value.insights.entries()) {
    const where = `insight[${index}]`

    violations.push(...scan(insight.note, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(insight.note, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(insight.note, MEDICAL, 'no_medical_claims'))
    violations.push(...scan(insight.note, GENERIC_FILLER, 'not_generic'))
    violations.push(...scan(insight.note, VERDICT, 'no_verdict_on_the_person'))
    violations.push(...scan(insight.note, PERSONAL_PROMISE, 'no_promise_about_this_person'))

    // A judgement about a commitment nobody has is a judgement about nothing,
    // and it would be matched against the real week by label — so an invented
    // one either does nothing or, worse, shadows a real entry.
    if (known.length > 0 && !known.includes(insight.label)) {
      violations.push({ rule: 'unknown_commitment', detail: `${where}: "${insight.label}"` })
    }
  }

  // Two judgements about the same commitment cannot both be applied, and
  // picking one would be picking the answer we prefer.
  const labels = value.insights.map((i) => i.label)
  if (new Set(labels).size !== labels.length) {
    violations.push({ rule: 'duplicate_commitment', detail: labels.join(', ') })
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
  // `ort` is deliberately not here: "An welchem Ort trainierst du lieber?" is
  // a question about a gym, not about an address.
  /\bwelche[rmn]?\s+(stadt|land|region|plz|postleitzahl)\b/i,
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
  // `\w*` on both ends, because German plurals append -en and a trailing \b
  // killed the match: the first widening refused "Kochst du nach Rezept?" and
  // permitted "Hast du Schlafstörungen?".
  /\w*(st(ö|oe)rung|erkrankung|krankheit|diagnose|syndrom|beschwerde|schmerz)\w*/i,
  /\b(depress|angstzust|magersucht|bulimie|burnout|adhs|diabetes)/i,
  /\b(antidepressiva|psychopharmaka|tablette|medikament|arznei|therapeut|schmerzmittel)\w*/i,
  /\bleidest du\b/i,
  // Anchored on medication, not on "nimmst du" plus anything. The broad form
  // refused "Nimmst du dir abends etwas Zeit für dich?".
  /\bnimmst du\b[^.!?]{0,30}\b(medikament|tablette|mittel|pr(ä|ae)parat|tropfen)\w*/i,
  /\bbist du (schwanger|krank|depressiv|magers(ü|ue)chtig|in behandlung)\b/i,
  /\bin (therapie|behandlung)\b/i,
  // `rezept` is a recipe before it is a prescription, and this app asks about
  // cooking. Only the medical compound counts.
  /\b(arzt|(ä|ae)rztin|klinik|befund|rezeptpflichtig|vorerkrank)\w*/i,
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
  // `wann hast du` alone made "Wann hast du zuletzt Sport gemacht?" a repeat.
  'freie Zeitfenster': /\b(zeit hast|wann hast du zeit|freie? (zeit|tage|abende)|zeitfenster|wie viel zeit)/i,
  Kochen: /\b(koch|selbst zubereit|essen zubereit|am herd)/i,
  Ernährungsform: /\b(ern(ä|ae)hrst du dich|ern(ä|ae)hrungsform|vegan|vegetarisch|isst du fleisch)/i,
  // `stehst du` alone made "Wie stehst du zu Krafttraining?" a repeat of
  // bedtimes. The separable verb needs its particle.
  Schlafzeiten: /\b(schlafzeit|schlafenszeit|ins bett|aufsteh|stehst du[^.!?]{0,20}\bauf\b|wann.*schl(ä|ae)fst|weckerzeit|wecker)/i,
  Schlafqualität: /\b(schl(ä|ae)fst du (gut|schlecht)|schlafqualit(ä|ae)t|durchschlaf|wachst du.*nachts)/i,
  Bildschirmzeit: /\b(bildschirm|handy|display|screen|am telefon)/i,
  // Bare `fokus` made "Worauf willst du dich zuerst fokussieren?" a repeat of
  // the concentration field, which is about being distractible, not about
  // priorities.
  Konzentration: /\b(konzentr|ablenk|aufmerksam|fokus\w*\s+(f(ä|ae)llt|schwer|leicht))/i,
  'bestehende Routinen': /\b(routine|gewohnheit|machst du (schon|bereits) (jeden|t(ä|ae)glich))/i,
  Zieldatum: /\b(bis wann|zieldatum|deadline|frist|wann willst du.*erreicht)/i,
}
