// Shared presentational primitives.
//
// Kept small on purpose: the brief rules out twenty cards per screen, so the
// component set stays narrow enough that every screen looks like the same app.

import Link from 'next/link'
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

/**
 * The domain, as an ink rather than a pastel.
 *
 * A tag used to be a filled pill in a washed-out tint, which is what a health
 * app looks like. It is a hairline box in the domain's own ink now — the same
 * device as every other border in the app, so a screen reads as one surface.
 * Sleep and mind get their own hues rather than borrowing movement's.
 */
const DOMAIN_CLASS: Record<PlanDomain, string> = {
  training: 'border-training/35 text-training',
  nutrition: 'border-nutrition/35 text-nutrition',
  movement: 'border-movement/35 text-movement',
  sleep: 'border-sleep/35 text-sleep',
  self_improvement: 'border-mind/35 text-mind',
  priority: 'border-accent/35 text-accent',
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-5 pb-28 pt-5">{children}</div>
}

/**
 * The screen's own title.
 *
 * Larger and tighter than before. On a phone the first line has to carry the
 * whole answer to "where am I", and 24px with default tracking read as a
 * paragraph heading rather than as a screen.
 */
export function ScreenTitle({
  title,
  subtitle,
  subtitleClass,
}: {
  title: string
  subtitle?: string
  /** For a subtitle that is a measurement rather than a sentence — a date, a range. */
  subtitleClass?: string
}) {
  return (
    <header className="mb-6">
      <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
        {title}
      </h1>
      {subtitle && (
        <p className={`mt-2 leading-relaxed text-muted ${subtitleClass ?? 'text-[15px]'}`}>
          {subtitle}
        </p>
      )}
    </header>
  )
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="label mb-2.5 mt-8 text-[10px] font-semibold text-faint">
      {children}
    </h2>
  )
}

/**
 * A card is a rectangle with a hairline. No shadow, anywhere in the app.
 *
 * The old one carried a soft drop shadow so it would lift off the warm paper.
 * On white there is nothing to lift off, and a stack of floating panels is
 * half of what made the surface read as generated. Separation comes from the
 * line, the way it does on a printed panel.
 */
export function Card({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' }) {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/25 bg-accent-soft'
      : tone === 'warn'
        ? 'border-warn/25 bg-warn-soft'
        : 'border-line bg-surface'
  return <div className={`rounded-[3px] border ${toneClass} p-4`}>{children}</div>
}

export function DomainBadge({ domain, track }: { domain: PlanDomain; track?: 'goal' | 'baseline' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {track === 'baseline' && (
        // The baseline runs under every goal. Marking it keeps the distinction
        // visible without giving it a second colour system.
        <span className="label text-[10px] font-semibold text-faint">Basis</span>
      )}
      <span
        className={`label rounded-[2px] border px-1.5 py-px text-[10px] font-semibold ${DOMAIN_CLASS[domain]}`}
      >
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
    <div className="rounded-[3px] border border-line bg-surface p-4">
      <div className="label text-[10px] font-semibold text-faint">{label}</div>
      {/* 22px of mono broke "14. November" across two lines and left the tile
          looking like a layout bug. The mono is the point, so the size gives
          way rather than the typeface. */}
      <div className="num mt-1.5 text-[17px] font-medium leading-tight text-ink">{value}</div>
      {/* The hint is a sentence, so it is set like one. Uppercase mono here
          made every tile shout a caption at the reader. */}
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted">{hint}</div>}
    </div>
  )
}

const BUTTON_BASE =
  'inline-flex w-full items-center justify-center rounded-[2px] px-4 py-3 text-sm font-semibold transition disabled:opacity-40'

function buttonLook(variant: 'primary' | 'quiet'): string {
  return variant === 'primary'
    ? 'bg-accent text-accent-ink active:brightness-95'
    : 'border border-line bg-surface text-ink active:bg-sunken'
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
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${BUTTON_BASE} ${buttonLook(variant)}`}
    >
      {children}
    </button>
  )
}

/**
 * A link that looks like a button — one element, not two.
 *
 * The app used to write `<Link><Button>…</Button></Link>`, which renders a
 * `<button>` inside an `<a>`. That is invalid HTML and it is not a
 * technicality: it produces two tab stops for one destination and a nested
 * control announcement on VoiceOver and TalkBack. It mattered most on
 * RequirePlan, whose two links are the only way out when somebody is stuck on
 * a plan that was refused.
 *
 * Deliberately shares BUTTON_BASE with Button rather than copying the classes,
 * so the two cannot drift into looking almost the same.
 */
export function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'quiet'
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${buttonLook(variant)}`}>
      {children}
    </Link>
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
          <div className="h-[3px] w-full overflow-hidden bg-sunken">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, (progress.done / progress.needed) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            <span className="num">{progress.done}</span> von{' '}
            <span className="num">{progress.needed}</span> {progress.unit}
          </p>
        </div>
      )}
    </Card>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-faint">{children}</p>
}
