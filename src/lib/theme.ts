// The appearance setting.
//
// Kept in a cookie rather than in localStorage, and that is the whole point:
// the server reads it while rendering and stamps it on <html>, so the first
// frame is already the right colour. Reading it in the browser instead means a
// dark-mode user gets one white frame on every navigation, which is exactly the
// flash people notice and nobody can explain.
//
// Not user data, so it is not in the database either: it belongs to the device,
// and a phone on dark and a laptop on light is a reasonable thing to want.

export const THEME_COOKIE = 'cadence.theme'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && (THEMES as readonly string[]).includes(value)
}

/**
 * What to put on <html>. 'system' deliberately stamps nothing — the stylesheet
 * already follows the device, and an attribute would just freeze whatever the
 * device happened to be at render time.
 */
export function themeAttribute(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme
}

/** A year: long enough that nobody re-picks it, short enough to expire. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
