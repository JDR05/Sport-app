# Zielarchetypen

Das zentrale Dokument der Kurskorrektur vom 19.08.2026. Es ersetzt die Annahme, das Produkt
sei eine Abnehm-App.

## Die Korrektur

Der Nutzer gibt **ein frei formuliertes Ziel** ein. Es kann aus jedem Bereich des Zielbilds
kommen — Körper, Gesundheit, Kopf, Leistung, Leben:

> „5 kg abnehmen“ · „besser schlafen“ · „10 km am Stück laufen“ · „weniger am Handy sein“ ·
> „endlich regelmäßig meditieren“ · „gesünder essen“ · „stärker werden“

Beide Quelldokumente nennen „5 kg abnehmen“ als ersten Use Case. Das war als **Testfall**
gemeint, nicht als Form des Produkts — und wurde in Schritt 3 und 4 fälschlich als Form
umgesetzt. Diese Korrektur stellt das gerade.

## Das Problem, das Archetypen lösen

Ist das Ziel beliebig, kann deterministischer Code nicht für jedes Ziel planen. Gleichzeitig
verlangen die Projektregeln, dass Berechnung und Sicherheitslogik **niemals** im LLM liegen.
Beides gleichzeitig geht nur über eine begrenzte Menge von Archetypen: Jeder bringt eine
eigene Planlogik und — das ist der wichtigere Teil — **eigene Sicherheitsgrenzen** mit.

Ein Kaloriendefizit ist bei einem Abnehmziel sinnvoll und bei einem Schlafziel unsinnig. Eine
Steigerungsregel ist beim Laufen zentral und bei einer Gewohnheit bedeutungslos. Eine
Sicherheitsgrenze, die für alles gilt, gilt für nichts.

## Die sechs Archetypen

| Archetyp | Erkennt Ziele wie | Zielmetrik (Beispiel) |
| --- | --- | --- |
| `body_composition` | abnehmen, zunehmen, Körperfett | `weight_kg` |
| `strength` | stärker werden, Muskelaufbau, Klimmzüge | `reps`, `load_kg` |
| `endurance` | 10 km laufen, Halbmarathon, längere Radtouren | `distance_km`, `duration_min` |
| `sleep_recovery` | besser schlafen, ausgeruhter sein, Regeneration | `sleep_hours`, `sleep_consistency` |
| `nutrition_quality` | gesünder essen, mehr Gemüse, weniger Zucker | `quality_score` |
| `habit_routine` | weniger Handy, meditieren, früher aufstehen, lesen | `adherence_rate` |

Was in keinen Archetyp fällt, bekommt `general_health`: die Gesundheitsbasis plus
KI-Vorschläge. **Nie eine Fehlermeldung, nie eine Absage.**

## Sicherheitsgrenzen je Archetyp

Diese Regeln sind deterministischer Code mit Tests, nicht Prompt-Anweisungen.

### `body_composition`
Kalorien-Untergrenze (1500 / 1200 kcal), Defizit höchstens 25 % des Bedarfs, Abnehmrate
höchstens 0,75 % Körpergewicht pro Woche und absolut höchstens 1,0 kg. Keine Crash-Diät,
keine kompensatorische Logik. Bei Zunahme-Zielen gilt die Rate gespiegelt.

### `strength`
Steigerung höchstens moderat pro Woche, verpflichtende Ruhetage, nie mehr als drei
Trainingstage am Stück, nie zwei Maximalbelastungen in Folge für dieselbe Muskelgruppe.

### `endurance`
Wochenumfang steigt höchstens um **10 %** gegenüber der Vorwoche — die klassische Regel gegen
Überlastungsverletzungen. Mindestens ein vollständiger Ruhetag. Nie „durch den Schmerz“.

