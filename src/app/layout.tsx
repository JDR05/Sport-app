import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  // A template rather than a fixed string, so every screen says where you are
  // without each page repeating the brand.
  title: { default: 'Cadence', template: '%s · Cadence' },
  description:
    'Du sagst, wer du werden willst. Cadence zeigt dir, wie du dorthin kommst – und lernt dabei, was für dich tatsächlich funktioniert.',
  applicationName: 'Cadence',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
  // An installed app should open like an app, not like a browser tab.
  appleWebApp: { capable: true, title: 'Cadence', statusBarStyle: 'default' },
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
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#131211' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="de" className={`${inter.variable} h-full`}>
      {/* No plan provider here: the login and sign-up screens have no plan,
          and the onboarding is what creates one. It wraps the app group only. */}
      <body className="min-h-full">{children}</body>
    </html>
  )
}
