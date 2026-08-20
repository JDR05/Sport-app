import type { Metadata } from 'next'
import { Screen, ScreenTitle } from '@/components/ui'
import { Wordmark } from '@/components/Logo'
import { AuthForm } from '@/components/AuthForm'
import { signUp } from '@/app/auth/actions'

export const metadata: Metadata = { title: 'Konto anlegen' }

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const params = await searchParams

  if (params.bestaetigen === '1') {
    return (
      <Screen>
        <div className="mb-8 mt-2">
          <Wordmark />
        </div>
        <ScreenTitle
          title="Fast fertig"
          subtitle="Wir haben dir eine E-Mail geschickt."
        />
        <p className="text-sm text-muted">
          Klick auf den Link darin und melde dich danach einmal an. Falls nichts ankommt: auch
          im Spam-Ordner nachsehen.
        </p>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="mb-8 mt-2">
        <Wordmark />
      </div>
      <ScreenTitle
        title="Konto anlegen"
        subtitle="Danach beschreibst du dein Ziel, und die App baut daraus deinen Plan."
      />
      <AuthForm
        action={signUp}
        submitLabel="Konto anlegen"
        passwordHint="Mindestens 10 Zeichen. Eine lange Wortfolge ist sicherer als ein kurzes Kunstwort."
        autoComplete="new-password"
        footer={{ text: 'Schon ein Konto?', linkLabel: 'Anmelden', href: '/login' }}
      />
    </Screen>
  )
}
