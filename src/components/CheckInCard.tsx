'use client'

// The daily check-in.
//
// Everything is optional, and a day nobody rated is missing information rather
// than a bad day — the same rule that governs an untouched action. So there is
// no nagging, no streak, and no empty state that implies failure.
//
// What it asks follows the goal. Nine things are recorded across the app, and
// asking all nine every evening would be the second job the brief rules out; it
// would also make the answers worse, because people who feel interrogated start
// tapping the middle option. Three core questions plus at most three from the
// archetype (src/lib/engine/checkin-fields.ts).
//
// Energy and mood are asked separately because they come apart: a week of
// training can leave someone tired and content at once, and a plan that read
// those as one number would draw the wrong conclusion from both.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getCheckIns, submitCheckIn } from '@/app/(app)/actions'
import { Card, SectionHeading } from '@/components/ui'
import { checkInFields, type CheckInField } from '@/lib/engine/checkin-fields'
import type { GoalArchetype } from '@/lib/domain/types'

const SCALE = [1, 2, 3, 4, 5] as const

const ENERGY_LABEL: Record<number, string> = {
  1: 'leer', 2: 'wenig', 3: 'geht so', 4: 'gut', 5: 'voll da',
}
const MOOD_LABEL: Record<number, string> = {
  1: 'mies', 2: 'gedrückt', 3: 'neutral', 4: 'gut', 5: 'richtig gut',
}
// Reads upwards, so it is labelled unmistakably.
const STRESS_LABEL: Record<number, string> = {
  1: 'ruhig', 2: 'wenig', 3: 'mittel', 4: 'viel', 5: 'zu viel',
}
const DIET_LABEL: Record<number, string> = {
  1: 'gar nicht gut', 2: 'eher nicht', 3: 'geht so', 4: 'gut', 5: 'richtig gut',
}
// Also upwards: 5 is a lot of soreness.
const SORENESS_LABEL: Record<number, string> = {
  1: 'frisch', 2: 'leicht', 3: 'spürbar', 4: 'deutlich', 5: 'heftig',
}

/**
 * Half-hour steps from four to ten hours.
 *
 * A number field would ask for a precision nobody has about their own night,
 * and it would put a keyboard in the way of a two-second gesture.
 */
const SLEEP_STEPS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const

/** Whole drinks up to five. Beyond that the exact number changes nothing. */
const DRINK_STEPS = [0, 1, 2, 3, 4, 5] as const

type Values = {
  energy: number | null
  mood: number | null
  stress: number | null
  sleepHours: number | null
  dietQuality: number | null
  soreness: number | null
  alcoholUnits: number | null
  caffeineLate: boolean | null
}

const EMPTY: Values = {
  energy: null, mood: null, stress: null, sleepHours: null,
  dietQuality: null, soreness: null, alcoholUnits: null, caffeineLate: null,
}

