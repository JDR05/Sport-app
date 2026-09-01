# Decision Log

Jede wichtige Architektur- und Produktentscheidung mit Datum, Entscheidung und Begründung.
Zweck: verhindern, dass spätere Arbeitsschritte alte Entscheidungen unbeabsichtigt wieder
aufheben. Neue Einträge oben anfügen. Bestehende Einträge werden nicht gelöscht, sondern
durch einen neuen Eintrag ersetzt, der auf sie verweist.

---

## 2026-09-01 — ADR-088: Zwei Fehler, die nur ein echter Anbieter zeigen konnte

**Entscheidung:** `AiAdapter` bekommt `usesModel`, und `classifyGoal` entscheidet daran statt am
Namen. Das Budget für die Rückfragen steigt von 8 s auf 20 s.

**Begründung:** Der erste Aufruf, der komplett durchlief, hat beides sichtbar gemacht — und
beide waren gegen den Mock unsichtbar.

**1. Ein erfolgreicher Aufruf wurde als Rückfall gemeldet.** Die Zeile hieß
`primary.name === 'claude' ? 'ai' : 'fallback'` — geschrieben, als Claude der einzige echte
Adapter war. Der kompatible Adapter nennt sich nach dem Anbieter, also `gemini`. Damit galt
jede **erfolgreiche** Gemini-Einordnung als Rückfall: `reclassify` schrieb nicht,
`classified_by` blieb `keywords`, und die App behauptete auf dem Bildschirm, sie habe das
Modell nicht benutzt, das sie gerade benutzt hatte. Logs und Datenbank widersprachen sich —
keine Warnzeile für `classify`, trotzdem `keywords` in der Zeile. Genau dieser Widerspruch
war der Hinweis.

Der Name ist kein Typ. `usesModel` fragt, was der Adapter *ist*. Die deterministischen Adapter
setzen es auf `false`, obwohl ihre Einordnung gelingt: ein Treffer in einer Wortliste ist eine
echte Antwort, aber nicht das Modell — und der Bildschirm sagt, welche von beiden man vor sich
hat.

**2. Das Rückfragen-Budget schnitt genau den Schritt ab, um den es geht.** 8 s, begründet
damit, dass eine Frage nach langem leeren Bildschirm schlechter ist als keine Frage. Gegen
einen echten Anbieter gemessen war das falsch: die Rückfragen liefen bei exakt 8 000 ms in den
Timeout, während der **Planvorschlag im selben Request** nach etwa zwölf Sekunden zurückkam und
funktionierte. Abgeschnitten wurde also ausgerechnet der Teil, der das Feature ausmacht — und
von außen sah es aus wie ein Modell, das nichts zu fragen hatte. Das ist laut Entwurf der
Normalfall, also wirkte nichts kaputt. Ein Fehler, der sich als beabsichtigtes Verhalten
tarnt, ist der teuerste.

Wer „Plan erstellen" tippt, wartet ohnehin bewusst. Die Frage ist ihm die Sekunden wert.

**Was daraus folgt:** Diese beiden waren gegen den Mock-Adapter grün und gegen den echten
Anbieter falsch. `npm run ai:check` existiert genau dafür und war ungenutzt, weil der Key nur
in Vercel lag. Vor dem nächsten Schritt an der KI gehört er lokal in `.env.local`.

---

## 2026-09-01 — ADR-087: Eine kaputte Konfiguration darf nicht wie ein Anbieterfehler aussehen

**Entscheidung:** `AI_TIMEOUT_MS` wird validiert, statt durch `Number()` gereicht zu werden. Ein
Wert, der keine positive Millisekundenzahl ist, wird verworfen, der Standard greift, und eine
Warnzeile nennt den abgelehnten Wert. Der gleiche Filter liegt auf dem Per-Call-Budget.
Zusätzlich zeigt der Bildschirm bei `api_error` die **wörtliche Antwort des Anbieters**.

**Begründung:** Ein Tag Fehlersuche, und die Logzeile aus ADR-086 hat beides in einer Zeile
geliefert:

```
[ai] questions failed via gemini (gemini-2.5-flash): api_error — 404: This model
     models/gemini-2.5-flash is no longer available to new users. Please update
     your code to use models/gemini-3.6-flash
[ai] classify failed via gemini (gemini-2.5-flash): timeout — no response within 0 ms
```

**„no response within 0 ms"** ist der eigentliche Fund. `readConfig` stand da als
`Number(env.AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)`. `??` fängt nur `null` und `undefined` —
eine Variable, die *existiert*, aber leer ist (in einem Dashboard versehentlich schnell
angelegt), wird zu `Number('')`, also **0**. `"20s"` wird zu `NaN`. Beides lässt `setTimeout`
sofort feuern, der AbortController bricht jede Anfrage ab, **bevor sie das Haus verlässt** —
und die App meldet `timeout`: ausgerechnet der Grund, der nach dem Anbieter klingt und zum
Nochmalversuchen einlädt.

Was den Fehler so schwer lesbar machte: **zwei Aufrufe entkamen ihm.** `askIntakeQuestions`
und der Wochen-Ladepfad übergeben ein eigenes Budget und überschrieben damit den kaputten
Wert. Deshalb erreichte im selben Request die Rückfrage Google und kam mit einem echten 404
zurück, während Einordnung und Vorschlag bei 0 ms starben. Ein Anbieter, der gleichzeitig
antwortet und nicht antwortet.

Ein konfigurierter Wert, der keine Dauer sein kann, ist ein Versehen und keine Anweisung. Der
Filter liegt an **einer** Stelle — dort, wo Umgebung zu Konfiguration wird — und deckt auch
den Override ab: „0 heißt: ruf das Modell nie" darf aus keiner Richtung erreichbar sein.

**Und der Hinweistext nennt keine Modellversion mehr.** Er schlug `gemini-2.5-flash` vor, und
noch am selben Nachmittag hat der Anbieter genau dieses Modell für neue Konten abgeschaltet —
der Hinweis war also aktiv falsch. Eine Versionsnummer in einem Hinweis verrottet. Was nicht
verrottet, ist die Antwort des Anbieters selbst, und die steht jetzt darunter: sie enthält
nichts vom Menschen, sondern spricht über die Anfrage, und im konkreten Fall sagt sie exakt,
welches Modell stattdessen zu nehmen ist. Kein selbstgeschriebener Satz schlägt das.

**Geprüft:** neun Tests — leerer Wert, Wert mit Einheit, Wort, `0`, negativ und `NaN` fallen
alle auf 20 000 ms zurück; ein echter Wert wird weiter übernommen; die Warnzeile nennt den
abgelehnten Wert; und ein kaputtes Per-Call-Budget schaltet die App nicht heimlich auf den
deterministischen Pfad zurück.

---

## 2026-09-01 — ADR-086: Ein gescheiterter Modellaufruf hinterlässt eine Spur

**Entscheidung:** Jeder fehlgeschlagene Modellaufruf wird serverseitig einmal protokolliert —
Adapter, Aufgabe, Modell, Grund und der Anfang dessen, was der Anbieter geantwortet hat.
**Nie der Schlüssel, nie der Prompt.** Zusätzlich nennt der Bildschirm den Grund in einem Satz,
der den nächsten Schritt beschreibt statt der Diagnose.

**Begründung:** Der Product Owner hat auf „KI dazuholen" getippt und bekam „Die KI hat nichts
geliefert." Die Vercel-Logs zeigten: `POST /ai` → **200, in unter einer Sekunde**, keine
Fehlerzeile. Damit waren ein falscher Schlüssel, ein falscher Modellname, ein Timeout und eine
abgelehnte Antwort **von außen nicht unterscheidbar** — weder für ihn noch für mich.

Das ist die Rechnung für eine sonst richtige Entscheidung: In dieser App ist jeder KI-Fehler
ein *Wert*, keine Exception, damit keine Aufrufstelle vergessen kann, ihn zu behandeln
(ADR-041). Der Preis war, dass er auch spurlos verschwindet. Ein Teilsystem, das nicht laut
scheitern kann, lässt sich nicht reparieren.

Drei Entscheidungen darin:

- **Gewrappt statt an jedem `return`.** Der kompatible Adapter hat acht Rückgabepunkte; die
  eine Stelle, an der jemand das Logging vergisst, ist genau die, die zählt. `call()` ruft
  jetzt `attempt()` und protokolliert dessen Ergebnis, einmal.
- **Die Worte des Anbieters wandern mit.** Der Grund allein trennt „falscher Schlüssel" nicht
  von „falscher Modellname" — beide sind von außen ein 4xx. `404: models/… is not found` ist
  die Zeile, die den Abend rettet.
- **`warn`, nicht `error`.** Ein Modell, das ablehnt, ist ein funktionierendes System auf dem
  dokumentierten Rückfallpfad. Dafür jemanden zu wecken wäre falsch. Information ist es aber
  auch nicht: irgendetwas, das ein Mensch konfiguriert hat, tut nicht das, was er denkt.

**Der Text auf dem Bildschirm nennt den nächsten Schritt, nicht den Befund.** „Der Anbieter hat
den Schlüssel abgelehnt" ist für sich wertlos; *welche Variable in Vercel* ist die ganze
Nachricht. Bei `api_error` nennt der Text ausdrücklich die wahrscheinlichste Ursache — ein
Modellname, den es beim Anbieter nicht gibt — weil `gemini-2.5-flash` gegen „Gemini 2.5 Flash"
nichts ist, worauf jemand von selbst kommt. `Record<AiFailure, string>` erzwingt, dass ein neuer
Fehlergrund nicht ohne Text bleiben kann; das ist stärker als ein Test.

**Geprüft:** vier neue Tests am kompatiblen Adapter — je eine Zeile bei abgelehntem Schlüssel,
unbekanntem Modell und Anbieterausfall; die Zeile nennt die Aufgabe; sie enthält **weder den
Schlüssel noch den Prompt**; und bei einem erfolgreichen Aufruf bleibt es still.

---

## 2026-09-01 — ADR-085: Ein Ziel holt die KI nach, ohne dass man von vorn anfängt

**Entscheidung:** Ein eigener Bildschirm (`/ai`, verlinkt aus dem Profil) setzt für das
**aktive** Ziel `ai_proposal_at` und `intake_asked_at` zurück, lässt das Modell das Ziel neu
einordnen, stellt seine Rückfragen und holt den Vorschlag. Fortschritt, Check-ins und Verlauf
bleiben unangetastet. Der neue Vorschlag wirkt sich **ab der nächsten Woche** aus.

**Begründung:** `ai_proposal_at` wird gesetzt, ob ein Vorschlag kam oder nicht — genau das
verhindert eine Wiederhol-Schleife bei jedem Seitenaufruf. Die Kehrseite ist, dass ein Ziel,
das angelegt wurde, **bevor** ein Key konfiguriert war, dauerhaft als „gefragt, nichts
gekommen" markiert ist. Das Häkchen später zu setzen ändert dann nichts, weil nie wieder
gefragt wird.

Genau das ist beim Product Owner eingetreten, und die Datenbank hat es bestätigt: Einwilligung
erteilt, aktives Ziel vom 20.08., `classified_by: keywords`, `ai_proposal_at` gesetzt,
`ai_proposal` null. Der einzige Ausweg wäre das Onboarding gewesen — das pausiert das Ziel und
legt ein neues an, wirft also die daran hängende Tracking-Historie weg, um einen Zeitstempel zu
reparieren. Das ist keine akzeptable Antwort auf „muss ich das neu machen".

**Warum die laufende Woche nicht neu gebaut wird**, obwohl das naheliegt: Der partielle Unique
Index lässt pro Woche und Ziel genau einen aktuellen Plan zu, und `superseded_by` zeigt auf den
Nachfolger — der beim Ablösen noch nicht existiert. Genau die Pattsituation, die ADR-033
beschreibt. Man käme mit einem selbstreferenzierenden Zwischenschritt daran vorbei, aber das
eigentliche Argument ist inhaltlich: In dieser Woche sind bereits Aktionen bewertet, und zwei
Pläne für dieselben Tage wären doppelte Spuren einer einmal gelebten Woche. `loadObservations`
liest bewusst über Pläne und Ziele hinweg — „Verhalten ist Verhalten" — und würde beide zählen.
Die Wochenzahlen wären ab dann falsch, dauerhaft. Der Vorschlag wird gespeichert, die nächste
Woche wird daraus gebaut, und der Bildschirm sagt das, statt es zu verschweigen.

**Warum die Neu-Einordnung zuerst kommt:** Der Archetyp entscheidet, welche Sicherheitsgrenzen
gelten und woraus der Plan überhaupt besteht. Ein Vorschlag auf Basis einer Wortlisten-Vermutung
steht auf dem falschen Fundament. Ändert das Modell den Archetyp, sagt der Bildschirm es
ausdrücklich und verweist aufs Profil zum Korrigieren — eine stille Änderung daran wäre die
folgenreichste unsichtbare Änderung, die die App machen könnte.

**Nicht durch einen Test abgesichert.** Der ganze Pfad ist datenbankgebunden, und dieses Projekt
hat bewusst nur reine Tests. Nachweisbar ist er an den Daten: nach dem Klick muss
`classified_by` auf `ai` stehen und `ai_proposal` gefüllt sein.

---

## 2026-09-01 — ADR-084: Das Modell darf nachfragen, bevor es plant — und meistens tut es das nicht

**Entscheidung:** Nachdem das Intake gespeichert ist und bevor der Plan vorgeschlagen wird,
sieht das Modell das ganze Bild und darf **höchstens drei** Dinge nachfragen. Die Antworten
gehen in den Planvorschlag ein. Jede Frage ist überspringbar. Der erwartete Normalfall ist
`needsMore: false` mit leerer Liste — dann sieht der Mensch diesen Schritt nie.

**Begründung:** Das Onboarding stellt allen dieselben Fragen, und das muss es: die Engine
braucht dieselben Felder von jedem, und ein Formular, das pro Person die Form ändert, ist
eines, das niemand testen kann. Die Folge ist aber, dass die App nur erfährt, was jemand
vorher als wichtig aufgeschrieben hat. Für „5 kg abnehmen" reicht das. Für „ich will wieder
zeichnen können, ohne dass mein Rücken nach zwanzig Minuten dicht macht" reicht es nicht, und
kein festes Formular hätte die passende Frage vorgesehen. Das ist die Stelle, an der das feste
Schema zum **Leitfaden** wird statt zur Grenze — der ausdrückliche Wunsch des Product Owners.

