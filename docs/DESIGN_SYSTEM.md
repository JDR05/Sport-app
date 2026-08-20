# Cadence — Marke und Designsystem

## Der Name

**Cadence** ist die Trittfrequenz, die man halten kann — nicht das Tempo, das man einmal
schafft. Genau die Haltung des Produkts: Es deckelt Raten, verschiebt das Zieldatum statt das
Tempo zu erhöhen, und sucht den Rhythmus, der zu **diesem** Menschen passt.

Das Wort trägt beide Bedeutungen, die diese App braucht: den täglichen Takt und die
Fähigkeit, ihn zu ändern.

> „Du sagst, wer du werden willst. Cadence zeigt dir, wie du dorthin kommst — und lernt
> dabei, was für dich tatsächlich funktioniert."

## Das Zeichen

Vier Schläge. Drei stehen dort, wo ein Plan sie hinlegen würde; **der dritte sitzt tiefer und
trägt als einziger die Akzentfarbe** — der Schlag, den die App verschoben hat, weil der
ursprüngliche für diesen Menschen nie funktioniert hat.

Das ist das ganze Produkt in einem Glyph: ein Rhythmus, und die Bereitschaft, ihn zu ändern.
Es übersteht außerdem 16 Pixel, was alles Klügere ausschließt.

## Farbe

Warmes Papier, fast schwarze Tinte, **ein** gedämpfter Akzent. Das Playbook schließt
„generische Health-App-Optik" ausdrücklich aus, also: kein Neon, keine Verläufe, kein
Konfetti, keine Fortschrittsringe, die sich füllen.

| Rolle | Hell | Dunkel |
| --- | --- | --- |
| Papier | `#faf9f7` | `#131211` |
| Fläche | `#ffffff` | `#1c1b19` |
| Tinte | `#1b1a18` | `#edebe7` |
| Akzent | `#3f6b52` | `#7aa98b` |

Jede Domäne hat ihren eigenen zurückhaltenden Ton, damit ein Blick auf „Heute" sagt, um
welche Art Aktion es geht, ohne zu lesen. **Schlaf und Kopf haben eigene Töne bekommen** —
vorher liehen sie sich den Bewegungston, wodurch ein Schlafziel wie ein Gehziel aussah, also
genau das, wogegen die Farbe da ist.

Dunkelmodus ist **eigens gewählt**, nicht umgedreht: eigene Schritte, gegen die dunkle Fläche
geprüft.

## Form und Bewegung

Drei Radien, nicht sieben: Karte, Bedienelement, Pille.

Bewegung ist kurz und selten. Sie bestätigt ein Antippen, sie führt nichts auf. Alles über
200 ms liest sich auf dem Handy als Verzögerung, nicht als Politur. `prefers-reduced-motion`
wird respektiert — wer sein System um weniger Bewegung bittet, meint es.

## Zahlen

Zahlen stehen in Spalten — eine Gewichtsreihe, eine Quote. `.tnum` schaltet Tabellenziffern
ein, damit sie beim Ändern nicht seitlich springen.

## Diagramme

Eine Serie, also **kein Legendenkasten** — die Überschrift benennt sie. Dünne Marken,
Haarlinien statt Gitter, durchgezogen statt gestrichelt (Striche lesen sich als Schwelle).
**Keine Zahl an jedem Punkt**: nur der letzte Wert wird beschriftet, der Rest steht in der
Tabelle darunter — die zugleich das ist, was eine Vorlesesoftware bekommt.

Beim Gewichtsverlauf sind **zwei Dinge** gezeichnet, und ihr Unterschied ist der Punkt: Die
blassen Punkte sind, was die Waage an einem Tag sagte; die Linie ist der Trend. Eine einzelne
Messung schwankt um ein Kilo allein durch Wasser. Ein Diagramm, das nur die Punkte zeigt,
lässt jemanden, der alles richtig macht, an sich zweifeln.

## Was angezeigt wird, richtet sich nach dem Ziel

**Erhoben wird alles, angezeigt nur das Zugehörige.** Wer an seinem Schlaf arbeitet, sieht
Stunden — nie Kilogramm, obwohl das Gewicht gespeichert ist und den Plan weiterhin
beeinflusst. Ein Ziel ohne sinnvolle Zahl bekommt keine erfundene; die App sagt das, statt
eine zu konstruieren. Nicht alles, was sich zu ändern lohnt, ist messbar.

| Archetyp | Angezeigte Zahl |
| --- | --- |
| Körper und Gewicht | Gewicht (kg) |
| Ausdauer | Wochenumfang (km) |
| Kraft | Trainingslast (kg) |
| Schlaf | Schlafdauer (h) |
| Ernährung, Gewohnheit, Allgemein | keine — bewertet wird Verhalten |
