# propose-plan.v1

Der Hebel-Prompt. Er ist der Grund, warum die App auf ein Ziel eingehen kann, für das kein
Archetyp gebaut wurde — siehe `docs/AI_CAPABILITIES.md` und ADR-041.

## Was ihn von `suggest.v1` unterscheidet

`suggest` gab Anregungen neben dem Plan. Dieser hier erzeugt **Aktionen, die in den Plan
gehen**: terminiert von der Engine, abhakbar, Teil der Mustererkennung. Deshalb ist er
strenger — jede Regel unten ist eine, deren Verletzung die App den ganzen Vorschlag verwerfen
lässt.

## Die wichtigste Regel

**Keine Termine.** Das Modell sagt *was* und *wie oft*. Wann etwas stattfindet, entscheidet
die Engine, die als einzige die freien Zeitfenster, harten Ausschlüsse, Ruhetage und den
Tagesdeckel kennt. Ein Modell, das Termine vorschlägt, umgeht genau die Prüfungen, die es
sicher machen.

## Änderungen

- v1 — erste Fassung.