**Die eigentliche Entscheidung ist wieder das Schweigen.** Ein Modell, dem man einen „du
darfst fragen"-Platz hinstellt, füllt ihn. Drei Pflichtfragen am Ende eines zehnminütigen
Formulars sind genau die Stelle, an der Leute aussteigen — der Schritt wäre also nicht
neutral, sondern schädlich, wenn er immer erschiene. Deshalb:

- Der Prompt macht die leere Antwort zur respektablen, und `checkQuestions` setzt es durch:
  `needsMore: false` mit nichtleerer Liste **und** `needsMore: true` ohne Frage sind beide
  ein `contradicts_itself` und verwerfen die ganze Antwort. Eine der beiden Hälften zu
  glauben hieße, sich die genehme auszusuchen.
- Das Schema deckelt bei drei Fragen und vier Antwortvorschlägen, damit ein Modell, das die
  Anweisung ignoriert, vom Parser gestoppt wird und nicht von gar nichts.
- Ohne Key, ohne Einwilligung, bei Fehler oder Timeout: leere Liste. Es gibt bewusst **keinen
  deterministischen Ersatz** — eine feste Liste von Zusatzfragen ist genau das, was das
  Onboarding schon ist, und dieselben drei Fragen an alle wären ein längeres Formular, kein
  Modell, das eine Lücke bemerkt.

**Was es nicht fragen darf**, deterministisch geprüft statt im Prompt erbeten:

- **Identität und Kontakt.** Der Einwilligungstext (ADR-083) verspricht, dass Name, E-Mail
  und Geburtsdatum die App nicht verlassen. Eine Frage ist die eine Stelle, an der das Modell
  genau danach fragen könnte und der Mensch es selbst eintippt — und die Antwort geht mit der
  nächsten Anfrage zurück. Das Versprechen muss auch auf dem Rückweg gelten. Geprüft wird
  Frage, Begründung **und** jede Antwortmöglichkeit; eine Prüfung nur auf der Frage wäre
  trivial zu umgehen.
- **Medizinisches.** Diagnosen, Medikamente, Schwangerschaft, Therapie.
- **Allgemeines.** „Was ist dein Ziel?" ist das Erste, was der Mensch getippt hat.
- **Was schon beantwortet ist.** `openFields()` erzeugt die Lückenliste deterministisch und
  `knownFields()` ist ihr Komplement; eine Frage, die ein bekanntes Feld nennt, fliegt raus.
  Nötig, weil das Intake, das das Modell sieht, absichtlich vergröbert ist — und eine grobe
  Angabe sieht aus wie eine fehlende.

**Ein echter Fund unterwegs:** Der Test, der prüft, dass kein `HH:MM` in den Prompt gerät, hat
eine Lücke aufgedeckt, die es schon vorher gab. `existingRoutines` ist Freitext, Leute
schreiben „Kaffee um 6:45", und damit verließ ein exakter Tageszeitstempel die Maschine —
entgegen dem, was der Kommentar über `proposeUserMessage` behauptete. Uhrzeiten in
Routine-Labels werden jetzt durch „morgens/mittags/nachmittags/abends" ersetzt: das Signal,
auf das es ankommt (es gibt einen Ankerpunkt am Morgen), bleibt, die Minute geht nicht raus.

**Nicht geprüft:** wie oft ein reales Modell tatsächlich schweigt. Der Key liegt in Vercel,
nicht lokal, also lässt sich das hier nicht messen. `npm run ai:check` hat dafür einen
dritten Test bekommen, der beide Fälle nebeneinander stellt — vollständiges und abgebrochenes
Onboarding. Ein Modell, das bei vollständigem Intake drei Fragen stellt, ist das falsche
Modell für diese Aufgabe, wie gut die Fragen auch klingen.

---

## 2026-09-01 — ADR-083: Ohne ausdrückliche Einwilligung verlässt nichts das Haus

**Entscheidung:** Kein Modellaufruf ohne vorher erteilte, ausdrückliche Einwilligung. Sie
steht in `profiles.ai_consent_at` **und** `ai_consent_version`, wird über `adapterFor()` vor
**jedem** Aufruf geprüft, ist im Onboarding nie vorangekreuzt und lässt sich im Profil mit
einem Tippen zurücknehmen. Ohne Häkchen läuft die App vollständig weiter.

**Begründung:** Gesundheitsdaten sind eine besondere Kategorie nach Art. 9 DSGVO —
Verarbeitung ist verboten, außer eine Ausnahme greift. Für eine Consumer-App ist das
Art. 9 Abs. 2 lit. a: **ausdrückliche** Einwilligung. „Ausdrücklich" schließt das
vorangekreuzte Kästchen aus, und das in AGB versteckte Ja ebenso.

Vier Entscheidungen darin, jede aus einem konkreten Fehlermodus:

- **Deterministischer Code, kein Formularfeld.** Ein Server-Action ist ein öffentlicher
  HTTP-Endpunkt; „unser eigenes Formular ruft das auf" ist keine Sicherheitseigenschaft. Und
  ein Prompt kann nichts über eine Anfrage erzwingen, die bereits raus ist.
- **Die Absage *ist* der Adapter.** Die Aufrufstellen verzweigen nicht über ein Boolean —
  sie holen sich einen Adapter und bekommen einen, der ablehnt (`WithheldAdapter`,
  `reason: 'no_consent'`). Ein vergessenes `if` erzeugt damit ein Ergebnis, das jede
  Aufrufstelle ohnehin behandelt, statt einer Anfrage, die schon unterwegs ist.
- **Zeitstempel plus Version, kein Boolean.** Art. 7 Abs. 1 legt die Beweislast beim
  Verantwortlichen: die Frage ist nie „ist es an", sondern „wann hat diese Person wozu
  zugestimmt". Die Version sorgt dafür, dass ein Anbieterwechsel oder ein größerer Payload
  neu fragt, statt eine alte Zustimmung stillschweigend auszuweiten.
- **Der Anbietername kommt aus der Base-URL, nicht aus einem Label.** Informierte
  Einwilligung muss den Empfänger nennen; ein Label ist ein getippter String, der von der
  URL abdriften kann — und dann wäre der Einwilligungstext leise falsch.

**Warum das hier überhaupt eine echte Wahl ist:** Art. 7 Abs. 4 sagt, eine Einwilligung ist
nicht freiwillig, wenn der Dienst ohne sie verweigert wird. Genau das kann diese App
vermeiden, weil die Architektur es seit Schritt 3 hergibt: Ziel einordnen, planen, Muster
erkennen, Experimente auswerten ist alles deterministischer Code mit Tests. Ablehnen kostet
das Modell, nicht das Produkt. Das ist der Punkt, an dem sich „kein KI-Wrapper" auszahlt.

**Geprüft, nicht behauptet:** `scripts/verify_rls_isolation.sql` wurde um vier Prüfungen
erweitert — A kann die Einwilligung für B **nicht** setzen, kann die eigene erteilen und
widerrufen, und eine halbe Einwilligung (Zeitstempel ohne Version) weist der Check-Constraint
ab. Dazu zwei echte Isolationsprüfungen auf `weekly_notes`, die vorher mangels Fixtures
trivial wahr gewesen wären. Lauf gegen `life-system`: **38 Prüfungen, 0 Fehler.**

**Was das nicht löst:** Kostenlose Modell-Tarife trainieren in der Regel auf den Prompts.
Eine Einwilligung macht das zulässig, nicht harmlos. Vor einem öffentlichen Start mit fremden
Gesundheitsdaten gehört ein Anbieter her, der vertraglich nicht trainiert — dank des
kompatiblen Adapters (ADR-080) ist das eine Umgebungsvariable, kein Umbau.

---

## 2026-09-01 — ADR-082: Die KI hört nach dem Plan nicht auf — der Wochenimpuls

**Entscheidung:** Ein Mal pro Woche schreibt das Modell einen **Wochenimpuls**: eine
Beobachtung, ein Vorschlag und höchstens eine Rückfrage, belegt durch konkrete Daten aus
genau dieser Woche. Er steht in `weekly_notes` (eine Zeile je Profil und Woche, per Unique
Index erzwungen), wird auf Insights angezeigt und ändert sich danach nicht mehr.
**Schweigen ist ein reguläres Ergebnis, kein Fehler.**

**Begründung:** Bis hierhin wurde das Modell zwei Mal je Ziel gefragt — Archetyp erkennen,
Plan vorschlagen — und danach nie wieder. Damit konnte die App nur bemerken, wofür vorher
jemand eine Regel geschrieben hatte. Zwei Löcher folgen daraus, und das erste ist keine
fehlende Funktion, sondern eine **falsche Antwort**:

- `check_ins.note` wird seit dem Check-in jeden Tag erhoben und **von nichts gelesen**.
  Jemand tippt „war krank", die deterministische Erkennung sieht drei ausgefallene Aktionen
  und beginnt, ein Muster über Mittwoche zu bilden. Der Wochenimpuls ist die einzige Stelle,
  die diesen Text überhaupt sieht.
- Zusammenhänge über Domains hinweg, die keine Regel vorwegnimmt, bleiben unsichtbar. Genau
  dafür ist ein Modell da und ein Schema nicht.

**Warum das Schweigen die eigentliche Entscheidung ist:** Ein Wochenformat, das jede Woche
etwas liefern *muss*, liefert in ruhigen Wochen Füllsatz — „trink mehr Wasser", „bleib dran".
Ein Füllsatz macht aus einem Messgerät ein Horoskop, und er ist exakt das, was ein
Wettbewerber ohne jede Datenlage auch sagen kann: das Gegenteil eines Unterschieds. Deshalb
wird härter geprüft, was die App **nicht** sagt, als was sie sagt:

- `checkWeeklyNote` weist `not_generic` (Sätze, die für eine fremde Person genauso gelten)
  und `no_verdict_on_the_person` (Urteile über den Menschen statt über die Woche) ab —
  zusätzlich zu den vier Sicherheitsfamilien, die auch für Planvorschläge gelten. Ein Text,
  auf den jemand handelt, wird nicht milder geprüft, nur weil er kein Planitem ist.
- `basedOn` darf nicht leer sein. Ohne Beleg ist ein selbstsicherer Satz über eine Woche
  möglich, die das Modell nie gelesen hat (Prinzip 4).
- Vor Donnerstag wird nichts geschrieben, und ohne eine einzige bewertete Aktion auch nicht.
- Das Modell bekommt die Beobachtung der Vorwoche mit, damit es nicht zwei Mal dasselbe sagt.
- `hasSomethingToSay: false` ist ein gültiges Ergebnis des Schemas, nicht ein Ausfall.

**Kein deterministischer Ersatz.** `MockAdapter` und `NullAdapter` liefern hier bewusst
nichts. Ein deterministischer „Tipp" wäre eine feste Liste, und ein Satz aus einer festen
Liste ist für jeden wahr — also genau der Füllsatz, den die Prüfung oben verwirft. Ohne Key
erscheint der Impuls schlicht nicht; die deterministischen Insights stehen für sich, weil sie
auf echten Zählungen beruhen. Das Produkt bleibt vollständig benutzbar (ADR-041).

**Kosten:** ein Modellaufruf je Nutzer und Woche, ausgelöst beim Öffnen von Insights, nicht
per Cron. Fehler jeder Art enden gleich: kein Impuls.

---

## 2026-09-01 — ADR-081: RLS gegen das gehostete Projekt geprüft, mit zwei Nutzern

**Entscheidung:** `scripts/verify_rls_isolation.sql` prüft die Mandantentrennung an einer
echten Datenbank: zwei Nutzer, alle 13 Tabellen, lesend und schreibend. Ausgeführt gegen das
Produktivprojekt `life-system` am 1. September 2026 — **31 Prüfungen, 0 Fehler**. Erfüllt den
seit Schritt 3 offenen Punkt.

**Begründung:** Die Policies existierten und `verify_schema.sql` bestätigte, dass sie da sind.
Ob sie *halten*, hatte niemand je nachgesehen. Vor einem öffentlichen Start mit fremden
Gesundheitsdaten ist das der Unterschied zwischen „sollte passen" und „geprüft".

Zwei **Kontrollprüfungen** sind wichtiger als die Isolationsprüfungen selbst, und sie stehen
deshalb im Skript ganz vorn:

- `Impersonierung greift` — hätte `set local request.jwt.claims` still nichts getan, wäre
  `auth.uid()` null gewesen, jedes „sieht nichts" wäre trivial wahr, und das Skript hätte
  einen Erfolg gemeldet, ohne irgendetwas zu beweisen.
- Die **Gegenproben** — RLS, die *alles* blockt, besteht jeden Isolationstest und wäre eine
  App, die ihre eigenen Zeilen nicht lesen kann. Ein Sicherheitstest ohne sie ist ein halber.

Geprüft wurde außerdem der subtile Fall, den eine UPDATE-Policy ohne `WITH CHECK` durchlässt:
die eigene Zeile behalten, aber einem anderen Profil zuschieben. Abgewiesen (42501).

Ein früherer Lauf meldete an einer Stelle fälschlich „App wäre kaputt": der Fehler war
`23505`, eine Unique-Verletzung des partiellen Index „ein aktives Ziel pro Profil" — also eine
Produktregel, die korrekt zuschlug, und nicht RLS. Der Testfall war falsch, nicht die App.
Deshalb prüft das Skript jetzt die **Fehlerklasse** und nicht nur, dass etwas scheiterte.

Alles läuft in einer Transaktion mit `rollback`; die Datenbestände des Product Owners (1
Profil, 4 Ziele, 57 Aktionen, 3 Check-ins) waren davor und danach identisch, ohne Testreste.
Migrationsstand geprüft: 17 im Repo, 17 angewendet, kein Drift.

