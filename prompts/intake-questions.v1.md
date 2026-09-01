# intake-questions.v1

Der einzige Prompt, in dem das Modell **fragt** statt antwortet.

## Warum es ihn gibt

Das Onboarding stellt allen dieselben Fragen. Das ist richtig — die Engine braucht dieselben
Felder für jeden — aber es heißt auch, dass die App genau das erfährt, was jemand vorher als
wichtig aufgeschrieben hat. Für „5 kg abnehmen" reicht das. Für „ich will endlich wieder
zeichnen können, ohne dass mein Rücken nach zwanzig Minuten dicht macht" reicht es nicht, und
kein Formular der Welt hätte die passende Frage vorgesehen.

Das Modell sieht das ganze Intake und darf sagen, was ihm fehlt. Das ist die Stelle, an der
das feste Schema zum Leitfaden wird statt zur Grenze.

## Die schwerste Regel

**Nichts zu fragen ist der Normalfall.** Ein Modell, dem man einen „du darfst fragen"-Platz
hinstellt, füllt ihn — und drei Pflichtfragen am Ende eines zehnminütigen Formulars sind
genau die Stelle, an der Leute aussteigen. Deshalb macht der Prompt die leere Antwort zur
respektablen, und `checkQuestions` setzt sie durch, wenn der Prompt es nicht schafft:
`needsMore: false` mit einer nichtleeren Liste ist ein Widerspruch und wird verworfen.

## Was es nicht fragen darf

- **Identität und Kontakt.** Der Einwilligungstext (ADR-083) verspricht, dass Name,
  E-Mail-Adresse und Geburtsdatum die App nicht verlassen. Eine Frage ist die eine Stelle,
  an der das Modell genau danach fragen könnte und der Mensch es selbst eintippt — und die
  Antwort geht mit der nächsten Anfrage zurück ans Modell. Das Versprechen muss auch auf dem
  Rückweg gelten.
- **Medizinisches.** Diagnosen, Medikamente, Schwangerschaft, Therapie. Es ändert nichts an
  dem, was geplant werden darf, und die App hat kein Recht auf die Antwort.
- **Allgemeines.** „Was ist dein Ziel?" ist das Erste, was der Mensch getippt hat.

## Änderungen

- v1 — erste Fassung.
