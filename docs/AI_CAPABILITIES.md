# Was die KI tun darf — und woran sie scheitert

## Das Problem

Heute macht die KI **eine** Sache: Sie ordnet ein frei formuliertes Ziel einem von sieben
Archetypen zu. Danach übernimmt ein deterministischer Planer, der pro Archetyp immer
denselben Bauplan abfährt.

Für „5 kg abnehmen" funktioniert das gut. Für „ich will motivierter sein", „ich will weniger
prokrastinieren", „ich will besser mit Stress umgehen", „meine Rückenschmerzen loswerden"
funktioniert es nicht — diese Ziele landen in `general_health`, und `general_health` erzeugt
genau **eine** Zielaktion: „Ziel schärfen, 10 Min, Sonntagabend".

Der Product Owner hat es so formuliert: *die KI hat keine Hebel, die sie bewegen kann.*

Das ist zutreffend, und es ist kein Detail. Es ist der Unterschied zwischen einer App für
sechs Ziele und einer App für das Ziel, das dieser Mensch tatsächlich hat.

## Die Auflösung: die KI entscheidet **was**, die Engine entscheidet **wann und ob**

Der Reflex wäre, die Sicherheitsregeln zu lockern, damit die KI mehr kann. Das ist die
falsche Richtung — und unnötig, weil die beiden sich gar nicht im Weg stehen.

Die KI schreibt **nie** in den Plan. Sie gibt einen **Vorschlag** in einem typisierten Schema
ab. Danach läuft die bestehende deterministische Kette darüber:

```
KI-Vorschlag
   │
   ├─ zod-Schema            Form falsch          → verworfen
   ├─ Plausibilitätsprüfung Restriktion, medizinische Aussage,
   │                        weniger Schlaf, unrealistischer Aufwand → verworfen
   ├─ Engine terminiert     freie Slots, Ruhetage, harte Grenzen,
   │                        Höchstzahl pro Tag
   └─ assertPlanInvariants  Sicherheitsgrenze verletzt → gesamter Plan verworfen
                                                          → deterministischer Pfad
```

**Die KI schlägt keine Termine vor.** Sie sagt „drei kurze Blöcke fokussierte Arbeit, je 25
Minuten, vormittags besser als abends". Wo die im Kalender landen, ob überhaupt drei
hineinpassen, ob dazwischen genug Erholung liegt — das entscheidet die Engine, die alle
Grenzen kennt. Damit behält die Sicherheitsarchitektur jede Eigenschaft, die sie heute hat,
und die KI bekommt trotzdem echten Spielraum.

## Die sechs Hebel

### 1 · Zielspur-Aktionen erfinden

Der wichtigste. Für ein Ziel, das kein Archetyp gut trifft, liefert die KI 2–5 konkrete
Aktionen mit Titel, Bereich, Dauer, Häufigkeit und Begründung.

Beispiel „ich will weniger prokrastinieren":

| Aktion | Bereich | Dauer | Häufigkeit |
| --- | --- | --- | --- |
| Am Vorabend eine einzige Hauptaufgabe für morgen festlegen | Kopf | 5 Min | täglich |
| Erster Block am Morgen ohne Telefon im Raum | Kopf | 25 Min | 5×/Woche |
| Freitagabend: Was ist liegengeblieben, und woran lag es? | Kopf | 10 Min | wöchentlich |

Das kann kein Archetyp erzeugen, und keine Wortliste. Das ist die Arbeit, für die ein Modell
da ist.

### 2 · Die Metrik bestimmen

Nicht jedes Ziel hat eine Zahl, aber viele haben eine, an die man nicht sofort denkt.
„Prokrastination" hat keine Waage — aber „Tage, an denen die Hauptaufgabe erledigt wurde"
ist eine saubere **Verhaltensmetrik**, und Verhaltensmetriken sind genau das, woran
Experimente ausgewertet werden dürfen (ADR-012).

Die KI schlägt Metrikschlüssel, Einheit und Richtung vor. Die Metrikklasse setzt sie **nicht**
— `behavior` gegen `outcome` bleibt deterministisch, sonst fällt die Trennung, auf der die
ganze Experimentlogik steht.

### 3 · Formulieren

Aktionstitel in der Sprache des Nutzers. Heute steht bei einem Gewohnheitsziel wörtlich
`15 Min: Ich möchte weniger am Handy sein` auf dem Bildschirm — ein Reduktionsziel, in einen
positiven Zeitblock übersetzt, der sprachlich das Gegenteil sagt.

### 4 · Muster deuten

