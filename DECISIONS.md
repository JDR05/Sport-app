# Decision Log

Jede wichtige Architektur- und Produktentscheidung mit Datum, Entscheidung und Begründung.
Zweck: verhindern, dass spätere Arbeitsschritte alte Entscheidungen unbeabsichtigt wieder
aufheben. Neue Einträge oben anfügen. Bestehende Einträge werden nicht gelöscht, sondern
durch einen neuen Eintrag ersetzt, der auf sie verweist.

---

## 2026-08-19 — ADR-027: Bei benachbarten freien Tagen wird der Körper aufgeteilt

**Entscheidung:** Liegen die einzigen freien Trainingstage direkt nebeneinander, plant der
Kraft-Archetyp einen Split nach Muskelgruppen statt zweimal Ganzkörper — auch für Einsteiger,
für die sonst Ganzkörper vorgesehen wäre.

**Begründung:** Die Erholungsregel verbietet zwei schwere Einheiten für dieselbe Muskelgruppe
innerhalb von zwei Tagen. Bei jemandem, der nur Samstag und Sonntag frei hat, kollidiert das
mit dem Wunsch, zweimal zu trainieren. Die Einheit zu streichen wäre die bequeme Antwort; den
Körper aufzuteilen ist die richtige. Aufgefallen, als der Feldwirksamkeitstest einen
Trainingsausschluss auf Dienstag und Donnerstag setzte.

---

## 2026-08-19 — ADR-026: Schlaf-Invariante prüft die Richtung, nicht die Ankunft

**Entscheidung:** Die Sicherheitsprüfung für Schlafziele verlangt drei Dinge: der Plan darf
den Schlaf nie verkürzen, er muss ihn bewegen, wenn er unter sieben Stunden liegt, und die
Verschiebung darf 30 Minuten pro Woche nicht überschreiten. Sie verlangt **nicht**, dass der
Plan die sieben Stunden sofort erreicht.

**Begründung:** Die erste Fassung tat genau das und lehnte damit jeden Plan für Menschen ab,
die fünf Stunden schlafen — obwohl die 30-Minuten-Regel es unmöglich macht, dort in einer
Woche hinzukommen. Zwei Regeln, die sich gegenseitig ausschließen. Eine zweite Fassung warf
zusätzlich bei Menschen, die zehn Stunden schlafen: der Plan hatte das gar nicht empfohlen,
die Person schläft schlicht so. Eine Invariante darf nur beanstanden, was die App selbst tut.

---

## 2026-08-19 — ADR-025: Sicherheitsgrenzen gelten je Zielart

**Entscheidung:** Jeder Archetyp bringt eigene Invarianten mit. Kalorien-Untergrenzen und
Ratendeckel bei Körperzielen; höchstens 10 % Umfangssteigerung pro Woche bei Ausdauer; bei
Schlafzielen darf nie weniger Schlaf empfohlen werden; bei Ernährungsqualität keine
Eliminationsdiäten und keine Kalorienziele; bei Gewohnheiten höchstens eine neue gleichzeitig
und keine Streak-Mechanik. Vollständig in `docs/GOAL_ARCHETYPES.md`.

**Begründung:** Ersetzt die pauschale Fassung aus ADR-017, die stillschweigend annahm, jedes
Ziel sei ein Abnehmziel. Ein Kaloriendefizit ist bei einem Schlafziel unsinnig, eine
Steigerungsregel bei einer Gewohnheit bedeutungslos. Eine Sicherheitsgrenze, die für alles
gilt, gilt für nichts. Die Werte aus ADR-017 bleiben gültig — aber nur für
`body_composition`.

---

## 2026-08-19 — ADR-024: Vollständiges Onboarding in einem Durchlauf

**Entscheidung:** Nach dem frei formulierten Ziel folgt eine vollständige Erhebung über alle
Lebensbereiche in einem Durchlauf, statt des gestaffelten Onboardings aus ADR-018.

