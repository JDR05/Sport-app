# Final Architecture

Ergebnis von Phase 2, korrigiert am 19.08.2026. Dieses Dokument hat **Vorrang**, wo es
früheren Dokumenten widerspricht — für alles, was Ziele betrifft, gilt zusätzlich
`GOAL_ARCHETYPES.md`.

> **Kurskorrektur.** Die ursprüngliche Fassung ging von einem einzigen Use Case
> („5 kg abnehmen") als Form des Produkts aus. Der Product Owner hat klargestellt, dass das
> Ziel offen ist: jede Art von Gesundheits- und Selbstverbesserungsziel. Die Abschnitte unten
> sind entsprechend angepasst; `GOAL_ARCHETYPES.md` trägt die Details. `ARCHITECTURE.md` beschreibt weiterhin den Aufbau, `PRODUCT_SPEC.md` die
Vision; die hier getroffenen Entscheidungen überschreiben beide im Konfliktfall. Grundlage
ist `PRODUCT_CRITIQUE.md`.

## Was sich gegenüber der Ausgangsplanung ändert

| Kritik | Entscheidung |
| --- | --- |
| K1 USP wirkt zu spät | Adaptation wird **zweistufig**: Planpflege ab Tag 2, Experimente ab statistischer Schwelle |
| K1 Personalisierung unsichtbar | Jedes Planelement trägt eine Begründung, die auf die Nutzereingabe referenziert |
| K2 Tracking-Abhängigkeit | Tagesabschluss unter 15 s; **fehlende Daten ≠ `missed`**; Check-in-Rate ist Kernmetrik |
| K3 „nur ChatGPT + Dashboard" | **Playbook wird ein eigener Screen**, ab Tag 1 sichtbar, mit Fortschritt zur ersten Regel |
| K4 Gewicht als Experimentmetrik | **Metrikklassen getrennt**: Verhalten wertet Experimente aus, Zielmetrik nie |
| K5 Today überladen | Today auf **drei Domains** reduziert: Ernährung, Training, Bewegung |
| K6 Deckelung als Absage | Deckelung wird als Zusage mit Datum formuliert |
| K7 Personalisierungstest zu schwach | Test misst **strukturelle** Distanz; zweiter Test prüft Feldwirksamkeit |
| K8 Preis zu früh getestet | Preisabfrage frühestens Monat 3; Phase 5 misst nur Absicht |
| **Kurskorrektur** | Ziel ist **frei formuliert**; sechs Archetypen mit je eigener Planlogik und eigenen Sicherheitsgrenzen |
| **Kurskorrektur** | Plan wird **zweispurig**: Gesundheitsbasis für alle plus Zielspur je Archetyp |
| **Kurskorrektur** | Die KI rückt **in den Kern** — Zieleinordnung und zielspezifische Vorschläge, mit deterministischem Fallback |
| **Kurskorrektur** | Onboarding wird **vollständig in einem Durchlauf**, statt gestaffelt |

## Gestrichen oder verschoben

**Aus dem MVP entfernt:** Self-Improvement-Aktionen als geplante Tagesaktionen (→ V2) ·
Termine und Zeitfenster auf Today (→ V3 mit Kalender) · Schlaf als geplante Aktion (bleibt als
Kontexterfassung) · Motivationsstile (→ V2) · `subscriptions` (→ V2) · Preisabfrage in der
Validierung (→ Monat 3).

**Neu im MVP, weil die Kritik es erzwingt:** Playbook-Screen · Planpflege-Mechanismus ·
Feldwirksamkeitstest.

Netto wird der MVP kleiner, nicht größer.

## Domänenmodell — die zwei Korrekturen

### Metrikklassen

```
BehaviorMetric   Erfüllungsquote, Trainingsanzahl, Snackhäufigkeit, Check-in-Rate
                 → kurze Fenster, geringes Rauschen
                 → EINZIGE zulässige Grundlage für Experiment-Auswertung

OutcomeMetric    Gewicht und andere Zielmetriken
                 → gleitender Mittelwert über lange Fenster
                 → nur Progress und Zielprognose, NIE Experimententscheidung
```

In `measurements` trägt jede Zeile ein `metric_class`. Die Engine akzeptiert in der
Experiment-Auswertung ausschließlich `behavior`. Das ist ein Typ-Constraint, keine Konvention.

### Beobachtungsstatus

```
planned        noch offen
done           erledigt
moved          verschoben, hat stattgefunden
missed         geplant, nicht gemacht          → Verhaltenssignal
not_relevant   passte objektiv nicht           → Planungsfehler, kein Verhaltenssignal
unknown        keine Eingabe des Nutzers       → NEU: geht nicht in Detection ein
```

`unknown` ist die Antwort auf K2. Ohne diesen Wert erzeugt jede Trackinglücke ein falsches
Verhaltensmuster.

## Zweistufige Adaptation

```
                    Beobachtungen
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      PLANPFLEGE                   EXPERIMENT
   ab Tag 2, deterministisch    ab statistischer Schwelle
   kleine Verschiebungen        eine Variable, feste Laufzeit
   als vorläufig markiert       Baseline + Auswertung
   erzeugt KEINE Regel          erzeugt bei Erfolg eine PersonalRule
```

Planpflege darf den Plan anpassen, aber niemals ins Personal Model schreiben. Nur bestätigte
Experimente erzeugen Regeln. Damit bleibt das Playbook glaubwürdig und der Nutzer sieht
trotzdem ab Tag 2 Bewegung.

## Schnittstellen

Verbindlich für die folgenden Schritte. Alle Engine-Signaturen sind rein: keine DB, kein
Netzwerk, kein React.

Die Signaturen unten sind durch die Kurskorrektur erweitert: `Goal` trägt den frei
formulierten Text und den erkannten Archetyp, `GoalMetric` ist nicht mehr auf `weight_kg`
festgelegt, und `PlanResult` liefert Basis und Zielspur getrennt.

```ts
// lib/engine — Schritt 3
type GoalArchetype =
  | 'body_composition' | 'strength' | 'endurance'
  | 'sleep_recovery' | 'nutrition_quality' | 'habit_routine'
  | 'general_health'   // Fallback: nie eine Absage

type Goal = {
  rawText: string          // was der Nutzer selbst geschrieben hat
  archetype: GoalArchetype
  targetDate: string | null
}

type PlanInput = {
  profile: Profile
  goal: Goal
  metrics: GoalMetric[]    // metricKey ist frei, nicht 'weight_kg'
  constraints: Constraint[]
  schedule: Schedule
  personalRules: PersonalRule[]
}

type PlanResult = {
  strategy: WeekStrategy
  items: PlannedItem[]
  assumptions: Assumption[]   // was mangels Angabe angenommen wurde (K1/Onboarding-Abbruch)
  rationale: Rationale[]      // je Item: warum, mit Bezug auf die Nutzereingabe (K1)
}

generatePlan(input: PlanInput): PlanResult

// lib/engine/archetypes — je Archetyp eine Strategie und eigene Invarianten
interface ArchetypeStrategy {
  archetype: GoalArchetype
  planGoalTrack(input: PlanInput, energy: EnergyResult): GoalTrack
  assertInvariants(plan: PlanResult, input: PlanInput): void
  clampGoal(input: PlanInput): ClampedGoal
}

// lib/engine/classify — deterministischer Fallback, wenn keine KI verfügbar ist
classifyGoalText(text: string): { archetype: GoalArchetype; confidence: number }

// lib/engine/safety
assertPlanInvariants(plan: PlanResult, input: PlanInput): void   // wirft bei Verletzung
// ruft die gemeinsamen Grenzen UND die des jeweiligen Archetyps auf

// lib/adaptive — Schritt 6
refinePlan(plan, observations): PlanPatch                    // Planpflege, ab Tag 2
detectDeviations(observations, thresholds): Deviation[]      // ignoriert `unknown`
formHypothesis(deviation): Hypothesis | null
proposeExperiment(hypothesis, input): Experiment | null      // null, wenn Invariante verletzt
evaluateExperiment(experiment, behaviorMetrics): Decision    // NUR BehaviorMetric
derivePersonalRule(experiment, decision): PersonalRule | null

// lib/ai — Schritt 7, gewachsen: fünf Aufgaben statt drei
interface AiAdapter {
  classifyGoal(rawText): Promise<AiResult<GoalClassification>>
  proposePlan(input): Promise<AiResult<PlanProposal>>       // ADR-041
  askQuestions(input): Promise<AiResult<IntakeQuestions>>   // ADR-084
  weeklyNote(ctx): Promise<AiResult<WeeklyNote>>            // ADR-086
  ask(ctx): Promise<AiResult<AskAnswer>>                    // ADR-096
}
```

Die letzte ist die einzige, die **der Mensch** anstößt. Alle anderen sind die App, die redet.

Jede Aufgabe hat Prompt, Schema und Sicherheitsprüfung an einer Stelle (`lib/ai/tasks.ts`),
gemeinsam für alle Adapter — ein schwächeres Modell erzeugt unsichere Formulierungen öfter,
nicht seltener, also muss das Gatter davor genau dasselbe sein.

Zwei Signaturen geben absichtlich `null` zurück: nicht jede Abweichung verdient eine
Hypothese, und nicht jede Hypothese ein zulässiges Experiment. Ein leeres Ergebnis ist der
Normalfall, kein Fehler.

## Abhängigkeiten der Schritte

```
Schritt 2  Datenfundament ─────────┐
                                   ▼
Schritt 3  Engine (rein) ──────────┼──► Schritt 4  UX/UI
                                   │           │
                                   └──► Schritt 5  Check-ins ──► Schritt 6  Adaptive
                                                                       │
                                                        Schritt 7  AI ─┘
                                                                       │
                                                        Schritt 8  QA ─┘
```

Schritt 3 hängt am Datenmodell nur über Typen, nicht über Laufzeit — die Engine ist ohne
Datenbank testbar und kann parallel zu Schritt 4 entstehen.

## Testgates

| Gate | Ab Schritt | Bedingung |
| --- | --- | --- |
| RLS-Isolation | 2 | Nutzer A sieht unter keinen Umständen Daten von Nutzer B |
| Struktureller Personalisierungstest | 3 | 10 Profile → strukturell verschiedene Pläne, Schwelle vorab fixiert |
| **Zielorientierungstest** | 3 | Gleiches Profil, verschiedene Zielarten → strukturell verschiedene Pläne |
| Feldwirksamkeitstest | 3 | Jedes Onboarding-Feld verändert für **mindestens einen** Archetyp den Plan |
| Sicherheitsinvarianten | 3 | Gelten für alle Profil-Fixtures **und alle sechs Archetypen** |
| `unknown` verzerrt nicht | 6 | Trackinglücken erzeugen keine Hypothese |
| Experiment nur auf Verhalten | 6 | Auswertung mit `OutcomeMetric` ist ein Typfehler |
| Produkt ohne AI benutzbar | 7 | Vollständiger Flow mit NullAdapter |

Die Schwellwerte für den Personalisierungstest werden **vor** der Implementierung
festgelegt und in `tests/` dokumentiert. Nachträgliches Justieren, bis der Test grün ist,
hebt seinen Zweck auf.

## Was bewusst offen bleibt

- Die konkrete Formel für den Energiebedarf wird in Schritt 3 gewählt und dort begründet.
- Die statistischen Schwellen der Detection werden in Schritt 6 an echten Fixture-Daten
  kalibriert, nicht vorab geraten.
- Ob Planpflege dem Nutzer zur Bestätigung vorgelegt oder still angewandt wird, entscheidet
  Schritt 5 anhand des dann sichtbaren UX-Flows.
