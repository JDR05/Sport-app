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

export function CheckInCard({ today }: { today: string }) {
  const [energy, setEnergy] = useState<number | null>(null)
  const [mood, setMood] = useState<number | null>(null)
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
    (next: { energy?: number | null; mood?: number | null; note?: string }) => {
      const payload = {
        checkedInOn: today,
        energy: next.energy !== undefined ? next.energy : energy,
        mood: next.mood !== undefined ? next.mood : mood,
        note: (next.note !== undefined ? next.note : note).trim() || null,
      }
      void submitCheckIn(payload).then((result) => setSaved(result.ok))
    },
    [today, energy, mood, note],
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
