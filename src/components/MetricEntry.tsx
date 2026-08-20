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
import { MetricChart } from '@/components/MetricChart'
import { Button, Card, Note } from '@/components/ui'

export type MetricSpec = {
  metricKey: string
  unit: string
  label: string
  /** Drawn as a reference line, when the goal has a number to reach. */
  target?: number | null
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

      {entries.length >= 2 ? (
        <>
          <div className="mt-4">
            <MetricChart
              points={entries.map((e) => ({ date: e.measuredAt, value: e.value }))}
              unit={spec.unit}
              label={spec.label}
              target={spec.target}
            />
          </div>
          <p className="mt-1 text-xs text-faint">
            Punkte sind deine Tageswerte, die Linie ist der Trend. Einzelne Tage schwanken —
            die Linie ist das, was zählt.
          </p>

          {/* The data as data. Also what a screen reader reads, so the chart is
              never the only route to it. */}
          <details className="mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted underline decoration-line underline-offset-4">
              Alle Werte
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-faint">
                <tr>
                  <th scope="col" className="font-medium">Datum</th>
                  <th scope="col" className="text-right font-medium">{spec.label}</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.measuredAt}>
                    <td className="py-0.5 text-muted">
                      {new Date(e.measuredAt).toLocaleDateString('de-DE')}
                    </td>
                    <td className="tnum py-0.5 text-right text-ink">
                      {formatNumber(e.value)} {spec.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : entries.length === 1 ? (
        <>
          <dl className="mt-4 flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-muted">Zuletzt</dt>
            <dd className="tnum font-semibold text-ink">
              {formatNumber(entries[0].value)} {spec.unit}
            </dd>
          </dl>
          <Note>
            Ab dem zweiten Wert zeichnet die App den Verlauf. Ein einzelner Wert ist noch
            keine Richtung.
          </Note>
        </>
      ) : null}
    </Card>
  )
}

function formatNumber(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',')
}