**Begründung:** Entscheidung des Product Owners. Die KI soll von Anfang an den ganzen Menschen
kennen, nicht nur den Ausschnitt, den das aktuelle Ziel betrifft — sonst kann sie weder
allgemeine Gesundheitsverbesserungen vorschlagen noch später ein zweites Ziel sinnvoll
einordnen.

**Bekannter Preis, bewusst akzeptiert:** Onboarding Completion ist laut den eigenen KPIs eine
Kernmetrik, und jede zusätzliche Frage kostet dort. Der Feldwirksamkeitstest aus ADR-014
bleibt deshalb bestehen und wird jetzt **pro Archetyp** geführt: ein Feld gilt als
gerechtfertigt, wenn es für mindestens eine Zielart den Plan verändert. Felder, die für
*keinen* Archetyp etwas bewirken, fliegen weiterhin raus.

---

## 2026-08-19 — ADR-023: Die KI rückt in den Produktkern

**Entscheidung:** Der AI-Layer wird vorgezogen und ist im MVP zuständig für Zieleinordnung,
zielspezifische Vorschläge und Formulierung. Modell: `claude-opus-5`. Ohne API-Key oder bei
ungültiger Antwort übernimmt ein deterministischer Klassifikator.

**Begründung:** Ein frei formuliertes Ziel lässt sich ohne Modell nicht sinnvoll einordnen,
und der beschriebene Produktnutzen — Vorschläge, Anregungen, Verbesserungen — entsteht genau
dort. Damit ändert sich die Reihenfolge aus ADR-006, nicht das Prinzip: Archetypen, Planlogik
und Sicherheitsgrenzen bleiben deterministisch und laufen ohne Modell vollständig durch. Die
KI macht sie besser, nicht erst möglich. Ein KI-Vorschlag, der eine Invariante verletzt, wird
verworfen statt korrigiert.

---

## 2026-08-19 — ADR-022: Zweispuriger Plan — Gesundheitsbasis plus Zielspur

**Entscheidung:** Jeder Plan besteht aus einer Gesundheitsbasis, die bei jedem Ziel mitläuft,
und einer Zielspur, die sich nach dem Archetyp richtet. Die Obergrenze von 3–5 Aktionen auf
Today bleibt hart; die Basis darf die Zielspur nie überlagern.

**Begründung:** Der Product Owner beschreibt beides als eine Sache: allgemein gesünder werden
*und* das eine Ziel erreichen. Getrennt gedacht würde daraus entweder eine generische
Gesundheits-App oder ein enger Zieltracker. Zusammen ergibt es das Produkt.

---

## 2026-08-19 — ADR-021: Das Ziel ist offen — ersetzt „5 kg abnehmen" als Produktform

**Entscheidung:** Der Nutzer gibt ein frei formuliertes Ziel aus jedem Bereich von Gesundheit
und persönlicher Entwicklung ein. Sechs deterministisch geplante Archetypen decken die
häufigen Fälle ab; alles andere bekommt Gesundheitsbasis plus KI-Vorschläge — nie eine
Absage. Ein aktives Ziel zur Zeit bleibt bestehen (ADR-004).

**Begründung:** Klarstellung des Product Owners. Beide Quelldokumente nennen „5 kg abnehmen"
als ersten Use Case (Produktplan §16 und §30, Playbook §17); das war als **Testfall** gemeint,
nicht als Form des Produkts. In Schritt 3 und 4 wurde es fälschlich als Form umgesetzt —
Gewicht ist in die Engine-Typen, in `clampGoal` und in den ersten Onboarding-Schritt
eingewachsen.

**Was das kostet:** Umbau von Engine und Onboarding. Das Datenfundament aus Schritt 2 ist
nicht betroffen — `goal_metrics.metric_key` und `goals.goal_type` sind bereits generisch, und
`plan_domain` enthält `sleep`, `self_improvement` und `priority` schon.

**Was bestehen bleibt:** Die MVP-Disziplin aus dem Playbook. Sechs Archetypen sind eine
begrenzte, erweiterbare Menge — keine Super-App. Was nicht hineinpasst, fällt auf die
Gesundheitsbasis zurück, statt einen siebten Planer zu erzwingen.

