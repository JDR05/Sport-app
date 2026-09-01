'use client'

// The goal metric over time.
//
// Two things are drawn, and the difference between them is the point: the faint
// dots are what the scale said on a given day, the solid line is the trend.
// A single weigh-in moves a kilo on water alone, so a chart that showed only
// the dots would make someone doing everything right believe they were failing.
// Showing both teaches that in one glance, without a paragraph about it.
//
// Deliberately spare: hairline baseline, no gridlines, no value on every point —
// only the latest is labelled. A number beside every dot is chaos and goes
// unread. Everything else lives in the table below, which is also what a screen
// reader gets, so the chart is never the only way to reach the data.

import { useId, useState } from 'react'

export type Point = { date: string; value: number }

const W = 320
const H = 120
const PAD = { top: 14, right: 34, bottom: 18, left: 8 }

/** Readings averaged for the trend line. Matches MetricEntry's threshold. */
const WINDOW = 3

export function MetricChart({
  points,
  unit,
  label,
  target,
}: {
  points: Point[]
  unit: string
  label: string
  target?: number | null
}) {
  const titleId = useId()
  const [active, setActive] = useState<number | null>(null)

  if (points.length < 2) return null

  const trend = movingAverage(points.map((p) => p.value), WINDOW)

  const values = [...points.map((p) => p.value), ...trend]
  if (typeof target === 'number') values.push(target)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series would divide by zero and, worse, render as a line pinned to
  // one edge. A little padding keeps a genuinely stable value looking stable.
  const span = max - min < 0.5 ? 1 : (max - min) * 1.15
  const mid = (max + min) / 2
  const lo = mid - span / 2

  const x = (i: number) =>
    PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right)
  const y = (v: number) => H - PAD.bottom - ((v - lo) / span) * (H - PAD.top - PAD.bottom)

  const trendPath = trend.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ')
  const latest = points[points.length - 1]
  const shown = active === null ? latest : points[active]

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="sr-only">
        {label} über {points.length} Messungen, in {unit}
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-labelledby={titleId}
        className="block overflow-visible"
        preserveAspectRatio="none"
        style={{ height: H }}
      >
        {typeof target === 'number' && target >= lo && target <= lo + span && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(target)}
              y2={y(target)}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={W - PAD.right + 4}
              y={y(target) + 3}
              className="fill-faint text-[9px]"
            >
              Ziel
            </text>
          </g>
        )}

        {/* Baseline: one hairline, solid. Dashes read as a threshold. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          className="stroke-line"
          strokeWidth={1}
        />

        <path
          d={trendPath}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.value)}
            r={active === i ? 4.5 : 2.5}
            className={active === i ? 'fill-accent' : 'fill-faint'}
            // A 2px surface ring instead of a border, so dots stay separable
            // where the series doubles back on itself.
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}

        {/* Hit targets far bigger than the marks — this is a phone. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={x(i) - 14}
            y={0}
            width={28}
            height={H}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onClick={() => setActive(active === i ? null : i)}
          />
        ))}
      </svg>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-faint">
          {active === null ? 'Zuletzt' : formatDate(shown.date)}
        </span>
        <span className="num text-sm font-semibold text-ink">
          {formatNumber(shown.value)} {unit}
        </span>
      </div>
    </figure>
  )
}

/** Trailing average, so the line ends where the data ends rather than short. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((sum, v) => sum + v, 0) / slice.length
  })
}

function formatNumber(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}
