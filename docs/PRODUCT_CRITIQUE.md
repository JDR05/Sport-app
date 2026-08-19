# Product Critique

Rolle: Product Critic. Aufgabe ist nicht, Code zu testen, sondern das Produkt anzugreifen.
Jede Kritik ist konkret und endet mit einem Vorschlag. Was hier nicht ausgeräumt wird, wird
in `FINAL_ARCHITECTURE.md` gestrichen oder verschoben.

Schweregrad: **A** = trifft die Produktidee im Kern · **B** = gefährdet den MVP-Erfolg ·
**C** = Korrektur nötig, aber begrenzt

---

## K1 — Der USP wirkt erst, wenn der Nutzer schon weg ist · **A**

**Angriff:** Die Adaptive Engine braucht Wochen an Verhaltensdaten, bevor sie ein Muster
belegen kann — das Playbook verlangt das sogar ausdrücklich („eine einzelne Abweichung ist
kein Muster"). Die Retention-Entscheidung fällt aber in Tag 1 bis 7. In genau dem Fenster,
in dem der Nutzer entscheidet zu bleiben, ist das Produkt ein statischer Planer plus ein
Versprechen. Der differenzierende Teil ist zu diesem Zeitpunkt nachweislich inaktiv.

Das ist der zentrale Widerspruch des Konzepts: die Stärke liegt hinter einer Hürde, die die
meisten Nutzer nie überschreiten.

**Vorschlag:** Den Wert in Woche 1 vollständig aus dem *Plan* holen, nicht aus der Anpassung.

1. Der erste Plan muss explizit auf die Eingaben des Nutzers referenzieren, sichtbar im Text:
   nicht „Krafttraining 40 Min", sondern „Dienstag 19:30 nach deiner Vorlesung, 40 Min ohne
   Geräte — Laufen hast du ausgeschlossen." Personalisierung, die man nicht sieht, existiert
   für den Nutzer nicht.
2. Adaptation in **zwei Stufen** trennen: *Planpflege* greift ab Tag 2, ist deterministisch,
   klein und ehrlich als vorläufig gekennzeichnet („du hast beide Morgen-Slots verschoben —
   ich lege das Training auf abends"). *Experimente* bleiben an die statistische Schwelle
   gebunden. Ohne diese Trennung passiert in Woche 1 sichtbar gar nichts.

---

## K2 — Das MVP hängt vollständig an manuellem Tracking · **A**

**Angriff:** Der Produktplan fordert „manuelles Tracking reduzieren" und „darf sich nicht wie
ein zweiter Job anfühlen" — schließt Wearables im MVP aber aus. Damit hängt die gesamte
Adaptive Engine an Daten, die der Nutzer täglich von Hand einträgt. Genau das hören Nutzer
als Erstes auf zu tun. Ohne Check-ins keine Muster, ohne Muster kein USP. Die Nicht-Bauen-
Entscheidung und der Kernmechanismus widersprechen einander.

**Vorschlag:**

1. Ein vollständiger Tagesabschluss muss in **unter 15 Sekunden** möglich sein: ein
   Sammel-Prompt mit vorausgefüllten Werten, direkt auf Today, ohne Navigation.
2. Die Engine muss mit lückenhaften Daten arbeiten. **Fehlend ist nicht gleich nicht
   geschafft.** Ein Tag ohne Eingabe darf niemals als `missed` in die Mustererkennung
   eingehen — sonst erzeugt Trackingmüdigkeit falsche Hypothesen und das System redet dem
   Nutzer ein Problem ein, das er nicht hat. Das ist eine harte Anforderung an die Detection.
3. Check-in-Rate wird zur überwachten Kernmetrik, nicht zu einer von acht KPIs.

---

## K3 — „Ist das nur ChatGPT + Dashboard?" · **A**

**Angriff:** In V1 ehrlicherweise fast ja. Ein Nutzer kann heute ein LLM nach einem
Wochenplan fragen und bekommt etwas Vergleichbares — kostenlos, ohne Onboarding. Der
Unterschied entsteht ausschließlich durch Persistenz plus Rückkopplung über Zeit. Das ist
korrekt erkannt, aber es ist ein *unsichtbarer* Unterschied. Ein Nutzer, der ihn nicht sehen
kann, wird ihn nicht glauben.

**Vorschlag:** Ein sichtbares Artefakt, das ein Chat prinzipiell nicht haben kann — das
**persönliche Playbook**: eine wachsende Liste bestätigter Regeln über diese Person, jede mit
Beleg. „Donnerstag statt Mittwoch: Erfüllung von 20 % auf 80 %, bestätigt über 3 Wochen."

Dieser Screen kommt früh und ist anfangs leer — mit sichtbarem Fortschritt darauf, wie viele
Daten bis zur ersten Regel fehlen. Ein leeres Playbook mit Fortschrittsanzeige ist ein
Retention-Anker; dieselbe Information im Fließtext ist keiner.

---

## K4 — Experimente können nicht am Gewicht ausgewertet werden · **B**

**Angriff:** Tagesschwankungen von 1–2 kg sind normal. Bei 5 kg über 12 Wochen liegt das
wöchentliche Signal bei rund 0,4 kg — deutlich unter dem Rauschen. Ein Experiment über 7 Tage
ist am Gewicht grundsätzlich nicht auswertbar. Wenn die Engine es trotzdem versucht, erzeugt
sie Zufallsentscheidungen und speichert sie als „gelernte persönliche Regel". Das wäre nicht
nur nutzlos, sondern aktiv schädlich: falsche Regeln vergiften das Personal Model dauerhaft.

**Vorschlag:** Zwei Metrikklassen sauber trennen, im Datenmodell und in der Engine.

- **Verhaltensmetriken** (Erfüllungsquote, Trainingsanzahl, Snackhäufigkeit): kurzfristig,
  niedriges Rauschen, **einzige zulässige Grundlage für Experiment-Auswertung**.
- **Zielmetriken** (Gewicht): nur als gleitender Mittelwert über lange Fenster, ausschließlich
  für Progress und Zielprognose, **nie** für Experimententscheidungen.

---

## K5 — Der Today-Screen widerspricht dem eigenen UX-Prinzip · **C**

**Angriff:** Der Produktplan listet für Today: Top-Ziel, 3–5 Aktionen, Training, Ernährung,
Bewegung, Schlaf/Recovery, eine Entwicklungsaktion, Termine und Zeitfenster. Das sind sieben
Blöcke — bei gleichzeitig geltendem Prinzip „keine Datenüberflutung" und „3–5 wichtigste
Aktionen". Der Screen widerspricht sich im selben Dokument.

**Vorschlag:** Im MVP nur Domains, die auf das eine Ziel einzahlen: **Ernährung, Training,
Bewegung**. Schlaf wird als Kontext erfasst, aber nicht als geplante Aktion.
Self-Improvement-Aktionen und Termine/Zeitfenster kommen raus — Termine setzen ohnehin eine
Kalenderintegration voraus, die im MVP ausgeschlossen ist. Damit sind die „3–5 Aktionen"
tatsächlich 3–5 Aktionen.

---

## K6 — Die Sicherheitsdeckelung ist ein Abbruchrisiko im Onboarding · **B**

**Angriff:** Ein Nutzer, der 5 kg in 4 Wochen will, bekommt vom System ein langsameres Ziel.
Fachlich richtig — aber es ist das Erste, was die App tut: widersprechen. Ein „nein" in der
ersten Minute, bevor irgendein Wert geliefert wurde, kostet Nutzer.

**Vorschlag:** Die Deckelung nicht als Ablehnung formulieren, sondern als konkreteres
Versprechen mit Datum. Nicht „das ist unrealistisch", sondern „5 kg bis 14. November — und
hier ist der Weg dorthin." Dasselbe Ergebnis, umgekehrtes Vorzeichen. Ehrlichkeit wird als
Verlässlichkeit erlebt, wenn sie mit einer Zusage kommt statt mit einer Absage.

---

## K7 — Der Personalisierungstest kann trivial bestehen · **B**

**Angriff:** Innerhalb des einen Use Case „5 kg abnehmen" ist der Variationsraum begrenzt. Es
ist gut möglich, dass zehn Pläne sich nur in Uhrzeiten und Trainingsanzahl unterscheiden —
und dann besteht der Test, ohne dass echte Personalisierung existiert. Ein Test, den ein
schwaches System besteht, ist schlimmer als kein Test: er erzeugt falsche Sicherheit genau in
der Frage, die das Playbook als wichtigste bezeichnet.

**Vorschlag:** Der Test misst **strukturelle** Distanz, nicht Feldwerte: welche Domains
überhaupt vorkommen, welche Strategie gewählt wurde, Anzahl und Verteilung der Aktionen, Art
der Ernährungsumsetzung. Schwellwert vor der Implementierung festlegen, nicht danach
justieren, bis er grün ist.

**Zusatz:** Ein zweiter Test prüft jedes Onboarding-Feld einzeln — Feld variieren, Rest
konstant, Plan vergleichen. Jedes Feld aus Stufe 1, das keine Planänderung auslöst, fliegt
aus Stufe 1. Damit ist der Zielkonflikt „kurzes Onboarding vs. echte Personalisierung"
messbar statt Geschmackssache.

---

## K8 — Zahlungsbereitschaft ist zum geplanten Zeitpunkt nicht testbar · **C**

**Angriff:** Für einen Plan zahlt niemand, für ein Dashboard auch nicht. Zahlungsbereitschaft
kann nur aus dem entstehen, was man beim Wechsel verliert — Historie und Playbook. Das ist
nach 4 Wochen Nutzung nicht vorhanden. Die 5–12 €-Hypothese ist in Validierungsphase 5 damit
nicht ehrlich prüfbar.

**Vorschlag:** Vor Monat 3 keine Preisabfrage. In Phase 5 stattdessen nur Absichtsbekundung
und Abwanderungswiderstand messen. Die Pro-Feature-Auswahl (Langzeitmuster, mehrere Ziele,
Playbook) ist richtig gewählt — sie monetarisiert genau die Historie. Nur der Zeitpunkt ist
falsch.

---

## K9 — Funktional ist das ein Habit Tracker, solange die Analyse nicht spürbar ist · **C**

**Angriff:** Die App plant tägliche Aktionen und lässt sie abhaken. Die Abgrenzung „kein
einfacher Habit Tracker" existiert ausschließlich in dem Maß, in dem die Analyse für den
Nutzer erlebbar wird. Bis dahin ist die Selbstbeschreibung eine Behauptung.

**Vorschlag:** Deckungsgleich mit K3 — das Playbook ist der sichtbare Beweis. Zusätzlich: nie
eine Anpassung ohne die Begründung ausliefern, die sie ausgelöst hat.

---

## Was daraus folgt

Die Kritik trifft nicht die Produktidee, aber sie verschiebt die Prioritäten deutlich:

1. **Woche 1 entscheidet**, nicht Woche 12 — sichtbare Personalisierung im ersten Plan und
   Planpflege ab Tag 2 sind wichtiger als die vollständige Experimentmechanik.
2. **Das Playbook ist ein Screen**, kein Nebenprodukt.
3. **Verhaltensmetriken und Zielmetriken sind getrennte Konzepte** — das ist eine
   Architekturänderung, keine Feinheit.
4. **Fehlende Daten sind nicht gleich Versagen** — Detection muss das strukturell abbilden.
5. **Today schrumpft** auf drei Domains.

Alles davon geht in `FINAL_ARCHITECTURE.md`.
