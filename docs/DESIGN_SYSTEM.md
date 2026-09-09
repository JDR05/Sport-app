# Trace — Marke und Designsystem

## Der Name

**Trace** trägt beide Bedeutungen, die diese App braucht: die **Spur**, die du hinterlässt,
und die **Messkurve**, die ein Instrument zeichnet. Genau das tut das Produkt — es hält fest,
was tatsächlich passiert ist, und trägt es gegen das auf, was geplant war.

Der Vorgänger hieß *Cadence*. Der Name war nicht falsch, er war unbesonders: Cadence,
Momentum, Compass, Tempo, Anchor — das ist der Cluster, den Sprachmodelle ausgeben, wenn man
sie nach einem Namen fragt. Ein abstraktes englisches Substantiv, angenehm und austauschbar.

> „Du sagst, wer du werden willst. Trace zeigt dir, wie du dorthin kommst — und lernt
> dabei, was für dich tatsächlich funktioniert."

## Das Zeichen

Zwei Striche auf gemeinsamer Grundlinie, ungleich hoch.

Das ist keine Metapher über das Produkt, sondern das Produkt: Jeder Plan hat zwei Spuren — die
**Gesundheitsbasis**, die unter jedem Ziel mitläuft, und die **Zielspur** darüber. Der kurze
Strich ist die Basis, der hohe ist das Ziel, und das Ziel trägt die Signalfarbe, weil es der
Teil ist, der sich bewegt.

Es braucht keinen Absatz, um verstanden zu werden — die Prüfung, an der das alte Zeichen
scheiterte: Ein offener Ring mit einem Punkt bedeutete nur dem etwas, der den Kommentar
darunter geschrieben hatte. Und es übersteht 16 Pixel: Ein Ring mit Lücke wird dort zum
Kreis, zwei senkrechte Striche bleiben zwei senkrechte Striche.

**Dieselbe Geometrie ist die Kante jeder Aktionskarte.** Ein durchgehender Balken in der
Signalfarbe heißt Zielspur, ein kurzer stummer heißt Basis. Das Erkennungszeichen ist damit
die Information selbst und kein Abzeichen daneben.

## Wovon das hier ein Bruch ist

Die vorige Fassung war warmes Papier, gedämpftes Salbeigrün, alles auf 16 px gerundet, eine
Schrift für jede Aufgabe, weiche Schatten unter jeder Karte. Jede Einzelentscheidung ist
vertretbar — zusammen sind sie das Standardaussehen einer generierten App. Angenehm, und ohne
etwas, das man wiedererkennt.

Fünf Regeln ersetzen sie, und sie stehen als Regeln da, weil eine Oberfläche genau dorthin
zurückdriftet, wenn niemand sie festhält:

1. **Weiß, kein Papier.** Keine Wärme in den Neutraltönen. Wärme kommt in diesem Produkt aus
   den Sätzen, nicht aus den Wänden.
2. **Form nach Aufgabe, nicht überall gleich.** 14 px auf einer Fläche, 10 px auf einem
   Bedienelement. *Ersetzt die alte Regel „3 px auf allem".* Die alte Regel hatte recht damit,
   dass die vorige Weichheit — 16 px auf allem, ein Schatten unter jedem Block — nach
   generierter App aussieht, und unrecht mit dem Schluss, dass Schärfe die Kur ist. Eine
   3-px-Kante auf jedem Element ist genauso einheitlich wie eine 16-px-Rundung. **Einheitlichkeit
   war das Problem, nicht der Radius.** Die Pille bleibt auf genau eine Aufgabe beschränkt:
   Ringe und Statuschips, wo die Form Bedeutung trägt.
3. **Tiefe wird ausgegeben, nicht verstreut.** Genau zwei Stufen: `--lift` für alles, was
   Inhalt hält, `--lift-key` für die **eine** Sache, die auf einem Screen gerade zählt — eine
   pro Screen, und ein Test setzt das durch. *Ersetzt die alte Regel „kein `box-shadow` in der
   ganzen App".* Auf Papier stimmte sie; auf einem Telefon erzeugte sie einen Screen, auf dem
   fünfzehn Elemente auf exakt derselben Ebene lagen und deshalb nichts wichtiger sein konnte
   als irgendetwas anderes. Der Grund ist gesunken (`--surface-sunken`), damit eine Karte
   überhaupt auf etwas liegen kann.
4. **Zwei Schriften mit verschiedenen Aufgaben.** **Barlow** sagt etwas, **IBM Plex Mono**
   misst es. Jede Zahl, an der sich die App messen lassen muss — eine Uhrzeit, eine Quote,
   ein Datum, eine Dauer — steht im Mono. Das ist die sichtbarste Signatur hier und keine
   Dekoration: Sie markiert den Unterschied zwischen dem, was die App *behauptet*, und dem,
   was sie *gemessen* hat.
5. **Eine Signalfarbe, sparsam.** Elektrisches Blau, und nur für das, was gerade lebt: der
   aktuelle Tag, der aktive Tab, ein erledigter Ring.

## Farbe

| Rolle | Hell | Dunkel |
| --- | --- | --- |
| Grund | `#ffffff` | `#0e1013` |
| Fläche | `#ffffff` | `#16191e` |
| Tinte | `#0b0c0e` | `#e8eaee` |
| Linie | `#e2e5e9` | `#262b32` |
| Signal | `#0047d6` | `#6d9bff` |

Jede Domäne hat ihren eigenen Ton, damit ein Blick auf „Heute" sagt, um welche Art Aktion es
geht, ohne zu lesen. Die Töne sind jetzt **Tinten in voller Sättigung** statt Pastelltöne, und
ein Tag ist ein Haarlinien-Kästchen, keine gefüllte Pille. **Schlaf und Kopf haben eigene
Töne** — vorher liehen sie sich den Bewegungston, wodurch ein Schlafziel wie ein Gehziel
aussah, also genau das, wogegen die Farbe da ist.

Dunkelmodus ist **eigens gewählt**, nicht umgedreht: eigene Schritte, gegen die dunkle Fläche
geprüft.

## Form und Bewegung

Zwei Radien, keine Pille: Karte (3 px), Bedienelement (2 px). Der Unterschied zwischen diesen
Werten und den alten 16 px ist der größte Einzelanteil daran, dass die Oberfläche weich wirkte.

Bewegung ist kurz und selten. Sie bestätigt ein Antippen, sie führt nichts auf. Alles über
200 ms liest sich auf dem Handy als Verzögerung, nicht als Politur. `prefers-reduced-motion`
wird respektiert — wer sein System um weniger Bewegung bittet, meint es.

## Zahlen

`.num` setzt Zahlen in IBM Plex Mono mit Tabellenziffern und geschlitzter Null. Es gehört an
jede Uhrzeit, jede Quote, jedes Datum, jede Dauer und jede Anzahl — nicht, weil Zahlen dann
hübscher stehen, sondern weil die Schrift die Aussage markiert: Fließtext ist, was die App
sagt; Mono ist, was sie gemessen hat.

`.label` setzt kleine Versalien ebenfalls im Mono — Abschnittsüberschriften, Tags, die Leiste.
Damit reicht die Instrumentenlesart bis in die Möblierung.

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
