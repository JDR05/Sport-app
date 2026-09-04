// The legal pages, outside the signed-in area.
//
// Deliberately its own route group. § 5 DDG wants an Impressum "leicht
// erkennbar, unmittelbar erreichbar und ständig verfügbar", which in practice
// means reachable without signing in — somebody who has not created an account
// and somebody deciding whether to must both be able to read it. Putting these
// under `(app)` would have hidden them behind `requireUser`.

import Link from 'next/link'
import { LogoMark } from '@/components/Logo'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-6">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <LogoMark size={17} className="shrink-0 text-ink" />
        <span className="label text-[12px] font-semibold text-ink">Trace</span>
      </Link>

      <div className="legal">{children}</div>

      <nav className="mt-12 flex gap-4 border-t border-line pt-4 text-xs text-faint">
        <Link href="/impressum" className="underline decoration-line underline-offset-4">
          Impressum
        </Link>
        <Link href="/datenschutz" className="underline decoration-line underline-offset-4">
          Datenschutz
        </Link>
        <Link href="/" className="underline decoration-line underline-offset-4">
          Zur App
        </Link>
      </nav>
    </div>
  )
}