Der Supabase-Sicherheitsberater meldet eine einzige Warnung, `auth_leaked_password_protection`.
Die ist bewusst offen: dieselbe Prüfung baut ADR-040 selbst, weil sie im kostenlosen Plan fehlt.

---

## 2026-09-01 — ADR-080: Ein Adapter für jeden OpenAI-kompatiblen Anbieter

**Entscheidung:** Neben Claude gibt es `OpenAiCompatibleAdapter` — ein `fetch` gegen
`/chat/completions`, konfiguriert über `AI_COMPAT_BASE_URL`, `AI_COMPAT_KEY` und
`AI_COMPAT_MODEL`. Prompts, Schemas und Sicherheitsprüfungen liegen in `src/lib/ai/tasks.ts`
und werden von **beiden** Adaptern benutzt. Entscheidung des Product Owners: „lass andere
Anbieter nehmen bei denen es kostenlos".

**Begründung:** Es gibt keine kostenlose Claude-API. Free Tiers gibt es bei Google AI Studio,
Groq, OpenRouter, Mistral und Cerebras — und sie ändern sich laufend. Deshalb ist die Frage
„welcher Anbieter ist gerade gratis" hier **Konfiguration und nicht Code**: alle sprechen
dieselbe Schnittstelle, drei Variablen genügen zum Wechseln. Kein zweites SDK: es ist ein POST
mit JSON-Body, und eine Client-Bibliothek kennt immer nur einen der Anbieter.

Das eigentliche Risiko ist nicht die Anbindung, sondern die Qualität. Ein schwächeres Modell
schreibt „verzichte auf Kohlenhydrate", erfindet Kalorienzahlen und empfiehlt weniger Schlaf
**häufiger** als Claude, nicht seltener. Genau deshalb wurden Prompt, Schema und Prüfung aus
dem Claude-Adapter herausgezogen, bevor der zweite entstand. Sie zu kopieren wäre der Weg, auf
dem der Gratis-Pfad still schwächere Prüfungen bekommt als der bezahlte. Der Testfall dazu
schickt eine **schema-gültige**, aber unsichere Antwort — die erste Fassung des Tests scheiterte
schon am Schema und bestand damit aus dem falschen Grund.

**Datenschutz, ausdrücklich festgehalten:** Gratis-Stufen finanzieren sich in aller Regel damit,
dass Eingaben zum Training verwendet werden. Diese App schickt Gesundheitsdaten. Deshalb wurde
`proposeUserMessage` gleichzeitig gröber gemacht: „geht spät ins Bett" statt `23:47`, „kocht
selten" statt einer Zahl, Zeitfenster auf 30 Minuten gerundet, kein Zieldatum mehr. Der Plan
wird davon nicht schlechter — die Arithmetik macht der Archetyp, das Modell wird gefragt *was*,
nicht *wann*. Die exakten Werte bleiben in der Datenbank.

Reihenfolge in `createAdapter`: explizites `AI_ADAPTER` gewinnt immer, dann Claude (dessen
Ausgabequalität gegen diese Prompts gemessen wurde), dann der kompatible Anbieter, sonst
deterministisch. `AI_ADAPTER=compat` erzwingt den Gratis-Weg auch bei vorhandenem Claude-Key.

---

## 2026-08-24 — ADR-079: Die App heißt Trace und sieht aus wie ein Messgerät

**Entscheidung:** Der Name wird **Trace**. Das Erscheinungsbild wechselt von warmem Papier mit
gedämpftem Grün zu Weiß, Haarlinien, harten Kanten und einer Signalfarbe. Zwei Schriften mit
getrennten Aufgaben: **Barlow** für Sprache, **IBM Plex Mono** für jede Zahl, an der sich die
App messen lassen muss. Das Zeichen sind die zwei Spuren, die jeder Plan hat. Vollständige
Regeln in `docs/DESIGN_SYSTEM.md`.

**Begründung:** Der Product Owner: „das Logo sowie der Name und das Design in der app sieht
alles ki generiert aus". Das stimmt, und es ist konkret benennbar. „Cadence" liegt im Cluster,
den Sprachmodelle ausgeben — Cadence, Momentum, Compass, Tempo, Anchor. Warmes Papierweiß mit
Salbeigrün ist die Standardpalette für achtsame Gesundheits-Apps. Ein offener Ring mit Punkt
ist die am häufigsten generierte Markenform überhaupt. Inter ist die Schrift, die man wählt,
wenn man nicht auffallen will. Jede Einzelentscheidung war vertretbar — die Summe hatte keinen
Standpunkt.

Ausdrücklich abgelehnt wurde: „beige sanft und alles so rund immer die selbe Schrift". Genau
diese vier Punkte sind die Regeln in `DESIGN_SYSTEM.md` geworden, damit die Oberfläche nicht
wieder dorthin zurückdriftet: kein warmer Neutralton, 3 px statt 16 px und die Pille ersatzlos
gestrichen, kein einziger `box-shadow`, zwei Schriften mit klar verschiedenen Aufgaben.

**Trace** trägt beide Bedeutungen, die das Produkt braucht: die Spur, die jemand hinterlässt,
und die Messkurve, die ein Instrument zeichnet. Beides ist, was die App tut.

Das Zeichen ist keine Metapher über das Produkt, sondern das Produkt: zwei Striche ungleicher
Höhe — die Gesundheitsbasis, die unter jedem Ziel mitläuft, und die Zielspur darüber, die als
einzige die Signalfarbe trägt, weil sie der Teil ist, der sich bewegt. Dieselbe Geometrie ist
die linke Kante jeder Aktionskarte, wo sie echte Information trägt statt zu dekorieren. Und
sie übersteht 16 Pixel, was das alte Zeichen nicht tat.

Die Mono-Ziffern sind die sichtbarste Entscheidung und die inhaltlich wichtigste: Sie
markieren die Grenze zwischen dem, was die App behauptet, und dem, was sie gemessen hat.

---

## 2026-08-23 — ADR-078: Die englische Fassung ist ein eigener Schritt, nicht ein Nebenbei

**Entscheidung:** Die App bleibt vorerst durchgehend deutsch. Die englische Fassung — komplett,
inklusive Plantexte — wird als eigener, geschnittener Schritt gebaut, wenn die Texte stabil
sind. Entscheidung des Product Owners.

**Begründung:** Der Umfang ist gemessen, nicht geschätzt: rund 350 nutzersichtbare Texte in 64
Dateien, davon 165 in `src/lib/engine/` — Plantexte und Begründungen mit Interpolation, also
die aufwendige Sorte. Dazu die Prompts, die das Modell heute auf Deutsch antworten lassen.

Der Grund für das Verschieben ist nicht der Umfang, sondern der Zeitpunkt. Eine i18n-Schicht
verdoppelt ab dem Tag ihrer Einführung die Pflege **jedes** Textes. In dieser Session haben
sich Texte in Insights, Fortschritt, Playbook und in drei Archetypen geändert, weil dahinter
Fehler steckten. Jede dieser Korrekturen wäre doppelt angefallen — und eine halb
nachgezogene Übersetzung ist schlechter als gar keine, weil sie aussieht, als stimme sie.

Wenn sie kommt, dann zweisprachig und umschaltbar, nicht als Ersatz: der Product Owner liest
deutsch, und eine App, die ihm ihre Sicherheitsbegründungen in einer Fremdsprache erklärt,
verliert genau die Nachvollziehbarkeit, die Prinzip 4 verlangt.

---

## 2026-08-23 — ADR-077: Der Plan rechnet mit dem Stand von heute, nicht mit dem vom Anfang

**Entscheidung:** `GoalMetric` bekommt `currentValue` — die letzte Messung. Alle drei
metrischen Archetypen planen über `currentOf()` von dort aus statt vom `startValue`.
`metricReached()` erkennt richtungsabhängig, dass der Zielwert erreicht ist; Fortschritt sagt
es. Das Ziel wird **nicht** automatisch stillgelegt.

**Begründung:** Messwerte wurden bei jedem Eintrag geschrieben, im Chart gezeichnet — und von
nichts gelesen, was plant. Der Plan wurde also für immer aus dem Startwert berechnet. Wer vier
von fünf Kilo geschafft hatte, bekam weiter das Defizit für die vollen fünf. Wer angekommen
war, bekam weiter ein Defizit, das er nicht mehr brauchte — und das ist nicht bloß falsch,
sondern genau die Art von falsch, gegen die die Körperziel-Regeln in CLAUDE.md geschrieben
sind. Beim Ausdauerziel dasselbe in Grün: die 10-%-Grenze wuchs von einem Umfang aus, den die
Person längst hinter sich gelassen hatte.

Der Status `reached` existiert seit der ersten Migration und wurde von keinem Codepfad je
gesetzt. Eine Goal-Execution-App hatte damit kein Ende: das Ziel wurde erreicht, der Plan
schob weiter auf eine Zahl zu, die schon passiert war, und die Person erfuhr es, indem sie das
Diagramm las.

Angekündigt statt automatisch beendet. Ein Ziel mitten in der Woche stillzulegen nähme jemandem
den Plan weg, den er heute noch vor sich hat — ADR-039, eine Woche ist ein bereits gegebenes
Versprechen. Der Plan läuft unverändert weiter (bei einem erreichten Körperziel heißt das
rechnerisch Erhalt statt Defizit), und was als Nächstes kommt, entscheidet die Person über das
Onboarding, das ein altes Ziel ohnehin sauber pausiert.

`currentValue` ist bewusst nicht Teil der Onboarding-Daten: die Aufnahme sagt, wo jemand
startet und wo er hinwill. Wo er heute steht, beobachtet die App.

---

## 2026-08-23 — ADR-076: Nachholen erzeugt eine zweite Aktion, es verschiebt nicht die erste

**Entscheidung:** Planpflege wird auf Knopfdruck angewendet. Eine Verschiebung legt eine
**neue** Aktion auf den freien Tag; die ausgefallene bleibt als `missed` stehen, wo sie war.
Eine Entfernung überträgt die Antwort der Person auf die noch offenen Wiederholungen derselben
Aktion in dieser Woche.

**Begründung:** Zwei Fehler übereinander. `nextFreeDate` lehnte jeden Tag ab, der irgendeine
Aktion trug, während der eigene Kommentar „frei von einer Aktion derselben Domain" sagte — und
weil die Gesundheitsbasis über alle sieben Tage materialisiert wird, war nach dieser Lesart
jeder Tag belegt. Planpflege erzeugte in **allen siebzig** Profil-Ziel-Kombinationen null
Verschiebungen. Die sichtbare Hälfte der schnellen Schleife lief nie, und Woche eins, für die
sie existiert, zeigte nichts. Dazu sah sie die Tage gar nicht, zwischen denen sie wählte:
`loadObservations` endet bei heute, weil Evidenz das ist, was schon passiert ist.

Der zweite Fehler war, dass nichts davon je angewendet wurde. „2 Aktionen könnten an einem
anderen Tag besser passen" war ein Satz über eine Datenstruktur.

Die neue Aktion statt einer Verschiebung ist die eigentliche Entscheidung: `scheduled_on` zu
überschreiben würde den Ausfall vom Montag wegtragen und damit genau das zerstören, wonach die
langsame Schleife sucht — dass Montage wiederholt nicht funktionieren. Was passiert ist, muss
die Höflichkeit überleben, einen anderen Tag angeboten zu bekommen.

Auf Knopfdruck, nicht beim Laden: ADR-039 sagt, eine Woche ist ein bereits gegebenes
Versprechen. Sie darf von der Person geändert werden, nie unter ihr.

---

## 2026-08-23 — ADR-075: Eine gelernte Regel wird jede Woche gegen die Wirklichkeit geprüft

**Entscheidung:** `recheckRules()` bewertet jede aktive, nicht-Trial-Regel gegen die letzten
sechs Wochen und bewegt ihre Confidence über `reinforce()`. Ausgeführt genau dann, wenn eine
neue Woche materialisiert wird. Fällt eine Regel unter `MIN_RULE_CONFIDENCE`, entsteht ein
Insight. Erfüllt ADR-033.

