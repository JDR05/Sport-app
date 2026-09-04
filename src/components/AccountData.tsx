'use client'

// The two things a person may do with their own data.
//
// Not a settings nicety. Articles 15/20 and 17 GDPR are rights, and this app
// holds health data — the category the regulation protects most strictly. Until
// now there was no way to get a copy and no way to delete an account at all,
// which means every promise the onboarding makes about the data was
// unenforceable by the person it was made to.
//
// Both are deliberately plain and neither is buried. The export is one tap and
// produces a file on the device. The deletion asks once, in words that say what
// actually happens, and then does it — no thirty-day window, no "in case you
// change your mind" copy. A retention period nobody asked for is precisely the
// thing the right exists against.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMyAccount, downloadMyData } from '@/app/(app)/actions'
import { Button, Card, SectionHeading } from '@/components/ui'

export function AccountData() {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function exportData() {
    setError(null)
    startTransition(async () => {
      const data = await downloadMyData().catch(() => null)
      if (!data) {
        setError('Der Export hat gerade nicht geklappt. Versuch es später noch einmal.')
        return
      }

      // Built and released in the browser, so the file never passes through a
      // log or a third party on its way to the person it belongs to.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `trace-daten-${data.exportedAt.slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteMyAccount().catch(() => ({ ok: false }))
      if (!result.ok) {
        setError('Das Löschen hat nicht geklappt. Deine Daten sind unverändert.')
        return
      }
      router.push('/login')
    })
  }

  return (
    <>
      <SectionHeading>Deine Daten</SectionHeading>
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Du kannst jederzeit alles herunterladen, was hier über dich gespeichert ist — als
          Datei, Zeile für Zeile, ohne Zusammenfassung.
        </p>
        <div className="mt-3">
          <Button onClick={exportData} disabled={busy} variant="quiet">
            Alle meine Daten herunterladen
          </Button>
        </div>
      </Card>

      <div className="mt-3">
        <Card tone="warn">
          <p className="text-sm font-semibold text-ink">Konto und alle Daten löschen</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Ziel, Plan, Check-ins, Messwerte, Muster — alles wird sofort und endgültig
            gelöscht, zusammen mit deinem Zugang. Es gibt keine Kopie und keine Frist, in der
            wir es zurückholen könnten.
          </p>

          {!confirming ? (
            <div className="mt-3">
              <Button onClick={() => setConfirming(true)} disabled={busy} variant="quiet">
                Konto löschen
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Asked once, and the confirming button says what it does rather
                  than "OK". Somebody tapping this has to be able to read what
                  they are agreeing to on the button itself. */}
              <Button onClick={remove} disabled={busy}>
                {busy ? 'Wird gelöscht …' : 'Ja, endgültig löschen'}
              </Button>
              <Button onClick={() => setConfirming(false)} disabled={busy} variant="quiet">
                Abbrechen
              </Button>
            </div>
          )}
        </Card>
      </div>

      {error && (
        <p className="mt-2 text-sm leading-relaxed text-ink">{error}</p>
      )}
    </>
  )
}
