'use client'

// The daily check-in.
//
// Two numbers and a sentence, and all three optional. A day nobody rated is
// missing information, not a bad day — the same rule that governs an untouched
// action. So there is no nagging, no streak, and no empty state that implies
// failure.
//
// Energy and mood are asked separately because they come apart: a week of
// training can leave someone tired and content at once, and a plan that reads
// those as one number would draw the wrong conclusion from both.

import { useCallback, useEffect, useState } from 'react'
import { getCheckIns, submitCheckIn } from '@/app/(app)/actions'
import { Card, SectionHeading } from '@/components/ui'

const SCALE = [1, 2, 3, 4, 5] as const

const ENERGY_LABEL: Record<number, string> = {
  1: 'leer', 2: 'wenig', 3: 'geht so', 4: 'gut', 5: 'voll da',
}
const MOOD_LABEL: Record<number, string> = {
  1: 'mies', 2: 'gedrückt', 3: 'neutral', 4: 'gut', 5: 'richtig gut',
}
// The one scale that reads upwards, so it is labelled unmistakably.
const STRESS_LABEL: Record<number, string> = {
  1: 'ruhig', 2: 'wenig', 3: 'mittel', 4: 'viel', 5: 'zu viel',
}

/**
 * Half-hour steps from four to ten hours, plus the open ends.
 *
 * A number field would ask for a precision nobody has about their own night,
 * and it would put a keyboard in the way of a two-second gesture.
 */
const SLEEP_STEPS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const

export function CheckInCard({ today }: { today: string }) {
  const [energy, setEnergy] = useState<number | null>(null)
  const [mood, setMood] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [sleepHours, setSleepHours] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let current = true
    void getCheckIns(today).then((entries) => {
      if (!current) return
      const todays = entries.find((e) => e.checkedInOn === today)
      if (todays) {
        setEnergy(todays.energy)
        setMood(todays.mood)
        setStress(todays.stress)
        setSleepHours(todays.sleepHours)
        setNote(todays.note ?? '')
        setSaved(true)
      }
      setLoaded(true)
    })
    return () => {
      current = false
    }
  }, [today])

  const save = useCallback(
    (next: {
      energy?: number | null
      mood?: number | null
      stress?: number | null
      sleepHours?: number | null
      note?: string
    }) => {
      const payload = {
        checkedInOn: today,
        energy: next.energy !== undefined ? next.energy : energy,
        mood: next.mood !== undefined ? next.mood : mood,
        stress: next.stress !== undefined ? next.stress : stress,
        sleepHours: next.sleepHours !== undefined ? next.sleepHours : sleepHours,
        note: (next.note !== undefined ? next.note : note).trim() || null,
      }
      void submitCheckIn(payload).then((result) => setSaved(result.ok))
    },
    [today, energy, mood, stress, sleepHours, note],
  )

  if (!loaded) return null

  return (
    <>
      <SectionHeading>Wie war der Tag?</SectionHeading>
      <Card>
        <Scale
          label="Energie"
          labels={ENERGY_LABEL}
          value={energy}
          onChange={(value) => {
            setEnergy(value)
            save({ energy: value })
          }}
        />
        <div className="mt-4">
          <Scale
            label="Stimmung"
            labels={MOOD_LABEL}
            value={mood}
            onChange={(value) => {
              setMood(value)
              save({ mood: value })
            }}
          />
        </div>

        <div className="mt-4">
          <Scale
            label="Stress"
            labels={STRESS_LABEL}
            value={stress}
            onChange={(value) => {
              setStress(value)
              save({ stress: value })
            }}
          />
        </div>

        <div className="mt-4">
          <Sleep
            value={sleepHours}
            onChange={(value) => {
              setSleepHours(value)
              save({ sleepHours: value })
            }}
          />
        </div>

        <label htmlFor="checkin-note" className="mt-4 block text-sm font-semibold text-ink">
          Notiz
          <span className="ml-1 font-normal text-faint">optional</span>
        </label>
        <textarea
          id="checkin-note"
          rows={2}
          value={note}
          placeholder="Was ist dir aufgefallen?"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => save({ note })}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
        />

        <p className="mt-2 text-xs text-faint">
          {saved
            ? 'Gespeichert.'
            : 'Alles freiwillig. Ein Tag ohne Eintrag zählt nie als schlechter Tag.'}
        </p>
      </Card>
    </>
  )
}

/**
 * Last night's sleep, as a row of taps.
 *
 * This is the field that lets the app say "Dienstags schläfst du zwei Stunden
 * weniger" instead of "Dienstags läuft es schlechter" — the difference between
 * naming a circumstance and implying a verdict about the person.
 */
function Sleep({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">
        Schlaf letzte Nacht
        {value !== null && (
          <span className="ml-2 font-normal text-muted">
            {value.toFixed(1).replace('.', ',')} h
          </span>
        )}
      </p>
      <div className="-mx-1 mt-2 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
        {SLEEP_STEPS.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={value === h}
            aria-label={`${h.toFixed(1).replace('.', ',')} Stunden`}
            onClick={() => onChange(value === h ? null : h)}
            className={`shrink-0 snap-start rounded-pill border px-3 py-2 text-sm transition-[background-color,border-color] duration-[var(--motion-tap)] ${
              value === h
                ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                : 'border-line bg-surface text-muted'
            }`}
          >
            {h % 1 === 0 ? h : h.toFixed(1).replace('.', ',')}
          </button>
        ))}
      </div>
    </div>
  )
}

function Scale({
  label,
  labels,
  value,
  onChange,
}: {
  label: string
  labels: Record<number, string>
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">
        {label}
        {value !== null && <span className="ml-2 font-normal text-muted">{labels[value]}</span>}
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} von 5: ${labels[n]}`}
            aria-pressed={value === n}
            // Tapping the chosen value again clears it. Being able to take an
            // answer back matters when the alternative is a wrong one on record.
            onClick={() => onChange(value === n ? null : n)}
            className={`rounded-lg border py-2 text-sm font-medium transition ${
              value === n
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-muted active:bg-sunken'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
