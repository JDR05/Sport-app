# Decision Log

Jede wichtige Architektur- und Produktentscheidung mit Datum, Entscheidung und Begründung.
Zweck: verhindern, dass spätere Arbeitsschritte alte Entscheidungen unbeabsichtigt wieder
aufheben. Neue Einträge oben anfügen. Bestehende Einträge werden nicht gelöscht, sondern
durch einen neuen Eintrag ersetzt, der auf sie verweist.

---

## 2026-08-19 — ADR-008: Sicherheitsgrenzen sind Code, nicht Prompt

**Entscheidung:** Kalorien-Untergrenzen, maximale Abnehmrate, Pflicht-Ruhetage und das
Verbot kompensatorischer Logik werden als Invarianten in der Engine implementiert und mit
Tests über alle Profil-Fixtures abgesichert.

**Begründung:** Beide Quelldokumente verlangen konservative Gesundheitslogik. Eine
Prompt-Anweisung ist keine Garantie — ein Test ist eine. Damit gilt die Grenze auch dann,
wenn der AI-Layer später ausgetauscht wird oder ausfällt.

---

## 2026-08-19 — ADR-007: „Echte Personalisierung" wird als Test durchgesetzt

**Entscheidung:** Zehn deutlich unterschiedliche Profil-Fixtures erzeugen zehn Pläne; ein
automatisierter Test misst die paarweise Distanz und schlägt fehl, wenn die Pläne einander
zu ähnlich sind.

**Begründung:** Das Playbook nennt das die wichtigste Qualitätsprüfung überhaupt. Als
manuelle Prüfung würde sie in der Praxis übersprungen. Als CI-Gate kann die zentrale
Produktbehauptung nicht unbemerkt kaputtgehen.

---

## 2026-08-19 — ADR-006: Rules-Engine zuerst, AI-Layer zunächst gemockt

**Entscheidung:** Die Goal- und Plan-Engine wird deterministisch gebaut und getestet, bevor
ein echtes Modell angebunden wird. Der AI-Layer entsteht als Interface mit
Schema-Validierung, Fallback und einem deterministischen Mock-Adapter.

**Begründung:** Entspricht der Architekturregel aus beiden Dokumenten. Zusätzlich praktisch:
die Kernlogik ist ohne API-Key entwickelbar und vollständig testbar, und das echte Modell
wird später eingesteckt, ohne die Produktlogik anzufassen.

---

## 2026-08-19 — ADR-005: Sprachtrennung Deutsch/Englisch

**Entscheidung:** UI-Texte und alle Dokumente in `docs/` auf Deutsch. Code, Bezeichner,
Kommentare, Commit-Messages und Branch-Namen auf Englisch.

**Begründung:** Product Owner und Quelldokumente sind deutsch; die Zielgruppe des MVP
ebenfalls. Code bleibt englisch, weil Frameworks, Libraries und Tooling es sind — gemischte
Bezeichner erzeugen dauerhaft Reibung.

---

## 2026-08-19 — ADR-004: Ein Hauptziel im MVP, Wearables später

**Entscheidung:** Der MVP unterstützt genau ein aktives Hauptziel und keine
Health-/Wearable-Integration. Erster und einziger Use Case: „5 kg abnehmen".

**Begründung:** Direkt aus dem Produktplan. Mehrere Ziele erfordern Zielkonflikt-Auflösung,
Wearables erfordern OAuth, Sync und Normalisierung über mehrere Anbieter — beides bevor
überhaupt bewiesen ist, dass Nutzer einen persönlichen Plan annehmen.

---

## 2026-08-19 — ADR-003: Supabase als Datenfundament von Anfang an

**Entscheidung:** Postgres, Auth und Row Level Security über Supabase, statt zunächst
In-Memory-Persistenz.

**Begründung:** Entscheidung des Product Owners. Auth und Mandantentrennung sind in dieser
App nicht optional, und RLS früh zu bauen ist deutlich billiger, als sie später über ein
gewachsenes Datenmodell zu legen. Ein zusätzliches Projekt in der Organisation kostet
0 €/Monat.

---

## 2026-08-19 — ADR-002: Next.js 16 App Router, Web-first

**Entscheidung:** Responsive Web-App mit Next.js 16 (App Router), TypeScript und Tailwind.
Keine nativen Apps im MVP.

**Begründung:** Der Produktplan gibt Web-first für den MVP vor. Ein Framework mit Server- und
Client-Code in einem Deployment hält die Anzahl beweglicher Teile klein, solange das Produkt
noch validiert wird. Achtung: Next.js 16 weicht von älteren Konventionen ab — siehe
`AGENTS.md`.

---

## 2026-08-19 — ADR-001: Schrittweise Entwicklung mit Review-Punkten

**Entscheidung:** Entwicklung in klar getrennten Schritten. Nach jedem Schritt wird
committet, gepusht und für ein Review des Product Owners gestoppt.

**Begründung:** Das Playbook verlangt es ausdrücklich („nicht: Claude, baue die komplette
App") und der Product Owner hat es bestätigt. Der Nutzer bleibt Product Owner; grundlegende
Produktentscheidungen werden nachvollziehbar gemacht und bestätigt, statt implizit im Code
zu entstehen.