Die Erkennung bleibt statistisch und deterministisch — sie **findet** das Muster. Die KI
formuliert die Hypothese in der Sprache dieses Menschen und schlägt vor, welche Änderung
plausibel wäre. Welche Regeln daraus überhaupt werden können, bleibt auf die vier
mechanischen Schlüssel begrenzt (ADR-032): Ein gelerntes Verhalten darf einen Plan nur
verkleinern oder verschieben, nie vergrößern.

### 5 · Nachfragen, bevor sie plant

Das Onboarding stellt allen dieselben Fragen. Das ist richtig — die Engine braucht dieselben
Felder von jedem — aber es heißt auch, dass die App genau das erfährt, was jemand vorher als
wichtig aufgeschrieben hat. Für „5 kg abnehmen" reicht das. Für „ich will wieder zeichnen
können, ohne dass mein Rücken nach zwanzig Minuten dicht macht" reicht es nicht, und kein
Formular hätte die passende Frage vorgesehen.

Also sieht das Modell einmal das ganze Intake und darf bis zu **drei** Dinge nachfragen. Es
bekommt dazu eine deterministisch erzeugte Liste dessen, was offen geblieben ist — sonst
fragt es nach etwas, das schon in der Datenbank steht, was der schnellste Weg ist, eine App
so wirken zu lassen, als hätte sie nicht zugehört.

**Der Normalfall ist, dass es nichts fragt.** Ein Modell, dem man einen „du darfst
fragen"-Platz hinstellt, füllt ihn, und drei Pflichtfragen am Ende eines zehnminütigen
Formulars sind die Stelle, an der Leute aussteigen. Deshalb macht der Prompt die leere
Antwort zur respektablen, und `checkQuestions` verwirft `needsMore: false` mit einer
nichtleeren Liste als Widerspruch. Jede Frage ist überspringbar; eine übersprungene Antwort
ist `unknown`, und `unknown` ist überall sonst in diesem Produkt ein gültiger Zustand.

Nicht fragen darf es nach Identität und Kontakt (der Einwilligungstext verspricht, dass Name,
E-Mail und Geburtsdatum die App nicht verlassen — das muss auch auf dem Rückweg gelten) und
nach Medizinischem. Siehe ADR-084.

### 6 · Einmal pro Woche etwas sagen

Der Wochenimpuls: eine Beobachtung, ein Vorschlag, höchstens eine Rückfrage — aus den echten
Daten dieser Woche, einschließlich der Check-in-Notizen, die sonst nichts liest. Schweigen ist
ein reguläres Ergebnis, und `checkWeeklyNote` verwirft, was für einen fremden Menschen genauso
gälte. Siehe ADR-082.

## Was die KI weiterhin nicht darf

Unverändert gegenüber `CLAUDE.md`:

- Kritische Werte berechnen (Kalorien, Raten, Umfangssteigerungen)
- Diagnosen stellen oder Heilung versprechen
- Auth- oder Berechtigungsentscheidungen treffen
- Datenbankintegrität verantworten
- Eine Metrikklasse setzen
- Eine Sicherheitsgrenze umgehen — der Plan wird gebaut und geprüft, nicht bewertet
- Ergebnisse als sicher darstellen
- Nach Name, Adresse, E-Mail, Telefonnummer, Geburtsdatum oder Versicherung fragen
- Medizinische Fragen stellen (Diagnosen, Medikamente, Schwangerschaft, Therapie)
- Ohne ausdrückliche Einwilligung überhaupt aufgerufen werden (ADR-083)

## Ohne API-Key

Der deterministische Pfad bleibt, was er ist. Das heißt aber auch: **ohne Key ist die App bei
ungewöhnlichen Zielen deutlich schwächer**, und das soll sie im Onboarding sagen, statt es zu
verschweigen. Die bisherige Formulierung „die App bleibt ohne KI vollständig benutzbar" ist
technisch wahr und produktseitig irreführend — bei 12 von 20 realistisch formulierten Zielen
liefert der Wortlisten-Klassifikator `general_health`.

## Warum das die Sicherheitsarchitektur nicht schwächt

Weil sich nichts an der Prüfung ändert, nur an ihrer Eingabe. Eine von der KI erfundene
Aktion durchläuft **exakt dieselben** Invarianten wie eine vom Archetyp erzeugte. Wenn ein
Vorschlag eine Grenze reißt, wird er verworfen — nicht repariert. Stilles Reparieren würde
verbergen, dass ein schlechter Vorschlag entstanden ist, und genau das will diese Architektur
sehen können.
