'use client'

// One planned action, with its status control and its reasoning.
//
// Four statuses, not three. `missed` and `not_relevant` mean different things to
// the adaptive engine — one is a behavioural signal, the other a planning error —
// and the user is the only one who can tell them apart. Untouched items stay
// `unknown`, which never feeds pattern detection (ADR-011).

import { DomainBadge, Reasoning } from '@/components/ui'
import type { PlannedItem, PlanItemStatus } from '@/lib/domain/types'

const OPTIONS: Array<{ status: PlanItemStatus; label: string }> = [
  { status: 'done', label: 'Erledigt' },
  { status: 'moved', label: 'Verschoben' },
  { status: 'missed', label: 'Nicht geschafft' },
  { status: 'not_relevant', label: 'Passte nicht' },
]

export function ActionItem({
  item,
  status,
  onStatus,
}: {
  item: PlannedItem
  status: PlanItemStatus
  onStatus: (status: PlanItemStatus) => void
}) {
  const settled = status !== 'planned' && status !== 'unknown'

  return (
    <article
      className={`rounded-2xl border border-line bg-surface p-4 transition ${settled ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={`text-[15px] font-semibold text-ink ${status === 'done' ? 'line-through' : ''}`}>
          {item.title}
        </h3>
        <DomainBadge domain={item.domain} />
      </div>

      {item.plannedDurationMin && (
        <p className="mt-0.5 text-xs text-faint">{item.plannedDurationMin} Min</p>
      )}

      <Reasoning>{item.rationale.text}</Reasoning>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => (
          <button
            key={option.status}
            type="button"
            aria-pressed={status === option.status}
            onClick={() => onStatus(status === option.status ? 'unknown' : option.status)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              status === option.status
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-muted active:bg-sunken'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </article>
  )
}
