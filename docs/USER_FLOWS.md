# User Flows

## 1. Onboarding (gestaffelt)

Grundsatz: nur die Fragen sofort stellen, ohne die kein sinnvoller Plan entsteht. Alles
Weitere wird später erfragt, wenn es gebraucht wird.

Welche Felder in Stufe 1 gehören, ist **nicht Geschmackssache, sondern gemessen**:
`tests/engine.fields.test.ts` variiert jedes Feld einzeln und prüft, ob sich der Plan
tatsächlich ändert. Was nichts verändert, wird nicht gefragt.

**Stufe 1 — notwendig für den ersten Plan** (alle 20 nachweislich planwirksam)
- Ziel: Titel und Zieldatum
- Zielmetrik: aktuelles Gewicht, Zielgewicht
- Basis: Geburtsjahr, Größe, Geschlecht (für die Grundumsatzberechnung)
- Alltag: Arbeits-/Studienrhythmus, freie Zeitfenster
- Sport: bevorzugte Aktivitäten, Trainingshäufigkeit, Einheitsdauer, Equipment,
  Leistungsstand
- Ernährung: Kochhäufigkeit, verfügbare Kochzeit, Auswärts-Essen pro Woche,
  Ernährungsform, Mahlzeiten pro Tag
- Ausschlüsse: nicht gewünschte Aktivitäten, blockierte Wochentage

**Stufe 2 — später erfragt**
- Aufsteh- und Schlafzeit, Wochenendstruktur, Lebenssituation. Diese vier standen
  ursprünglich in Stufe 1, verändern den ersten Plan aber nachweislich nicht — die freien
  Zeitfenster und der Arbeitsrhythmus decken dieselbe Information bereits ab. Sie werden
  später erhoben, wo sie zählen (Schlaf für Recovery, Lebenssituation als Kontext).
- Budget, detaillierte Präferenzen, Motivationsstil, Bildschirmzeit, Routinen

**Abbruch:** Bricht der Nutzer nach Stufe 1 ab, muss ein Plan trotzdem erzeugbar sein.
Fehlende Angaben führen zu konservativen Annahmen, die im Plan als Annahme gekennzeichnet
werden — nicht zu einer Blockade.

## 2. Erster Plan

1. Engine erzeugt aus Profil, Ziel, Constraints und Schedule eine Wochenstrategie.
2. Daraus entstehen konkrete Tagesaktionen.
3. Der Plan wird als **Start-Hypothese** präsentiert, mit kurzer Begründung je Baustein.
4. Der Nutzer nimmt ihn an oder passt einzelne Punkte an.

Die Annahme des ersten Plans ist eine Schlüsselmetrik — wird er nicht angenommen, ist die
Personalisierung zu schwach.

## 3. Täglicher Loop

```
Today öffnen → Top-Ziel und 3–5 Aktionen sehen → ausführen
   → Status setzen (erledigt / verschoben / nicht geschafft / nicht relevant)
   → optional kurzer Check-in (Energie, Notiz)
```

Die Aktionen kommen aus drei Domains: Ernährung, Training, Bewegung.

**Der Tagesabschluss muss in unter 15 Sekunden möglich sein** — ein Sammel-Prompt mit
vorausgefüllten Werten, direkt auf Today, ohne Navigation. Das ist keine UX-Feinheit: der
MVP hat keine Wearables, also hängt die gesamte Adaptive Engine an diesen Eingaben.

Drei Statuswerte dürfen nicht zusammenfallen:

- **nicht geschafft** (`missed`) — Verhaltenssignal, geht in die Mustererkennung ein.
- **nicht relevant** (`not_relevant`) — Planungsfehler. Unterscheidet „ich wollte nicht" von
  „das passte objektiv nicht in meinen Tag".
- **unbekannt** (`unknown`) — der Nutzer hat nichts eingetragen. Fehlende Information, kein
  Versagen, und **niemals** Grundlage einer Hypothese.

## 4. Messung

Gewicht bzw. Zielmetrik wird in unregelmäßigen Abständen erfasst. Die Engine arbeitet mit
Trends über Zeitfenster, nie mit Einzelwerten — Tagesschwankungen dürfen keine
Plananpassung auslösen.

## 5. Wochenanalyse

Am Wochenende: Plan gegen Realität, Erfüllungsquote je Bereich und je Wochentag,
Zielmetrik-Trend. Ergebnis sind Insights, die auf konkrete Datenpunkte verweisen.

## 6. Experiment

```
wiederkehrende Abweichung erkannt
   → Hypothese formulieren ("Mittwoch kollidiert mit deinem Alltag")
   → EIN Experiment vorschlagen ("Training auf Donnerstag verschieben")
   → Nutzer nimmt an oder lehnt ab
   → definierte Laufzeit
   → Ergebnis gegen Baseline messen
   → behalten / verwerfen / weiter testen
   → bei Erfolg: Personal Rule speichern, Plan aktualisieren
```

Der Nutzer sieht immer, **warum** ein Experiment vorgeschlagen wurde.

## 7. Zieländerung

Der Nutzer kann Ziel, Zeitraum oder Constraints ändern. Bestehende Personal Rules bleiben
erhalten — sie beschreiben die Person, nicht das Ziel. Laufende Experimente werden beendet
und als abgebrochen markiert, nicht als gescheitert.

## 8. Rückkehr nach Inaktivität

Nach längerer Inaktivität wird der Nutzer nicht mit Rückständen konfrontiert. Der Plan wird
neu aufgesetzt, ausgelassene Tage werden nicht als Schuld dargestellt. Sie fließen als
Kontext in die Analyse ein, lösen aber allein keine Hypothese aus.

## Edge Cases, die funktionieren müssen

| Fall | Erwartetes Verhalten |
| --- | --- |
| Onboarding-Abbruch | Plan mit konservativen Annahmen, Annahmen sichtbar |
| Fehlende Messdaten | Progress zeigt „noch keine Daten", keine erfundenen Trends |
| Mehrere Tage ohne Eingabe | Status `unknown`, keine Hypothese, kein Mahnen |
| Widersprüchliche Angaben | Konflikt wird benannt, konservative Auflösung |
| Sehr viele ausgelassene Tage | Kein Schuldnarrativ; Plan verkleinern statt wiederholen |
| Zielkonflikt | Im MVP verhindert (nur ein aktives Ziel) |
| Unrealistisches Ziel | Deckelung als Zusage mit Datum („5 kg bis 14. November"), nicht als Absage |
| Lange Inaktivität | Sanfter Neustart |
