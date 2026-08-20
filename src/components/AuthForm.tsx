'use client'

// One form for both screens. Sign-in and sign-up differ only in the action they
// post to and the words on the button, so they share everything else rather
// than drifting apart over time.

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import type { AuthState } from '@/app/auth/actions'

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>

export function AuthForm({
  action,
  submitLabel,
  passwordHint,
  autoComplete,
  next,
  footer,
}: {
  action: Action
  submitLabel: string
  passwordHint?: string
  autoComplete: 'current-password' | 'new-password'
  next?: string
  footer: { text: string; linkLabel: string; href: string }
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { error: null })

  return (
    <form action={formAction} className="mt-6">
      {next && <input type="hidden" name="weiter" value={next} />}

      <div className="mb-5">
        <label htmlFor="email" className="block text-sm font-semibold text-ink">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-accent"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="block text-sm font-semibold text-ink">
          Passwort
        </label>
        {passwordHint && <p className="mt-0.5 text-xs text-muted">{passwordHint}</p>}
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={autoComplete}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
      </div>

      {state.error && (
        <p role="alert" className="mb-4 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-ink">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Einen Moment …' : submitLabel}
      </Button>

      <p className="mt-6 text-center text-sm text-muted">
        {footer.text}{' '}
        <Link href={footer.href} className="font-semibold text-accent underline underline-offset-4">
          {footer.linkLabel}
        </Link>
      </p>
    </form>
  )
}
