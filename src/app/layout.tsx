import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PlanProvider } from '@/components/PlanProvider'

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
      <body className="min-h-full">
        <PlanProvider>{children}</PlanProvider>
      </body>
    </html>
  )
}
