// The Cadence mark.
//
// Four beats. Three sit where a plan would put them; the third is lower and
// carries the accent — the beat the app moved because the original one never
// worked for this person.
//
// That is the whole product in a glyph: a rhythm, and the willingness to
// change it. It also survives 16 pixels, which rules out anything cleverer.
//
// Drawn with currentColor so it inherits from wherever it sits, with the moved
// beat as the single accented element.

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Cadence"
      className={className}
    >
      <rect x="2" y="10" width="3.5" height="12" rx="1.75" fill="currentColor" />
      <rect x="8" y="5" width="3.5" height="17" rx="1.75" fill="currentColor" />
      {/* The moved beat. */}
      <rect x="14" y="15" width="3.5" height="7" rx="1.75" className="fill-accent" />
      <rect x="20" y="7" width="3.5" height="15" rx="1.75" fill="currentColor" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className ?? ''}`}>
      <LogoMark size={20} />
      <span className="text-[17px] font-semibold tracking-tight">Cadence</span>
    </span>
  )
}
