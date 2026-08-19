# Final Architecture

Ergebnis von Phase 2. Dieses Dokument hat **Vorrang**, wo es früheren Dokumenten
widerspricht. `ARCHITECTURE.md` beschreibt weiterhin den Aufbau, `PRODUCT_SPEC.md` die
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

```ts
// lib/engine — Schritt 3
type PlanInput = {
  profile: Profile
  goal: Goal
  metrics: GoalMetric[]
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

// lib/engine/safety
clampGoal(goal, metrics, profile): { adjusted: boolean; targetDate: Date; reason?: string }
assertPlanInvariants(plan: PlanResult, input: PlanInput): void   // wirft bei Verletzung

// lib/adaptive — Schritt 6
refinePlan(plan, observations): PlanPatch                    // Planpflege, ab Tag 2
detectDeviations(observations, thresholds): Deviation[]      // ignoriert `unknown`
formHypothesis(deviation): Hypothesis | null
proposeExperiment(hypothesis, input): Experiment | null      // null, wenn Invariante verletzt
evaluateExperiment(experiment, behaviorMetrics): Decision    // NUR BehaviorMetric
derivePersonalRule(experiment, decision): PersonalRule | null

// lib/ai — Schritt 7
interface AiAdapter {
  suggestHypothesis(ctx): Promise<Result<Hypothesis>>
  phrasePlan(plan, ctx): Promise<Result<PlanCopy>>
  summarizeWeek(analysis): Promise<Result<InsightDraft[]>>
}
```

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
| Feldwirksamkeitstest | 3 | Jedes Onboarding-Feld aus Stufe 1 verändert nachweislich den Plan |
| Sicherheitsinvarianten | 3 | Gelten für alle Profil-Fixtures |
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
