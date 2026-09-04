'use client'

// Answering one of the model's suggestions.
//
// The proposal was a list to read. It said "45 Minuten Krafttraining im Gym,
// 2×/Woche" and there was no way to say anything back — not "make it three",
// not "not this one". So the screen that exists to show what the AI thinks was
// also the screen that proved the app was not listening: "dann möchte ich da
// aber Präferenzen geben, zum Beispiel möchte ich zweimal der Woche
// Krafttraining machen."
//
// Two controls and no more. How often, and whether at all. Everything else —
// which day, what time, whether there is room for it — is the engine's, and a
// control offering those would be offering something the safety limits can
// overrule. What comes back is where it landed, which is the honest answer to
// a request the plan may not have been able to grant in full.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveActionPreference } from '@/app/(app)/actions'
import { MAX_TIMES_PER_WEEK } from '@/lib/engine/proposed'
import type { ActionPreference as Preference, Weekday } from '@/lib/domain/types'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function ActionPreferenceControl({
  title,
  suggested,
  stored,
  placedOn,
}: {
  title: string
  /** What the model asked for, and the value shown when nothing is stored. */
  suggested: number
  stored: Preference | undefined
  /** The days this action actually sits on this week. */
  placedOn: Weekday[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Optimistic, because a stepper that waits for a round trip before moving
  // feels broken on the first tap and gets tapped twice.
  const [times, setTimes] = useState(stored?.timesPerWeek ?? suggested)
  const [enabled, setEnabled] = useState(stored?.enabled ?? true)
  const [saving, startSaving] = useState<boolean>(false)

  function save(next: { timesPerWeek: number; enabled: boolean }) {
    startSaving(true)
    startTransition(async () => {
      await saveActionPreference({ title, ...next }).catch(() => null)
      startSaving(false)
      // The week may have changed underneath — an action added, removed or
      // renamed. Everything on screen reads from the server, so this is what
      // makes Heute and Plan agree with what was just asked for.
      router.refresh()
    })
  }

  function setCount(next: number) {
    const clamped = Math.min(MAX_TIMES_PER_WEEK, Math.max(1, next))
    if (clamped === times) return
    setTimes(clamped)
    save({ timesPerWeek: clamped, enabled })
  }

  function toggle() {
    const next = !enabled
    setEnabled(next)
    save({ timesPerWeek: times, enabled: next })
  }

  const busy = pending || saving
  const days = ORDER.filter((d) => placedOn.includes(d))

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className={`flex items-center gap-1.5 ${enabled ? '' : 'opacity-40'}`}>
        <Step label="Seltener" onClick={() => setCount(times - 1)} disabled={!enabled || times <= 1}>
          −
        </Step>
        <span className="num min-w-[3.5rem] text-center text-[13px] text-ink">
          {times}×/Woche
        </span>
        <Step
          label="Öfter"
          onClick={() => setCount(times + 1)}
          disabled={!enabled || times >= MAX_TIMES_PER_WEEK}
        >
          +
        </Step>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-pressed={!enabled}
        className="label rounded-[2px] border border-line-strong px-2 py-1 text-[10px] font-semibold text-faint"
      >
        {enabled ? 'Nicht einplanen' : 'Wieder einplanen'}
      </button>

      {/* Where it actually landed.

          The whole point of asking, and the answer to "sodass mir diese
          Vorschläge irgendwo einordnen, wo ich Zeit hab". It is also the honest
          place to see that a wish was not fully granted: asking for four and
          reading three days back says the week had room for three, without the
          app having to claim otherwise. */}
      <span className="w-full text-xs text-faint">
        {busy
          ? 'Wird eingeplant …'
          : !enabled
            ? 'Steht nicht im Plan.'
            : days.length > 0
              ? `Diese Woche: ${days.map((d) => WEEKDAY_SHORT[d]).join(' · ')}`
              : 'Diese Woche ist kein Platz mehr dafür.'}
      </span>
    </div>
  )
}

function Step({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="num h-8 w-8 rounded-[2px] border border-line-strong text-[15px] text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}
