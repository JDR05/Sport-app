// What the app shows with no network at all.
//
// Cached by the service worker at install, so it is the one screen guaranteed
// to exist offline. Deliberately plain: it is reached when nothing else can be
// fetched, so anything clever here is something else that can fail.

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Offline · Trace' }

export default function OfflinePage() {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-16">
      <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
        Keine Verbindung
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Dein Plan und deine Einträge sind gespeichert — sie liegen in deinem Konto und nicht
        auf diesem Gerät. Sobald du wieder online bist, ist alles da.
      </p>
      {/* A plain anchor, not next/link: client navigation needs the app's
          JavaScript, and this page exists for the case where fetching it failed. */}
      <a
        href="/today"
        className="mt-6 inline-flex rounded-[2px] border border-line-strong px-4 py-3 text-sm font-semibold text-ink"
      >
        Nochmal versuchen
      </a>
    </div>
  )
}
