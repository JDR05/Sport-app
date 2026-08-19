# Adaptive Engine

Der Kern des Produkts und der einzige Grund, warum diese App kein Habit Tracker mit
KI-Texten ist.

## Der Zyklus

```
Goal → Plan → Action → Result → Analysis → Hypothesis
                                              │
        Adaptation ← Learning ← Result ← Experiment
```

## Schritt 1 — Detection

Eingang: geplantes Verhalten, tatsächliches Verhalten, Zeitpunkt, Kontext, Zielmetrik.

**Die wichtigste Regel: eine einzelne Abweichung ist kein Muster.** Bevor eine Hypothese
entsteht, müssen erfüllt sein:

- die Abweichung wiederholt sich (mehrfach, nicht einmalig),
- es liegt eine ausreichende Datenbasis vor (Mindestanzahl geplanter Instanzen),
- die betroffenen Items sind als `missed` markiert, nicht als `not_relevant`.

Wird die Schwelle nicht erreicht, passiert **nichts**. Kein Vorschlag, kein Hinweis, keine
Nachfrage. Verfrühte Interventionen sind der schnellste Weg, Vertrauen zu verlieren.

Gesuchte Muster: Abweichung nach Wochentag, nach Tageszeit, nach Bereich (Training,
Ernährung, Schlaf), nach Aufgabendauer, nach Position im Tagesablauf.

## Schritt 2 — Hypothese

Aus dem Muster wird eine Ursachenvermutung in der Sprache des Nutzers formuliert. Beispiel:
Muster „Training mittwochs zu 20 % erfüllt, sonst 85 %" → Hypothese „Mittwoch kollidiert mit
deinem Alltag."

Die Hypothese benennt eine **veränderbare** Ursache. „Der Nutzer ist unmotiviert" ist keine
zulässige Hypothese: daraus folgt kein Experiment.

## Schritt 3 — Intervention

Die kleinste sinnvolle Änderung, und **genau eine Variable**. Beispiel: Training von Mittwoch
auf Donnerstag verschieben — nicht gleichzeitig die Dauer kürzen.

Vor dem Vorschlag prüft die Engine die Sicherheitsgrenzen. Ein Experiment, das eine
Invariante verletzen würde, wird gar nicht erst erzeugt.

## Schritt 4 — Experiment

Feste Laufzeit, vorher definierte Metrik, vorher festgehaltene Baseline. Beispiel aus dem
Produktplan: „abends zu viel snacken" → Hypothese „tagsüber zu wenig gegessen" → 7 Tage
größeres Mittagessen → beobachtete Metrik: Snackhäufigkeit am Abend.

Der Nutzer nimmt an oder lehnt ab. Ablehnung ist selbst ein Signal und wird gespeichert.

## Schritt 5 — Evaluation

Ergebnis gegen Baseline, nicht gegen das Gefühl. Die Auswertung ist deterministisch und
berücksichtigt, dass kurze Zeiträume rauschen: eine Verbesserung unterhalb der
Rauschschwelle gilt als „kein Effekt", nicht als Erfolg.

## Schritt 6 — Decision

Drei mögliche Ausgänge: **behalten**, **verwerfen**, **weiter testen** (wenn die Datenbasis
noch zu dünn war). Jede Entscheidung wird mit Begründung gespeichert.

## Schritt 7 — Memory

Erfolgreiche Muster werden als `personal_rule` gespeichert und in der nächsten Planung
berücksichtigt. Beispiel: „Donnerstag ist für diesen Nutzer zuverlässiger als Mittwoch."

Regeln tragen ein `confidence` und können durch spätere gegenteilige Evidenz wieder
geschwächt werden — die Person ändert sich, das Modell muss das können.

## Beispiel im Zusammenhang

| Woche | Was passiert |
| --- | --- |
| 1 | Nutzer setzt Plan um, checkt ein. Kein Eingriff — zu wenig Daten. |
| 2 | System erkennt: Mittwochstraining wiederholt ausgefallen. Hypothese + Experiment. |
| 3 | Experiment läuft: Training auf Donnerstag. Ergebnis wird gemessen. |
| 4 | Erfüllungsquote höher → Regel übernommen, Plan aktualisiert. |
| 12 | Nicht nur ein Gewicht, sondern ein persönliches Playbook. |

## Was die Engine nicht tun darf

- Aus einer einzelnen Abweichung ein Muster machen.
- Mehrere Variablen gleichzeitig verändern.
- Ein Experiment vorschlagen, das eine Sicherheitsgrenze verletzt.
- `not_relevant` als Verhaltensversagen werten.
- Rückschläge moralisch bewerten.
- Einen Vorschlag machen, ohne die zugrunde liegenden Daten zeigen zu können.
