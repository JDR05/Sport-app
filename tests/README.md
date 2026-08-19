Automatisierte Tests.

```bash
npm run test          # einmalig
npm run test:watch    # im Watch-Modus
npm run plans         # die zehn Fixture-Pläne ausgeben statt nur prüfen
```

## Die beiden Gates

**`engine.personalization.test.ts`** — die wichtigste Qualitätsprüfung des Projekts. Zehn
stark unterschiedliche Profile erzeugen zehn Pläne; über alle 45 Paare wird die strukturelle
Distanz gemessen.

| Schwelle | Wert | Stand |
| --- | --- | --- |
| Mittlere paarweise Distanz | ≥ 0,45 | 0,72 |
| Minimale paarweise Distanz | ≥ 0,20 | 0,30 |

Beide Schwellen wurden **vor** der Implementierung festgelegt (ADR-014). Schlägt der Test
fehl, wird die Engine verbessert — nicht die Schwelle gesenkt.

Verglichen wird eine Signatur aus zehn strukturellen Merkmalen, bewusst ohne Uhrzeiten und
Freitexte: genau daran hätte ein schwacher Planer den Test trivial bestanden.

**`engine.fields.test.ts`** — jedes der 20 Stufe-1-Onboarding-Felder wird einzeln variiert und
muss den Plan verändern. Der zweite Block dokumentiert die vier Felder, die es nachweislich
nicht tun und deshalb nach Stufe 2 verschoben wurden.

## Die übrigen Dateien

| Datei | Prüft |
| --- | --- |
| `fixtures/profiles.ts` | Zehn Profile, darunter die drei Playbook-Personas, plus ein abgebrochenes Onboarding |
| `fixtures/observations.ts` | Geplante Aktionen und ihr tatsächlicher Ausgang, wochenweise gebaut |
| `engine.energy.test.ts` | Mifflin-St Jeor gegen von Hand gerechnete Werte, Deckel und Untergrenze |
| `engine.invariants.test.ts` | Alle Sicherheitsgrenzen für **jedes** Profil, nicht nur für die, gegen die entwickelt wurde |
| `engine.goalOrientation.test.ts` | Dasselbe Profil mit verschiedenen Zielen bekommt verschiedene Pläne |
| `engine.classify.test.ts` | Der deterministische Klassifikator, inklusive deutscher Komposita |
| `engine.assumptions.test.ts` | Onboarding-Abbruch ergibt trotzdem einen gültigen Plan mit dokumentierten Annahmen; Determinismus |
| `ai.validation.test.ts` | Schema- und Plausibilitätsprüfung der Modellantworten |
| `ai.fallback.test.ts` | Ohne Key, bei ungültigem JSON und bei Timeout bleibt das Produkt benutzbar |

## Die Adaptive Engine

Die Mehrzahl dieser Tests prüft, dass **nichts** passiert. Eine Erkennung, die zu früh
zuschlägt, macht das Produkt nicht etwas schlechter — sie macht es zu einem System, das
Menschen selbstbewusst Unwahres über sich erzählt.

| Datei | Prüft |
| --- | --- |
| `adaptive.detect.test.ts` | Eine einzelne Abweichung ist kein Muster; eine schlechte Woche ist kein Muster; `unknown` erzeugt und verwässert keine Quote; `not_relevant` ist ein Planungsfehler; wer alles verpasst, bekommt keinen Wochentag zugewiesen |
| `adaptive.experiment.test.ts` | Genau eine Variable, feste Laufzeit, Baseline vorher, Verhaltensmetrik; keine Hypothese über den Menschen; über alle 70 Kombinationen kein Vorschlag, der eine Invariante reißt |
| `adaptive.evaluate.test.ts` | Zielmetriken kommen nicht durch; eine kleine Verbesserung heißt „kein Effekt"; nur ein bestätigtes, gelaufenes Experiment erzeugt eine Regel; Regeln verblassen wieder |
| `adaptive.loop.test.ts` | Der geschlossene Kreis: aus wiederholten Ausfällen wird ein Plan, der den Tag nicht mehr nutzt — und jede der vier Regeln verändert nachweislich einen echten Plan |
