# propose-plan.v1

Der Hebel-Prompt. Er ist der Grund, warum die App auf ein Ziel eingehen kann, für das kein
Archetyp gebaut wurde — siehe `docs/AI_CAPABILITIES.md` und ADR-041.

## Der einzige Prompt, der Aktionen erzeugt

Er erzeugt **Aktionen, die in den Plan gehen**: terminiert von der Engine, abhakbar, Teil der
Mustererkennung. Deshalb ist er streng — jede Regel unten ist eine, deren Verletzung die App
den ganzen Vorschlag verwerfen lässt.

Ein zweiter Prompt (`suggest.v1`) erzeugte einmal Anregungen *neben* dem Plan. Er ist mit
ADR-072 entfallen: unverbindliche Ideen neben einem Plan sind die Kartenflut, die die
UX-Prinzipien ausschließen, und zwei KI-Pfade nebeneinander sind eine Falle.

## Die wichtigste Regel

**Keine Termine.** Das Modell sagt *was* und *wie oft*. Wann etwas stattfindet, entscheidet
die Engine, die als einzige die freien Zeitfenster, harten Ausschlüsse, Ruhetage und den
Tagesdeckel kennt. Ein Modell, das Termine vorschlägt, umgeht genau die Prüfungen, die es
sicher machen.

## Änderungen

- v1 — erste Fassung.
