// A ring is a measurement, not a reward.
//
// It does not turn green at a threshold, it does not celebrate, and it may go
// down — the playbook rules out gamification and streaks, and a ring is the
// easiest place in an app to smuggle both back in.
//
// The number it shows is only ever over what the person actually judged. So the
// count it rests on is drawn beside it, always: "100 %" from two judged actions
// out of nine is honest and misleading at the same time, and only the second
// line resolves that.
//
// An unjudged week shows an empty track and a dash. Not zero — zero would be a
// claim, and nothing is known yet.

import type { PlanDomain } from '@/lib/domain/types'

const DOMAIN_CLASS: Record<PlanDomain, string> = {
  training: 'text-training',
  nutrition: 'text-nutrition',
  movement: 'text-movement',
  sleep: 'text-sleep',
  self_improvement: 'text-mind',
  priority: 'text-accent',
}

export function ScoreRing({
  rate,
  size = 64,
  domain,
  label,
  detail,
}: {
  rate: number | null
  size?: number
  domain?: PlanDomain
  label: string
  detail?: string
}) {
  const stroke = size >= 96 ? 8 : 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const filled = rate === null ? 0 : circumference * rate

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {/* The track is the whole week; the arc is what is known about it. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-line"
            strokeWidth={stroke}
          />
          {rate !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              className={domain ? DOMAIN_CLASS[domain] : 'text-accent'}
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              // Start at twelve o'clock rather than three.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`num font-semibold text-ink ${size >= 96 ? 'text-xl' : 'text-sm'}`}
          >
            {rate === null ? '–' : `${Math.round(rate * 100)}`}
            {rate !== null && <span className="text-[0.7em] font-medium text-muted">%</span>}
          </span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs font-medium text-ink">{label}</p>
        {detail && <p className="text-[11px] leading-tight text-faint">{detail}</p>}
      </div>
    </div>
  )
}
