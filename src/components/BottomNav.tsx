'use client'

// The bottom bar.
//
// Two things make a tap here feel instant, and neither is about the data.
//
// The first is that the tapped tab colours immediately. `usePathname()` only
// changes once the navigation has *committed*, so a bar that reads its active
// state from it alone leaves the tapped tab grey for the whole round trip —
// the finger goes down and nothing at all happens. useLinkStatus knows the tap
// happened before the server does.
//
// The second is `loading.tsx` in the app group, which paints the shape of the
// destination while the server works. That is the route-level fix the Next
// docs prefer, and this is the inline hint that sits on top of it.

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { TABS } from '@/components/tabs'

type Tab = (typeof TABS)[number]

/**
 * True from the moment the tab is tapped until the new screen commits.
 *
 * Has to live inside the Link — the hook reads the nearest one above it.
 */
function TabContent({
  label,
  Icon,
  active,
}: {
  label: string
  Icon: Tab['Icon']
  active: boolean
}) {
  const { pending } = useLinkStatus()
  const lit = active || pending

  return (
    <span
      className={`relative flex w-full flex-col items-center gap-1 transition-colors duration-100 ${
        lit ? 'text-accent' : 'text-faint'
      }`}
    >
      {/* A rule above the live tab, not a rounded highlight behind it. The bar
          reads as a scale with a position marked on it. */}
      <span
        aria-hidden
        className={`absolute -top-2.5 h-[2px] w-7 ${lit ? 'bg-accent' : 'bg-transparent'}`}
      />
      <Icon />
      <span className="label text-[9px] font-semibold">{label}</span>
    </span>
  )
}

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
                className="flex flex-col items-center px-1 pb-3 pt-3"
              >
                <TabContent label={tab.label} Icon={tab.Icon} active={active} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