export function CheckInCard({
  today,
  archetype,
}: {
  today: string
  archetype: GoalArchetype
}) {
  const [values, setValues] = useState<Values>(EMPTY)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  // Whether this person has already answered something today, so a late reply
  // from the server cannot overwrite a tap that came first.
  const touched = useRef(false)

  // Drawn immediately, filled in when the answer arrives.
  //
  // This used to render nothing until `getCheckIns` came back, and nothing at
  // all if that call ever failed — there was no catch, so one bad response left
  // the card invisible for the rest of the session with no trace anywhere. From
  // the sofa that is indistinguishable from the feature having been deleted:
  // "das mit wie es mir heute geht, Essen, Stress — hast du komplett entfernt,
  // gibt's jetzt einfach nicht mehr."
  //
  // The scales need no server data to be usable, so waiting for one bought
  // nothing and cost the whole card. An empty scale is the honest starting
  // state anyway: nothing recorded yet.
  useEffect(() => {
    let current = true
    void getCheckIns(today)
      .then((entries) => {
        if (!current || touched.current) return
        const todays = entries.find((e) => e.checkedInOn === today)
        if (!todays) return
        setValues({
          energy: todays.energy,
          mood: todays.mood,
          stress: todays.stress,
          sleepHours: todays.sleepHours,
          dietQuality: todays.dietQuality,
          soreness: todays.soreness,
          alcoholUnits: todays.alcoholUnits,
          caffeineLate: todays.caffeineLate,
        })
        setNote(todays.note ?? '')
        setSaved(true)
      })
      .catch(() => {
        // Nothing to say and nothing to hide. The card still works; a value
        // typed now overwrites whatever was there, which is what the person
        // meant by typing it.
      })
    return () => {
      current = false
    }
  }, [today])

  const save = useCallback(
    (next: Values, nextNote: string) => {
      void submitCheckIn({
        checkedInOn: today,
        ...next,
        note: nextNote.trim() || null,
      }).then((result) => setSaved(result.ok))
    },
    [today],
  )

  /** Writes one field and saves, so nothing depends on state having settled. */
  function set<K extends keyof Values>(field: K, value: Values[K]) {
    touched.current = true
    const next = { ...values, [field]: value }
    setValues(next)
    save(next, note)
  }

  const fields = checkInFields(archetype)
  const asks = (field: CheckInField) => fields.includes(field)

  return (
    <Framed>
        <div className="flex flex-col gap-4">
          {asks('energy') && (
            <Scale
              label="Energie"
              labels={ENERGY_LABEL}
              value={values.energy}
              onChange={(v) => set('energy', v)}
            />
          )}
          {asks('mood') && (
            <Scale
              label="Stimmung"
              labels={MOOD_LABEL}
              value={values.mood}
              onChange={(v) => set('mood', v)}
            />
          )}
          {asks('stress') && (
            <Scale
              label="Stress"
              labels={STRESS_LABEL}
              value={values.stress}
              onChange={(v) => set('stress', v)}
            />
          )}
          {asks('dietQuality') && (
            <Scale
              label="Gegessen"
              labels={DIET_LABEL}
              value={values.dietQuality}
              onChange={(v) => set('dietQuality', v)}
            />
          )}
          {asks('soreness') && (
            <Scale
              label="Muskelkater"
              labels={SORENESS_LABEL}
              value={values.soreness}
              onChange={(v) => set('soreness', v)}
            />
          )}
          {asks('sleepHours') && (
            <Steps
              label="Schlaf letzte Nacht"
              steps={SLEEP_STEPS}
              value={values.sleepHours}
              format={(h) => (h % 1 === 0 ? String(h) : h.toFixed(1).replace('.', ','))}
              suffix="h"
              onChange={(v) => set('sleepHours', v)}
            />
          )}
          {asks('alcoholUnits') && (
            <Steps
              label="Alkohol"
              steps={DRINK_STEPS}
              value={values.alcoholUnits}
              format={(n) => (n === 5 ? '5+' : String(n))}
              suffix="Glas"
              onChange={(v) => set('alcoholUnits', v)}
            />
          )}
          {asks('caffeineLate') && (
            <Toggle
              label="Koffein nach 16 Uhr"
              value={values.caffeineLate}
              onChange={(v) => set('caffeineLate', v)}
            />
          )}
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
          onBlur={() => save(values, note)}
          className="mt-2 w-full resize-none rounded-[2px] border border-line bg-surface px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
        />

        <p className="mt-2 text-xs text-faint">
          {saved
            ? 'Gespeichert.'
            : 'Alles freiwillig. Ein Tag ohne Eintrag zählt nie als schlechter Tag.'}
        </p>
    </Framed>
  )
}

/** The heading and the card, for every place this is not already inside one. */
function Framed({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionHeading>Wie war der Tag?</SectionHeading>
      <Card>{children}</Card>
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
            // answer back matters more here than one fewer tap.
            onClick={() => onChange(value === n ? null : n)}
            className={`rounded-control border py-2.5 text-sm transition-[background-color,border-color] duration-[var(--motion-tap)] ${
              value === n
                ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                : 'border-line bg-surface text-muted'
            }`}
          >
            <span className="num">{n}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A horizontal row of values to tap, for anything with more than five steps. */
function Steps({
  label,
  steps,
  value,
  format,
  suffix,
  onChange,
}: {
  label: string
  steps: readonly number[]
  value: number | null
  format: (value: number) => string
  suffix: string
  onChange: (value: number | null) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">
        {label}
        {value !== null && (
          <span className="ml-2 font-normal text-muted">
            <span className="num">{format(value)}</span> {suffix}
          </span>
        )}
      </p>
      <div className="-mx-1 mt-2 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${format(n)} ${suffix}`}
            onClick={() => onChange(value === n ? null : n)}
            className={`shrink-0 snap-start rounded-[2px] border px-3.5 py-2 text-sm transition-[background-color,border-color] duration-[var(--motion-tap)] ${
              value === n
                ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                : 'border-line bg-surface text-muted'
            }`}
          >
            <span className="num">{format(n)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {[
          { v: true, label: 'Ja' },
          { v: false, label: 'Nein' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.v}
            onClick={() => onChange(value === option.v ? null : option.v)}
            className={`rounded-control border py-2.5 text-sm transition-[background-color,border-color] duration-[var(--motion-tap)] ${
              value === option.v
                ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                : 'border-line bg-surface text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
