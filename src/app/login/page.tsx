import { Screen, ScreenTitle } from '@/components/ui'
import { AuthForm } from '@/components/AuthForm'
import { signIn } from '@/app/auth/actions'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = typeof params.weiter === 'string' ? params.weiter : undefined
  const linkBroken = params.fehler === 'link'

  return (
    <Screen>
      <ScreenTitle title="Willkommen zurück" subtitle="Dein Plan wartet." />

      {linkBroken && (
        <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-ink">
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
