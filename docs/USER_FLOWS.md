# User Flows

## 1. Onboarding (gestaffelt)

Grundsatz: nur die Fragen sofort stellen, ohne die kein sinnvoller Plan entsteht. Alles
Weitere wird später erfragt, wenn es gebraucht wird.

**Stufe 1 — notwendig für den ersten Plan**
- Ziel und Zeitraum („5 kg abnehmen", Zielzeitpunkt)
- Basis: Alter, Größe, aktuelles Gewicht, Geschlecht (für die Grundumsatzberechnung)
- Alltag: Aufsteh- und Schlafzeit, Arbeit/Studium, freie Zeitfenster, Wochenendstruktur
- Sport: Sportarten, mögliche Trainingshäufigkeit, Dauer, Equipment, Leistungsstand
- Ernährung: Vorlieben, Kochmöglichkeiten, verfügbare Zeit, Essenszeiten
- Ausschlüsse: was der Nutzer ausdrücklich **nicht** tun möchte

**Stufe 2 — später erfragt**
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

Der Statuswert „nicht relevant" ist wichtig: er unterscheidet „ich wollte nicht" von „das
passte objektiv nicht in meinen Tag" und verhindert, dass die Adaptive Engine aus einem
Planungsfehler ein Verhaltensmuster ableitet.

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
| Widersprüchliche Angaben | Konflikt wird benannt, konservative Auflösung |
| Sehr viele ausgelassene Tage | Kein Schuldnarrativ; Plan verkleinern statt wiederholen |
| Zielkonflikt | Im MVP verhindert (nur ein aktives Ziel) |
| Unrealistisches Ziel | Zeitraum wird auf sichere Rate gedeckelt, mit Erklärung |
| Lange Inaktivität | Sanfter Neustart |
