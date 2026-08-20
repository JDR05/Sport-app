'use client'

import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-semibold text-ink">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

const CHIP_BASE =
  'rounded-xl border px-3 py-2 text-sm font-medium transition select-none'

// Written out rather than interpolated: Tailwind scans the source for literal
// class names, so `grid-cols-${n}` would silently produce no styles at all.
const COLUMNS: Record<2 | 3 | 4 | 5, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}
const CHIP_ON = 'border-accent bg-accent text-accent-ink'
const CHIP_OFF = 'border-line bg-surface text-ink active:bg-sunken'

export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
  columns?: 2 | 3 | 4 | 5
}) {
  return (
    <div className={`grid gap-2 ${COLUMNS[columns]}`} role="group">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`${CHIP_BASE} ${value === option.value ? CHIP_ON : CHIP_OFF}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function MultiChoice<T extends string>({
  options,
  values,
  onChange,
  columns = 2,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  values: T[]
  onChange: (values: T[]) => void
  columns?: 2 | 3 | 4 | 5
}) {
  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])

  return (
    <div className={`grid gap-2 ${COLUMNS[columns]}`} role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={values.includes(option.value)}
          onClick={() => toggle(option.value)}
          className={`${CHIP_BASE} ${values.includes(option.value) ? CHIP_ON : CHIP_OFF}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  placeholder,
}: {
  value: number | null
  onChange: (value: number | null) => void
  suffix?: string
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-transparent text-base tabular-nums text-ink outline-none placeholder:text-faint"
      />
      {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
    </div>
  )
}

export function DateInput({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none"
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-accent"
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
    />
  )
}

export function TimeInput({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <input
      type="time"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base tabular-nums text-ink outline-none"
    />
  )
}

export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-sunken'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">
        Schritt {step + 1} von {total}
      </p>
    </div>
  )
}
