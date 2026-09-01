// The escapes, not the happy path.
//
// Three tests already covered "never recommend less sleep" and they were all
// green while nine sentences walked straight through the gate — because every
// one of them used the two phrasings the patterns happened to match. That is
// the specific way a safety check rots: it is written against the example that
// prompted it, and German lets the same instruction be said ten other ways.
//
// So this file is a list of escapes. Every entry is a sentence that was
// demonstrated passing checkProposal before the fix, plus the ordinary
// sentences the fix must not start refusing — because a rule that refuses
// everything passes any test you write for it and silences the product.

import { describe, expect, it } from 'vitest'
import { checkProposal, checkQuestions, checkWeeklyNote } from '@/lib/ai'
import type { IntakeQuestions, WeeklyNote } from '@/lib/ai/schemas'

const proposalSaying = (text: string) => ({
  headline: 'Ein Plan für dich',
  reasoning: 'Aus deinen Angaben abgeleitet.',
  actions: [{ title: 'Aktion', reasoning: text, minutes: 20, timesPerWeek: 3 }],
})

const noteSaying = (text: string): WeeklyNote => ({
  hasSomethingToSay: true,
  observation: 'Deine drei ausgefallenen Aktionen liegen alle auf denselben Tagen.',
  suggestion: text,
  question: null,
  basedOn: ['item.abc'],
})

const askingAbout = (text: string): IntakeQuestions => ({
  needsMore: true,
  questions: [{ question: text, why: 'Würde den Plan verändern, weil es die Tage betrifft.', options: [] }],
})

/** Every one of these passed the gate before. */
const LESS_SLEEP = [
  // Round three. The round-two rewrite used fixed slot counts, so one adverb
  // broke them — fourteen of fourteen escaped — and it put the object-exclusion
  // for `streichen` in a lookbehind, which German word order walks around
  // because the object comes first and the verb last.
  'Schlaf einfach eine Stunde weniger.',
  'Schlaf ruhig eine halbe Stunde weniger.',
  'Schlaf unter der Woche eine Stunde weniger.',
  'Schlafe an Trainingstagen etwas kürzer.',
  'Verschieb deine Bettzeit um eine Stunde nach hinten.',
  'Zieh dir eine Stunde vom Schlaf ab.',
  'Setz die Nachtruhe um eine Stunde herunter.',
  // Round two. The first fix enumerated constructions and still passed
  // fourteen of these fifteen, for two structural reasons rather than fifteen
  // accidents: it required a reduction *verb*, so a sentence that simply
  // prescribes a number below the floor had no rule at all; and it matched
  // "früher aufstehen" only as an infinitive, while German splits separable
  // verbs in exactly the form advice is written in.
  'Sechs Stunden Schlaf reichen für dich völlig aus.',
  'Begnüge dich mit sechs Stunden Schlaf, das genügt.',
  'Fünf Stunden pro Nacht sind für dich genug.',
  'Du brauchst nicht so viel Schlaf.',
  'Verkürz die Nacht ein bisschen.',
  'Steh eine Stunde früher auf und trainiere vor der Arbeit.',
  'Stell den Wecker eine Stunde früher als sonst.',
  'Zwei Stunden Nachtruhe weniger schaffst du locker.',
  'Du kannst locker mit weniger Nachtruhe auskommen.',
  'Nutz die Nacht zum Lernen.',
  'Trainiere früh morgens, dafür musst du eben eher raus.',
  'Geh später ins Bett, dann hast du mehr vom Abend.',
  'Schlaf eine Stunde weniger und trainiere dafür morgens',
  'Reduziere deinen Schlaf um dreissig Minuten',
  'Verkürze deinen Schlaf an Trainingstagen',
  'Kürze deine Nachtruhe für das Lauftraining',
  'Nimm dir eine Stunde vom Schlaf für das Training',
  'Geh später ins Bett und steh trotzdem früher auf',
  'Du könntest deinen Schlaf etwas reduzieren',
  'Eine Stunde weniger Schlaf schadet dir nicht',
  // The two adjacent phrasings the old patterns did catch. Kept so the fix
  // cannot be a replacement that quietly drops what already worked.
  'Steh eine Stunde früher auf und schlafe kürzer',
  'Du solltest weniger schlafen, um früher loszukommen',
]

const RESTRICTIVE = [
  // Round three: appending "…, dann läuft dein Training besser" defeated the
  // rule on any restriction, because the exception window looked 25 characters
  // ahead for a training word. The guard now matches the protected object
  // instead of trying to exclude the safe one.
  'Streiche Süßigkeiten, damit dein Training endlich besser läuft.',
  'Zucker ist ab jetzt gestrichen, dann klappt auch das Training.',
  'Alkohol wird gestrichen, dein Lauf profitiert davon.',
  // Round two. validate.ts's own header names the target — "a schema-valid
  // proposal can still tell someone to skip dinner, and that is the failure
  // mode that matters" — and "Ersetze das Abendessen durch einen Tee" is that
  // sentence. All twelve passed: the list was a vocabulary of eight stems and
  // missed the four commonest German reduction verbs.
  'Vermeide Süßigkeiten am Abend.',
  'Reduziere deinen Zuckerkonsum deutlich.',
  'Halbiere deine Portionen beim Abendessen.',
  'Ersetze das Abendessen durch einen Tee.',
  'Iss nur noch zweimal am Tag.',
  'Süßigkeiten sind ab jetzt gestrichen.',
  'Kohlenhydrate am Abend sind für dich gestrichen.',
  'Schränk die Süßigkeiten ein.',
  'Trink weniger Alkohol in dieser Woche.',
  'Nimm das Brot vom Speiseplan.',
  'Lass die Kohlenhydrate abends aus.',
  'Finger weg von Chips.',
  // PROPOSE_SYSTEM gives this exact sentence to the model as the thing not to
  // write, and promises the proposal is discarded whole. It was not.
  'Kein Handy mehr nach 22 Uhr',
  'Kein Zucker mehr am Abend',
  'Iss abends nichts mehr',
  'Lass abends das Brot weg',
  'Keine Kohlenhydrate mehr am Abend',
  'Verzichte ab jetzt auf Süßigkeiten',
]

