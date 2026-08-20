'use client'

// Choosing how the app looks.
//
// Three states rather than a switch, because "follow my phone" is the one most
// people want and a two-way toggle cannot express it.
//
// The write goes to a cookie so the server can render the right colours on the
// next request, and the attribute is set on <html> straight away so the change
// is instant rather than waiting for a round trip.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChoiceGroup } from '@/components/form'
import {
  THEME_COOKIE, THEME_COOKIE_MAX_AGE, themeAttribute, type Theme,
} from '@/lib/theme'

const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
]

export function ThemeSetting({ current }: { current: Theme }) {
  const [theme, setTheme] = useState<Theme>(current)
  const router = useRouter()

  function choose(next: Theme | null) {
    if (next === null) return
    setTheme(next)

    const attribute = themeAttribute(next)
    if (attribute) document.documentElement.dataset.theme = attribute
    else delete document.documentElement.dataset.theme

    // SameSite=Lax is enough: this is a display preference, and it has to
    // survive a normal navigation from an email link.
    document.cookie =
      `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`
    router.refresh()
  }

  return <ChoiceGroup options={OPTIONS} value={theme} onChange={choose} columns={3} />
}
