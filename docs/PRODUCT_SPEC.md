# Product Spec

## Das Problem

Menschen haben bereits Daten und Apps, aber niemand übersetzt sie in einen realistischen
Alltag. Die meisten wissen, was sie tun sollten, setzen es aber nicht dauerhaft um.
Bestehende Apps behandeln Ernährung, Training, Schlaf, Kalender und Gewohnheiten getrennt.
Statische Pläne überstehen weder Stress noch Zeitmangel noch Rückschläge. KI-Coaches geben
generische Ratschläge, ohne aus dem tatsächlichen Verhalten zu lernen.

Die Produktfrage lautet deshalb: **Wie übersetze ich meine Ziele und mein echtes Leben in
wenige konkrete Handlungen — und wie finde ich heraus, welche Strategie bei mir persönlich
funktioniert?**

## Zielbild

Fünf Bereiche, die miteinander koordiniert werden statt nebeneinander zu stehen:

- **BODY** — Gewicht, Fitness, Muskelaufbau, Bewegung
- **HEALTH** — Schlaf, Ernährung, Regeneration
- **MIND** — Fokus, Routinen, Disziplin, persönliche Entwicklung
- **PERFORMANCE** — Studium, Arbeit, Sport, Business
- **LIFE** — Zeitmanagement, Tagesstruktur, Prioritäten

Koordination heißt konkret: Eine Prüfungsphase darf das Trainingsvolumen reduzieren,
schlechte Regeneration verändert die Belastung, ein voller Tag vereinfacht die Planung. Im
MVP wird diese Kopplung nur so weit umgesetzt, wie der Use Case „5 kg abnehmen" sie braucht.

## Produktprinzipien

1. **Minimum Input → Maximum Intelligence.** Jede Frage im Onboarding muss sich später im
   Plan sichtbar auszahlen.
2. **One Change at a Time.** Ein wichtiger Hebel schlägt zehn neue Regeln.
3. **Plan statt Chat.** Das System liefert Entscheidungen und konkrete Pläne, nicht Gespräch.
4. **Adaptiv statt statisch.**
5. **Persönlich statt generisch.** Empfehlungen entstehen aus dem persönlichen Kontext.
6. **Progress over perfection.** Schlechte Tage sind Daten, kein moralisches Versagen.
7. **Transparenz.** Wichtige Anpassungen sind nachvollziehbar.
8. **Safety first.** Keine gefährlichen Gesundheits- oder Ernährungsempfehlungen.

## Zielsystem

Die Zielhierarchie übersetzt Fernes in Heutiges:

```
Vision / langfristiges Ziel
  └── 90-Tage-Ziel
        └── 4-Wochen-Ziel
              └── Wochenziele
                    └── Tagesaktionen
```

Beispiel: „In 12 Wochen 5 kg abnehmen" → Wochenstrategie → die konkreten Aktionen von heute.
Mehrere parallele Ziele sind langfristig vorgesehen; dann muss das System Prioritäten und
Zielkonflikte erkennen. Im MVP ist genau ein aktives Hauptziel erlaubt.

## Der initiale Plan

Der erste Plan ist eine **Start-Hypothese**, kein perfekter Plan — und wird dem Nutzer auch
so präsentiert. Er kann Ernährung, Training, Bewegung, Schlaf/Recovery, kleine
Self-Improvement-Aktionen und Tagesprioritäten enthalten. Entscheidend ist, dass der Nutzer
auf einen Blick sieht, *was er heute tun muss* — nicht eine Liste möglicher Optimierungen.

## Screens

**Today** — Top-Ziel des Tages, 3–5 wichtigste Aktionen, Training, Ernährung, Bewegung,
Schlaf/Recovery, eine kleine Entwicklungsaktion, Termine und Zeitfenster. Jede Aufgabe trägt
einen Status: geplant, erledigt, verschoben, nicht geschafft, nicht relevant.

**Plan** — Tages- und Wochenplan.

**Progress** — Hauptziel und Fortschritt, Gewichtstrend bzw. Zielmetrik, Wochenfortschritt
und Konsistenz, Training/Ernährung/Schlaf sofern Daten vorhanden. Beantwortet: Wo stehe ich?
Was läuft gut? Was hält mich zurück? Was ist jetzt wichtig?

**Insights** — Erkenntnisse und laufende Experimente.

**Profile** — Lebenssituation, Präferenzen, Ziele, Einstellungen.

## Motivation

Kontextbezogen, nicht als Dauerbeschallung. Kurze konkrete Hinweise, sichtbarer Fortschritt,
Rückschläge normalisieren, nächste Aktion hervorheben. Keine Schuldmechanik. Optional
verschiedene Motivationsstile (direkt, ruhig, spielerisch) — im MVP nachrangig.

## Monetarisierung (Hypothese)

**Free:** ein Hauptziel, Basis-Onboarding, Startplan, Today/Plan/Progress, grundlegende
Check-ins, begrenzte Insights.

**Pro (später):** mehrere Ziele, fortgeschrittene Adaptive Engine, Langzeitmuster,
Health-/Wearable-Integrationen, Kalender, automatisierte Ernährung, mehr Experimente,
persönliches Playbook.

Preisrahmen als unbestätigte Hypothese: 5–12 € monatlich bzw. vergünstigtes Jahresabo. Nicht
festlegen vor echtem Product-Market-Signal. Keine aggressive Paywall vor dem Nachweis des
Kernnutzens.

## Was das Produkt nicht ist

Kein weiterer ChatGPT-Klon. Kein einfacher Habit Tracker. Kein Kalorientracker mit
KI-Texten. Kein Social-Media-Feed. Kein Motivationsspruch-Generator. Kein medizinisches
Diagnosewerkzeug. Kein überladener Super-App-MVP.

## Langfristiger Moat

Nicht das LLM. Der mögliche Vorteil ist ein über Monate entstehendes persönliches
Verhaltensmodell: welche Strategien für welche Person funktionieren, welche Zeiten
zuverlässig sind, welche Interventionen helfen, welche Ziele kollidieren. Das ist durch einen
einmaligen Chat nicht zu ersetzen.
