// Datenschutzerklärung, Art. 13/14 DSGVO.
//
// Written from what the code actually does rather than from a generator. Every
// category below corresponds to a real table, every recipient to a real
// outbound call, and every retention statement to real behaviour — the export
// and the deletion described here are `src/lib/db/account.ts`.
//
// That matters more here than usual. This app processes health data, which
// Article 9 protects most strictly: the lawful basis is the person's explicit
// consent, and consent is only valid if it is *informed*. A privacy policy that
// describes a generic app rather than this one does not inform anybody, and the
// consent collected on the back of it is worth nothing.
//
// What is still marked [ausfüllen] is what only the operator knows: who they
// are, and which hosting contracts they have signed. Those must not be guessed.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Datenschutz · Trace',
  robots: { index: false, follow: false },
}

const TODO = '[ausfüllen]'

export default function DatenschutzPage() {
  return (
    <main>
      <h1>Datenschutzerklärung</h1>

      <p className="notice">
        Entwurf. Die inhaltlichen Angaben beschreiben, was die App tatsächlich tut. Vor der
        Veröffentlichung müssen die markierten Felder ausgefüllt und die Erklärung
        rechtlich geprüft werden.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {TODO} Name, Anschrift und E-Mail der verantwortlichen Stelle im Sinne von Art. 4
        Nr. 7 DSGVO. {TODO} Angabe, ob ein Datenschutzbeauftragter benannt ist.
      </p>

      <h2>2. Welche Daten verarbeitet werden</h2>
      <p>
        Trace verarbeitet <strong>Gesundheitsdaten</strong> im Sinne von Art. 9 Abs. 1 DSGVO.
        Das ist keine Formalie: es ist die am strengsten geschützte Datenkategorie, und die
        Rechtsgrundlage dafür ist ausschließlich deine ausdrückliche Einwilligung nach Art. 9
        Abs. 2 lit. a DSGVO.
      </p>
      <ul>
        <li>
          <strong>Konto:</strong> E-Mail-Adresse und Zeitpunkt der Registrierung.
        </li>
        <li>
          <strong>Profil:</strong> Geburtsjahr, Körpergröße, Gewicht, Geschlecht bei Geburt,
          Angaben zu Sport, Ernährung, Schlaf und Konzentration.
        </li>
        <li>
          <strong>Ziel und Plan:</strong> dein frei formuliertes Ziel, Zielwerte, Zeitfenster,
          feste Termine, ausgeschlossene Tage, der erzeugte Wochenplan und die Begründung zu
          jeder Aktion.
        </li>
        <li>
          <strong>Verlauf:</strong> ob eine geplante Aktion erledigt, verschoben, nicht
          geschafft oder unpassend war, samt Grund und Notiz.
        </li>
        <li>
          <strong>Tages-Check-in:</strong> Energie, Stimmung, Stress, Schlafdauer,
          Ernährungsqualität, Muskelkater, Alkohol, später Koffein sowie freie Notizen.
        </li>
        <li>
          <strong>Messwerte:</strong> zum Beispiel Gewicht oder Laufdistanz, mit Zeitpunkt.
        </li>
        <li>
          <strong>Abgeleitetes:</strong> erkannte Muster, Experimente und persönliche Regeln,
          die die App aus dem Verlauf berechnet.
        </li>
      </ul>

      <h2>3. Zweck und Rechtsgrundlage</h2>
      <ul>
        <li>
          <strong>Konto und Anmeldung</strong> — Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des
          Nutzungsvertrags).
        </li>
        <li>
          <strong>Gesundheitsbezogene Angaben, Plan, Check-ins, Messwerte</strong> — Art. 9
          Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung). Ohne diese Angaben kann kein Plan
          erstellt werden; die Einwilligung ist freiwillig und jederzeit widerrufbar.
        </li>
        <li>
          <strong>Übermittlung an ein KI-Modell</strong> — gesonderte, ausdrückliche
          Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO, die du in der App einzeln erteilst und
          jederzeit zurücknehmen kannst. Ohne sie funktioniert die App vollständig; der Plan
          wird dann deterministisch berechnet.
        </li>
      </ul>
      <p>
        Ein Widerruf wirkt für die Zukunft und berührt nicht die Rechtmäßigkeit der bis dahin
        erfolgten Verarbeitung.
      </p>

      <h2>4. Empfänger</h2>
      <ul>
        <li>
          <strong>Hosting und Datenbank:</strong> {TODO} Anbieter, Serverstandort und Verweis
          auf den Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.
        </li>
        <li>
          <strong>KI-Anbieter:</strong> {TODO} konkreter Anbieter, Serverstandort,
          Auftragsverarbeitungsvertrag und — falls außerhalb der EU — die Grundlage der
          Übermittlung nach Kapitel V DSGVO. Übermittelt werden dein Ziel, dein Tagesablauf
          und die für die Planung nötigen Profilangaben; die App zeigt vor der Einwilligung
          an, welcher Anbieter das ist und ob er die Texte zum Training eigener Modelle
          verwenden darf.
        </li>
      </ul>
      <p>
        Es findet keine Weitergabe zu Werbezwecken statt, es werden keine Daten verkauft, und
        es sind keine Tracking- oder Analysedienste Dritter eingebunden.
      </p>

      <h2>5. Speicherdauer</h2>
      <p>
        Deine Daten werden gespeichert, solange dein Konto besteht. Löschst du dein Konto,
        werden sie <strong>sofort und vollständig</strong> gelöscht — es gibt keine
        Aufbewahrungsfrist, keine Kopie und kein Zeitfenster, in dem sich das rückgängig
        machen ließe. {TODO} Angabe zur Aufbewahrungsdauer von Server-Logs beim Hoster.
      </p>

      <h2>6. Deine Rechte</h2>
      <p>Dir stehen zu: Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21),
        sowie das Recht, eine erteilte Einwilligung jederzeit zu widerrufen.
      </p>
      <p>
        Zwei davon übst du direkt in der App aus, ohne uns fragen zu müssen: unter{' '}
        <strong>Profil → Deine Daten</strong> lädst du eine vollständige, maschinenlesbare
        Kopie herunter und löschst dort auch dein Konto samt aller Daten.
      </p>
      <p>
        Du hast außerdem das Recht auf Beschwerde bei einer Aufsichtsbehörde. Zuständig ist
        die Behörde deines Wohnorts oder {TODO} zuständige Aufsichtsbehörde des
        Verantwortlichen.
      </p>

      <h2>7. Automatisierte Entscheidungen</h2>
      <p>
        Die App erzeugt Vorschläge — einen Wochenplan, Hinweise, Experimente. Sie trifft
        keine Entscheidungen mit rechtlicher Wirkung oder ähnlich erheblicher Beeinträchtigung
        im Sinne von Art. 22 DSGVO. Du entscheidest selbst, ob du einer Empfehlung folgst,
        und kannst jede Aktion ablehnen oder ändern.
      </p>

      <h2>8. Kein Medizinprodukt</h2>
      <p>
        Trace ist eine Wellness- und Gewohnheitsanwendung. Sie ist{' '}
        <strong>nicht dazu bestimmt</strong>, Krankheiten zu erkennen, zu verhüten, zu
        überwachen, zu behandeln oder zu lindern, und ist damit kein Medizinprodukt im Sinne
        der Verordnung (EU) 2017/745. Sie ersetzt keine ärztliche Beratung, Diagnose oder
        Behandlung. Bei Beschwerden, bestehenden Erkrankungen, in der Schwangerschaft oder
        bei Medikamenteneinnahme sprich bitte mit einer Ärztin oder einem Arzt, bevor du
        etwas an Ernährung oder Training änderst.
      </p>

      <h2>9. Datenschutz-Folgenabschätzung</h2>
      <p>
        {TODO} Für die umfangreiche Verarbeitung von Gesundheitsdaten nach Art. 9 DSGVO ist
        zu prüfen und zu dokumentieren, ob eine Datenschutz-Folgenabschätzung nach Art. 35
        DSGVO erforderlich ist.
      </p>

      <h2>10. Änderungen</h2>
      <p>
        Ändert sich, wie die App Daten verarbeitet, wird diese Erklärung angepasst. Betrifft
        die Änderung den Umfang einer Einwilligung, holen wir sie neu ein, statt sie
        stillschweigend zu erweitern.
      </p>

      <p className="updated">Stand: {TODO} Datum der letzten Änderung</p>
    </main>
  )
}