/**
 * Sentences the app must stay able to say.
 *
 * The counterweight, and the reason the patterns enumerate constructions
 * instead of using a proximity window. A guard that also refuses "an den Tagen
 * mit schlechtem Schlaf hast du weniger umgesetzt" does not make anyone safer;
 * it deletes the observation the weekly note exists to make.
 */
const ORDINARY = [
  // Round three found fourteen of thirty legitimate sentences refused. Every
  // one of these is something the weekly note or the plan needs to say, and
  // the failure is silent: the note is discarded and Insights shows nothing.
  'Am Mittwoch das Training zu streichen war die richtige Entscheidung.',
  'Wir können das Krafttraining am Donnerstag streichen, wenn du müde bist.',
  'Die zweite Einheit der Woche kannst du bei schlechtem Schlaf streichen.',
  'Du hattest diese Woche keine Ausfälle mehr, das ist neu.',
  'Es gab keine Rückschläge mehr, seit du die Einheit auf den Morgen gelegt hast.',
  'Du isst weniger auswärts als in der Woche davor, das sieht man.',
  'Lass dich davon nicht aus der Ruhe bringen, eine Woche ist kein Muster.',
  'Acht Stunden Schlaf reichen dir offensichtlich völlig.',
  'Nach der Nacht reicht die Energie oft nicht für den Abendtermin.',
  'Du stehst am Wochenende früher auf als unter der Woche, ohne Wecker.',
  // The counterweight, and round two showed it is not theoretical: the first
  // fix used a 30-character proximity window — the very mechanism its own
  // comment said it avoided — and refused the single most important thing a
  // sleep-aware planner says. A guard that deletes the safe recommendation is
  // not a safer app.
  'Nach einer Nacht mit wenig Schlaf kannst du die Einheit kürzen.',
  'Bei schlechtem Schlaf lieber die Einheit verkürzen als ausfallen lassen.',
  'Nach Wochen mit wenig Schlaf hast du die Einheiten reduzieren müssen.',
  'Wenn dein Schlaf schlecht war, darfst du das Training streichen.',
  'Am Wochenende bleibt keine Zeit mehr für die zweite Einheit.',
  'Du hast keinen Sport mehr eingetragen, seit der Schicht am Montag.',
  'Nach 20 Uhr hattest du keine Energie mehr für die Einheit.',
  'Acht Stunden Schlaf tun dir sichtbar gut.',
  'Geh eine halbe Stunde früher ins Bett, das ist der kleinste Hebel.',
  'Dein Schlaf war diese Woche besser als sonst.',
  'An den Tagen mit schlechtem Schlaf hast du weniger umgesetzt.',
  'Diese Woche hast du weniger Aktionen geschafft als in der Woche davor.',
  'Nimm die kurze Mobilisation vor dem Schlafen dazu.',
  'Leg die lange Einheit auf die Tage ohne Eintrag.',
  'Du kommst abends später ins Bett, wenn du spät trainierst.',
  'Trink ein Glas Wasser mehr zu jeder Mahlzeit.',
  'Plane das Abendessen etwas früher ein.',
]

describe('never less sleep, however it is phrased', () => {
  it.each(LESS_SLEEP)('refuses a proposal saying %s', (text) => {
    expect(checkProposal(proposalSaying(text)).map((v) => v.rule)).toContain('never_less_sleep')
  })

  it.each(LESS_SLEEP)('refuses a weekly note saying %s', (text) => {
    expect(checkWeeklyNote(noteSaying(text)).map((v) => v.rule)).toContain('never_less_sleep')
  })
})

describe('additive only, however it is phrased', () => {
  it.each(RESTRICTIVE)('refuses a proposal saying %s', (text) => {
    expect(checkProposal(proposalSaying(text)).map((v) => v.rule)).toContain('additive_only')
  })

  it.each(RESTRICTIVE)('refuses a weekly note saying %s', (text) => {
    expect(checkWeeklyNote(noteSaying(text)).map((v) => v.rule)).toContain('additive_only')
  })
})

describe('what the guards must not swallow', () => {
  it.each(ORDINARY)('still allows %s', (text) => {
    expect(checkProposal(proposalSaying(text))).toEqual([])
    expect(checkWeeklyNote(noteSaying(text))).toEqual([])
  })
})

describe('the same rules apply to a question', () => {
  // A question is text a person reads and acts on. "Könntest du kürzer
  // schlafen, um früher zu trainieren?" is the same instruction with a
  // question mark, so it goes through the same families.
  it.each([
    ...LESS_SLEEP.slice(0, 4).map((t) => [t, 'never_less_sleep'] as const),
    ...RESTRICTIVE.slice(0, 3).map((t) => [t, 'additive_only'] as const),
  ])('refuses asking %s', (text, rule) => {
    // Names the rule. `length > 0` was satisfied by any unrelated violation —
    // a question can trip `must_be_a_question` and look like proof that the
    // sleep guard fired.
    expect(checkQuestions(askingAbout(`${text}?`)).map((v) => v.rule)).toContain(rule)
  })
})
