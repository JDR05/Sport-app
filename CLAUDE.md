@AGENTS.md

# Personal Life Improvement System — Projektregeln

Diese Datei ist die dauerhafte Arbeitsgrundlage. Sie wird zuerst gelesen, bevor Code
entsteht. Grundlage sind zwei Dokumente des Product Owners: der **Produktplan** (was das
Produkt ist) und das **Playbook** (wie entwickelt wird). Beide sind in `docs/` in
Anforderungen übersetzt.

**Bei Widersprüchen zwischen Dokumenten gilt `docs/FINAL_ARCHITECTURE.md`.** Es ist das
Ergebnis der Kritikphase und überschreibt frühere Planung bewusst.

## Produktvision

Eine persönliche, adaptive Goal-Execution-App. Der Nutzer beschreibt Alltag, Möglichkeiten
und Ziele; das System erzeugt daraus einen realistischen Tages- und Wochenplan und
vergleicht anschließend Plan und tatsächliches Verhalten. Es erkennt wiederkehrende Muster,
formuliert Hypothesen, testet je eine kleine Änderung als Experiment und übernimmt, was
funktioniert.

> „Du sagst, wer du werden willst. Die App zeigt dir, wie du dorthin kommst – und lernt
> dabei, was für dich tatsächlich funktioniert."

Der langfristige Vorteil ist **nicht das LLM**, sondern das über Monate entstehende
persönliche Verhaltensmodell.

## MVP-Grenzen

Der MVP validiert **einen** Use Case: „5 kg abnehmen" in einem realistischen Zeitraum.

Enthalten: Account, gestaffeltes Onboarding, ein Hauptziel mit Zeitraum, persönlicher
Startplan mit sichtbarer Begründung, Today, Wochenplan, Progress, Insights, Playbook,
einfaches Tracking, Gewicht/Zielmetrik, Check-ins, Wochenanalyse, Planpflege, Experimente
und Plananpassungen.

Today umfasst im MVP genau drei Domains: **Ernährung, Training, Bewegung**.

Nicht enthalten — und auch nicht „schnell nebenbei": Wearables und Health-APIs,
Social/Community, Marketplace, komplexe Gamification, vollständige Lebensmitteldatenbank,
beliebig viele parallele Ziele, native Apps, medizinische Diagnosefunktionen.

## Architekturprinzipien

1. **Deterministik vor LLM.** Berechnungen, Sicherheitslogik, Validierung, Auth,
   Berechtigungen und Datenintegrität sind TypeScript-Code mit Tests — niemals LLM-Output.
2. **Die Engine ist rein.** `src/lib/engine/` kennt weder Datenbank noch Netzwerk noch
   React. Ein- und Ausgabe sind einfache Datenstrukturen, damit sie vollständig testbar ist.
3. **AI ist ein austauschbarer Adapter** hinter einem Interface mit Schema-Validierung und
   kontrolliertem Fallback. Fällt die AI aus oder liefert ungültige Daten, bleibt das
   Produkt funktionsfähig.
4. **Nachvollziehbarkeit.** Jede wesentliche Empfehlung referenziert die konkreten Daten,
   aus denen sie entstanden ist.
5. **Metrikklassen sind getrennt.** Experimente werden ausschließlich an Verhaltensmetriken
   ausgewertet, niemals an Zielmetriken wie Gewicht. Erzwungen über Typen.
6. **Fehlende Daten sind kein Versagen.** Der Status `unknown` geht nie in die
   Mustererkennung ein.

## AI-Regeln

AI darf: Pläne formulieren, priorisieren, Muster interpretieren, Hypothesen und Experimente
vorschlagen, erklären und Anpassungen vorschlagen.

AI darf nicht: kritische Werte berechnen, Diagnosen stellen, Auth- oder
Berechtigungsentscheidungen treffen, Datenbankintegrität verantworten, oder Ergebnisse als
sicher darstellen.

Outputs sind schema-validiert (zod). Ungültiges JSON, fehlende Felder, widersprüchliche
Empfehlungen und Timeouts müssen kontrolliert abgefangen werden und dürfen keine kaputten
Zustände erzeugen. Prompts liegen versioniert in `prompts/`.

## Sicherheits- und Gesundheitsregeln

Diese Regeln sind deterministischer Code, keine Prompt-Anweisungen:

- Keine medizinischen Diagnosen und keine Heilversprechen.
- Kalorien-Untergrenzen werden hart erzwungen; keine Crash-Diäten.
- Die Abnehmrate ist gedeckelt und konservativ.
- Keine kompensatorische Logik („heute mehr gegessen → morgen weniger").
- Keine Förderung von Essstörungen, Schlafmangel oder Übertraining; Ruhetage sind Pflicht.
- Bei Unsicherheit reagiert die App sicher, statt eine riskante Empfehlung zu erfinden.

## UX-Prinzipien

Mobile-first und extrem übersichtlich. Auf jedem Screen muss erkennbar sein: **Was ist heute
wichtig? Warum? Was kommt als Nächstes?** Keine Datenüberflutung, keine zwanzig Karten pro
Screen, keine unnötige Gamification, keine generische Health-App-Optik. „Heute" ist wichtiger
als „irgendwann". Rückschläge sind Lernsignal, keine Schuldmechanik. Die App darf sich nicht
wie ein zweiter Job anfühlen.

## Konventionen

- **Sprache:** UI-Texte und alle Dokumente in `docs/` auf Deutsch. Code, Bezeichner,
  Kommentare, Commit-Messages und Branch-Namen auf Englisch.
- **Next.js 16** weicht von älteren Konventionen ab. Vor dem Schreiben von App-Code die
  mitgelieferten Docs unter `node_modules/next/dist/docs/` konsultieren, nicht aus dem
  Gedächtnis arbeiten. Siehe `AGENTS.md`.
- Secrets ausschließlich in `.env.local`; `.env.example` dokumentiert die Variablen.
- Jede wichtige Architektur- oder Produktentscheidung kommt nach `DECISIONS.md`.

## Arbeitsweise bei jedem Feature

1. Problem und Nutzerwert beschreiben. 2. Abhängigkeiten prüfen. 3. Architekturentscheidung
dokumentieren. 4. Implementierung klein schneiden. 5. Tests schreiben. 6. Implementieren.
7. QA ausführen. 8. Produktwirkung prüfen. 9. Erst dann das nächste Feature.

**One Change at a Time** gilt auch für die Entwicklung: pro Schritt ein Thema, danach Stopp
und Review durch den Product Owner. Nicht die komplette App auf einmal bauen.

## Die wichtigste Qualitätsprüfung

Echte Personalisierung. Wenn zehn deutlich unterschiedliche Profile ungefähr denselben Plan
erhalten, ist die Personalisierung nicht ausreichend. Das ist ab Schritt 3 ein
automatisierter Test und kein Vorsatz.
