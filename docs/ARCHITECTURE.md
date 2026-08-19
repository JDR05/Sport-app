# Architektur

## Sechs Schichten

| # | Schicht | Verantwortung |
| --- | --- | --- |
| 1 | User / App | Screens und Interaktionen |
| 2 | Personal Plan | Today, Woche, Ziele, konkrete Aktionen |
| 3 | Adaptive Engine | Plan → Realität → Muster → Hypothese → Experiment → Lernen |
| 4 | Personal Model | Alltag, Ziele, Präferenzen, Verlauf, gelernte Regeln |
| 5 | AI Layer | Interpretation, Formulierung, Hypothesen-Vorschläge |
| 6 | Data / Rules | Datenbank, Validierung, Berechnungen, Sicherheit |

Der Datenfluss geht von unten nach oben; Entscheidungen mit Konsequenz entstehen in
Schicht 6 und 3, niemals in Schicht 5.

## Stack

- **Next.js 16** (App Router), TypeScript, Tailwind — eine responsive Web-App, ein Deployment
- **Supabase** — Postgres, Auth, Row Level Security
- **zod** — Validierung an jeder Grenze: Formulare, API, AI-Outputs
- **Vitest** — Unit-Tests der Engine
- **Playwright** — End-to-End-Flows ab Schritt 4

## Modulstruktur

```
src/
  app/                 Routen und Screens (Next.js App Router)
  components/          Wiederverwendbare UI-Bausteine, mobile-first
  lib/
    engine/            Goal & Plan Engine — REIN: keine DB, kein Netz, kein React
      safety.ts        Harte Gesundheitsgrenzen als Invarianten
      energy.ts        Grundumsatz, Bedarf, Defizit — deterministisch
      strategy.ts      Ziel + Profil + Constraints -> Wochenstrategie
      schedule.ts      Wochenstrategie + Zeitfenster -> Tagesaktionen
    adaptive/          Abweichungserkennung, Hypothesen, Experimente, Personal Rules
    ai/                Adapter-Interface, Schemas, Validierung, Fallback, Mock
    db/                Supabase-Clients, Queries, generierte Typen
    domain/            Gemeinsame Typen und Enums
docs/                  Produkt- und Architekturdokumente
prompts/               Versionierte AI-Prompts und Schemas
scripts/               Entwicklungs-, Seed- und Testskripte
tests/                 Automatisierte Tests inklusive Profil-Fixtures
```

## Die wichtigste Grenze

`src/lib/engine/` importiert nichts aus `db/`, `ai/` oder React. Ein- und Ausgabe sind
einfache Datenstrukturen. Das ist keine Stilfrage:

- Die Engine ist vollständig testbar, ohne Datenbank oder Modell.
- Der Personalisierungstest über zehn Profile läuft in Millisekunden.
- Der AI-Layer kann ausgetauscht werden oder ausfallen, ohne dass die Planlogik betroffen ist.
- Sicherheitsgrenzen lassen sich als Invarianten über alle Eingaben prüfen.

## Datenfluss beim Planen

```
Profile + Goal + Constraints + Schedule + PersonalRules
        │
        ▼  engine/  (deterministisch, getestet)
   Wochenstrategie  ──►  Tagesaktionen  ──►  gespeichert als plan / plan_items
        │
        ▼  ai/  (optional, validiert, mit Fallback)
   Formulierung, Priorisierung, Erklärungstexte
```

Fällt der AI-Schritt aus, existiert der Plan trotzdem — nur mit sachlicheren Texten. Das ist
der Unterschied zwischen einem Produkt mit AI-Unterstützung und einem AI-Wrapper.

## Analytics

Erfasst werden Aktivierung, Day-1/7/30-Retention, Plan Completion, Check-in-Rate, Experiment
Completion und Zielprogress. Kein Tracking über das hinaus, was diese Fragen beantwortet.