---

## 2026-08-19 — ADR-020: Fünf Tabs, Playbook als eigene Route

**Entscheidung:** Die Bottom-Navigation hat fünf Ziele — Heute, Plan, Fortschritt, Insights,
Profil. Das Playbook hat eine eigene Route `/playbook`, ist aber über Insights erreichbar
statt als sechster Tab.

**Begründung:** ADR-009 verlangt, dass das Playbook ein eigener Screen ist, und der
Produktplan nennt genau fünf Navigationsziele. Ein sechster Tab macht die Leiste auf dem
Telefon eng — also genau die Überladung, die die UX-Prinzipien ausschließen. Beide
Anforderungen sind erfüllt: eigener Screen, aber kein Platz im Hauptmenü.

---

## 2026-08-19 — ADR-019: Client-State als bewusstes Gerüst für Schritt 4

**Entscheidung:** Die Onboarding-Antworten liegen in Schritt 4 in `localStorage`, der Plan
wird im Browser aus der Engine abgeleitet. Kein Auth, kein Datenbankzugriff, keine Server
Actions.

**Begründung:** Die Screens sollen gegen die echte Engine gebaut und beurteilt werden können,
bevor Auth und Persistenz existieren — sonst hängt das UX-Review an Infrastruktur, die
inhaltlich nichts beiträgt. Die Screens sehen ausschließlich `PlanInput` und `PlanResult`;
Schritt 5 tauscht die Speicherschicht gegen Supabase, ohne dass eine Komponente sich ändern
muss.

**Konsequenz:** Die Daten liegen aktuell nur im jeweiligen Browser. Das steht so auch im
Profil-Screen, statt es zu verschweigen.

---

## 2026-08-19 — ADR-018: Onboarding-Stufe 1 wird gemessen, nicht diskutiert

**Entscheidung:** Ein Feld steht genau dann in Stufe 1 des Onboardings, wenn
`tests/engine.fields.test.ts` nachweist, dass es den erzeugten Plan verändert. Aufsteh- und
Schlafzeit, Wochenendstruktur und Lebenssituation sind dadurch nach Stufe 2 gewandert; die
verbleibenden 20 Felder sind alle nachweislich planwirksam.

**Begründung:** Der Zielkonflikt „kurzes Onboarding gegen echte Personalisierung" lässt sich
nicht durch Meinung auflösen. Jede Frage kostet Abschlussquote; eine Frage, deren Antwort den
Plan nicht verändert, kostet sie umsonst. Die vier verschobenen Felder waren redundant zu den
freien Zeitfenstern und zum Arbeitsrhythmus.

---

## 2026-08-19 — ADR-017: Konkrete Sicherheitsgrenzen

**Entscheidung:** Kalorien-Untergrenze 1500 kcal (männlich und ohne Angabe) bzw. 1200 kcal
(weiblich); Defizit höchstens 25 % des Tagesbedarfs; Abnehmrate höchstens 0,75 % des
Körpergewichts pro Woche und absolut höchstens 1,0 kg pro Woche; mindestens zwei Ruhetage für
Einsteiger, einer sonst; nie mehr als drei Trainingstage am Stück. Grundumsatz nach
Mifflin-St Jeor. Alle Werte in `src/lib/engine/constants.ts`.

**Ergänzende Regel:** Fehlt eine Angabe, wählt die Engine immer die Variante, die zu **mehr**
Essen und **weniger** Belastung führt. Bei unbekanntem Geschlecht also der höhere Grundumsatz
*und* die höhere Kaloriengrenze — das ist die einzige Auflösung, die in beide Richtungen
sicher ist.

**Begründung:** ADR-008 legt fest, dass Sicherheitsgrenzen Code sind; hier stehen die Zahlen.
Der doppelte Deckel auf die Rate ist Absicht: ein relativer Deckel allein wäre bei sehr hohem
Körpergewicht zu großzügig, ein absoluter allein bei sehr niedrigem zu knapp.

