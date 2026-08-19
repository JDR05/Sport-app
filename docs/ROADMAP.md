# Roadmap

## Entwicklungsstufen

| Stufe | Inhalt | Ziel |
| --- | --- | --- |
| **V0** Prototype | UX, Screens, Beispielplan, klickbarer Flow | Idee verstehen |
| **V1** Functional MVP | Echte Nutzer, Datenbank, Ziele, Plan, Check-in, Progress, erste Anpassungen | Nutzung validieren |
| **V2** Adaptive Product | Mustererkennung, Experimente, Personal Rules, Langzeitmodell | Beweisen, dass es besser wird als ein AI-Coach |
| **V3** Expansion | Health, Wearables, Kalender, Ernährung, weitere Module | Skalieren |

## Schrittfolge der Umsetzung

Nach jedem Schritt: committen, pushen, Stopp für das Review des Product Owners.

| Schritt | Inhalt | Status |
| --- | --- | --- |
| 0 | Fundament: Projektstruktur, `CLAUDE.md`, `DECISIONS.md`, Phase-0-Dokumente | **erledigt** |
| 1 | Product Critic: `PRODUCT_CRITIQUE.md`, daraus `FINAL_ARCHITECTURE.md` | **erledigt** |
| 2 | Datenfundament: Supabase-Projekt, Migrations, RLS, generierte Typen, Tests | **erledigt** |
| 3 | Goal & Plan Engine, Sicherheitsinvarianten, Struktur- und Feldwirksamkeitstest | **erledigt** |
| 3b | **Umbau auf Zielarchetypen**: offene Zielform, sechs Archetypen, Sicherheitsgrenzen je Zielart, Zielorientierungstest | **erledigt** |
| 4 | UX/UI: Designsystem, Onboarding, Today, Plan, Progress, Insights, Playbook, Profile | **erledigt** |
| 4b | **Onboarding neu**: freies Ziel zuerst, danach vollständige Erhebung in einem Durchlauf | **erledigt** |
| 5 | Check-ins und Plan-vs-Actual, Wochenauswertung | offen |
| 6 | Adaptive Engine: Planpflege, Erkennung, Hypothesen, Experimente, Personal Rules | offen |
| 7 | AI-Layer: Adapter, Schemas, Validierung, Fallback, versionierte Prompts — **vorgezogen**, weil ein freies Ziel ohne KI nicht sinnvoll interpretierbar ist | **erledigt** |
| 8 | End-to-End-QA: drei Personas, Edge Cases, Regressionslauf | offen |

## Reihenfolgelogik

Die Adaptive Engine (Schritt 6) braucht Verhaltensdaten, die erst ab Schritt 5 entstehen.
Schritt 5 braucht Pläne aus Schritt 3 und Screens aus Schritt 4. Schritt 3 braucht das
Datenmodell aus Schritt 2.

**Der AI-Layer ist durch die Kurskorrektur vorgerückt.** Ursprünglich stand er bewusst hinter
dem funktionierenden Kern, damit kein AI-Wrapper entsteht. Ein frei formuliertes Ziel lässt
sich aber ohne Modell nicht sinnvoll einordnen. Das Prinzip bleibt trotzdem gewahrt: die
Archetypen, ihre Planlogik und ihre Sicherheitsgrenzen sind deterministisch und laufen ohne
Modell vollständig durch — die KI macht sie besser, nicht erst möglich.

## Langfristige Vision

Nach erfolgreicher MVP-Validierung: Health → Fitness → Nutrition → Sleep → Mind →
Productivity → Performance → Life. Der Vorteil bleibt das über Monate entstehende
persönliche Verhaltensmodell, nicht das Modell dahinter.

