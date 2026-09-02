'use client'

// The onboarding step, on its own screen.
//
// The same component, deliberately: two editors for one list is two places for
// the wording, the validation and the "one entry per weekday" rule to drift
// apart, and the copy in that step was written for somebody who has not seen a
// benefit yet — which is exactly the tone this screen needs too.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCommitments } from '@/app/(app)/actions'
import { CommitmentsStep } from '@/app/onboarding/CommitmentsStep'
import { Button, Note, Screen, ScreenTitle } from '@/components/ui'
import type { Commitment } from '@/lib/domain/types'

export function CommitmentsView({ initial }: { initial: Commitment[] }) {
  const router = useRouter()
  const [commitments, setCommitments] = useState<Commitment[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Compared by value rather than by a dirty flag on every edit: the step
  // hands back a whole new list each time, and somebody who adds an entry and
  // removes it again has changed nothing.
  const changed = JSON.stringify(commitments) !== JSON.stringify(initial)

  async function save() {
    setSaving(true)
    setError(null)
    const result = await updateCommitments(commitments).catch(() => null)
    setSaving(false)

    if (!result?.ok) {
      setError('Das konnte nicht gespeichert werden. Versuch es noch einmal.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <Screen>
      <ScreenTitle
        title="Deine festen Termine"
        subtitle="Was jede Woche sowieso stattfindet — Training, Schicht, Vorlesung."
      />

      <CommitmentsStep
        value={commitments}
        onChange={(next) => {
          setCommitments(next)
          setSaved(false)
        }}
      />

      <div className="mt-6">
        <Button onClick={() => void save()} disabled={saving || !changed}>
          {saving ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm leading-relaxed text-muted">{error}</p>}

      {saved && !changed && (
        <p className="mt-3 text-sm leading-relaxed text-ink">Gespeichert.</p>
      )}

      {/* The limitation, said plainly rather than discovered.
          
          A plan already written is a promise already made: this week keeps the
          actions it has, including the statuses on them. What changes at once
          is that the app stops showing an empty evening where your training
          is — and next week is planned around the new list. */}
      <Note>
        Der Termin taucht sofort in Heute und im Wochenplan auf. Der Plan selbst wird nicht
        rückwirkend umgebaut — was du diese Woche schon abgehakt hast, bleibt stehen. Ab der
        nächsten Woche plant die App um die neuen Termine herum.
      </Note>
    </Screen>
  )
}