**Begründung:** `reinforce`, `activeRules` und `mergeRule` wurden in Schritt 6 geschrieben,
getestet — und nie aufgerufen. Confidence betrat das Modell bei 0,6 und blieb dort für immer.
Eine im November gelernte Regel formte im März weiter jeden Plan mit demselben Gewicht, und
der Satz, der im Playbook darunter steht („sie kann wieder sinken, wenn es später anders
läuft"), traf auf nichts zu, was der Code tat. Ein Modell, das nur Gewissheit ansammeln kann,
erzählt einem Menschen irgendwann, wer er früher war.

Zwei Asymmetrien sind Absicht. **Fehlende Evidenz ändert nichts** — und das ist der Normalfall:
eine Regel, die ihre eigene Evidenz gelöscht hat (auf einem gemiedenen Wochentag wird nichts
mehr geplant), verfestigt sich nicht und verblasst nicht. Das ist das sechste
Architekturprinzip, angewandt auf das Modell selbst. Und eine Regel wurde durch ein Experiment
erworben, also braucht es drei widersprechende Wochen, um sie zu kippen, nicht eine schiefe.

Der Zeitpunkt braucht keine Buchhaltungsspalte: der partielle Unique-Index auf `plans`
garantiert, dass eine Woche genau einmal gebaut wird. Trial-Regeln bleiben ausgenommen — über
die urteilt bereits ein laufendes Experiment, und zwei Mechanismen über derselben Regel machen
beide Ergebnisse unlesbar.

---

## 2026-08-23 — ADR-074: Der Fortschrittsbalken zählt echte Tage auf ein echtes Ziel

**Entscheidung:** Der Balken im Playbook zählt Tage, an denen mindestens eine Aktion
tatsächlich beantwortet wurde, gegen `DAYS_TO_FIRST_RULE` = `MIN_DISTINCT_WEEKS * 7 +
EXPERIMENT_DAYS`.

**Begründung:** Er war in beiden Hälften Dekoration: `done` stand fest auf 0, `needed` auf
einer erfundenen 21. Der Balken bewegte sich also nie, und das Ziel entsprach keinem Wert im
Code. Beides ist jetzt hergeleitet — die Erkennung braucht das Muster in zwei getrennten
Wochen, danach läuft das Experiment vierzehn Tage. Gezählt werden Tage mit *Antwort*, nicht
Tage seit der Anmeldung: eine Woche, die niemand getrackt hat, bringt die App keinem Wissen
näher, und ein Balken, der trotzdem voller wird, verspricht etwas, das er nicht halten kann.

---

## 2026-08-23 — ADR-073: Die App sagt auch, was funktioniert

**Entscheidung:** `detectStrengths()` sucht Buckets, in denen der Plan zuverlässig aufgeht,
mit einer bewusst höheren Schwelle als die Abweichungserkennung: `MIN_STRENGTH_RATE` = 0,8
zusätzlich zum bestehenden Kontrast- und Wochen-Kriterium. Das Ergebnis steht oben auf
Insights, vor allem anderen.

**Begründung:** Jeder andere Teil der adaptiven Schicht sucht, was schiefgeht. Das ist nötig
und es ist zugleich der Weg, auf dem eine Gesundheits-App zum zweiten Job wird: nach sechs
Wochen ist das Einzige, was sie je über einen Menschen gesagt hat, wo er zu kurz kommt.

Die höhere Schwelle ist der Punkt. Ein Defizit ist nennenswert, sobald es real ist — man kann
etwas dagegen tun. Eine Stärke ist erst nennenswert, wenn sie unübersehbar ist. „Samstags
läuft es bei dir gut" über einen Münzwurf gesagt ist Schmeichelei, und Schmeichelei aus einem
Messinstrument kostet es alles, was es hat. Wer seinen ganzen Plan umsetzt, bekommt auf keiner
Achse eine Stärke: es gibt nichts, besser als das zu sein.

---

## 2026-08-23 — ADR-072: Ein KI-Pfad, der Aktionen erzeugt — kein zweiter daneben

**Entscheidung:** `suggest()` samt Prompt, Schema, Mock, Adapter-Methode und
`checkSuggestions` wird entfernt. `proposePlan()` bleibt der einzige Weg, auf dem
modellgeschriebener Text einen Menschen erreicht. Die Prüfregeln von `checkSuggestions` waren
Wort für Wort dieselben wie in `checkProposal`; die zugehörigen Tests zeigen jetzt dorthin.

**Begründung:** `suggest` stammt aus der Zeit vor ADR-041 und wurde von ihm überholt. Es hatte
in keiner Codezeile des Produkts einen Aufrufer — es lief nie. Was es erzeugt hätte, wäre ein
zweiter Kartenstapel neben dem Plan gewesen: unverbindliche Ideen, für die niemand
verantwortlich ist, auf einem Screen, für den die UX-Prinzipien „keine Datenüberflutung, keine
zwanzig Karten pro Screen" festhalten.

Toter Code mit eigenem Prompt, Schema, Validator und Adapter-Methode ist keine Reserve,
sondern eine Falle: der Nächste verdrahtet ihn und hat zwei konkurrierende KI-Pfade. Es geht
keine Sicherheit verloren — `checkProposal` wendet dieselben vier Regelfamilien an, und zwar
auf dem Pfad, der tatsächlich läuft.

`AI_SUGGEST_MODEL` wird weiterhin gelesen. Eine Variable umzubenennen, die in einem Deployment
bereits gesetzt ist, würde still auf den Default zurückfallen statt zu scheitern — das
schlechteste beider Ergebnisse.

---

## 2026-08-22 — ADR-071: Ein Experiment wird aufgegeben, nicht verworfen

**Entscheidung:** Ein Experiment, das länger als zwölf Wochen offen ist und immer noch zu
wenige Aktionen gesammelt hat, endet mit dem Status `aborted` statt mit einer weiteren
Verlängerung. `Evaluation.abandoned` unterscheidet es von `rejected`.

**Begründung:** „Zu wenig passiert" antwortete mit weiteren zwei Wochen, und nichts hinderte
es daran, das ewig zu tun. Wer die App vier Monate weglegte, kam zu einem Test zurück, der
noch lief, den einzigen Platz belegte — eins zur Zeit ist die Regel — und über seine
Trial-Regel weiter jeden Plan formte, auf Basis von zwei Wochen, die längst aus dem lesbaren
Fenster gefallen waren.

Aufgegeben ist nicht abgelehnt. Abgelehnt ist ein Urteil über die Änderung; abgebrochen sagt,
dass es nie eines gab. Das Zweite als das Erste zu verbuchen hieße, der Person zu erzählen,
das Morgentraining habe bei ihr nicht funktioniert — über einen Zeitraum, in dem sie gar
nicht da war. Alter allein ist nie der Grund: ein Experiment mit genügend Daten bekommt sein
Urteil, egal wie lange es gedauert hat.

---

## 2026-08-22 — ADR-070: Ein Zieldatum in der Vergangenheit wird ersetzt, nicht abgelehnt

**Entscheidung:** `horizonFor()` in `src/lib/engine/horizon.ts` beantwortet für alle sieben
Archetypen dieselbe Dreiteilung — kein Datum, ein gültiges Datum, ein vergangenes Datum. Eine
gemeinsame Invariante lehnt jede Strategie ab, deren Zieldatum nicht in der Zukunft liegt.

**Begründung:** Vier Archetypen — Schlaf, Gesundheitsbasis, Gewohnheit, Ernährung — nahmen,
was getippt wurde, und stellten es unbesehen in die Strategie. Es kam als `adjusted: false`
zurück, und Fortschritt druckte es unter die Worte „wie gewünscht": eine Frist, die Monate
vorbei war, präsentiert als Plan, der wie vorgesehen läuft. Gewünscht hatte das niemand — es
war eine vertippte Jahreszahl oder ein nach langer Pause wieder aufgenommenes Ziel.

Die drei ratenbegrenzten Archetypen kamen zufällig zum richtigen Ergebnis: eine negative
Wochenzahl ist kleiner als die sichere, also fing der Deckel es im Vorbeigehen ab. Das hörte
in dem Moment auf zu funktionieren, in dem es keine Rate zu deckeln gab.

Die Antwort ist nie eine Absage (K6): ein Datum, das nicht benutzbar ist, wird durch eines
ersetzt, das es ist, und der Austausch wird ausgesprochen. Die Invariante liegt zentral, weil
genau das ein neuer Zieltyp vergisst — und das Vergessen unsichtbar ist.

---

## 2026-08-22 — ADR-069: Planpflege arbeitet an der laufenden Woche, Erkennung am ganzen Fenster

**Entscheidung:** `refinePlan` filtert seine Beobachtungen auf die aktuelle Woche. Jede
Nachhol-Verschiebung belegt ihren Tag, sodass zwei Ausfälle zwei Tage bekommen.

**Begründung:** Planpflege bekam dasselbe Sechs-Wochen-Fenster wie die Mustererkennung und
handelte auf allem davon. Jede je als „passt nicht zu meinem Alltag" markierte Aktion kam
sechs Wochen lang jede Woche als Neuigkeit zurück — etwas längst Entferntes, erneut zum
Entfernen angeboten. Jeder Ausfall aus sechs Wochen wurde eine Verschiebung, und weil die
Suche immer bei heute begann, landeten alle auf demselben Datum: fünf Korrekturen, ein Tag,
unter einer Überschrift, die „an dieser Woche" sagt.

Erkennung will das lange Fenster, Pflege die Woche, in der jemand gerade steckt. Dieselben
Zeilen, zwei verschiedene Fragen.

---

## 2026-08-22 — ADR-068: Jeder Ausgang des Wochen-Ladens hat einen Screen

**Entscheidung:** Der Zustand des Wochenplans ist ein benannter Union-Typ in
`src/components/planState.ts` — `loading`, `ready`, `unsafe`, `no_goal`, `failed` — statt
zweier Booleans. `RequirePlan` behandelt alle fünf.

**Begründung:** Zwei davon zeigten überhaupt nichts. `no_goal` kam vom Server, wurde als
„geladen" notiert und passte dann zu keinem Zweig des Guards, der auf `return null` durchfiel.
Und eine Anfrage, die warf, erreichte den Handler nie, sodass `loaded` für immer falsch blieb.
Keins von beidem loggt etwas, und von der Couch aus sehen beide gleich aus: Die App öffnet
sich zu einem leeren Bildschirm und bleibt dort — ohne Möglichkeit zu erkennen, ob sie denkt,
kaputt ist oder auf etwas wartet.

Ein Zustand, den niemand rendert, ist ein Zustand, dessen Defekt niemand bemerkt.

---

## 2026-08-22 — ADR-067: Vor dem ersten Tag wird nichts geplant

**Entscheidung:** `materialise()` bekommt den ersten Tag der Person in dieser Woche und
schreibt nichts davor. Die Sicherheitsinvarianten prüfen weiterhin die vollständige Woche.

**Begründung:** Eine Woche wird beim ersten Öffnen festgeschrieben (ADR-039), also schrieb
eine Anmeldung am Samstag auch Montag bis Freitag mit: fünf Aktionen aus der Zeit vor dem
Konto, die auf dem Plan-Screen um Bewertung baten. Unangetastet altern sie zu `missed`, und
die Erkennung liest das als Evidenz über Wochentage — wer sich an einem Samstag anmeldet,
bekäme gesagt, dass Montage bei ihm nie funktionieren.

Ein Tag vor dem ersten Tag ist keine unbewertete Aktion. Er war nie geplant.

---

## 2026-08-21 — ADR-066: Ein Zielwechsel bearbeitet die Angaben, er ersetzt sie nicht

**Entscheidung:** Das Onboarding-Formular wird beim Zielwechsel aus der Datenbank vorbefüllt.
Die Umkehrabbildung liegt als reine Funktion `toDraft` in `src/app/onboarding/draft.ts`, testbar
ohne Browser. Der **Zieltext selbst wird bewusst nicht** übernommen.

**Begründung:** Das Formular startete jedes Mal leer. Für ein erstes Ziel ist das richtig, für
ein zweites zerstörerisch: „Ziel wechseln" öffnete eine leere Aufnahme, und das Absenden ersetzte
freie Zeitfenster, feste Termine, Aufstehzeiten, harte Constraints und jede Profilangabe durch
das, was der leere Entwurf noch enthielt. Wer „Rest überspringen" benutzte, verlor das
Fußballtraining, von dem die Nachtregel abhängt, die gesperrten Tage und die Ausrüstung —
lautlos, weil der Schreibvorgang selbst gelang.

Es widersprach außerdem dem Satz auf genau dem Screen, der dorthin führt: „Die Angaben sind
gespeichert. Du musst hier nichts noch einmal machen."

Der Zieltext bleibt leer, weil jemand, der sein Ziel neu definieren will, ein neues schreiben
will. Ihn vorauszufüllen lädt dazu ein, ihn versehentlich erneut abzuschicken — und das würde
ein Ziel pausieren und durch eine Kopie seiner selbst ersetzen.

---

## 2026-08-21 — ADR-067: Die Ringe beschreiben die Woche, die der Plan zeigt

**Entscheidung:** `weeklyReview` liefert zusätzlich `thisWeek` — diese Woche, begrenzt auf das
**aktive** Ziel. Fortschritt bewertet damit. `observations` bleibt bewusst unbegrenzt.

**Begründung:** `readWeek` filtert nach `goal_id`, `loadObservations` nicht. Nach einem
Zielwechsel mitten in der Woche zeigte Plan sieben Aktionen und der Ring zählte vierzehn; nach
einem zweiten Wechsel einundzwanzig. Fortschritt verlinkte dann auf „im Wochenplan nachtragen"
— wo die Hälfte davon gar nicht existiert. Genau der Defekt, den `1cae25c` beheben sollte, nur
über den Zielwechsel-Pfad erreichbar.

Die breite Sicht bleibt für die Mustererkennung: Verhalten ist Verhalten, und ein Mittwoch, den
jemand unter seinem alten Ziel verpasst hat, ist weiterhin Evidenz über Mittwoche. Nur die
Aussage „das ist deine Woche" muss zu dem passen, was die App als Woche anzeigt.

Fällt die Abfrage aus, wird die ungefilterte Woche gezeigt: etwas zu breit ist ein kleinerer
Fehler als leer.

---

## 2026-08-21 — ADR-064: Rundung gehört an die Anzeige, nicht in die Rechnung

**Entscheidung:** `ratePerWeekKg` in `bodyComposition.ts` wird nicht mehr gerundet. Die
Wochenrate geht mit voller Präzision in die Defizitberechnung; gerundet wird nur dort, wo eine
Zahl angezeigt wird.

**Begründung:** Ein externer Deep-Dive-Review hat `round1()` an dieser Stelle markiert. Die
vorhergesagte Wirkung — die Invariante lehnt den Plan ab — stimmte **nicht**: die Invariante
rechnet die Rate aus den Rohwerten neu, und `targetIntake()` deckelt das Defizit ohnehin bei
`MAX_DEFICIT_SHARE`. Der zugrunde liegende Punkt war trotzdem richtig.

Nachgerechnet: 5 kg in 9 Wochen sind 0,5556 kg/Woche. Gerundet auf 0,6 plant die App ein
Tagesdefizit von 660 statt 611 kcal — 49 kcal mehr, als die Person vereinbart hat. Andere
Eingaben rundeten in die Gegenrichtung und planten einen langsameren Verlust als gewünscht
(80→74 kg in 11 Wochen: −50 kcal). Gemessene Spanne über sechs realistische Ziele: ±50 kcal/Tag.

Nie unsicher, aber immer falsch: eine sicherheitsrelevante Größe darf sich nicht danach richten,
wie viele Nachkommastellen eine Anzeige zeigt.

---

## 2026-08-21 — ADR-065: Die Zielübergabe ist umkehrbar

**Entscheidung:** `saveOnboarding` merkt sich die Id des pausierten Ziels und reaktiviert es,
wenn die Aktivierung des neuen Ziels fehlschlägt. Der Startgewicht-Insert wandert **vor** die
Übergabe, in den durch `rollback` geschützten Bereich.

**Begründung:** Ergänzt ADR-055. Dort wurde die Reihenfolge umgedreht, damit nichts zerstört
wird, bevor der Ersatz existiert — aber die letzten beiden Statements blieben ungeschützt, und
mein eigener Kommentar an der Stelle behauptete „Nothing to roll back to here". Das war falsch:
das alte Ziel ist pausiert, nicht gelöscht, und lässt sich reaktivieren. Scheiterte die
Aktivierung, stand der Nutzer mit **null aktiven Zielen** da — und „kein Ziel" liest die App als
„nicht onboarded" und schickt zurück ins Onboarding. Gegen eine echte Datenbank durchgespielt:
vorher 0 aktive Ziele, jetzt 1 mit erhaltenen Constraints und Historie.

Das Startgewicht stand ganz am Ende, nach der bereits erfolgten Aktivierung. Ein Fehler dort
meldete „Speichern hat nicht geklappt" über einen Zielwechsel, der tatsächlich funktioniert
hatte — und ein erneuter Versuch war dann kein Retry desselben Vorgangs. Eine Messung der
Person ist unabhängig davon gültig, ob der Wechsel durchläuft, also kostet es nichts, sie früh
zu schreiben und jeden Fehler im rücknehmbaren Teil zu halten.

---

## 2026-08-21 — ADR-063: Eine gefloorte Dauer darf nie in Distanz zurückgerechnet werden

**Entscheidung:** In `endurance.ts` wird die Distanz einer Einheit auf `wanted` gedeckelt
(`km = min(wanted, minutes / MIN_PER_KM)`), nie darüber angehoben. Die Anzahl der Läufe folgt
wieder direkt `sessionsPerWeekTarget` — die zwischenzeitliche „weniger, aber sichere Läufe"-Logik
ist entfernt, weil sie nicht mehr nötig ist. Zusätzlich trägt eine einzelne Einheit pro Woche das
volle Wochenbudget statt nur den 45-%-Anteil des langen Laufs.

**Begründung:** Der QA-Agent hat reproduziert, dass „10 km pro Woche" — die naheliegendste
Antwort bei einem 10-km-Ziel — die App komplett unbenutzbar machte: Sicherheitsgrenze verletzt,
Fehlerbildschirm, kein Ausweg außer erneutem Onboarding. Das war meine eigene Regression vom
selben Tag (ADR-060/062-Umbau).

Ursache: eine Dauer kann aus zwei verschiedenen Gründen verändert werden, und nur einer davon
darf die Distanz mitziehen. Reicht das Zeitfenster nicht, muss die Distanz schrumpfen — das ist
legitim. Wird die Dauer nur angehoben, weil eine Einheit sonst zu kurz wäre, um sich zu lohnen
(`MIN_VIABLE_SESSION_MINUTES`), darf das die Distanz **nicht** erhöhen — die Einheit bekommt mehr
Zeit, nicht mehr beanspruchte Kilometer. Genau das passierte: eine auf 3 km budgetierte Einheit
wurde auf 20 Minuten gefloort und ihre Distanz dann aus diesen 20 Minuten zurückgerechnet, macht
3,3 km — über der 10-%-Grenze, und die Invariante, die genau das abfangen soll, hielt die Woche
für regelkonform.

Mein erster Fix (weniger, dafür längere Läufe wählen) hätte das Problem verdeckt, statt es zu
lösen, und enthüllte einen dritten, unabhängigen Fehler: bei genau einer Einheit lief die
Lang-/Locker-Aufteilung weiter, sodass diese eine Einheit nur 45 % des Wochenbudgets beanspruchte
und die übrigen 55 % kommentarlos verschwanden.

Gegengeprüft: Startvolumen von 0,5 bis 10 km/Woche wird jetzt durchweg geplant, keine Ablehnung
mehr, die angeforderte Lauf-Anzahl bleibt erhalten.

---

## 2026-08-21 — ADR-062: Dauerregeln sind Dauerregeln, keine Wochentagstermine

**Entscheidung:** `PlannedItem` bekommt `cadence: 'daily' | 'weekly'`. Die Engine liefert
weiterhin **einen Eintrag je Regel** — die Archetyp-Invarianten zählen Regeln, nicht Tage —,
und `materialise()` in `src/lib/db/item-mapping.ts` fächert Dauerregeln beim Speichern auf
sieben Tage auf. „Heute" fasst sie in **einer** Karte zusammen, damit die 3–5-Aktionen-Regel
hält; jede Regel bleibt darin einzeln beantwortbar.

**Begründung:** Kalorienkorridor, Eiweiß zu jeder Hauptmahlzeit, Schlafenszeit — alles wahr an
sieben Tagen, geplant an genau einem. Das brach zwei Dinge gleichzeitig:

Der Plan war schlicht unlogisch zu lesen — „Eiweiß zu jeder Hauptmahlzeit", mittwochs.
Und die gesamte Ernährungsseite eines Abnehmziels wurde an **einem Häkchen pro Woche**
gemessen. Genau diese Verhaltensmetrik ist die einzige, an der Experimente ausgewertet werden
dürfen.

Gemessen über alle 70 Kombinationen: vorher **19 % der Tage ganz leer** und 41 % mit genau
einer Aktion — gegen eine Vorgabe von drei bis fünf. Danach: 0 % leer, 97 % mit zwei oder mehr.

Aufgefächert wird an der Speichergrenze, nicht in der Engine. So bleiben beide Wahrheiten:
die Grenzen der Engine zählen, was entschieden wurde, und alles danach — Heute, die Ringe,
die Mustererkennung — sieht die Tage, die der Mensch tatsächlich hat.

Termine bleiben Termine: Meal-Prep und der Wocheneinkauf sind einzelne Ereignisse, und sie
über die Woche zu verteilen wäre derselbe Fehler in die andere Richtung.

---

## 2026-08-21 — ADR-060: Ein Experiment muss den Plan nachweislich verändern

**Entscheidung:** `proposeExperiment` baut den Plan mit der Regel **und** vergleicht ihn mit dem
aktuellen. Ist die Signaturdistanz 0, wird nichts vorgeschlagen.

**Begründung:** Bisher wurde nur geprüft, ob der Plan *sicher* ist. Drei der vier Regeln, die
der Planer versteht, können in den meisten Wochen gar nichts bewegen: eine Tageszeit-Präferenz
braucht einen Tag mit zwei Zeitfenstern, `lighter_domain` betrifft nur die Basisspur, und
`avoid_weekday` steuert die *Platzierung von Einheiten* — an einem Tag mit Tagesroutinen tut es
nichts.

Vorgeschlagen wurde trotzdem, mit dem Satz „14 Tage lang wird an diesem Wochentag nichts
geplant." Der Nutzer stimmt zu, öffnet Heute — und findet denselben Mittwoch. Vierzehn Tage
später wird ein Münzwurf als etwas ins Playbook geschrieben, das er über sich gelernt habe.
Genau das sollte ADR-042 beenden; dort wurde der **Zeitpunkt** der Trial-Regel repariert, nicht
die Frage, ob sie überhaupt wirkt.

Ob eine Regel greift, hängt vom Wochenplan der Person ab, nicht von der Regel. Deshalb ist der
Vergleich beider Wochen die einzig ehrliche Prüfung.

Nebenbefund beim Umbau: der Testfixture-Nutzer für Experimente hatte **überhaupt keine
Mittwochsaktion**. Die Suite hat einen leeren Vorschlag als korrekt behauptet.

---

## 2026-08-21 — ADR-061: Verglichen wird nur, was auf derselben Achse liegt

**Entscheidung:** In `detectAlong` enthält die Vergleichsgruppe ausschließlich Beobachtungen mit
einem Wert auf dieser Achse. Zusätzlich muss `bestOtherSlot` die verlassene Tageszeit
tatsächlich schlagen.

**Begründung:** Aktionen ohne Uhrzeit oder ohne Dauer wurden korrekt aus der Gruppenbildung
ausgeschlossen — und dann im **Vergleichsnenner** mitgezählt. Da jeder Plan getaktete Einheiten
mit ungetakteten Tagesroutinen mischt und Routinen meist gelingen, war das der Normalfall, nicht
der Randfall: es erzeugte Kontrast aus dem Nichts und konnte zwei einander widersprechende
Befunde aus derselben Woche melden.

`bestOtherSlot` startete mit einer Untergrenze von 0 und verglich nie gegen die Tageszeit, die
verlassen werden sollte. Die App konnte „Mittags funktioniert bisher zuverlässiger" sagen,
während mittags messbar schlechter lief. Jemanden auf eine schlechtere Zeit zu schieben ist
kein Experiment, sondern ein verlorener Halbmonat.

---

## 2026-08-21 — ADR-057: Ein halb geschriebener Plan wird zurückgenommen

**Entscheidung:** Scheitert in `writeWeek` der Items-Insert, wird die zuvor geschriebene
`plans`-Zeile wieder gelöscht.

**Begründung:** Vorher blieb sie stehen. Der Aufrufer liest nach einem `null` erneut, findet
**genau diese Zeile** und liefert eine Woche mit null Aktionen zurück — während der partielle
Unique-Index es unmöglich macht, diese Woche je wieder aufzubauen. Eine dauerhaft leere Woche
ohne Ausweg. Ein echtes Wettrennen verliert weiterhin am Index und hat gar keine eigene Zeile
zum Löschen; beide Fälle enden damit korrekt.

---

## 2026-08-21 — ADR-058: Der Abschluss eines Experiments ist eine Bedingung, keine Annahme

**Entscheidung:** `concludeIfDue` aktualisiert den Status mit `.in('status', ['running',
'extended'])` als Vorbedingung und bricht ab, wenn keine Zeile getroffen wurde. `ruleWritten`
kommt aus dem Schreibergebnis. Ein `continue` misst die neue Periode **ab heute**. Zusätzlich
wird beim Öffnen der App abgeschlossen, nicht nur auf Insights.

**Begründung:** Fünf ungeprüfte Schreibvorgänge. Scheiterte der Status-Update, wurden Ergebnis
und Regel trotzdem geschrieben und das Experiment blieb `running` — jeder weitere Seitenaufruf
schloss es erneut ab und hängte ein weiteres Ergebnis an, endlos; `experiment_results` hat
keine Unique-Bedingung dagegen. Zwei gleichzeitige Aufrufe hätten dasselbe getan.

`ruleWritten` stammte aus der reinen Funktion, nicht aus dem Upsert: „deine Regel wurde
übernommen" konnte gemeldet werden, obwohl nichts gespeichert wurde — und das Experiment ist
danach `adopted`, also nicht wiederholbar.

Das Enddatum wanderte um 14 Tage ab dem **alten** Enddatum. Wer zwei Monate nicht reinschaut,
löste bei jedem Laden einen weiteren Abschluss aus, bis die Arithmetik aufholte.

Und nur Insights schloss ab. Wer diesen Screen nie öffnet, hatte ein dauerhaft offenes
Experiment — was, weil nur eines offen sein darf, **jedes künftige blockiert** und dessen
Trial-Regel unbegrenzt weiterwirken lässt.

---

## 2026-08-21 — ADR-059: `style-src` erlaubt Inline-Attribute, `script-src` nicht

**Entscheidung:** `style-src 'self' 'unsafe-inline'`. Skripte bleiben bei
`'nonce-…' 'strict-dynamic'`.

**Begründung:** Eine Nonce deckt kein `style=""`-Attribut ab — CSP prüft die unter
`style-src-attr`, das auf `style-src` zurückfällt. Die strikte Fassung blockierte damit das
eigene Layout. Im Browser nachgemessen: der Fortschrittsbalken im Playbook rendert mit voller
Breite statt seines echten Prozentwerts — eine **falsche Aussage auf dem Screen**, ausgerechnet
auf dem Screen, den Kritikpunkt K3 tragend gemacht hat. Ring und Chart verloren ihre Maße.

Aufgegeben wird wenig, behalten wird das Entscheidende: Skripte bleiben streng, `connect-src`
nennt weiterhin die eine Gegenstelle, und die App rendert kein nutzergeneriertes HTML — es gibt
also keinen Weg, über den fremdes Markup auf diese Seite gelangt, um die Lockerung auszunutzen.
Gegengeprüft: Layout korrekt, null Style-Verstöße, Skript ohne Nonce weiterhin blockiert.

---

## 2026-08-21 — ADR-055: Erst bauen, dann abreissen

**Entscheidung:** `saveOnboarding` legt das neue Ziel zuerst an — als `paused`, damit es nicht
mit dem aktiven kollidiert —, dann Metriken, dann die neuen Constraints, und erst danach wird
Altes entfernt. Die alten Constraints werden per Id gelöscht, nachdem die neuen stehen. Jeder
Fehler vor der Übergabe rollt das halb gebaute Ziel zurück. Jeder Schreibvorgang wird geprüft,
auch der `measurements`-Insert.

**Begründung:** Vorher lief es andersherum: Constraints löschen, altes Ziel pausieren,
Experimente abbrechen — und erst dann das neue Ziel einfügen. Jeder Fehler dazwischen hinterließ
einen Menschen **ohne aktives Ziel und ohne Constraints**. Und die App beantwortet „kein Ziel"
damit, dass sie zurück ins Onboarding schickt. Genau das Symptom, das der Product Owner
gemeldet hat — nicht aus dem Routing, sondern aus der Datenschicht.

PostgREST gibt jedem Statement seine eigene Transaktion. Damit **ist** die Reihenfolge hier die
Sicherheitsgarantie: nichts, was jemand schon hat, wird entfernt, bevor der Ersatz in der
Datenbank steht. Gegen eine echte Datenbank geprüft — vorher 0 Ziele/0 Constraints, jetzt
1/1 nach demselben Fehler.

Harte Constraints sind der Unterschied zwischen einem sicheren und einem verletzenden Plan.
Dass sie kurzzeitig ganz fehlen können, ist kein akzeptabler Zwischenzustand.

---

## 2026-08-21 — ADR-056: Ein Formatcheck ist kein Wertecheck

**Entscheidung:** Datumsangaben werden über `src/lib/domain/isoDate.ts` geprüft, das den Wert
durch `Date` zurückspielt. `2026-02-31` wird abgelehnt.

**Begründung:** `/^\d{4}-\d{2}-\d{2}$/` akzeptiert den 31. Februar. Die Form stimmt, der Tag
existiert nicht — der Wert erreicht eine `date`-Spalte und scheitert dort, also **nachdem** die
umliegenden Statements gelaufen sind. Das war der konkrete Auslöser für ADR-055.

Als UTC gelesen, weil die App ausschließlich reine Kalendertage speichert: eine Prüfung, die
mit der Zeitzone des Servers wandert, würde in verschiedenen Regionen verschiedene Daten
akzeptieren.

---

## 2026-08-20 — ADR-054: Der Ring ist die eine Form

**Entscheidung:** Ring als durchgehende Gestalt: Wortmarke, Wochen-Score und ab jetzt auch das
Abhaken (`CheckRing`, 44 px). Die Aktionskarte zeigt nur noch Ring, Titel, Domain und Dauer;
„Verschoben / Nicht geschafft / Passte nicht" und die Begründung liegen hinter **einer**
Aufklappung.

**Begründung:** Drei Rückmeldungen auf einmal — zu viel Text, Layout, „wirkt austauschbar".

Vorher standen unter jeder Aktion vier Statusknöpfe über zwei Zeilen plus ein „Warum?". Ein
Tag mit drei Aktionen war eine Wand aus zwölf Knöpfen und drei Absätzen, und das, was man
fünfmal am Tag tut — abhaken — kostete genauso viel Aufwand wie das, was man fast nie tut.
Jetzt ist der Normalfall ein Tippen.

Nichts wird versteckt: alles ist eine Aufklappung entfernt, entsprechend der Vorgabe des
Product Owners, dass alles irgendwo sichtbar bleibt. Es schreit nur nicht mehr alles
gleichzeitig.

Die Wiederholung derselben Form an drei Stellen ist, was eine App nach sich selbst aussehen
lässt statt nach einer Komponentenbibliothek — und sie ist hier wörtlich gemeint: jedes
Antippen ist ein Segment des Rings auf Fortschritt.

Übergänge nur auf Farbe, nie auf Layout. Eine animierte Größenänderung kostet einen Frame und
liest sich als Verzögerung — genau die Beschwerde, mit der das angefangen hat.

---

## 2026-08-20 — ADR-053: Der Check-in fragt nach dem Ziel, nicht nach allem

**Entscheidung:** Drei weitere Felder — `diet_quality`, `soreness`, `alcohol_units`,
`caffeine_late` — existieren in der Datenbank für alle. **Gefragt** wird je Archetyp:
drei Kernfragen (Energie, Stimmung, Schlaf) plus höchstens drei aus dem Ziel. Definiert in
`src/lib/engine/checkin-fields.ts`, Obergrenze `MAX_CHECKIN_FIELDS = 6`.

**Begründung:** Neun Fragen jeden Abend wären genau der „zweite Job", den das Playbook
ausschließt — und sie würden die Antworten schlechter machen: wer sich verhört fühlt, tippt
die Mitte. Ein Schlafziel hat nichts mit Muskelkater zu tun, ein Kraftziel nichts mit einem
Glas Wein.

Die Spalten existieren trotzdem für alle, damit ein Zielwechsel die Historie nicht entwertet:
was einmal erfasst wurde, bleibt lesbar, es wird nur nicht mehr gefragt.

Schlaf steht bewusst im Kern statt im Schlaf-Archetyp: er ist der Faktor, von dem die meisten
anderen Muster abhängen, und der, mit dem die App einen schlechten Dienstag erklären kann,
ohne jemandem etwas vorzuwerfen.

Ein Test verlangt, dass drei Ziele mit unterschiedlichen Hebeln auch unterschiedliche Fragen
bekommen — dieselbe Prüfung, die die Planungs-Engine bestehen muss. Sonst wäre die Relevanz
eine Behauptung statt ein Verhalten.

---

## 2026-08-20 — ADR-051: Die Nacht ist keine freie Zeit

**Entscheidung:** Aufstehzeiten werden **je Wochentag** erfasst (partiell — ein Tag ohne
Angabe bleibt unbekannt). Ein neues reines Modul `src/lib/engine/night.ts` rechnet aus, wie
viel Nacht nach dem letzten festen Termin eines Tages bis zum Wecker am Morgen danach übrig
bleibt. Liegt sie bei **7 h oder darunter**, wird der Abend nicht mehr beplant, und der Plan
sagt in einem Satz warum. Konstanten: `WIND_DOWN_MINUTES = 60`, `MIN_NIGHT_HOURS = 7`.

**Begründung:** Der Fall des Product Owners: Fußball bis 21:00, Mittwoch um 5:00 raus. Diese
Nacht steht fest, bevor der Plan irgendetwas gesagt hat. Ein Planer, der den Dienstagabend als
leeres Zeitfenster behandelt, fügt keine Einheit hinzu — er nimmt Schlaf weg, und das ist
genau die Richtung, die die Sicherheitsregeln ausschließen.

Bewusst nur der Abend: ein Morgen am selben Tag bleibt planbar, weil er die Nacht nichts
kostet. Wer Dienstagabend Fußball hat, kann Dienstagmorgen laufen.

Eine Aufstehzeit für die ganze Woche hätte nicht gereicht — Studium, Schicht und wechselnde
Vorlesungen haben sieben verschiedene Morgen. Ohne Angabe rechnet die App nicht, statt eine
Uhrzeit zu erfinden.

---

## 2026-08-20 — ADR-052: Die Zeile in die Datenbank ist eine reine Funktion

**Entscheidung:** `scheduleRow()` bildet `Schedule` auf die Datenbankzeile ab, mit einem Test,
der jeden Feldnamen des Domain-Typs gegen die Zeile prüft.

**Begründung:** Zweimal in diesem Projekt wurde etwas erfasst, korrekt durchtypisiert und
trotzdem nie gespeichert oder nie gelesen — die alte einzelne `wake_time` und die Check-ins.
TypeScript fängt das nicht: ein Insert-Objekt, dem eine Eigenschaft fehlt, ist gültig. Aus dem
Save herausgezogen wird daraus etwas Prüfbares, und aus „jemand hat daran gedacht" wird
„sonst schlägt die Suite fehl".

---

## 2026-08-20 — ADR-050: Ein Muster wird nie ohne seinen Umstand genannt

**Entscheidung:** Der Check-in erfasst zusätzlich **Schlaf** (Stunden) und **Stress** (1–5,
aufwärts gelesen). Ein neues reines Modul `src/lib/adaptive/attribution.ts` vergleicht die
betroffenen Tage mit den übrigen und nennt, was anders war — ein spät endender Termin, weniger
Schlaf, weniger Energie, mehr Stress. Diese Sätze erscheinen zusammen mit dem Muster.

Schwellen vorab fixiert: mindestens 3 bewertete Tage je Seite, 45 min Schlafunterschied,
0,6 Punkte auf den 1–5-Skalen, „spät" ab 20:30 Ende.

**Begründung:** „Dienstags läuft es schlechter" ist eine Feststellung mit einer
mitgelieferten Ursache, und die mitgelieferte Ursache ist immer die Person. Genau das
schließt das Playbook aus. Wer bis 21:00 Fußball hat und um 5 aufsteht, hat kein
Disziplinproblem, sondern zu wenig Nacht — und die App muss das sagen können.

Bewusste Grenze der Behauptung: die Formulierung nennt einen **Unterschied**, nie einen Grund.
Korrelation über eine Handvoll Tage ist keine Kausalität; ein Test sperrt sowohl
Schuldvokabular als auch „der Grund ist". Fehlende Werte werden übersprungen, nie als Null
gezählt — sonst würden zwei erfasste Nächte als vier schlaflose gelesen.

Nur Wochentagsmuster werden attribuiert. Ein Check-in gehört dem Tag, nicht der Stunde, und
kann deshalb nichts darüber sagen, warum Abende anders laufen als Morgen.

---

## 2026-08-20 — ADR-047: Ein Zeichen, das die App selbst zeigt

**Entscheidung:** Die Marke ist ein offener Ring mit einem abgesetzten Beat. Der Ring ist die
Woche — derselbe Fortschrittsring, den die App auf Fortschritt und Heute zeichnet. Die Öffnung
liest sich als **C**, der akzentuierte Beat ist die Änderung, die das Experiment probiert hat.

Dazu echte Installations-Icons: `app/icon.svg`, `app/apple-icon.png` (180 px), `favicon.ico`
sowie 192/512 und ein **maskable** 512 im Manifest. Alle werden aus derselben Geometrie
erzeugt (`scripts/`-loses Einmalskript, Werte im Code dokumentiert).

**Begründung:** Der vorherige Balken-Marke fehlte ein Bezug zum Produkt — sie hätte zu jeder
Analytics-App gehören können. Der Ring gehört zu dieser: er ist das, was der Nutzer täglich
ansieht.

Die vielen Dateiformate sind kein Overkill, sondern Voraussetzung: iOS ignoriert die
Manifest-Icons für den Homescreen und verlangt ein `apple-touch-icon`-PNG, Android verlangt
für den adaptiven Zuschnitt ein maskable Icon, dessen Inhalt innerhalb von 80 % des Feldes
bleibt.

---

## 2026-08-20 — ADR-048: Eine Palette, zwei Erscheinungen — über `light-dark()`

**Entscheidung:** Die Farbtokens stehen einmal da und nennen beide Werte pro Zeile
(`light-dark(hell, dunkel)`). Der Modus wird ausschließlich über `color-scheme` gesteuert.
Die Kontoseite bietet System/Hell/Dunkel; die Wahl liegt in einem Cookie, und der Server
stempelt `data-theme` auf `<html>`.

**Begründung:** Die übliche Lösung — ein Hell-Block plus ein duplizierter Dunkel-Block unter
`prefers-color-scheme` — verrottet: eine Farbe, die in der einen Hälfte ergänzt und in der
anderen vergessen wird, fällt Monate später als ein einzelner falscher Farbfleck auf. Mit
`light-dark()` ist das Vergessen strukturell unmöglich.

Der Cookie statt localStorage ist der Grund, warum es kein weißes Aufblitzen gibt: die
Einstellung muss beim **ersten** Frame feststehen, und nur der Server kann das leisten.
`system` stempelt bewusst nichts — sonst würde eingefroren, was das Gerät zufällig beim
Rendern war.

---

## 2026-08-20 — ADR-049: Das Manifest darf nicht hinter dem Login liegen

**Entscheidung:** Der Auth-Proxy schließt `.webmanifest` genauso aus wie Bilder.

**Begründung:** Der Browser lädt das Manifest, bevor sich jemand angemeldet hat, und oft ohne
Credentials selbst wenn er angemeldet ist. Vorher antwortete `/manifest.webmanifest` mit einer
Weiterleitung auf `/login` — die Installationsaufforderung erschien nie, und die App ließ sich
gar nicht auf den Homescreen legen. Gegengeprüft: jetzt 200.

---

## 2026-08-20 — ADR-045: Der Plan kennt die Termine, die es schon gibt

**Entscheidung:** `Schedule` hat neben `freeSlots` jetzt `commitments` — feste, wöchentlich
wiederkehrende Termine mit Wochentag, Uhrzeit, Dauer, Art und (bei Sport) Sportart. Die Engine
zieht sie **einmal am Rand** von den freien Zeitfenstern ab, plant an einem Tag mit Sport kein
zweites Training, rechnet Sport als Belastung gegen die Ruhetage und gegen das Wochenziel, und
plant trotzdem mindestens **eine** Einheit der eigenen Art dazu.

**Begründung:** Die Engine kannte nur Zeit, die jemand *angeboten* hat. Alles andere sah aus wie
eine leere Woche — also wurde in Stunden geplant, die nie frei waren, und am Dienstagabend ein
Training vorgeschlagen, an dem der Product Owner bereits Fußball hat.

Der Abzug passiert bewusst ganz vorne in `buildContext`: danach arbeitet jeder Helfer
(`longestSlotOn`, `bestSlotOn`, `slotOf`) auf echter freier Zeit, und keiner kann vergessen zu
fragen.

Die Mindestens-eine-Einheit ist die Gegenkraft zur Verrechnung. Fußball ist Training, aber kein
Krafttraining — ein Ziel „stärker werden", das mit Fußball beantwortet wird, ist keine Antwort,
und ein Kaloriendefizit ohne Widerstandstraining kostet Muskeln.

---

## 2026-08-20 — ADR-046: Die Überschrift muss stimmen

**Entscheidung:** Die Anzahl der Einheiten kommt aus der **Platzierung**, nicht aus der
Anforderung, und der Wochenumfang beim Laufen ist die Summe der geplanten Läufe, nicht das, was
die Steigerungsregel erlaubt hätte. Ein Test über alle Profile × alle Ziele, mit und ohne
Vereinswoche, vergleicht jede Zahl in der Überschrift mit dem, was darunter steht.

**Begründung:** Beim Durchsehen echter Pläne standen zwei Widersprüche nebeneinander:
„3× Kraft" über einer Woche mit zwei Einheiten (die Ruhetagsregel hatte korrekt gekürzt, die
Überschrift nicht), und „13,2 km" über einem einzigen Lauf von 5,9 km. Beide fielen erst auf,
als die Woche schon etwas enthielt — und der zweite existierte auch ohne feste Termine.

