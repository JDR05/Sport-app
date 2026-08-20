// The app's destinations, in one place.
//
// Both the bottom bar and the header label read from here, so a renamed screen
// cannot be called one thing at the top and another at the bottom.

import {
  IconInsights, IconPlan, IconProfile, IconProgress, IconToday,
} from '@/components/NavIcons'

// Five destinations, as in the product plan. The playbook has its own route but
// is reached from Insights: a sixth tab would crowd the bar on a phone, which is
// exactly the kind of clutter the brief rules out.
export const TABS = [
  { href: '/today', label: 'Heute', Icon: IconToday },
  { href: '/plan', label: 'Plan', Icon: IconPlan },
  { href: '/progress', label: 'Fortschritt', Icon: IconProgress },
  { href: '/insights', label: 'Insights', Icon: IconInsights },
  { href: '/profile', label: 'Profil', Icon: IconProfile },
] as const

/** The label of the destination a path belongs to, or undefined for the rest. */
export function screenLabel(pathname: string): string | undefined {
  return TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.label
}
