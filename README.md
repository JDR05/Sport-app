# Personal Life Improvement System

Eine persönliche, adaptive Goal-Execution-App. Der Nutzer beschreibt Alltag, Möglichkeiten
und Ziele; das System erzeugt daraus einen realistischen Tages- und Wochenplan, vergleicht
anschließend Plan und tatsächliches Verhalten, erkennt wiederkehrende Muster und testet
gezielte Änderungen.

Erster und einziger Use Case im MVP: **„5 kg abnehmen"** in einem realistischen Zeitraum.

## Stand

Schritt 0 von 8 — Fundament und Projektregeln. Noch kein Feature-Code. Die Schrittfolge steht
in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Wo was steht

| Datei | Inhalt |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Dauerhafte Projektregeln — zuerst lesen |
| [`DECISIONS.md`](DECISIONS.md) | Entscheidungsprotokoll mit Begründungen |
| [`docs/`](docs/README.md) | Produktspezifikation, Architektur, Datenmodell, Adaptive Engine |
| `src/` | Anwendungscode |
| `tests/` | Automatisierte Tests |
| `prompts/` | Versionierte AI-Prompts und Schemas |
| `scripts/` | Entwicklungs- und Seed-Skripte |

## Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte eintragen, sobald Supabase eingerichtet ist (Schritt 2)
npm run dev
```

Prüfungen vor jedem Commit:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS)

Die Goal- und Plan-Engine ist deterministischer TypeScript-Code ohne Datenbank-, Netzwerk-
oder React-Abhängigkeit. Der AI-Layer sitzt hinter einem Adapter-Interface mit
Schema-Validierung und Fallback — die App bleibt ohne ihn vollständig benutzbar.

## Hinweis

Diese App gibt keine medizinischen Ratschläge und stellt keine Diagnosen. Gesundheitslogik
ist bewusst konservativ und in deterministischem Code abgesichert.