Den Umfang stattdessen in den einen verbliebenen Lauf zu packen, wäre die andere Art gewesen,
die Zahlen zusammenzubringen, und die falsche: genau diesen Sprung verhindert die
10-%-Grenze.

---

## 2026-08-20 — ADR-044: Das Onboarding ist zerstörend und wird deshalb bewacht

**Entscheidung:** `/onboarding` zeigt einem Menschen mit aktivem Ziel nicht mehr das leere
Formular, sondern nennt das bestehende Ziel und fragt. Das Formular gibt es nur nach
ausdrücklicher Zustimmung (`?reset=1`). Zusätzlich unterscheidet `loadPlanInput` jetzt
zwischen „nichts gespeichert" und „Abfrage fehlgeschlagen": ein Fehler wirft
`PlanInputUnavailableError` und landet in einer Fehleransicht mit „Nochmal versuchen".
Höchstens ein aktives Ziel je Person ist ein Unique-Index.

**Begründung:** Das Onboarding abzuschicken pausiert das bestehende Ziel und legt ein neues
an — es ist also zerstörend, war aber ungeschützt erreichbar. Gleichzeitig war jeder
fehlgeschlagene Datenbankzugriff nicht von „hat noch nie etwas eingerichtet" zu unterscheiden,
weil nur `data` gelesen wurde und `error` nicht. Eine kurze Störung sah damit exakt aus wie ein
neuer Nutzer, und die App antwortete mit dem Formular, dessen Ausfüllen die echte Einrichtung
ersetzte. Aus Sicht des Product Owners: „immer wenn du pushst, kommt das Onboarding nochmal."

