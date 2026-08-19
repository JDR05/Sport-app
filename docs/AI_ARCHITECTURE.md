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

Drei Implementierungen, alle gebaut:

1. **MockAdapter** — deterministisch, ohne Netzwerk. Aktiv, wann immer kein API-Key gesetzt
   ist, und dauerhaft in Tests. Kein Stub: er erzeugt echte, brauchbare Ausgaben aus dem
   Schlüsselwort-Klassifikator und den Angaben des Nutzers.
2. **ClaudeAdapter** — echtes Modell, sobald `ANTHROPIC_API_KEY` gesetzt ist. Läuft
   ausschließlich serverseitig; der Key erreicht den Browser nie.
3. **NullAdapter** — liefert nie etwas. Für den Nachweis, dass das Produkt ohne AI
   vollständig funktioniert; wird im Test über alle Profile und Ziele geführt.

Welcher Adapter aktiv ist, entscheidet die Konfiguration, nicht der aufrufende Code.

## Modelle und Kosten

Beide Aufgaben sind getrennt konfigurierbar (`AI_CLASSIFY_MODEL`, `AI_SUGGEST_MODEL`),
Voreinstellung `claude-opus-5`.

Die Aufrufe sind klein: Zieleinordnung rund 630 Token Eingabe und 150 Ausgabe, einmal pro
Nutzer; Wochenvorschläge rund 2.300 zu 600, einmal pro Woche. Daraus ergibt sich pro Nutzer
und Monat etwa:

| Modell | Preis je Mio. Token (rein/raus) | Kosten pro Nutzer/Monat |
| --- | --- | --- |
| `claude-haiku-4-5` | 1 $ / 5 $ | ~0,02 $ |
| `claude-sonnet-5` | 2 $ / 10 $ | ~0,05 $ |
| `claude-opus-5` | 5 $ / 25 $ | ~0,12 $ |

Der Systemprompt ist bei jedem Aufruf identisch und wird mit `cache_control` zwischengespeichert;
Cache-Treffer kosten ein Zehntel des Eingabepreises. In der Validierungsphase mit zehn Testern
liegen die Kosten damit im Bereich von Cent pro Monat. Kosten sind hier kein Argument — die
Frage ist, ob überhaupt etwas ausgegeben werden soll, bevor es Signal gibt.

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

**Umgesetzt in `tests/ai.validation.test.ts` und `tests/ai.fallback.test.ts`.** Die
Plausibilitätsprüfung weist ab: Verzichts- und Verbotsformulierungen, Kalorien- und
Nährwertzahlen (die rechnet die App selbst), jede Empfehlung zu weniger Schlaf, Diagnosen und
Nahrungsergänzung, sowie Vorschläge über 45 Minuten Aufwand. Verworfen wird, nicht korrigiert
— ein stilles Zurechtbiegen würde verbergen, dass das Modell etwas Unzulässiges geliefert hat.

Der Fallback ist über alle fünf Fehlerarten getestet: Timeout, ungültiges JSON,
Schemaverletzung, unplausible Antwort und API-Fehler führen jeweils zum deterministischen
Pfad, und die App sagt dem Nutzer, welcher Weg gegriffen hat.
