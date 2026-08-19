# MVP-Scope

## Zweck des MVP

Beweisen, dass Nutzer einen persönlichen Plan **annehmen**, **zurückkommen** und adaptive
Empfehlungen als **tatsächlich hilfreich** erleben. Nicht mehr.

**Ein aktives Ziel zur Zeit — aber jede Zielart.** Das Ziel wird frei formuliert und einem von
sechs Archetypen zugeordnet; was in keinen passt, bekommt Gesundheitsbasis plus KI-Vorschläge.
Siehe `GOAL_ARCHETYPES.md`. „5 kg abnehmen" ist einer der Testfälle, nicht die Form des
Produkts.

## Enthalten

- Account und Authentifizierung
- **Vollständiges Onboarding** über alle Lebensbereiche in einem Durchlauf
- **Frei formuliertes Hauptziel**, per KI einem Archetyp zugeordnet, mit deterministischem
  Fallback
- Persönlicher Startplan mit sichtbarer Begründung, **zweispurig**: Gesundheitsbasis plus
  Zielspur je Element
- Today (drei Domains: Ernährung, Training, Bewegung), Wochenplan, Progress, Insights,
  **Playbook**, Profile
- Einfaches Tracking: Aufgabenstatus, Gewicht/Zielmetrik, kurze Check-ins — Tagesabschluss
  in unter 15 Sekunden
- **Planpflege** ab Tag 2 (deterministisch, vorläufig, erzeugt keine Regel)
- Wochenanalyse und erste Insights
- Experimente und Plananpassungen
- Datenexport und -löschung

## Nicht enthalten

Wearables und Health-APIs · Social/Community · Marketplace · komplexe Gamification ·
vollständige Lebensmitteldatenbank · mehrere parallele Ziele · native Apps · medizinische
Diagnosefunktionen · Bezahlfunktion · Kalenderintegration · automatisierte Ernährungsplanung
mit Rezeptdatenbank

Nach Phase 2 zusätzlich gestrichen bzw. verschoben (siehe `FINAL_ARCHITECTURE.md`):
Self-Improvement-Aktionen als geplante Tagesaktionen (→ V2) · Termine und Zeitfenster auf
Today (→ V3) · Schlaf als geplante Aktion (bleibt Kontexterfassung) · Motivationsstile
(→ V2) · `subscriptions` (→ V2).

Alles, was nicht zur Validierung des Kernnutzens beiträgt, wird verschoben.

## Abnahmekriterien

Der MVP gilt als fertig, wenn:

1. Ein neuer Nutzer vom Start bis zum angenommenen Plan durchkommt, ohne zu hängen.
2. Zehn deutlich unterschiedliche Profile **strukturell** unterschiedliche Pläne erhalten
   (automatisierter Test, Schwelle vorab fixiert).
2b. **Dasselbe Profil mit verschiedenen Zielarten** ebenfalls strukturell unterschiedliche
   Pläne erhält — sonst ist die Zielorientierung nur behauptet.
2c. Jeder der sechs Archetypen seine eigenen Sicherheitsgrenzen einhält.
3. Jedes Onboarding-Feld für **mindestens einen** Archetyp den Plan verändert
   (Feldwirksamkeitstest, jetzt pro Zielart geführt).
4. Die Sicherheitsinvarianten für alle Testprofile gelten (automatisierter Test).
5. Der tägliche Loop funktioniert: Today → Status setzen → Wochenanalyse → Insight.
6. Mindestens ein vollständiger Experimentzyklus durchlaufbar ist: Erkennung → Hypothese →
   Experiment → Auswertung → Regel → angepasster Plan → sichtbar im Playbook.
7. Trackinglücken (`unknown`) erzeugen nachweislich keine Hypothese.
8. Experimente werden nur an Verhaltensmetriken ausgewertet — der Versuch mit einer
   Zielmetrik ist ein Typfehler.
9. Die App ohne AI-Layer vollständig benutzbar bleibt (NullAdapter-Test).
10. RLS nachweislich verhindert, dass ein Nutzer fremde Daten sieht.
11. Die drei QA-Personas und die Edge Cases aus `USER_FLOWS.md` durchlaufen.

## KPIs nach dem Launch

**Check-in-Rate ist die Kernmetrik**, nicht eine von vielen: ohne Check-ins gibt es keine
Muster und damit kein Produkt.

Daneben: Onboarding Completion · erster Plan angenommen · Day-7- und Day-30-Retention ·
Experiment Completion · Anteil angenommener Plananpassungen · Zielprogress.

## Validierung vor größerem Aufwand

1. Konzept und klickbarer Prototyp
2. 5–10 Personen testen den 5-kg-Flow
3. Mindestens 4 Wochen Nutzung beobachten
4. Prüfen, ob Nutzer zurückkommen und Anpassungen hilfreich finden
5. Absichtsbekundung und Abwanderungswiderstand messen — **keine Preisabfrage vor Monat 3**.
   Zahlungsbereitschaft entsteht aus Historie und Playbook; nach vier Wochen existiert beides
   noch nicht und die Antwort wäre wertlos.
6. Erst danach Health-/Wearable-Funktionen