Beide Hälften mussten weg. Selbst wenn die Weiterleitung irgendwann wieder danebengreift, kann
das Onboarding jetzt nichts mehr ersetzen, ohne dass jemand es verlangt hat.

---

## 2026-08-20 — ADR-042: Die Regel eines laufenden Experiments verändert den Plan sofort

**Entscheidung:** Sobald der Nutzer ein Experiment annimmt, wird die getestete Regel als
`trial`-Regel in `personal_rules` geschrieben und vom Planer angewendet. Sie ist nicht Teil
des persönlichen Modells: das Playbook zeigt sie nicht, und bei `discard` wird sie gelöscht,
bei `keep` durch die echte Regel mit ihrer echten Konfidenz ersetzt. Kollidiert ihr Schlüssel
mit einer bereits gelernten Regel, gewinnt die Trial-Regel für die Dauer des Tests.

**Begründung:** Vorher entstand eine Regel erst, *nachdem* das Experiment abgeschlossen war.
Damit produzierten die vierzehn Tage dazwischen exakt den Plan, den die Person vorher hatte —
das Experiment testete nichts, und das Ergebnis war garantiert Rauschen. Genau dieses Rauschen
wäre anschließend als Regel dauerhaft ins persönliche Modell geschrieben worden. Das ist der
Kern des Produkts (`docs/ADAPTIVE_ENGINE.md`), also darf er nicht nur auf dem Papier stehen.

