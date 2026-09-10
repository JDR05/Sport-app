# daily-brief · v1

Der einzige Prompt, der **jeden Tag** läuft.

## Warum es ihn gibt

Gemessen, nicht vermutet. In der laufenden Installation stand es so:

| Tabelle | Zeilen |
| --- | --- |
| `goals` mit `classified_by = 'ai'` | 1 |
| `goals` mit `ai_proposal` | 1 |
| `weekly_notes` | 3 |
| `ai_questions` | 0 |
| `insights` / `experiments` / `personal_rules` | 0 / 0 / 0 |

Die KI hat in vier Wochen fünfmal gesprochen — zweimal beim Anlegen des Ziels, dreimal
als Wochenimpuls. Dazwischen war sie weg. Das ist keine Einstellungsfrage, das war die
Architektur: jeder KI-Aufruf außer dem Wochenimpuls war **einmal pro Ziel** gedeckelt
(`intake_asked_at`, `ai_proposal_at`), und der Wochenimpuls hat zusätzlich
`MIN_DAYS_BETWEEN_IMPULSES = 2`.

Eine App, deren Kern ein persönliches Verhaltensmodell ist, darf nicht einmal pro Woche
etwas sagen.

## Was dieser Prompt kann, was die anderen nicht können

1. **Er sieht heute.** Der Wochenimpuls sieht eine Woche und redet über eine Woche. Dieser
   sieht die Zeilen, die gleich auf dem Bildschirm stehen, und redet über genau die.
2. **Er priorisiert.** Von drei bis fünf Aktionen sagt er, welche heute die eine ist.
   Bisher waren alle gleich wichtig, was heißt: keine.
3. **Er ändert etwas.** Alle anderen Prompts schreiben Text. Dieser darf **einen** Eingriff
   in den heutigen Tag vorschlagen, und der Mensch tippt ihn an.

## Was er nicht darf

Das Vokabular ist absichtlich das kleinste, das noch etwas taugt: `move` innerhalb von
heute, `drop` aus heute heraus. Kein `add`, kein „länger", kein „schwerer", kein anderer
Tag. Jede dieser Richtungen erhöht Belastung, und Belastung ist das, worum
`docs/GOAL_ARCHETYPES.md` Grenzen zieht. Ein Modell, das einen Tag nur verkleinern oder
umsortieren kann, kann niemanden ins Übertraining reden — unabhängig davon, was es glaubt.

Die zweite Hälfte steht in Code, nicht hier: `applicable()` prüft die id gegen die echten
heutigen Zeilen, gegen den Status (eine schon bewertete Aktion wird nicht mehr angefasst)
und gegen die Tageszeiten, die dieser Mensch überhaupt hat. `applyAdjust()` schreibt.
Ein Prompt war noch nie eine Sicherheitsmaßnahme und wird hier auch keine.

## Die schwerste Regel

`hasSomethingToSay: false`. Ein Feld, das jeden Tag gefüllt werden **muss**, wird an den
Tagen, an denen nichts war, mit Füllung gefüllt — und einmal Füllung reicht, damit die
Karte nie wieder gelesen wird. Ein gewöhnlicher Dienstag, an dem der Plan passt, ist ein
`false`, und dann existiert die Karte nicht.

Das ist dieselbe Regel wie bei `weekly-note` und `ask`, zum dritten Mal, und damit
Hausregel statt Einzelfallentscheidung.
