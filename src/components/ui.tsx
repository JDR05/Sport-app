// Shared presentational primitives.
//
// Kept small on purpose: the brief rules out twenty cards per screen, so the
// component set stays narrow enough that every screen looks like the same app.

import type { ReactNode } from 'react'
import type { PlanDomain } from '@/lib/domain/types'

export const DOMAIN_LABEL: Record<PlanDomain, string> = {
  training: 'Training',
  nutrition: 'Ernährung',
  movement: 'Bewegung',
  sleep: 'Schlaf',
  self_improvement: 'Routine',
  priority: 'Fokus',
}

const DOMAIN_CLASS: Record<PlanDomain, string> = {
  training: 'bg-training-soft text-training',
  nutrition: 'bg-nutrition-soft text-nutrition',
  movement: 'bg-movement-soft text-movement',
  sleep: 'bg-movement-soft text-movement',
  self_improvement: 'bg-accent-soft text-accent',
  priority: 'bg-accent-soft text-accent',
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-5 pb-28 pt-6">{children}</div>
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  )
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wider text-faint">
      {children}
    </h2>
  )
}

export function Card({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' }) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent-soft border-transparent'
      : tone === 'warn'
        ? 'bg-warn-soft border-transparent'
        : 'bg-surface border-line'
  return <div className={`rounded-2xl border ${toneClass} p-4`}>{children}</div>
}

export function DomainBadge({ domain, track }: { domain: PlanDomain; track?: 'goal' | 'baseline' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {track === 'baseline' && (
        // The baseline runs under every goal. Marking it keeps the distinction
        // visible without giving it a second colour system.
        <span className="text-[10px] font-medium uppercase tracking-wide text-faint">Basis</span>
      )}
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${DOMAIN_CLASS[domain]}`}>
        {DOMAIN_LABEL[domain]}
      </span>
    </span>
  )
}

/**
 * The "why" behind a recommendation. Always available, never in the way: the
 * brief asks for explainability without turning every card into an essay.
 */
export function Reasoning({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted underline decoration-line underline-offset-4 marker:hidden">
        <span className="group-open:hidden">Warum?</span>
        <span className="hidden group-open:inline">Weniger</span>
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </details>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'quiet'
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const base =
    'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-40'
  const look =
    variant === 'primary'
      ? 'bg-accent text-accent-ink active:brightness-95'
      : 'border border-line bg-surface text-ink active:bg-sunken'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look}`}>
      {children}
    </button>
  )
}

/**
 * Used wherever the app has nothing to show yet. Never pretends: it says what
 * is missing and what will make it appear. Missing data is not a failure.
 */
export function EmptyState({
  title,
  body,
  progress,
}: {
  title: string
  body: string
  progress?: { done: number; needed: number; unit: string }
}) {
  return (
    <Card>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      {progress && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.min(100, (progress.done / progress.needed) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-faint">
            {progress.done} von {progress.needed} {progress.unit}
          </p>
        </div>
      )}
    </Card>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-faint">{children}</p>
}
