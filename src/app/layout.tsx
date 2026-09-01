import type { Metadata, Viewport } from 'next'
import { Barlow, IBM_Plex_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { isTheme, THEME_COOKIE, themeAttribute } from '@/lib/theme'
import './globals.css'

/*
 * Two faces, two jobs, and that separation is the point.
 *
 * Barlow says things: a slightly narrow grotesk with squared terminals, which
 * sets a phone column tighter than Inter without reading as condensed. Plex
 * Mono measures them — every time, rate, count and date in the app is set in
 * it. One typeface doing every job is most of what made the old surface look
 * generated; two with clearly different work is what makes this one read as
 * an instrument.
 */
const ui = Barlow({
  variable: '--font-ui',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const mono = IBM_Plex_Mono({
  variable: '--font-mono-raw',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  // A template rather than a fixed string, so every screen says where you are
  // without each page repeating the brand.
  title: { default: 'Trace', template: '%s · Trace' },
  description:
    'Du sagst, wer du werden willst. Trace zeigt dir, wie du dorthin kommst – und lernt dabei, was für dich tatsächlich funktioniert.',
  applicationName: 'Trace',
  manifest: '/manifest.webmanifest',
  // No `icons` entry on purpose: app/icon.svg and app/apple-icon.png are file
  // conventions Next picks up by itself, and declaring icons here would
  // override them — which is how the app ends up shipping a link to a file
  // that was deleted.
  // An installed app should open like an app, not like a browser tab.
  appleWebApp: { capable: true, title: 'Trace', statusBarStyle: 'default' },
}

/**
 * Nothing in this app can be built before the request exists.
 *
 * Every screen is either behind a session or part of signing in, and the CSP
 * stamps a fresh nonce per request. A prerendered page cannot carry that nonce,
 * and under 'strict-dynamic' the browser then refuses every script on it — the
 * page renders, accepts typing, and never hydrates. Declaring it here covers
 * the built-in shells (404, global error) too, which no per-page export
 * reaches. scripts/check-nonces.mjs fails the build if one slips through.
 */
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1013' },
  ],
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Read here rather than in the browser: the attribute has to be on the very
  // first frame, or someone on dark mode sees a white flash on every
  // navigation. 'system' stamps nothing and lets the stylesheet decide.
  const stored = (await cookies()).get(THEME_COOKIE)?.value
  const theme = themeAttribute(isTheme(stored) ? stored : 'system')

  return (
    <html lang="de" data-theme={theme} className={`${ui.variable} ${mono.variable} h-full`}>
      {/* No plan provider here: the login and sign-up screens have no plan,
          and the onboarding is what creates one. It wraps the app group only. */}
      <body className="min-h-full">{children}</body>
    </html>
  )
}
