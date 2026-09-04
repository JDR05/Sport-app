'use client'

// What the app shows when a read fails.
//
// This exists because of the alternative it replaces. When the database could
// not answer, the app could not tell that apart from "this person has never
// set anything up", so it sent them into the onboarding — and filling that in
// retires the goal they already had. A temporary fault destroyed real setup.
//
// A fault is now a fault: say so, and offer the one thing that helps, which is
// trying again. Nothing here writes anything.

import { useEffect } from 'react'
import { reportError } from '@/lib/db/errors'
import { Button, Card, Note, Screen, ScreenTitle } from '@/components/ui'

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
    // Also to the operator, who otherwise only learns about a crash if the
    // person mentions it. Best-effort and non-blocking — a failed report must
    // never become a second failure on a screen that is already the fallback.
    reportError(error, 'render')
  }, [error])

  return (
    <Screen>
      <ScreenTitle
        title="Kurz nicht erreichbar"
        subtitle="Deine Daten sind gespeichert. Das hier ist ein Ladefehler, kein Datenverlust."
      />
      <Card tone="warn">
        <p className="text-sm leading-relaxed text-ink">
          Die App konnte deine Angaben gerade nicht laden. Versuch es bitte noch einmal.
        </p>
      </Card>
      <div className="mt-4">
        <Button onClick={() => retry()}>Nochmal versuchen</Button>
      </div>
      <Note>
        Wenn das öfter passiert, sag Bescheid — dann steckt mehr dahinter als eine kurze Störung.
      </Note>
    </Screen>
  )
}
