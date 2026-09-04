# Was noch fehlt, bevor Trace eine offizielle App ist

Stand: 4. September 2026. Grundlage sind drei Dinge: eine Simulation über 7000 generierte
Profile gegen die echte Engine, ein Durchgang durch den Code, und die Recherche zur
Rechtslage in der EU. Alles, was hier als Zahl steht, ist gemessen und nicht geschätzt.

Die Liste ist nach **Blockern**, **wichtig** und **später** sortiert. Ein Blocker ist etwas,
das eine Veröffentlichung rechtlich oder fachlich unmöglich macht — nicht etwas, das ich
gerne hätte.

---

## Bereits erledigt in diesem Durchgang

| Was | Vorher | Nachher |
| --- | ---: | ---: |
| Plan enthält Aktionen vor dem heutigen Tag | 37,1 % | 0 % |
| Plan wird gar nicht gebaut („Plan nicht möglich") | 4,4 % | 0 % |
| Zu viele Karten an einem Tag | 4,0 % | 0,1 % |
| Kontolöschung (Art. 17 DSGVO) | fehlte | in der App |
| Datenexport (Art. 15/20 DSGVO) | fehlte | in der App |
| Impressum und Datenschutzerklärung | fehlten | Entwurf, ohne Anmeldung erreichbar |
| KI-Offenlegung (EU AI Act Art. 50) | fehlte | in der Fragebox |
| Kontrast `faint` auf Weiß | 3,10:1 | 4,93:1 |
| Sichtbarkeit von Button-Rändern | 1,26:1 | 3,30:1 |
| Automatische Prüfung vor dem Merge | keine | GitHub Action |
| Auf dem Homescreen installierbar | nein | Manifest |
| Personalisierung `general_health` | 0,26 | 0,40 |
| Identische Pläne im Fallback | 7,6 % | 1,0 % |
| Fehler-Monitoring | keins | eigene Datenbank |
| Offline lesbar | nein | Service Worker |
| Erinnerungen | keine | Push, stündlicher Versand |

Details in ADR-114 bis ADR-118.

---

## Blocker

### 1. Impressum und Datenschutzerklärung ausfüllen

Beide Seiten existieren jetzt und sind ohne Anmeldung erreichbar, aber die Felder, die nur du
kennst, sind mit `[ausfüllen]` markiert: Name und Anschrift, Kontakt, Registereintrag,
Hoster, KI-Anbieter, Aufsichtsbehörde.

**Ein Impressum mit erfundenen Angaben ist schlechter als keines** — es ist eine falsche
Aussage darüber, wer haftet, und genau der Fall, für den es Abmahnungen gibt. Deshalb habe ich
nichts geraten.

Die Datenschutzerklärung beschreibt inhaltlich, was der Code tatsächlich tut: welche Tabelle
welche Daten hält, wohin sie gehen, wie lange sie bleiben. Das ist der Teil, den ein Generator
nicht liefern kann und der bei Art.-9-Daten entscheidet — eine Einwilligung ist nur wirksam,
wenn sie **informiert** ist, und eine Erklärung, die eine generische App beschreibt,
informiert über diese hier nicht.

**Vor Veröffentlichung anwaltlich prüfen lassen.** Ich bin kein Anwalt, und bei
Gesundheitsdaten ist das keine Floskel.

### 2. Auftragsverarbeitungsverträge (Art. 28 DSGVO)

Für **Supabase** (Hosting und Datenbank) und für den **KI-Anbieter** brauchst du je einen AVV
und die Angabe des Serverstandorts. Liegt ein Anbieter außerhalb der EU, brauchst du zusätzlich
eine Grundlage nach Kapitel V DSGVO (Standardvertragsklauseln oder Angemessenheitsbeschluss).

Ohne AVV ist jede Verarbeitung dort rechtswidrig — unabhängig davon, wie gut die Einwilligung
formuliert ist.

### 3. Datenschutz-Folgenabschätzung (Art. 35 DSGVO) prüfen

Umfangreiche Verarbeitung von Gesundheitsdaten plus Profilbildung („das über Monate
entstehende persönliche Verhaltensmodell") ist ein starker Indikator für eine DSFA-Pflicht.
Das Ergebnis der Prüfung muss dokumentiert werden — auch wenn es „nicht erforderlich" lautet.

### 4. Bestätigungs-Mails funktionieren nicht zuverlässig

Offen als #29, von dir bewusst zurückgestellt. Für einen internen Test in Ordnung; für eine
Veröffentlichung nicht: Supabase' eingebauter Mailversand hat ein niedriges Stundenlimit, und
wer seine Bestätigungsmail nicht bekommt, hat kein Konto. Custom SMTP ist etwa eine Stunde
Arbeit.

---

## Wichtig

### 5. Push-Zustellung ist ungetestet

Datenbank, Berechtigungen und Payload-Form sind geprüft. Ob Apple und Google die Nachricht
tatsächlich zustellen, ist es nicht — dafür braucht es echte VAPID-Schlüssel und ein echtes
Gerät. Einrichten: `npx tsx scripts/vapid-keys.ts`, die vier Variablen setzen, `cron_secret`
in `app_secrets` eintragen, dann auf dem eigenen Handy einschalten und einen Abend abwarten.

### 6. Barrierefreiheit: Kontraste erledigt, der Rest nicht

Die Kontraste sind jetzt gemessen und behoben — `faint` auf Weiß lag bei **3,10:1** gegen die
geforderten 4,5:1, Button-Ränder bei **1,26:1** gegen 3:1. 28 Prüfungen laufen bei jedem
Commit mit.

**Nicht geprüft:** Tastaturbedienung, Fokus-Ringe, Screenreader-Durchlauf, Zoom auf 200 %.
Dafür braucht es einen echten Browser und idealerweise jemanden, der die App so benutzt.

Ob das BFSG dich trifft, hängt an Unternehmensgröße und Angebot — Kleinstunternehmen sind
teilweise ausgenommen. Gehört in die anwaltliche Prüfung.

### 7. Löschen des Ziels ohne Löschen des Kontos

Man kann das Ziel wechseln und das ganze Konto löschen, aber nichts dazwischen.

### 8. Zweitmeinung zum KI-Anbieter

Offen als #38. Vor dem ersten fremden Nutzer musst du wissen, welcher Anbieter läuft, wo er
steht und ob er die Texte zum Training verwendet — die App zeigt das bereits an, aber die
Entscheidung ist nicht getroffen.

---

## Was ausdrücklich in Ordnung ist

Damit die Liste nicht den falschen Eindruck macht:

- **Die Mandantentrennung.** RLS ist das Sicherheitsmodell, gegen zwei echte Nutzer verifiziert,
  und der Service-Key ist bewusst nicht deployed (ADR-034). Das ist die richtige Entscheidung
  und selten so konsequent umgesetzt.
- **Die Sicherheitsgrenzen.** Kalorien-Untergrenze, Ruhetage, Steigerungsraten, Schlafregeln
  sind deterministischer Code mit Tests, nicht Prompt-Anweisungen. Über 7000 generierte Profile
  hält jede einzelne.
- **Die Trennung von KI und Rechnen.** Fällt das Modell aus, funktioniert die App vollständig.
  Das ist die Bedingung dafür, dass es kein Wrapper ist, und sie ist erfüllt.
- **Die Nachvollziehbarkeit.** Jede Aktion trägt ihre Begründung und die Felder, aus denen sie
  stammt. Über 7000 Profile gibt es keine einzige Aktion ohne Begründung.
