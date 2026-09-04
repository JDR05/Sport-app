'use client'

// One reminder a day, at an hour the person picks.
//
// The app waited to be remembered. The check-in is where the behaviour model
// gets its data, and somebody who does not think of it in the evening records
// nothing — so it learns nothing, so it gets worse, so they think of it even
// less. That loop is the largest single thing between this app and being used.
//
// What this is deliberately not: no streaks, no "du hast 3 Tage verpasst", no
// second nudge when the first is ignored. A notification is the easiest place
// in an app to break the no-guilt rule, and one that arrives on a bad evening
// to say you failed is the notification people turn off — along with every
// other one the app might ever send.

import { useState, useSyncExternalStore, useTransition } from 'react'
import { disableReminders, enableReminders, setReminderTime } from '@/app/(app)/actions'
import { Button, Card, SectionHeading } from '@/components/ui'

/** The evening hours somebody would plausibly want, plus a morning option. */
const HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21, 22]

type Support = 'unknown' | 'unsupported' | 'blocked' | 'available'

/**
 * What this browser can do, read as the external state it is.
 *
 * `Notification.permission` is not React state — it lives in the browser, the
 * person can change it in settings while the app is open, and it does not exist
 * on the server. `useSyncExternalStore` is the shape for exactly that, and it
 * avoids the setState-in-an-effect that the alternative needs.
 *
 * There is no event to subscribe to, so the subscribe function is a no-op: the
 * value is re-read on every render React does anyway, which is often enough for
 * something that changes when somebody leaves the app to visit settings.
 */
function useSupport(): Support {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
      return Notification.permission === 'denied' ? 'blocked' : 'available'
    },
    // The server cannot know, and must not guess — guessing produces markup
    // that differs from the client's and a hydration mismatch.
    () => 'unknown',
  )
}

export function Reminders({ enabled, hour }: { enabled: boolean; hour: number }) {
  const support = useSupport()
  const [on, setOn] = useState(enabled)
  const [pick, setPick] = useState(hour)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function turnOn() {
    setError(null)
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) {
      setError('Erinnerungen sind auf diesem Server noch nicht eingerichtet.')
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      .catch(() => null)

    if (!sub) {
      setError('Der Browser hat die Anmeldung abgelehnt. Versuch es später noch einmal.')
      return
    }

    const json = sub.toJSON()
    startTransition(async () => {
      const result = await enableReminders({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        remindHour: pick,
        // The person's own zone, so "20:00" means their eight in the evening
        // and keeps meaning it across a daylight-saving change.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).catch(() => ({ ok: false }))

      if (result.ok) setOn(true)
      else setError('Das Speichern hat nicht geklappt.')
    })
  }

  function turnOff() {
    setError(null)
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe().catch(() => {})
        await disableReminders(sub.endpoint).catch(() => null)
      }
      setOn(false)
    })
  }

  function changeHour(next: number) {
    setPick(next)
    if (!on) return
    startTransition(async () => {
      await setReminderTime(next).catch(() => null)
    })
  }

  return (
    <>
      <SectionHeading>Erinnerung</SectionHeading>
      <Card>
        {support === 'unknown' ? (
          // Nothing until the browser has been asked. A capability question
          // answered on the server is answered by guessing.
          <p className="text-sm leading-relaxed text-muted">
            Einmal am Tag eine Frage: wie lief der Tag. Keine Serien, keine Mahnungen.
          </p>
        ) : support === 'unsupported' ? (
          <p className="text-sm leading-relaxed text-muted">
            Dieser Browser kann keine Erinnerungen. Auf dem iPhone geht es, wenn du die App
            zum Home-Bildschirm hinzufügst.
          </p>
        ) : support === 'blocked' ? (
          <p className="text-sm leading-relaxed text-muted">
            Benachrichtigungen sind für diese Seite blockiert. Das lässt sich nur in den
            Einstellungen deines Browsers ändern.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted">
              Einmal am Tag eine Frage: wie lief der Tag. Keine Serien, keine Mahnungen.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => changeHour(h)}
                  aria-pressed={pick === h}
                  className={`num rounded-[2px] border px-2.5 py-1.5 text-[13px] ${
                    pick === h
                      ? 'border-ink bg-sunken text-ink'
                      : 'border-line-strong bg-surface text-muted'
                  }`}
                >
                  {String(h).padStart(2, '0')}:00
                </button>
              ))}
            </div>

            <div className="mt-3">
              {on ? (
                <Button onClick={turnOff} disabled={busy} variant="quiet">
                  Erinnerung ausschalten
                </Button>
              ) : (
                <Button onClick={() => void turnOn()} disabled={busy}>
                  Erinnerung einschalten
                </Button>
              )}
            </div>
          </>
        )}

        {error && <p className="mt-2 text-sm leading-relaxed text-ink">{error}</p>}
      </Card>
    </>
  )
}

/**
 * The VAPID public key, as the Push API wants it.
 *
 * It is published base64url; `subscribe` wants raw bytes. Not a detail worth
 * a library — but worth doing exactly, because a wrong byte here fails at
 * subscribe time with a message that says nothing about the cause.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replaceAll('-', '+')
    .replaceAll('_', '/')
  const raw = atob(padded)
  // Allocated explicitly rather than via `Uint8Array.from`, because the Push
  // API's type wants a view over a plain ArrayBuffer and the inferred one is
  // widened to include SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