---

## 2026-08-19 — ADR-016: Supabase-Projekt `life-system`, `Us2` dafür pausiert

**Entscheidung:** Das Datenfundament liegt im Supabase-Projekt `life-system`
(`ujytwuonyxinjurrrgwg`, eu-central-1, 0 €/Monat). Um es im Free-Tier anlegen zu können,
wurde auf Anweisung des Product Owners das Projekt `Us2` pausiert.

**Begründung und Konsequenz:** Der Free-Tier erlaubt zwei aktive Projekte pro Owner; `Us2`
und `faellig` belegten beide Plätze. Die Empfehlung lautete `faellig` (Blast Radius von einer
Person statt zwei), der Product Owner hat sich für `Us2` entschieden.

**Wichtig für später:** `Us2` ist eine Paar-App mit einem zweiten Nutzer. Pausieren ist
reversibel und löscht keine Daten, aber die App ist für beide Nutzer offline, bis das Projekt
reaktiviert wird. Wer diese Entscheidung rückgängig machen will, braucht dafür einen freien
Projekt-Slot oder ein Pro-Abo.

---

## 2026-08-19 — ADR-015: Preisabfrage frühestens ab Monat 3

**Entscheidung:** In Validierungsphase 5 wird keine Zahlungsbereitschaft abgefragt, sondern
nur Absichtsbekundung und Abwanderungswiderstand. Preisfragen frühestens nach drei Monaten
Nutzung.

**Begründung:** Zahlungsbereitschaft entsteht aus dem, was man beim Wechsel verliert —
Historie und Playbook. Nach vier Wochen existiert beides praktisch nicht. Eine Preisantwort
zu diesem Zeitpunkt misst Höflichkeit, nicht Bereitschaft. Ersetzt die ursprüngliche
Phase-5-Definition. Siehe `PRODUCT_CRITIQUE.md` K8.

---

## 2026-08-19 — ADR-014: Der Personalisierungstest misst strukturelle Distanz

**Entscheidung:** Der Test aus ADR-007 vergleicht Struktur (welche Domains vorkommen, welche
Strategie gewählt wurde, Anzahl und Verteilung der Aktionen, Art der Ernährungsumsetzung),
nicht Feldwerte. Die Schwelle wird vor der Implementierung festgelegt. Ergänzt um einen
Feldwirksamkeitstest: jedes Onboarding-Feld aus Stufe 1 muss den Plan nachweislich
verändern.

**Begründung:** Innerhalb eines einzigen Use Case ist der Variationsraum klein. Ein Test, der
nur Uhrzeiten vergleicht, besteht auch dann, wenn keine echte Personalisierung existiert —
und erzeugt falsche Sicherheit genau in der Frage, die das Playbook als wichtigste
bezeichnet. Der Feldwirksamkeitstest macht zusätzlich den Zielkonflikt „kurzes Onboarding vs.
Personalisierung" messbar. Siehe `PRODUCT_CRITIQUE.md` K7.

---

## 2026-08-19 — ADR-013: Zweistufige Adaptation — Planpflege und Experiment

**Entscheidung:** Anpassungen laufen in zwei getrennten Stufen. **Planpflege** greift ab
Tag 2, ist deterministisch und klein, wird als vorläufig gekennzeichnet und erzeugt keine
Personal Rule. **Experimente** bleiben an die statistische Schwelle gebunden und sind die
einzige Quelle für Personal Rules.

**Begründung:** Die Adaptive Engine braucht Wochen, bis sie ein Muster belegen kann — die
Retention-Entscheidung fällt aber in Tag 1 bis 7. Ohne die erste Stufe passiert in genau dem
Fenster, in dem der Nutzer bleibt oder geht, sichtbar nichts. Ohne die Trennung würden
vorläufige Anpassungen ins Personal Model schreiben und das Playbook entwerten. Siehe
`PRODUCT_CRITIQUE.md` K1.