Die Reihenfolge beim Anwenden ist explizit festgelegt, nicht der Zeilenreihenfolge der
Datenbank überlassen: sonst hätte dasselbe Experiment je nach Abfrage zwei verschiedene
Antworten gegeben.

---

## 2026-08-20 — ADR-043: Ein offenes Experiment ist eine Datenbankinvariante

**Entscheidung:** Ein partieller Unique-Index über `experiments (profile_id)` für die
Status `proposed`, `running` und `extended` erzwingt, dass höchstens ein Experiment offen
ist. `extended` gilt als offen und wird auch wieder gelesen; sein Enddatum wandert mit.
Ein Zielwechsel setzt offene Experimente auf `aborted` und löscht die Trial-Regeln.

**Begründung:** Die Regel „eines zur Zeit" existierte nur als Lesen-dann-Schreiben im Code
und war damit rennbar. Zwei gleichzeitige Experimente machen beide Ergebnisse unlesbar, und
der Leser benutzte `maybeSingle()` — ein Duplikat hätte bei jedem weiteren Laden geworfen und
die Lernschleife dauerhaft getötet. Umgekehrt hätte ein Experiment, das nach einem Zielwechsel
offen bleibt, unter dem neuen Index jedes künftige Experiment blockiert, und seine Trial-Regel
hätte weiter Pläne für ein Ziel geformt, das niemand mehr verfolgt.

---

## 2026-08-20 — ADR-041: Die KI entscheidet **was**, die Engine entscheidet **wann und ob**

**Ausloeser:** Der Product Owner hat den Kernmangel benannt: *die KI hat keine Hebel, die sie
bewegen kann.* Sie ordnete ein Ziel einer von sieben Schubladen zu und war fertig; danach lief
ein deterministischer Planer nach Schema F. Wer „motivierter werden" oder „weniger
prokrastinieren" eingab, landete in `general_health` und bekam **eine** Zielaktion.

**Entscheidung:** Die KI liefert einen typisierten **Vorschlag** — Aktionen mit Titel,
Bereich, Dauer, Haeufigkeit und Begruendung. Sie schlaegt **keine Termine** vor. Wo etwas
landet, ob es ueberhaupt hineinpasst, ob dazwischen genug Erholung liegt: das entscheidet die
Engine, die als einzige die freien Zeitfenster, harten Ausschluesse, Ruhetage und Tagesdeckel
kennt.

**Zwei Modi**, nach Entscheidung des Product Owners: `augment` legt bis zu drei Aktionen auf
den Archetyp-Plan — haeufige Ziele behalten also ihren geprueften Plan und bekommen trotzdem
etwas Persoenliches. `takeover` ersetzt die Zielspur ganz, aber **nur bei `general_health`**,
also dort, wo ohnehin nichts Passendes gebaut wurde.

**Der Archetyp behaelt seine Domaenen.** Ein Vorschlag darf nicht in einen Bereich schreiben,
dessen Last der Archetyp verwaltet — Trainingsumfang bei Kraft und Ausdauer, Anzahl der
Ernaehrungsaenderungen bei `nutrition_quality`. Das ist keine Stilfrage: Diese Deckel sind
Invarianten, und ein Vorschlag, der hineingreift, erzeugt keinen etwas vollen Plan, sondern
einen **abgelehnten** — der Mensch saehe gar nichts. Offen bleibt genau der Raum, in dem die
Archetypen schwach sind: Kopf, Routine, Fokus, Bewegung. Also dort, wo diese Ziele leben.

**Warum das die Sicherheitsarchitektur nicht schwaecht:** Eine von der KI erfundene Aktion ist
ein gewoehnliches `PlannedItem` und durchlaeuft **dieselben** Invarianten wie eine vom
Archetyp erzeugte. Ein Plan, der eine Grenze reisst, wird **ganz** verworfen, nicht
zurechtgestutzt — stilles Reparieren wuerde verbergen, dass ein schlechter Vorschlag entstand.

**Der Vorschlag ist Eingabe, kein Aufruf.** Er steht in `PlanInput`, nicht hinter einem
`fetch` in der Engine. `generatePlan` bleibt rein: keine Uhr, kein Netzwerk, dieselbe Eingabe
ergibt denselben Plan — und damit bleiben alle Gates billig genug fuer jeden Commit.

**Drei Invarianten mussten praeziser werden.** `nutrition_quality` zaehlte *alle*
Zielaktionen als „Ernaehrungsaenderungen", `habit_routine` alle als „neue Gewohnheit",
`strength` und `endurance` alle als Trainingseinheiten. Ihre eigenen Namen und Begruendungen
meinen jeweils ihre Domaene. Der Fehler konnte vorher nicht auffallen, weil die Zielspur
immer nur eine Domaene enthielt. Jetzt zaehlen sie, was sie behaupten zu zaehlen.

**Ohne API-Key** bleibt der deterministische Pfad, was er ist — aber die App ist bei
ungewoehnlichen Zielen dann deutlich schwaecher, und das soll sie sagen statt es zu
verschweigen. Siehe `docs/AI_CAPABILITIES.md`.

---

## 2026-08-20 — ADR-040: Leak-Pruefung selbst gebaut, weil sie im kostenlosen Plan fehlt

**Korrektur zu einer frueheren Empfehlung.** Ich hatte den Product Owner gebeten, in Supabase
„Leaked Password Protection" einzuschalten. Die Option existiert dort nicht: Sie ist laut
Supabase-Dokumentation **erst ab dem Pro-Plan** verfuegbar. Der Advisor meldet sie trotzdem,
was den Hinweis irrefuehrend macht.

**Entscheidung:** Die Pruefung liegt jetzt im eigenen Code, in `src/lib/auth/pwned.ts`, und
laeuft vor dem Anlegen des Kontos.

**Warum ueberhaupt:** Credential Stuffing raet keine Passwoerter, es spielt die
hunderte Millionen durch, die bereits oeffentlich sind. Eine Gesundheits-App haelt genau die
Art von Daten, die niemand mit seinem Namen verknuepft sehen moechte.

**Das Passwort verlaesst den Server nie.** Der Dienst arbeitet mit k-Anonymitaet: Es gehen die
ersten fuenf Zeichen des SHA-1-Hashes hinaus, zurueck kommen alle Suffixe mit diesem Praefix —
einige hundert —, und der Abgleich passiert lokal. Der Dienst erfaehrt ein Praefix, das auf
etwa einen von einer Million Hashes passt, und sonst nichts. `Add-Padding` sorgt dafuer, dass
die Antwortgroesse nichts ueber die Trefferzahl verraet.

**Sie faellt bewusst offen aus.** Ist der Dienst langsam oder nicht erreichbar, laeuft die
Registrierung weiter. Der Ausfall eines Dritten darf niemanden aus dem eigenen Konto
aussperren; Laenge und Form pruefen ohnehin weiter.

**Nicht live getestet.** Der Proxy dieser Entwicklungsumgebung blockiert
`api.pwnedpasswords.com`. Geprueft ist die Logik — der Hash-Split gegen einen bekannten Wert,
das Parsen der Antwort, Padding-Eintraege, kaputte Antworten. Der Netzwerkaufruf selbst wurde
hier nie ausgefuehrt.

**Was auf dem kostenlosen Plan stattdessen geht** und eingeschaltet werden sollte:
Mindestlaenge und erforderliche Zeichenklassen unter Authentication → Providers → Email.

---

## 2026-08-20 — ADR-039: Eine Woche wird beim ersten Oeffnen festgeschrieben

**Entscheidung:** ADR-037 haelt fest, dass Plaene berechnet und nicht gespeichert werden, und
nennt den Moment, in dem sich das aendert: sobald Aktionen abgehakt werden koennen. Der ist
jetzt da. Beim ersten Oeffnen einer Woche entstehen eine `plans`-Zeile und die zugehoerigen
`plan_items`. Ab da ist diese Woche fest.

**Begruendung, erstens:** Ein Status braucht etwas, woran er haengen kann. „Der dritte Eintrag
am Dienstag" ist keine Identitaet — er ist ein anderer, sobald die Engine ihre Meinung ueber
den Dienstag aendert.

**Begruendung, zweitens, und die ist wichtiger:** Ein Plan, den jemand gerade abarbeitet, darf
sich nicht unter ihm veraendern, nur weil am Donnerstag eine Regel gelernt wurde. Neues Wissen
gilt ab der naechsten Woche. Die laufende ist ein bereits gegebenes Versprechen.

**Ein aktueller Plan je Woche und Ziel**, als partieller Unique-Index. Zwei gleichzeitige
Anfragen — eine wiederhergestellte Handy-Ansicht plus ein Tippen — faenden sonst beide nichts
und schrieben beide. Danach haekelte die Person eine Aktion auf der einen Kopie ab, waehrend
der Bildschirm die andere zeigte. Erst pruefen und dann einfuegen loest das nicht; nur die
Datenbank kann das.

**Das Ziel gehoert in den Index.** Ohne es waere ein Zielwechsel mitten in der Woche nicht
darstellbar: Der neue Plan liesse sich nicht einfuegen, bevor der alte abgeloest ist, und ein
Plan abloesen heisst, die Id seines Nachfolgers einzutragen — die es noch nicht gibt. Mit dem
Ziel im Index bleibt der alte Plan einfach stehen. Die Aktionen darunter sind Geschichte, und
die Adaptive Engine lernt weiter daraus.

**Damit ist der Kreis geschlossen.** `toObservations` verbindet gespeicherte Aktionen mit der
Adaptive Engine, die seit ADR-029 auf handgemachten Daten getestet war. Ein Test fuehrt jetzt
denselben Zyklus auf Daten in Datenbankform: vier Wochen mit ausgefallenen Mittwochen ergeben
ein Muster, eine Hypothese und genau ein sicheres Experiment.

---

## 2026-08-20 — ADR-038: Diese App wird ausschliesslich dynamisch gerendert

**Ausloeser:** Ein Fehler, den der Product Owner gefunden hat und der genau so aussah wie
gar nichts. Im Onboarding liess sich „Weiter" nicht druecken. Die Seite war korrekt
dargestellt, Tippen funktionierte, kein Fehler im Log, keine Meldung im Browser.

**Ursache:** `/onboarding` war die letzte statisch vorgerenderte Seite. Die CSP arbeitet mit
einem Nonce pro Anfrage und `'strict-dynamic'` — letzteres weist den Browser an, `'self'` zu
**ignorieren** und ausschliesslich Skripten mit passendem Nonce zu vertrauen. Eine
vorgerenderte Seite entsteht, bevor es die Anfrage gibt, kann also kein Nonce tragen. Alle elf
Script-Tags wurden abgelehnt, React hydrierte nie, und jeder Button blieb in dem Zustand
eingefroren, den der Server geliefert hatte. Tippen ging weiter, weil das der Browser selbst
macht.

**Entscheidung:** `export const dynamic = 'force-dynamic'` im Root-Layout. Das entspricht der
Wahrheit ueber dieses Produkt: Jeder Screen haengt entweder an einer Sitzung oder gehoert zur
Anmeldung. Es gibt hier keine Seite, die sich sinnvoll ohne Anfrage bauen laesst.

**Der eigentliche Ertrag ist der Waechter.** `scripts/check-nonces.mjs` laesst den Build
scheitern, sobald eine vorgerenderte Seite ein Skript ohne Nonce ausliefert. Diese Fehlerklasse
ist deshalb so gefaehrlich, weil sie sich nicht wie ein Fehler anfuehlt — ohne den Waechter
faellt sie erst auf, wenn jemand vor der App sitzt und nichts passiert.

**Eine Ausnahme, und sie ist geprueft statt behauptet:** `global-error` ersetzt das Root-Layout,
wenn dieses selbst gescheitert ist, und muss deshalb vorgerendert existieren. Sie ist vom
Nonce-Zwang ausgenommen — aber nur, solange sie ohne JavaScript funktioniert. Der Waechter
prueft das nach: ein `onclick` oder ein `type="button"` laesst den Build scheitern. Ein
Submit-Button in einem Formular bleibt erlaubt, denn der funktioniert seit jeher ohne Skripte.

