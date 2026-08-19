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
| `engine.energy.test.ts` | Mifflin-St Jeor gegen von Hand gerechnete Werte, Deckel und Untergrenze |
| `engine.safety.test.ts` | `clampGoal` verschiebt das Datum statt die Rate und formuliert als Zusage; Invarianten greifen bei manipulierten Plänen |
| `engine.invariants.test.ts` | Alle Sicherheitsgrenzen für **jedes** Profil, nicht nur für die, gegen die entwickelt wurde |
| `engine.assumptions.test.ts` | Onboarding-Abbruch ergibt trotzdem einen gültigen Plan mit dokumentierten Annahmen; Determinismus |