---

## 2026-08-19 — ADR-012: Verhaltens- und Zielmetriken sind getrennte Klassen

**Entscheidung:** `measurements` trägt ein `metric_class` (`behavior` | `outcome`).
Experimente werden ausschließlich an Verhaltensmetriken ausgewertet; Zielmetriken wie
Gewicht dienen nur Progress und Zielprognose über lange Fenster. Die Engine erzwingt das
über Typen.

**Begründung:** Bei 5 kg über 12 Wochen liegt das wöchentliche Gewichtssignal bei rund
0,4 kg und damit unter der normalen Tagesschwankung. Ein 7-Tage-Experiment am Gewicht
auszuwerten produziert Zufallsentscheidungen — die dann als „gelernte persönliche Regel"
gespeichert würden und das Personal Model dauerhaft vergiften. Siehe `PRODUCT_CRITIQUE.md`
K4.

---

## 2026-08-19 — ADR-011: Statuswert `unknown` für fehlende Eingaben

**Entscheidung:** `plan_items` erhält den Status `unknown` für Aufgaben ohne Nutzereingabe.
Er geht nie in die Mustererkennung ein.

**Begründung:** Der MVP hat bewusst keine Wearables und hängt damit vollständig an manuellem
Tracking. Ohne diesen Status würde jede Trackinglücke als `missed` gewertet, aus
Trackingmüdigkeit ein Verhaltensmuster erzeugt und dem Nutzer ein Problem eingeredet, das er
nicht hat. Siehe `PRODUCT_CRITIQUE.md` K2.

---

## 2026-08-19 — ADR-010: Today umfasst im MVP drei Domains

**Entscheidung:** Today zeigt Ernährung, Training und Bewegung. Schlaf wird als Kontext
erfasst, aber nicht geplant. Self-Improvement-Aktionen und Termine/Zeitfenster entfallen im
MVP.

**Begründung:** Die ursprüngliche Screen-Definition listet sieben Blöcke bei gleichzeitigem
Prinzip „3–5 wichtigste Aktionen" und „keine Datenüberflutung" — ein Widerspruch im selben
Dokument. Termine setzen zudem eine Kalenderintegration voraus, die im MVP ausgeschlossen
ist. Siehe `PRODUCT_CRITIQUE.md` K5.

---

## 2026-08-19 — ADR-009: Das Playbook wird ein eigener Screen im MVP

**Entscheidung:** Die Liste bestätigter persönlicher Regeln bekommt einen eigenen Screen, ab
Tag 1 sichtbar, anfangs leer und mit Fortschrittsanzeige bis zur ersten Regel. Jede Regel
trägt ihren Beleg.

**Begründung:** Der Unterschied zu einem Chatverlauf entsteht durch Persistenz plus
Rückkopplung — das ist aber unsichtbar, und was der Nutzer nicht sehen kann, glaubt er nicht.
Ein sichtbar wachsendes Artefakt, das ein Chat prinzipiell nicht haben kann, ist der
Retention-Anker. Dies ist die einzige Scope-*Erweiterung* aus der Kritikphase; netto wird der
MVP trotzdem kleiner. Siehe `PRODUCT_CRITIQUE.md` K3 und K9.

---

## 2026-08-19 — ADR-008: Sicherheitsgrenzen sind Code, nicht Prompt

**Entscheidung:** Kalorien-Untergrenzen, maximale Abnehmrate, Pflicht-Ruhetage und das
Verbot kompensatorischer Logik werden als Invarianten in der Engine implementiert und mit
Tests über alle Profil-Fixtures abgesichert.

**Begründung:** Beide Quelldokumente verlangen konservative Gesundheitslogik. Eine
Prompt-Anweisung ist keine Garantie — ein Test ist eine. Damit gilt die Grenze auch dann,
wenn der AI-Layer später ausgetauscht wird oder ausfällt.

---

## 2026-08-19 — ADR-007: „Echte Personalisierung" wird als Test durchgesetzt

