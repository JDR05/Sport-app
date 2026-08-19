# MVP-Scope

## Zweck des MVP

Beweisen, dass Nutzer einen persönlichen Plan **annehmen**, **zurückkommen** und adaptive
Empfehlungen als **tatsächlich hilfreich** erleben. Nicht mehr.

Ein einziger Use Case: „5 kg abnehmen" in einem realistischen Zeitraum.

## Enthalten

- Account und Authentifizierung
- Gestaffeltes Onboarding
- Ein Hauptziel mit Zeitraum und Zielmetrik
- Persönlicher Startplan (Wochenstrategie + Tagesaktionen)
- Today, Wochenplan, Progress, Insights, Profile
- Einfaches Tracking: Aufgabenstatus, Gewicht/Zielmetrik, kurze Check-ins
- Wochenanalyse und erste Insights
- Experimente und Plananpassungen
- Datenexport und -löschung

## Nicht enthalten

Wearables und Health-APIs · Social/Community · Marketplace · komplexe Gamification ·
vollständige Lebensmitteldatenbank · mehrere parallele Ziele · native Apps · medizinische
Diagnosefunktionen · Bezahlfunktion · Kalenderintegration · automatisierte Ernährungsplanung
mit Rezeptdatenbank

Alles, was nicht zur Validierung des Kernnutzens beiträgt, wird verschoben.

## Abnahmekriterien

Der MVP gilt als fertig, wenn:

1. Ein neuer Nutzer vom Start bis zum angenommenen Plan durchkommt, ohne zu hängen.
2. Zehn deutlich unterschiedliche Profile **deutlich unterschiedliche** Pläne erhalten
   (automatisierter Test).
3. Die Sicherheitsinvarianten für alle Testprofile gelten (automatisierter Test).
4. Der tägliche Loop funktioniert: Today → Status setzen → Wochenanalyse → Insight.
5. Mindestens ein vollständiger Experimentzyklus durchlaufbar ist: Erkennung → Hypothese →
   Experiment → Auswertung → Regel → angepasster Plan.
6. Die App ohne AI-Layer vollständig benutzbar bleibt (NullAdapter-Test).
7. RLS nachweislich verhindert, dass ein Nutzer fremde Daten sieht.
8. Die drei QA-Personas und die Edge Cases aus `USER_FLOWS.md` durchlaufen.

## KPIs nach dem Launch

Onboarding Completion · erster Plan angenommen · Day-7- und Day-30-Retention ·
Check-in-Rate · Experiment Completion · Anteil angenommener Plananpassungen · Zielprogress ·
später: freiwillige Zahlungsbereitschaft.

## Validierung vor größerem Aufwand

1. Konzept und klickbarer Prototyp
2. 5–10 Personen testen den 5-kg-Flow
3. Mindestens 4 Wochen Nutzung beobachten
4. Prüfen, ob Nutzer zurückkommen und Anpassungen hilfreich finden
5. Zahlungsbereitschaft testen
6. Erst danach Health-/Wearable-Funktionen
