# propose-plan.v1

Der Hebel-Prompt. Er ist der Grund, warum die App auf ein Ziel eingehen kann, für das kein
Archetyp gebaut wurde — siehe `docs/AI_CAPABILITIES.md` und ADR-041.

## Ein Plan ist mehr als Sport

Seit ADR-101 lädt der Prompt ausdrücklich dazu ein, auch Aktionen für Kopf, Erholung und
Alltag vorzuschlagen — Atemübungen, ein paar Seiten lesen vor dem Schlafen, ein Spaziergang
ohne Handy, ein fester Abschluss des Arbeitstags. Solche Aktionen kosten kaum Zeit und keine
Belastung, also passen sie auf Tage, an denen schon Sport stattfindet.

Das war vorher nicht nur unerwähnt, sondern technisch unmöglich: die Engine maß jeden Tag an
der Frage „passt hier eine *Einheit* hin?", und ein Fußballtraining ließ von einem
75-Minuten-Fenster fünfzehn Minuten übrig — unter der Untergrenze für eine Einheit, also fiel
der ganze Tag aus dem Plan. Fünf Minuten Atmen hätten dort gepasst.

## Jede Aktion sagt, was sie bewirkt

`effect` ist seit ADR-101 Pflicht im Prompt und optional im Schema (ältere gespeicherte
Vorschläge haben keins). Ein Satz, **allgemein** formuliert:

* richtig: „Langsames Ausatmen senkt die Herzfrequenz und erleichtert das Einschlafen."
* verworfen: „Das verbessert deinen Schlaf."

Der Unterschied ist der zwischen einem Mechanismus und einem Versprechen an einen bestimmten
Menschen. `PERSONAL_PROMISE` in `validate.ts` setzt ihn durch — ein erklärender Satz ist genau
die Stelle, an der eine Gesundheitszusage unbemerkt durchrutscht, weil sie nach Lehre klingt
statt nach Behauptung.

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
