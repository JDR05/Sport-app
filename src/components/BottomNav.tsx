'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Five destinations, as in the product plan. The playbook has its own route but
// is reached from Insights: a sixth tab would crowd the bar on a phone, which is
// exactly the kind of clutter the brief rules out.
const TABS = [
  { href: '/today', label: 'Heute' },
  { href: '/plan', label: 'Plan' },
  { href: '/progress', label: 'Fortschritt' },
  { href: '/insights', label: 'Insights' },
  { href: '/profile', label: 'Profil' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-3 text-[11px] font-medium transition ${
                  active ? 'text-accent' : 'text-faint'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1 w-6 rounded-full transition ${active ? 'bg-accent' : 'bg-transparent'}`}
                />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
