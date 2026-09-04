// What makes this a program on the homescreen rather than a bookmark.
//
// Without a manifest, "zum Homescreen hinzufügen" produces a browser tab with a
// URL bar. That matters beyond appearance: an installed PWA is the only way to
// get web push on iOS, and push is the largest single lever on whether this app
// is used at all — the check-in is where the behaviour model gets its data, and
// somebody who does not think of the app in the evening records nothing.
//
// A route rather than a static file, so the values come from the same place as
// the rest of the app's identity and cannot drift from `layout.tsx`.

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trace',
    short_name: 'Trace',
    description:
      'Dein Ziel, dein Alltag, dein Plan — und was tatsächlich bei dir funktioniert.',
    // `standalone`, not `fullscreen`: this app is used one-handed in short
    // bursts and the system clock and battery are worth more than the twenty
    // pixels they cost.
    display: 'standalone',
    start_url: '/today',
    // A scope of '/' rather than '/today', or every link out of Heute — the
    // Impressum included — would open in a browser window instead.
    scope: '/',
    orientation: 'portrait',
    lang: 'de',
    dir: 'ltr',
    // Matches the light theme's paper. The splash screen is the first thing
    // somebody sees after tapping the icon, and a mismatched one reads as a
    // flash of the wrong app.
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['health', 'lifestyle', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      // `maskable` is what stops Android drawing the icon inside a white
      // circle on a dark launcher.
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
