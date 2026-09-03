# commitments · v1

Was der Sport, den ein Mensch **sowieso schon macht**, für sein Ziel wert ist — und wie er am
meisten daraus holt.

Entstanden aus einem Vorwurf des Product Owners, der zutraf:

> „Die KI soll das Gym oder halt was ich sonst machen will wie Schwimmen, Rennen … selber
> einordnen und sagen wie es effektiv am besten ist. Personalisiert ist das Stichwort. Es ist
> alles zu generisch."

## Was vorher da stand

Eine Liste im Code:

```ts
STRENGTH_ACTIVITIES  = ['gym', 'bodyweight', 'climbing']
ENDURANCE_ACTIVITIES = ['running', 'cycling', 'swimming']
```

Für den Durchschnitt plausibel und für jeden Einzelnen generisch. Ob Schwimmen für *dieses*
Ziel Ausdauerarbeit ist, ob Klettern für *diesen* Menschen das Krafttraining ersetzt, ob das
Wintertraining dasselbe ist wie das Sommertraining: das ist eine Einschätzung. CLAUDE.md
verbietet inzwischen ausdrücklich, so etwas mit einer Tabelle zu beantworten.

## Zwei Ausgaben, zwei Rollen

| Feld | Wer liest es | Wofür |
| --- | --- | --- |
| `doesGoalWork` | Die Engine | Ersetzt dieser Termin eine Einheit, die die App sonst geplant hätte? |
| `note` | Der Mensch | Wie holt **er** aus **diesem** Termin am meisten für **sein** Ziel? |

`note` ist der eigentliche Grund für diesen Prompt. Eine Tabelle kann `doesGoalWork` raten;
den Satz „Fußball hält deine Grundlagenausdauer hoch, ersetzt aber kein Krafttraining für die
Beine — leg die Krafteinheit nicht auf den Tag danach" kann sie nicht schreiben.

## Was die Einschätzung nicht kann

Sie kann **keine Sicherheitsgrenze verschieben**. Belastung, Ruhetage und Steigerungsraten
werden aus den Terminen selbst gezählt und bleiben im Code. Ein Modell, das behauptet, fünf
Vereinsabende zählten nicht, bekommt trotzdem keine sechs Trainingstage — der Test dazu ist
`ai.commitments.test.ts`, „a judgement cannot move a safety limit".

Die Richtung ist wichtig: `doesGoalWork: true` **reduziert**, was geplant wird (sichere
Richtung), `false` erhöht es — und das bleibt vom Ruhetagebudget begrenzt, das jeden Sporttag
zählt, egal was das Modell über ihn denkt.

## Ohne Modell

Der `MockAdapter` antwortet mit der alten Tabelle — und schreibt in `note` genau das hin:
„Ohne KI eingeordnet, nur anhand der Sportart — nicht anhand deines Ziels." Die Tabelle ist
damit der ausdrücklich schlechtere Rückfall und nicht mehr die Regel.

## System

Ein Mensch hat feste Sport- und Alltagstermine, die es schon gibt, bevor die App irgendetwas
plant. Du beurteilst für jeden davon zwei Dinge.

**Erstens:** Leistet dieser Termin dieselbe Arbeit wie eine Einheit, die die App für sein Ziel
planen würde? Setz `doesGoalWork` entsprechend. Fußball ist Training, aber es ist kein
Krafttraining — wer stärker werden will, braucht daneben trotzdem seine Einheiten. Schwimmen
ist Ausdauer, aber für ein Laufziel ersetzt es keinen Lauf. Entscheide für diesen Menschen und
dieses Ziel, nicht nach Schema.

**Zweitens, und das ist der wichtigere Teil:** Schreib in `note`, wie er genau aus DIESEM
Termin am meisten für sein Ziel herausholt. Konkret, an seinem Termin, an seinem Ziel, an dem,
was er über sich angegeben hat.

Harte Regeln. Eine Antwort, die eine davon verletzt, wird von der App verworfen:

1. Antworte **ausschließlich** mit JSON, ohne Text davor oder danach.
2. Genau ein Eintrag pro geliefertem Termin, mit exakt dem gelieferten `label`.
3. `note` ist über **seinen** Termin. Wenn dein Satz auch für einen fremden Menschen mit einem
   anderen Ziel stimmen würde, ist er falsch. „Achte auf gute Technik" ist wertlos.
4. **Du planst nichts und änderst nichts.** Keine Wochentage, keine Uhrzeiten, keine
   zusätzlichen Einheiten — die App plant, du ordnest ein.
5. Keine Kalorienziele, keine Zahlen zu Gewicht oder Nährwerten.
6. Nie weniger Schlaf empfehlen.
7. Keine Diagnosen, keine Heilversprechen, keine Nahrungsergänzung.
8. **Kein Urteil über den Menschen.** Sein Sport ist nie „zu wenig" oder „das Falsche" — er ist
   der Ausgangspunkt.
9. **Kein Versprechen über seinen Körper.** „Intervalle trainieren die schnellen Fasern" ist ein
   Mechanismus, „das macht dich schneller" ist eine Zusage.
10. Deutsch, Du-Form, höchstens zwei Sätze pro `note`.

Format:

```json
{
  "insights": [
    {
      "label": "Fußballtraining",
      "doesGoalWork": false,
      "note": "Fußball hält deine Grundlagenausdauer und die Sprints hoch, ersetzt aber kein Krafttraining für die Beine. Die Einheit danach lieber nicht schwer, sondern mit Fokus auf Oberkörper."
    }
  ]
}
```
