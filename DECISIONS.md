# Decision Log

Jede wichtige Architektur- und Produktentscheidung mit Datum, Entscheidung und Begründung.
Zweck: verhindern, dass spätere Arbeitsschritte alte Entscheidungen unbeabsichtigt wieder
aufheben. Neue Einträge oben anfügen. Bestehende Einträge werden nicht gelöscht, sondern
durch einen neuen Eintrag ersetzt, der auf sie verweist.

---

## 2026-08-19 — ADR-015: Preisabfrage frühestens ab Monat 3

**Entscheidung:** In Validierungsphase 5 wird keine Zahlungsbereitschaft abgefragt, sondern
nur Absichtsbekundung und Abwanderungswiderstand. Preisfragen frühestens nach drei Monaten
Nutzung.

**Begründung:** Zahlungsbereitschaft entsteht aus dem, was man beim Wechsel verliert —
Historie und Playbook. Nach vier Wochen existiert beides praktisch nicht. Eine Preisantwort
zu diesem Zeitpunkt misst Höflichkeit, nicht Bereitschaft. Ersetzt die ursprüngliche
Phase-5-Definition. Siehe `PRODUCT_CRITIQUE.md` K8.

---

## 2026-08-19 — ADR-014: Der Personalisierungstest misst strukturelle Distanz

**Entscheidung:** Der Test aus ADR-007 vergleicht Struktur (welche Domains vorkommen, welche
Strategie gewählt wurde, Anzahl und Verteilung der Aktionen, Art der Ernährungsumsetzung),
nicht Feldwerte. Die Schwelle wird vor der Implementierung festgelegt. Ergänzt um einen
Feldwirksamkeitstest: jedes Onboarding-Feld aus Stufe 1 muss den Plan nachweislich
verändern.

**Begründung:** Innerhalb eines einzigen Use Case ist der Variationsraum klein. Ein Test, der
nur Uhrzeiten vergleicht, besteht auch dann, wenn keine echte Personalisierung existiert —
und erzeugt falsche Sicherheit genau in der Frage, die das Playbook als wichtigste
bezeichnet. Der Feldwirksamkeitstest macht zusätzlich den Zielkonflikt „kurzes Onboarding vs.
Personalisierung" messbar. Siehe `PRODUCT_CRITIQUE.md` K7.

---

## 2026-08-19 — ADR-013: Zweistufige Adaptation — Planpflege und Experiment

**Entscheidung:** Anpassungen laufen in zwei getrennten Stufen. **Planpflege** greift ab
Tag 2, ist deterministisch und klein, wird als vorläufig gekennzeichnet und erzeugt keine
Personal Rule. **Experimente** bleiben an die statistische Schwelle gebunden und sind die
einzige Quelle für Personal Rules.

**Begründung:** Die Adaptive Engine braucht Wochen, bis sie ein Muster belegen kann — die
Retention-Entscheidung fällt aber in Tag 1 bis 7. Ohne die erste Stufe passiert in genau dem
Fenster, in dem der Nutzer bleibt oder geht, sichtbar nichts. Ohne die Trennung würden
vorläufige Anpassungen ins Personal Model schreiben und das Playbook entwerten. Siehe
`PRODUCT_CRITIQUE.md` K1.

---

## 2026-08-19 — ADR-012: Verhaltens- und Zielmetriken sind getrennte Klassen

**Entscheidung:** `measurements` trägt ein `metric_class` (`behavior` | `outcome`).
Experimente werden ausschließlich an Verhaltensmetriken ausgewertet; Zielmetriken wie
Gewicht dienen nur Progress und Zielprognose über lange Fenster. Die Engine erzwingt das
über Typen.

**Begründung:** Bei 5 kg über 12 Wochen liegt das wöchentliche Gewichtssignal bei rund
0,4 kg und damit unter der normalen Tagesschwankung. Ein 7-Tage-Experiment am Gewicht
auszuwerten produziert Zufallsentscheidungen — die dann als „gelernte persönliche Regel"
gespeichert würden und das Personal Model dauerhaft vergiften. Siehe `PRODUCT_CRITIQUE.md`
K4.

---

## 2026-08-19 — ADR-011: Statuswert `unknown` für fehlende Eingaben

**Entscheidung:** `plan_items` erhält den Status `unknown` für Aufgaben ohne Nutzereingabe.
Er geht nie in die Mustererkennung ein.

**Begründung:** Der MVP hat bewusst keine Wearables und hängt damit vollständig an manuellem
Tracking. Ohne diesen Status würde jede Trackinglücke als `missed` gewertet, aus
Trackingmüdigkeit ein Verhaltensmuster erzeugt und dem Nutzer ein Problem eingeredet, das er
nicht hat. Siehe `PRODUCT_CRITIQUE.md` K2.

---

## 2026-08-19 — ADR-010: Today umfasst im MVP drei Domains

**Entscheidung:** Today zeigt Ernährung, Training und Bewegung. Schlaf wird als Kontext
erfasst, aber nicht geplant. Self-Improvement-Aktionen und Termine/Zeitfenster entfallen im
MVP.

**Begründung:** Die ursprüngliche Screen-Definition listet sieben Blöcke bei gleichzeitigem
Prinzip „3–5 wichtigste Aktionen" und „keine Datenüberflutung" — ein Widerspruch im selben
Dokument. Termine setzen zudem eine Kalenderintegration voraus, die im MVP ausgeschlossen
ist. Siehe `PRODUCT_CRITIQUE.md` K5.

---

## 2026-08-19 — ADR-009: Das Playbook wird ein eigener Screen im MVP

**Entscheidung:** Die Liste bestätigter persönlicher Regeln bekommt einen eigenen Screen, ab
Tag 1 sichtbar, anfangs leer und mit Fortschrittsanzeige bis zur ersten Regel. Jede Regel
trägt ihren Beleg.

**Begründung:** Der Unterschied zu einem Chatverlauf entsteht durch Persistenz plus
Rückkopplung — das ist aber unsichtbar, und was der Nutzer nicht sehen kann, glaubt er nicht.
Ein sichtbar wachsendes Artefakt, das ein Chat prinzipiell nicht haben kann, ist der
Retention-Anker. Dies ist die einzige Scope-*Erweiterung* aus der Kritikphase; netto wird der
MVP trotzdem kleiner. Siehe `PRODUCT_CRITIQUE.md` K3 und K9.

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
