'use client'

// The last screen before nothing.
//
// This one replaces the root layout when the root layout itself failed, and
// Next prerenders it on purpose — it has to exist even when the rest of the
// app cannot be produced. That means it can never carry the per-request CSP
// nonce, so its JavaScript will not run.
//
// So it is written to not need any. No retry button, because a button that
// silently does nothing is worse than no button; a plain link instead, which
// browsers have handled without scripts since before any of this existed. No
// styles either: `style-src` allows a nonce, and this page has none, so
// anything decorative would simply be refused. Bare and readable beats pretty
// and broken.
//
// The digest is shown because it is the one thing that makes a report useful.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <html lang="de">
      <body>
        <title>Da ist etwas schiefgegangen</title>
        <main>
          <h1>Da ist etwas schiefgegangen</h1>
          <p>
            Die App konnte diese Seite nicht aufbauen. Dein Plan und deine Antworten sind
            davon nicht betroffen — sie liegen in deinem Konto, nicht in dieser Seite.
          </p>
          <p>
            {/* Deliberately not next/link. Client navigation is exactly what
                must not happen here: the root layout has failed, so the app
                needs to be rebuilt from scratch, and a plain anchor does that
                even with no JavaScript running at all. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Zurück zum Start</a>
          </p>
          {error.digest && (
            <p>
              <small>Fehlerkennung: {error.digest}</small>
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
