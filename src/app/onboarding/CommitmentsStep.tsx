'use client'

// Entering the week someone already has.
//
// This is the answer to a plan that was never possible: without it the app saw
// three empty evenings where there was football training, planned sessions into
// them, and asked someone to train twice on the day they already train.
//
// Kept to one screen and four taps per entry. Every extra question here is a
// question asked of someone who has not seen a single benefit yet, so the
// wording carries its own reason — people fill in what they understand the
// point of.

import { useState } from 'react'
import { Button, Card, Note } from '@/components/ui'
import { ChoiceGroup, Field, MultiChoice, TextInput } from '@/components/form'
import { WEEKDAYS, type Activity, type Commitment, type CommitmentKind, type Weekday } from '@/lib/domain/types'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

const KINDS: Array<{ value: CommitmentKind; label: string }> = [
  { value: 'sport', label: 'Sport' },
  { value: 'work', label: 'Arbeit' },
  { value: 'study', label: 'Uni/Schule' },
  { value: 'care', label: 'Familie' },
  { value: 'other', label: 'Anderes' },
]

const SPORTS: Array<{ value: Activity; label: string }> = [
  { value: 'football', label: 'Fußball' },
  { value: 'gym', label: 'Gym' },
  { value: 'running', label: 'Laufen' },
  { value: 'cycling', label: 'Radfahren' },
  { value: 'swimming', label: 'Schwimmen' },
  { value: 'climbing', label: 'Klettern' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'bodyweight', label: 'Anderes' },
]

const START_TIMES = ['07:00', '12:00', '17:00', '18:00', '19:00', '20:00'] as const

type Entry = {
  label: string
  days: Weekday[]
  start: string | null
  minutes: number | null
  kind: CommitmentKind | null
  activity: Activity | null
}

const BLANK: Entry = { label: '', days: [], start: null, minutes: null, kind: null, activity: null }

export function CommitmentsStep({
  value,
  onChange,
}: {
  value: Commitment[]
  onChange: (next: Commitment[]) => void
}) {
  const [entry, setEntry] = useState<Entry>(BLANK)

  const set = <K extends keyof Entry>(key: K, next: Entry[K]) =>
    setEntry((prev) => ({ ...prev, [key]: next }))

  // A commitment without a day and a length cannot be subtracted from anything,
  // so it is not accepted half-finished.
  const complete = entry.label.trim().length > 0 && entry.days.length > 0 && entry.kind !== null

  function add() {
    if (!complete) return
    // One entry per weekday: a training that happens twice a week is two blocks
    // in the calendar, and every downstream rule counts days.
    const added: Commitment[] = entry.days.map((weekday) => ({
      label: entry.label.trim(),
      weekday,
      start: entry.start ?? '19:00',
      minutes: entry.minutes ?? 90,
      kind: entry.kind ?? 'other',
      activity: entry.kind === 'sport' ? (entry.activity ?? 'bodyweight') : null,
    }))
    onChange([...value, ...added])
    setEntry(BLANK)
  }

  const grouped = groupByLabel(value)

  return (
    <>
      {grouped.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {grouped.map((group) => (
            <Card key={group.label}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{group.label}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {group.days.map((d) => WEEKDAY_SHORT[d]).join(', ')} · {group.start} ·{' '}
                    {group.minutes} Min
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((c) => c.label !== group.label))}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-muted active:bg-sunken"
                >
                  Entfernen
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Field label="Was hast du fest?" hint="Zum Beispiel Fußballtraining, Spätschicht, Vorlesung.">
        <TextInput
          value={entry.label}
          onChange={(v) => set('label', v)}
          placeholder="Fußballtraining"
          maxLength={80}
        />
      </Field>

      <Field label="An welchen Tagen?">
        <MultiChoice
          options={WEEKDAYS.map((w) => ({ value: w, label: WEEKDAY_SHORT[w] }))}
          values={entry.days}
          onChange={(v) => set('days', v)}
          columns={4}
        />
      </Field>

      <Field label="Was ist es?">
        <ChoiceGroup options={KINDS} value={entry.kind} onChange={(v) => set('kind', v)} columns={3} />
      </Field>

      {entry.kind === 'sport' && (
        <Field label="Welcher Sport?" hint="Damit der Plan es als dein Training mitzählt.">
          <ChoiceGroup
            options={SPORTS}
            value={entry.activity}
            onChange={(v) => set('activity', v)}
            columns={4}
          />
        </Field>
      )}

      <Field label="Wann geht es los?">
        <ChoiceGroup
          options={START_TIMES.map((t) => ({ value: t, label: t }))}
          value={entry.start}
          onChange={(v) => set('start', v)}
          columns={3}
        />
      </Field>

      <Field label="Wie lange?">
        <ChoiceGroup
          options={[60, 90, 120, 180].map((n) => ({ value: n, label: `${n} Min` }))}
          value={entry.minutes}
          onChange={(v) => set('minutes', v)}
          columns={4}
        />
      </Field>

      <Button variant="quiet" onClick={add} disabled={!complete}>
        Termin hinzufügen
      </Button>

      <Note>
        Der Plan legt an diesen Tagen kein zweites Training dazu und rechnet Sport als Belastung
        mit. Wenn du nichts Festes hast, geh einfach weiter.
      </Note>
    </>
  )
}

/** Entries added together share a label; showing them as one row keeps it short. */
function groupByLabel(commitments: Commitment[]) {
  const byLabel = new Map<string, Commitment[]>()
  for (const c of commitments) {
    byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), c])
  }
  return [...byLabel.entries()].map(([label, entries]) => ({
    label,
    days: WEEKDAYS.filter((w) => entries.some((e) => e.weekday === w)),
    start: entries[0].start,
    minutes: entries[0].minutes,
  }))
}