**Entscheidung:** Zehn deutlich unterschiedliche Profil-Fixtures erzeugen zehn Pläne; ein
automatisierter Test misst die paarweise Distanz und schlägt fehl, wenn die Pläne einander
zu ähnlich sind.

**Begründung:** Das Playbook nennt das die wichtigste Qualitätsprüfung überhaupt. Als
manuelle Prüfung würde sie in der Praxis übersprungen. Als CI-Gate kann die zentrale
Produktbehauptung nicht unbemerkt kaputtgehen.

---

## 2026-08-19 — ADR-006: Rules-Engine zuerst, AI-Layer zunächst gemockt

**Entscheidung:** Die Goal- und Plan-Engine wird deterministisch gebaut und getestet, bevor
ein echtes Modell angebunden wird. Der AI-Layer entsteht als Interface mit
Schema-Validierung, Fallback und einem deterministischen Mock-Adapter.

**Begründung:** Entspricht der Architekturregel aus beiden Dokumenten. Zusätzlich praktisch:
die Kernlogik ist ohne API-Key entwickelbar und vollständig testbar, und das echte Modell
wird später eingesteckt, ohne die Produktlogik anzufassen.

---

## 2026-08-19 — ADR-005: Sprachtrennung Deutsch/Englisch

**Entscheidung:** UI-Texte und alle Dokumente in `docs/` auf Deutsch. Code, Bezeichner,
Kommentare, Commit-Messages und Branch-Namen auf Englisch.

**Begründung:** Product Owner und Quelldokumente sind deutsch; die Zielgruppe des MVP
ebenfalls. Code bleibt englisch, weil Frameworks, Libraries und Tooling es sind — gemischte
Bezeichner erzeugen dauerhaft Reibung.

---

## 2026-08-19 — ADR-004: Ein Hauptziel im MVP, Wearables später

**Entscheidung:** Der MVP unterstützt genau ein aktives Hauptziel und keine
Health-/Wearable-Integration. Erster und einziger Use Case: „5 kg abnehmen".

**Begründung:** Direkt aus dem Produktplan. Mehrere Ziele erfordern Zielkonflikt-Auflösung,
Wearables erfordern OAuth, Sync und Normalisierung über mehrere Anbieter — beides bevor
überhaupt bewiesen ist, dass Nutzer einen persönlichen Plan annehmen.

---

## 2026-08-19 — ADR-003: Supabase als Datenfundament von Anfang an

**Entscheidung:** Postgres, Auth und Row Level Security über Supabase, statt zunächst
In-Memory-Persistenz.

**Begründung:** Entscheidung des Product Owners. Auth und Mandantentrennung sind in dieser
App nicht optional, und RLS früh zu bauen ist deutlich billiger, als sie später über ein
gewachsenes Datenmodell zu legen. Ein zusätzliches Projekt in der Organisation kostet
0 €/Monat.

---

## 2026-08-19 — ADR-002: Next.js 16 App Router, Web-first

**Entscheidung:** Responsive Web-App mit Next.js 16 (App Router), TypeScript und Tailwind.
Keine nativen Apps im MVP.

**Begründung:** Der Produktplan gibt Web-first für den MVP vor. Ein Framework mit Server- und
Client-Code in einem Deployment hält die Anzahl beweglicher Teile klein, solange das Produkt
noch validiert wird. Achtung: Next.js 16 weicht von älteren Konventionen ab — siehe
`AGENTS.md`.

---

## 2026-08-19 — ADR-001: Schrittweise Entwicklung mit Review-Punkten

**Entscheidung:** Entwicklung in klar getrennten Schritten. Nach jedem Schritt wird
committet, gepusht und für ein Review des Product Owners gestoppt.

**Begründung:** Das Playbook verlangt es ausdrücklich („nicht: Claude, baue die komplette
App") und der Product Owner hat es bestätigt. Der Nutzer bleibt Product Owner; grundlegende
Produktentscheidungen werden nachvollziehbar gemacht und bestätigt, statt implizit im Code
zu entstehen.
