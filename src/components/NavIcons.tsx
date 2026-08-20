// Navigation icons.
//
// Geometric and drawn with the same stroke weight, so the bar reads as one row
// rather than five borrowed pictograms. Each one says what the screen is about
// rather than decorating it: today is a single day, plan is a week, progress is
// a ring, insights is a found pattern, profile is a person.
//
// currentColor throughout, so the active state is a colour change and nothing
// else has to be swapped.

type Props = { className?: string }

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconToday({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v3M16 3v3" />
      <path d="M9 13.5l2 2 4-4" />
    </svg>
  )
}

export function IconPlan({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="19" cy="18" r="1.6" />
    </svg>
  )
}

export function IconProgress({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 6.9 4" strokeWidth="2.6" />
    </svg>
  )
}

export function IconInsights({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 16.5l4.5-5 3.5 3 7-8" />
      <circle cx="8.5" cy="11.5" r="1.4" />
      <circle cx="12" cy="14.5" r="1.4" />
    </svg>
  )
}

export function IconProfile({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  )
}
