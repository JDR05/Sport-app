import type { Metadata } from 'next'
import { Screen, ScreenTitle } from '@/components/ui'
import { Wordmark } from '@/components/Logo'
import { AuthForm } from '@/components/AuthForm'
import { signIn } from '@/app/auth/actions'

export const metadata: Metadata = { title: 'Anmelden' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = typeof params.weiter === 'string' ? params.weiter : undefined
  const linkBroken = params.fehler === 'link'
  const justConfirmed = params.bestaetigt === '1'

  return (
    <Screen>
      <div className="mb-8 mt-2">
        <Wordmark />
      </div>
      <ScreenTitle title="Willkommen zurück" subtitle="Dein Plan wartet." />

      {justConfirmed && (
        <p className="rounded-[2px] bg-accent-soft px-3 py-2.5 text-sm text-ink">
          E-Mail bestätigt. Melde dich jetzt einmal an — danach bleibst du angemeldet.
        </p>
      )}

      {linkBroken && (
        <p role="alert" className="rounded-[2px] bg-warn-soft px-3 py-2.5 text-sm text-ink">
          Der Bestätigungslink war ungültig oder abgelaufen. Melde dich an oder fordere einen
          neuen an.
        </p>
      )}

      <AuthForm
        action={signIn}
        submitLabel="Anmelden"
        autoComplete="current-password"
        next={next}
        footer={{ text: 'Noch kein Konto?', linkLabel: 'Registrieren', href: '/signup' }}
      />
    </Screen>
  )
}
