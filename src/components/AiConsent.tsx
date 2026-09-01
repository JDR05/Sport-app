'use client'

// The checkbox, and the text next to it.
//
// The text is the part that matters. Consent under Art. 9 (2) (a) DSGVO has to
// be informed, which means naming what leaves, who receives it and what they
// may do with it — in the sentence beside the box, not behind a link. A
// checkbox next to "Ich stimme der Datenverarbeitung zu" is not consent to
// anything in particular.
//
// Never pre-ticked, and never a condition for using the app: the state starts
// at whatever the database says, and turning it off leaves a product that
// still classifies goals, plans, detects patterns and runs experiments.

import { useState, useTransition } from 'react'
import { setAiConsent } from '@/app/(app)/actions'
import { Note } from '@/components/ui'

export type ConsentView = { granted: boolean; outdated: boolean }

export function AiConsent({
  initial,
  provider,
  onChange,
}: {
  initial: ConsentView
  /** Who actually receives the data, so the sentence names a company. */
  provider: string
  /**
   * Reports both the value and whether a write is still in flight, so the
   * onboarding can hold its Weiter button. The server reads consent from the
   * database when the classification is requested — if that request overtakes
   * this write, somebody who just ticked the box gets the keyword classifier
   * and no explanation.
   */
  onChange?: (state: { granted: boolean; pending: boolean }) => void
}) {
  const [granted, setGranted] = useState(initial.granted)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const toggle = (next: boolean) => {
    // Shown immediately, then corrected from what the server actually stored.
    // A box that stays ticked over a failed write would be the one lie this
    // component must not tell.
    setGranted(next)
    setFailed(false)
    onChange?.({ granted: next, pending: true })
    startTransition(async () => {
      const state = await setAiConsent(next)
      setGranted(state.granted)
      setFailed(state.granted !== next)
      onChange?.({ granted: state.granted, pending: false })
    })
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 rounded-[3px] border border-line bg-surface p-3">
        <input
          type="checkbox"
          checked={granted}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span className="text-sm leading-relaxed text-ink">
          <span className="font-semibold">KI-Unterstützung erlauben.</span>{' '}
          Dafür gehen dein Zieltext, dein Tagesablauf, deine Angaben zu Sport, Ernährung und
          Schlaf sowie später deine Notizen aus den Check-ins an {provider}. Ohne Namen,
          E-Mail-Adresse oder Geburtsdatum.
        </span>
      </label>

      {initial.outdated && !granted && (
        <Note>
          Du hattest schon einmal zugestimmt — inzwischen hat sich geändert, was verarbeitet
          wird. Deshalb fragen wir noch einmal, statt die alte Zustimmung weiterlaufen zu lassen.
        </Note>
      )}

      {failed && (
        <Note>
          Das hat gerade nicht geklappt. Es bleibt bei {granted ? 'erlaubt' : 'nicht erlaubt'} —
          versuch es bitte gleich noch einmal.
        </Note>
      )}

      <Note>
        Ohne Häkchen läuft die App vollständig weiter: Ziel einordnen, Plan bauen, Muster
        erkennen und Experimente auswerten passieren in dieser App und ohne KI. Du kannst die
        Zustimmung jederzeit im Profil zurücknehmen — das stoppt künftige Anfragen, bereits
        Gesendetes lässt sich nicht zurückholen.
      </Note>
    </div>
  )
}
