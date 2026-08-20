// The Cadence mark.
//
// An open ring with one beat sitting outside it.
//
// The ring is the week — the same progress ring the app draws on Progress and
// Today, so the logo is not a decoration bolted on but the thing the product
// actually shows you. The gap makes it read as a C, and the accented beat is
// the one that left the loop: the change the app tried because the original
// rhythm never worked for this person.
//
// That is the whole product in a glyph, and it still resolves at 16 pixels,
// which rules out anything cleverer.
//
// Geometry note: the arc runs clockwise from the lower terminal (50°) to the
// upper one (-62°) the long way round, so the opening faces right. Writing the
// two gap ends the other way round draws the short arc instead, which produces
// a crescent — worth stating, because it is not obvious from the numbers.

const RING = 'M17.40 18.43 A8.4 8.4 0 1 1 15.94 4.58'

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
      <path d={RING} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* The beat that moved. */}
      <circle cx="20.31" cy="7.2" r="2.8" className="fill-accent" />
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