**Kosten:** Kein statisches Caching mehr. Bei einer persoenlichen App, deren Inhalt pro Nutzer
und pro Tag verschieden ist, war davon ohnehin nichts zu gewinnen.

---

## 2026-08-20 — ADR-037: Der Plan wird berechnet, nicht gespeichert

**Entscheidung:** Persistiert werden die **Eingaben** — Profil, Ziel, Zielmetriken, Tagesstruktur,
Constraints, Personal Rules. Der Wochenplan selbst wird bei jedem Aufruf neu erzeugt.

**Begruendung:** `generatePlan` ist rein: keine Uhr, kein Zufall, kein Netzwerk. Dieselbe
Eingabe ergibt denselben Plan, und 745 Tests haengen an dieser Zusage. Neu berechnen ist
deshalb praktisch kostenlos und kann dem Gespeicherten nicht widersprechen. Wuerde man den
Plan zusaetzlich ablegen, gaebe es zwei Wahrheiten ueber dieselbe Sache — und die eine, die
niemand nachrechnet, wird irgendwann die falsche.

**Wann sich das aendert:** Sobald Aktionen abgehakt werden. Dann braucht ein `plan_item` eine
stabile Identitaet, an die ein Status haengt, und Experimente vergleichen Plaene vor und nach
einer Aenderung. Die Tabellen `plans` und `plan_items` existieren dafuer bereits und bleiben
bis dahin bewusst leer.

**Das Datum bleibt beim Client.** Der Server laeuft in UTC. Wer um halb eins nachts in Berlin
die App oeffnet, bekaeme sonst die Woche von gestern.

---

## 2026-08-20 — ADR-036: Custom SMTP wird bewusst aufgeschoben (OFFENER PUNKT)

**Status: offen.** Dieser Eintrag beschreibt eine Entscheidung, die noch nachzuholen ist.

**Entscheidung:** Die E-Mail-Vorlage „Confirm signup" bleibt vorerst auf dem Supabase-Standard.
Der Grund ist kein technischer Zweifel, sondern eine Voraussetzung: Vorlagen lassen sich im
Dashboard erst bearbeiten, wenn ein **eigener SMTP-Server** hinterlegt ist, und dafür braucht
es eine eigene Absenderadresse. Die gibt es noch nicht.

**Was das heute bedeutet.** Mit der Standardvorlage laeuft der **implizite Flow**: Supabase
bestaetigt die Adresse auf der eigenen Domain und haengt die Session an den URL-**Fragment**-
Teil. Ein Fragment erreicht per Definition nie den Server, also kann `/auth/confirm` daraus
keine Session herstellen. Das Konto ist bestaetigt, es liegt nur keine Anmeldung vor.

**Ablauf in der Zwischenzeit:** Registrieren → Mail bestaetigen → **einmal manuell anmelden**.
Danach bleibt die Session bestehen. Ein Schritt mehr, kein Defekt.

**Der Code ist auf beide Faelle vorbereitet.** `/auth/confirm` behandelt `token_hash` (den
Zielzustand) und dessen Abwesenheit (heute) getrennt. Der zweite Fall meldet ausdruecklich
**nicht** „Link ungueltig" — das waere die schlimmste moegliche Antwort: Sie behauptet ein
Scheitern genau in dem Moment, in dem die Bestaetigung geglueckt ist.

**Nachzuholen, sobald eine Absenderadresse existiert:**
1. Custom SMTP in Supabase hinterlegen (Authentication → SMTP Settings).
2. Vorlage „Confirm signup" auf
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` umstellen.
3. Rate Limit anheben (nach dem Einrichten steht es auf 30 Mails/Stunde).
4. Danach greift der PKCE-Pfad, und die manuelle Anmeldung nach der Bestaetigung entfaellt.

**Bis dahin gilt** das Stundenlimit des Supabase-Testversands, und die Zustellung ist
ausdruecklich „best effort". Fuer eine Handvoll Tester reicht das; fuer echte Nutzer nicht.

---

## 2026-08-20 — ADR-035: Authentifizierung in drei Schichten, jede fuer sich ausreichend

**Entscheidung:** Der Zugriffsschutz liegt an drei Stellen, absichtlich mehrfach:

1. **`src/proxy.ts`** (in Next 16 der neue Name fuer Middleware) leitet Nicht-Angemeldete um
   und erneuert das Session-Cookie. Das ist eine **optimistische** Pruefung.
2. **`requireUser()` / `currentUser()`** in `src/lib/auth/session.ts` pruefen unmittelbar an
   den Daten, mit `getClaims()` und `React.cache`.
3. **Row Level Security** in Postgres filtert jede Zeile auf `auth.uid()`.

**Begruendung:** Die Next-Dokumentation sagt ausdruecklich, dass der Proxy nicht die einzige
Verteidigung sein darf — er laeuft auch bei Prefetches und liest nur ein Cookie. Eine
Ebene tiefer sitzt deshalb die echte Pruefung, und darunter die Datenbank, die selbst dann
noch haelt, wenn beide Ebenen darueber umgangen wuerden.

**`getClaims()`, nicht `getSession()`:** `getSession()` gibt zurueck, was im Cookie steht,
ohne es zu pruefen. Serverseitig hiesse das, einem Wert zu vertrauen, den der Client
kontrolliert. `getClaims()` prueft jedes Mal die Signatur.

**Nebenwirkung, die zufaellig eine Luecke schliesst:** Da der Proxy fuer `/api/*` mit 401
antwortet statt mit einer Weiterleitung, ist `/api/ai/classify` nicht mehr offen. Dieser
Endpunkt kostet pro Aufruf Geld; er hat zusaetzlich eine eigene Pruefung im Handler bekommen,
weil die Ausgabenstelle ihre eigene Tuer verdient.

**Volle CSP ab jetzt aktiv.** Der Nonce entsteht pro Anfrage im Proxy. Das erzwingt
dynamisches Rendering — was nichts kostet, weil ab jetzt ohnehin jede Seite Cookies liest.
Gegen einen echten Browser geprueft: hydriert, gestylt, null CSP-Verstoesse.

---

## 2026-08-19 — ADR-034: Kein Service-Key im Deployment, RLS ist das Sicherheitsmodell

**Entscheidung:** Die App nutzt ausschliesslich den oeffentlichen Publishable Key.
`SUPABASE_SECRET_KEY` wird weder in Vercel hinterlegt noch im Code gelesen, solange kein
Vorgang ihn zwingend braucht.

**Begruendung:** Der Secret Key haengt RLS vollstaendig aus. Alle 13 Tabellen haben je vier
Policies, und jede Operation der App geschieht im Namen eines angemeldeten Nutzers — es gibt
derzeit keinen Vorgang, der mehr Rechte braucht. Einen Schluessel zu hinterlegen, der saemtliche
Zugriffsregeln umgeht, ohne dass ihn irgendjemand benutzt, verwandelt einen einzelnen Fehler
in eine vollstaendige Datenpanne. Der sicherste Schluessel ist der, den es im Deployment nicht
gibt.

**Wenn er spaeter gebraucht wird** — etwa fuer einen nutzeruebergreifenden Hintergrundjob —
kommt er bewusst dazu, nur fuer diesen einen Pfad, und mit einem neuen Eintrag hier.

---

## 2026-08-19 — ADR-033: Personal Rules können wieder schwächer werden

**Entscheidung:** Eine Regel startet mit Konfidenz 0,6, steigt mit bestätigender Evidenz in
Schritten von 0,15 auf höchstens 0,9 und sinkt bei gegenteiliger Evidenz genauso. Unter 0,3
wendet der Planer sie nicht mehr an; gelöscht wird sie nicht.

**Begründung:** Die Deckelung unter 1,0 ist Absicht — keine Menge an Wiederholung macht eine
Aussage über einen Menschen sicher. Wichtiger ist die Gegenrichtung: ein Modell, das nur
Gewissheit ansammeln kann, beschreibt nach einigen Monaten zuverlässig den Menschen, der
jemand einmal war. Wer im November keine Zeit am Mittwoch hatte, hat sie im März vielleicht.
Regeln bleiben gespeichert, damit ein späteres Wiederaufleben als Bestätigung erkennbar ist
und nicht als neue Entdeckung.

---

## 2026-08-19 — ADR-032: Eine gelernte Regel darf den Plan nur verkleinern oder verschieben

**Entscheidung:** Personal Rules können Tage entfernen, Einheiten kürzen, Aktionen auf eine
andere Tageszeit legen und einen Bereich ausdünnen. Sie können nichts vergrößern, verlängern
oder häufiger machen. `lighter_domain` fasst ausschließlich die Gesundheitsbasis an, nie die
Zielspur. `avoid_weekday` steuert, wo Einheiten **platziert** werden, und greift nicht in
tägliche Routinen ein. Eine Regel, die den letzten planbaren Tag entfernen würde, wird
übersprungen.

**Begründung:** Damit kann keine gelernte Regel den Plan durch eine Sicherheitsgrenze
schieben — die Richtung „weniger" ist immer sicher. Ohne diese Beschränkung müsste jede
Invariante zusätzlich gegen jede denkbare Regelkombination geprüft werden. Die Beschränkung
auf die Basis bei `lighter_domain` schützt das, wofür der Nutzer gekommen ist: die Zielspur
darf nicht durch Lernen erodieren.

**Nachweis:** Ein Test wendet jede Regel und alle Regeln gemeinsam auf alle 70 Kombinationen
aus Profil und Ziel an; `generatePlan` wirft in keinem Fall.

---

## 2026-08-19 — ADR-031: Die Sicherheit eines Experiments wird am echten Plan geprüft

**Entscheidung:** Bevor ein Experiment vorgeschlagen wird, baut die Engine den Plan, den die
vorgeschlagene Regel tatsächlich erzeugen würde, und lässt die echten Invarianten darüber
urteilen. Ein `PlanInvariantError` verwirft den Vorschlag stillschweigend — der Nutzer erfährt
nie, dass es ihn gab.

**Begründung:** Die Alternative wäre eine zweite Liste von Regeln, die beschreibt, welche
Vorschläge sicher sind. Zwei Listen driften auseinander, und die zweite wird beim Hinzufügen
eines Archetyps vergessen. Den echten Plan zu bauen ist etwas teurer und dafür nicht
umgehbar: Es gibt keinen Weg, auf dem das Annehmen eines Vorschlags zu einem unsicheren Plan
führt.

---

## 2026-08-19 — ADR-030: Ein Muster braucht Kontrast, nicht nur eine hohe Ausfallquote

**Entscheidung:** Eine Abweichung gilt nur dann als Muster, wenn die betroffene Gruppe um
mindestens 30 Prozentpunkte schlechter ist als der Rest derselben Achse. Gibt es nur eine
Gruppe, entsteht nie ein Muster.

**Begründung:** Ohne diese Regel bekommt jemand, der alles verpasst, die Auskunft, sein
Problem sei der Mittwoch. Die ehrliche Lesart ist dort „der Plan ist zu groß", und die
gehört in die Planpflege, nicht in ein Experiment. Eine Diagnose, die aus zu wenig Struktur
zu viel Bedeutung zieht, ist genau die Art von selbstbewusstem Unsinn, gegen die dieses
Produkt gebaut ist.

---

## 2026-08-19 — ADR-029: Die Erkennungsschwellen stehen vor der Implementierung fest

**Entscheidung:** Vor der ersten Zeile Erkennungscode festgelegt und in
`src/lib/adaptive/constants.ts` mit Begründung dokumentiert: mindestens 4 aufgelöste
Instanzen je Gruppe, mindestens 2 tatsächliche Ausfälle, Ausfallquote mindestens 50 %,
Ausfälle verteilt über mindestens 2 verschiedene Kalenderwochen. Experimente laufen 14 Tage
und brauchen mindestens 3 aufgelöste Instanzen; eine Verbesserung unter 15 Prozentpunkten
gilt als „kein Effekt", nicht als Erfolg.

**Begründung:** Dieselbe Disziplin wie ADR-014. Eine Schwelle, die nach dem Blick auf die
Daten gewählt wird, ist keine Schwelle, sondern eine Rechtfertigung. Die
Zwei-Wochen-Bedingung ist die wichtigste Einzelzahl: Sie ist der Grund, warum in Woche 1
garantiert keine Intervention stattfindet, und sie verhindert, dass eine einzelne
anstrengende Woche zu einer dauerhaften Aussage über einen Menschen wird.

**Änderungen an diesen Zahlen** sind erlaubt, aber nur bewusst und mit neuem Eintrag hier —
nie stillschweigend, damit ein Lauf besser aussieht.

---

## 2026-08-19 — ADR-028: Modellwahl ist Konfiguration, Voreinstellung `claude-opus-5`

**Entscheidung:** Zieleinordnung und Vorschläge nutzen getrennt konfigurierbare Modelle
(`AI_CLASSIFY_MODEL`, `AI_SUGGEST_MODEL`), voreingestellt auf `claude-opus-5`. Der
Systemprompt wird zwischengespeichert. Ohne `ANTHROPIC_API_KEY` läuft der deterministische
Adapter, ohne dass der aufrufende Code etwas davon merkt.

**Begründung:** Die beiden Aufgaben haben unterschiedliche Anforderungen. Ein deutschen Satz
in eine von sieben Schubladen zu sortieren, kann auch ein kleines Modell; bei den Vorschlägen
zeigt sich Modellqualität unmittelbar im Produktnutzen. Beides an einen Schalter zu binden
wäre eine unnötige Kopplung.

**Kosten, gerechnet statt geschätzt:** rund 0,02 $ (Haiku 4.5) bis 0,12 $ (Opus 5) pro Nutzer
und Monat. Bei zehn Testern also Cent-Beträge. Die Kostenfrage ist damit keine
Architekturfrage, sondern eine Entscheidung des Product Owners — deshalb eine
Umgebungsvariable und keine Festlegung im Code.

**Wichtiger Nebeneffekt:** Da die App ohne Key vollständig funktioniert, kostet die
Validierungsphase null. Das entspricht der Vorgabe des Playbooks, vor größerem Aufwand zu
validieren.

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
