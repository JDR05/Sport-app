# Reaktionszeit

## Der Befund

Die App lief in **iad1 (Virginia)**, die Datenbank steht in **eu-central-1 (Frankfurt)**.
Jede Serverantwort reiste damit zweimal über den Atlantik — und zwar nicht einmal, sondern
einmal *pro Datenbankaufruf*.

Ein Tippen auf „Insights" löste vorher ungefähr diese Kette aus, jeder Schritt wartend auf den
vorherigen:

```
proxy.ts          getClaims()                  1 Runde
(app)/layout      getClaims() + loadPlanInput  2 Runden (5 Abfragen parallel)
insights/page     concludeIfDue()              1–4 Runden
                  loadRunningExperiment()      1 Runde
                  weeklyReview()               2 Runden
```

Bei rund 90 ms Laufzeit je Richtung sind das schnell **über eine Sekunde**, bevor überhaupt
etwas gerendert wird. Genau das Gefühl, das der Product Owner beschrieben hat: „es geht zu
lange, bis es wechselt".

## Was dagegen getan ist

**1. Region.** `vercel.json` legt die Ausführung auf `fra1`. Aus zwei Atlantiküberquerungen
je Abfrage wird ein Aufruf im selben Rechenzentrumsverbund — der mit Abstand größte Hebel,
und er kostet eine Zeile.

**2. Weniger Runden.** Was nicht voneinander abhängt, läuft parallel statt nacheinander.

**3. Sofortige Rückmeldung.** Ein Tippen darf nie auf den Server warten, bevor sichtbar etwas
passiert. Das Abhaken einer Aktion war schon optimistisch; die Navigation soll es auch sein.

## Regel für später

Serverseitige Screens holen ihre Daten **in einer Runde**, nicht in einer Kette. Wenn ein
`await` auf das Ergebnis eines anderen wartet, ohne es zu brauchen, ist das ein Fehler — auf
dem Handy im Zug ist er messbar.
