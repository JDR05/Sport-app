# AI-Architektur

## Rolle des AI-Layers

Der AI-Layer ist **Interpretation und Sprache**, nicht Entscheidung und Rechnung.

**Zuständig für:** Formulierung von Plänen und Erklärungen, Priorisierung innerhalb bereits
gültiger Optionen, Interpretation von Mustern, Vorschläge für Hypothesen und Experimente,
Insight-Texte.

**Nicht zuständig für:** Kalorien-, Bedarfs- und Fortschrittsberechnung, Sicherheitsgrenzen,
Authentifizierung, Berechtigungen, Datenbankintegrität, die Entscheidung, ob ein Experiment
angenommen wird.

Merksatz: Wenn eine falsche Antwort dem Nutzer schaden oder Daten beschädigen könnte, gehört
die Logik nicht in den AI-Layer.

## Adapter-Interface

```
interface AiAdapter {
  suggestHypothesis(context): Promise<Result<Hypothesis>>
  phrasePlan(plan, context): Promise<Result<PlanCopy>>
  summarizeWeek(analysis): Promise<Result<InsightDraft[]>>
}
```

Drei Implementierungen sind vorgesehen:

1. **MockAdapter** — deterministisch, ohne Netzwerk. Standard bis Schritt 7 und dauerhaft in
   Tests.
2. **ClaudeAdapter** — echtes Modell, wenn `ANTHROPIC_API_KEY` gesetzt ist.
3. **NullAdapter** — liefert immer den Fallback. Für den Nachweis, dass das Produkt ohne AI
   vollständig funktioniert.

Welcher Adapter aktiv ist, entscheidet die Konfiguration, nicht der aufrufende Code.

## Strukturierte Outputs

Jeder AI-Aufruf hat ein zod-Schema. Beispiel für einen Hypothesen-Vorschlag:

```
{
  priority: 'low' | 'medium' | 'high',
  hypothesis: string,
  confidence: number,        // 0..1
  experiment: { variable: string, change: string, durationDays: number },
  metric: string,
  reasoning: string
}
```

`reasoning` ist Pflicht — eine Empfehlung ohne Begründung wird verworfen.

## Validierung und Fallback

Jeder Aufruf durchläuft dieselbe Kette:

```
Aufruf → Timeout-Grenze → JSON-Parse → zod-Validierung
       → fachliche Plausibilitätsprüfung → Ergebnis
                                    │
       ungültig an irgendeiner Stelle ┘
                    ▼
            deterministischer Fallback + Log
```

Die fachliche Prüfung ist die eigentliche Absicherung: ein schema-gültiger Vorschlag kann
trotzdem unzulässig sein (etwa ein Experiment, das die Kaloriengrenze unterschreitet oder
mehr als eine Variable verändert). Solche Vorschläge werden verworfen, nicht korrigiert.

Ein Fallback ist nie ein kaputter Zustand: der Nutzer bekommt einen gültigen Plan mit
sachlicheren Texten, nicht eine Fehlermeldung.

## Kontext

Der Adapter erhält strukturierten Kontext: Profil, Ziele, Schedule, aktuelle Pläne, Verlauf,
Messungen, laufende Experimente und gelernte Regeln — als Daten, nicht als Fließtext.
Personenbezogene Daten werden auf das reduziert, was die jeweilige Aufgabe braucht.

## Prompts

Versioniert in `prompts/`, mit Dateinamensschema `<aufgabe>.v<n>.md`. Prompts werden nie
still geändert: eine inhaltliche Änderung erzeugt eine neue Version, damit ein Vorher-Nachher
-Vergleich möglich bleibt.

## Testfälle (Schritt 7 und 8)

Ungültiges JSON, fehlende Pflichtfelder, widersprüchliche Empfehlung, unzulässige
Gesundheits- oder Ernährungsempfehlung, Timeout, leere Antwort, Vorschlag mit mehr als einer
veränderten Variable. In allen Fällen muss das Produkt benutzbar bleiben.
