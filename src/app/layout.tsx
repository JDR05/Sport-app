import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Persönlicher Plan',
  description:
    'Du sagst, wer du werden willst. Die App zeigt dir, wie du dorthin kommst – und lernt dabei, was für dich tatsächlich funktioniert.',
}

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
