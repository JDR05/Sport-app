// Impressum, § 5 DDG.
//
// The Digitale-Dienste-Gesetz replaced the TMG in May 2024 and carries the
// same duty: every commercial online service needs one, reachable in at most
// two taps from any page, permanently available.
//
// The placeholders are deliberate and must not be guessed at. An Impressum
// with an invented address is worse than a missing one — it is a false
// statement about who is legally responsible, and it is exactly the kind of
// thing an Abmahnung is for. Only the Product Owner knows these values.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Impressum · Trace',
  // Nothing here belongs in a search index until it is filled in.
  robots: { index: false, follow: false },
}

/** Everything § 5 DDG requires that only the operator can supply. */
const TODO = '[ausfüllen]'

export default function ImpressumPage() {
  return (
    <main>
      <h1>Impressum</h1>

      <p className="notice">
        Diese Seite ist noch nicht vollständig. Vor der Veröffentlichung müssen alle
        markierten Felder ausgefüllt werden — ein Impressum mit erfundenen Angaben ist
        schlechter als keines.
      </p>

      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {TODO} Name bzw. Firma mit Rechtsform
        <br />
        {TODO} Straße und Hausnummer
        <br />
        {TODO} PLZ und Ort
        <br />
        {TODO} Land
      </p>

      <h2>Vertreten durch</h2>
      <p>{TODO} vertretungsberechtigte Person</p>

      <h2>Kontakt</h2>
      <p>
        Telefon: {TODO}
        <br />
        E-Mail: {TODO}
      </p>

      <h2>Registereintrag</h2>
      <p>
        {TODO} Registergericht und Registernummer — entfällt bei Einzelunternehmen ohne
        Handelsregistereintrag.
      </p>

      <h2>Umsatzsteuer-Identifikationsnummer</h2>
      <p>{TODO} USt-IdNr. gemäß § 27 a UStG — entfällt bei Kleinunternehmerregelung.</p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>{TODO} Name und Anschrift</p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </main>
  )
}