### `sleep_recovery`
Die App darf **unter keinen Umständen** weniger Schlaf empfehlen. Mindest-Schlaffenster wird
erzwungen. Keine Empfehlungen zu Schlafmitteln oder Stimulanzien. Bei Hinweisen auf eine
mögliche Schlafstörung: Hinweis auf ärztliche Abklärung, keine Selbstbehandlung.

### `nutrition_quality`
Keine Eliminationsdiäten, keine Kalorienziele (das ist `body_composition`), keine Einteilung
in „verbotene“ Lebensmittel. Nur additive Empfehlungen: was dazukommt, nicht was wegfällt.

### `habit_routine`
**Höchstens eine neue Gewohnheit gleichzeitig** — One Change at a Time gilt hier wörtlich.
Keine Streak-Mechanik, die Druck erzeugt oder Rückschläge bestraft. Realistische
Mindestgrößen: lieber fünf Minuten täglich als dreißig einmal pro Woche.

### Für alle
Keine medizinischen Diagnosen. Keine Heilversprechen. Bei Unsicherheit reagiert die App
sicher, statt eine riskante Empfehlung zu erfinden.

## Zweispuriger Plan

Jeder Plan besteht aus zwei Spuren — das ist die eigentliche Produktidee:

```
        ┌─────────────────────────────────────────┐
        │  GESUNDHEITSBASIS                       │
        │  läuft bei jedem Ziel mit               │
        │  Bewegung · Ernährung · Schlaf · Erholung│
        └─────────────────────────────────────────┘
                          +
        ┌─────────────────────────────────────────┐
        │  ZIELSPUR                               │
        │  richtet sich nach dem Archetyp         │
        │  und den konkreten Angaben des Nutzers  │
        └─────────────────────────────────────────┘
```

Wer besser schlafen will, bekommt trotzdem Bewegung und Ernährung — auf einem Niveau, das
nicht mit dem Schlafziel konkurriert. Wer abnehmen will, bekommt trotzdem Schlaf und
Erholung, weil beides auf das Ziel einzahlt. **Allgemein gesünder werden und das eine Ziel
erreichen sind keine getrennten Produkte.**

Die Basis ist bewusst klein: sie darf die Zielspur nie überlagern. Auf Today bleiben es 3–5
Aktionen.

## Rolle der KI

Die KI rückt in den Kern. Sie ist zuständig für:

1. **Zieleinordnung** — freier Text zu Archetyp, Zielmetrik und Zeitraum
2. **Zielspezifische Vorschläge** — Anregungen und Verbesserungen, die über das hinausgehen,
   was ein Archetyp deterministisch abdecken kann
3. **Formulierung** — Pläne und Erklärungen in der Sprache des Nutzers

Sie ist **nicht** zuständig für: Berechnungen, Sicherheitsgrenzen, die Entscheidung, ob ein
Plan zulässig ist. Ein KI-Vorschlag, der eine Archetyp-Invariante verletzt, wird verworfen —
nicht korrigiert.

**Fallback:** Ohne API-Key oder bei ungültiger Antwort ordnet ein deterministischer
Klassifikator das Ziel per Schlüsselwörtern ein. Das Produkt bleibt vollständig benutzbar,
nur die Vorschläge sind allgemeiner. Das ist keine Notlösung, sondern die Bedingung dafür,
dass die App kein AI-Wrapper ist.

## Was das für die Tests bedeutet

Der Personalisierungstest wird **zweidimensional**: unterschiedliche Profile *und*
unterschiedliche Ziele müssen zu strukturell unterschiedlichen Plänen führen. Zwei Nutzer mit
identischem Alltag, aber den Zielen „abnehmen“ und „besser schlafen“, dürfen keine ähnlichen
Pläne bekommen — sonst ist die Zielorientierung nur behauptet.

Der Feldwirksamkeitstest wird **pro Archetyp** geführt. Aufsteh- und Schlafzeit sind für ein
Abnehmziel wirkungslos und für ein Schlafziel zentral; ein Feld gilt als nötig, wenn es für
**mindestens einen** Archetyp den Plan verändert.
