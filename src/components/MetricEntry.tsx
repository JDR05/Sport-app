'use client'

// Recording the goal metric.
//
// Appended, never replaced: the trend is the point, and overwriting yesterday
// would destroy the only thing that makes a series readable.
//
// It shows a moving average rather than the latest value. A single weigh-in
// swings by a kilo or two on water alone, and a number that jumps around while
// someone is doing everything right is how a plan gets abandoned in week three.

import { useState } from 'react'
import { submitMeasurement } from '@/app/(app)/actions'
import { Button, Card, Note } from '@/components/ui'

export type MetricSpec = {
  metricKey: string
  unit: string
  label: string
}

export function MetricEntry({
  spec,
  history,
}: {
  spec: MetricSpec
  history: Array<{ value: number; measuredAt: string }>
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState(history)

  const submit = async () => {
    const parsed = Number(value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Bitte eine Zahl eintragen.')
      return
    }

    setSaving(true)
    setError(null)
    const result = await submitMeasurement({
      metricKey: spec.metricKey,
      value: parsed,
      unit: spec.unit,
    })
    setSaving(false)

    if (!result.ok) {
      setError('Speichern hat nicht geklappt. Versuch es bitte noch einmal.')
      return
    }

    setEntries([...entries, { value: parsed, measuredAt: new Date().toISOString() }])
    setValue('')
  }

  const average = movingAverage(entries.map((e) => e.value))
  const enough = entries.length >= MIN_FOR_TREND

  return (
    <Card>
      <label htmlFor="metric" className="block text-sm font-semibold text-ink">
        {spec.label} eintragen
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="metric"
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={spec.unit}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <div className="shrink-0 basis-28">
          <Button type="button" onClick={submit} disabled={saving || value.trim() === ''}>
            {saving ? '…' : 'Sichern'}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-ink">
          {error}
        </p>
      )}

      {entries.length > 0 && (
        <dl className="mt-4 flex items-baseline justify-between gap-4 text-sm">
          <dt className="text-muted">
            {enough ? `Trend (${MIN_FOR_TREND}-Werte-Mittel)` : 'Zuletzt'}
          </dt>
          <dd className="font-semibold text-ink">
            {formatNumber(enough ? average : entries[entries.length - 1].value)} {spec.unit}
          </dd>
        </dl>
      )}

      {entries.length > 0 && !enough && (
        <Note>
          Ab {MIN_FOR_TREND} Werten zeigt die App den gleitenden Mittelwert statt des Tageswerts.
          Einzelne Tage schwanken und sagen für sich genommen nichts.
        </Note>
      )}
    </Card>
  )
}

/**
 * How many readings before a trend is shown instead of a single value.
 *
 * Three is the smallest number at which an average means anything at all, and
 * showing one earlier would be dressing a single measurement up as a direction.
 */
const MIN_FOR_TREND = 3

function movingAverage(values: number[]): number {
  const window = values.slice(-MIN_FOR_TREND)
  if (window.length === 0) return 0
  return window.reduce((sum, v) => sum + v, 0) / window.length
}

function formatNumber(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',')
}
