// The app's destinations, in one place.
//
// Both the bottom bar and the header label read from here, so a renamed screen
// cannot be called one thing at the top and another at the bottom.

import { IconInsights, IconProfile, IconToday } from '@/components/NavIcons'

// Three destinations, down from five, and the two that went were not carrying
// their own weight.
//
// Plan was seven rows, each a link back to Heute — the week strip on Heute
// already goes to any day in one tap, so it was a second door to one room.
// Fortschritt and Insights answered one question between them: how much of the
// plan happened, and what that means. Splitting that across two tabs meant
// checking both to find out whether the app had anything to say.
//
// What is left is what a person actually navigates between: the day they are
// in, what the app has worked out, and their own settings.
export const TABS = [
  { href: '/today', label: 'Heute', Icon: IconToday },
  { href: '/muster', label: 'Muster', Icon: IconInsights },
  { href: '/profile', label: 'Profil', Icon: IconProfile },
] as const

/** The label of the destination a path belongs to, or undefined for the rest. */
export function screenLabel(pathname: string): string | undefined {
  return TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.label
}
