// The Trace mark.
//
// Two strokes on a shared baseline, unequal in height.
//
// That is the product, not a metaphor about it: every plan this app builds has
// two tracks — the health baseline that runs under every goal, and the goal
// track on top of it. The short stroke is the baseline, the tall one is the
// goal, and the goal is the one in the signal colour because it is the thing
// that changes. Nothing here needs a paragraph to be understood, which is the
// test the previous mark failed: an open ring with a dot meant something only
// to whoever wrote the comment under it.
//
// It also survives being small, which is the other test. At 16 px a ring with
// a gap becomes a circle and a crescent becomes a smudge; two vertical strokes
// stay two vertical strokes.

/** The bar geometry, shared by the mark and the app icon so they cannot drift. */
export const BARS = {
  // Short, and always there.
  baseline: { x: 6, y1: 20, y2: 13 },
  // Tall, and the one that grows — so it carries the live colour.
  goal: { x: 14, y1: 20, y2: 5 },
  width: 3.2,
} as const

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Trace"
      className={className}
    >
      {/* The health baseline: always there, always shorter, never the loud one. */}
      <path
        d={`M${BARS.baseline.x} ${BARS.baseline.y1}V${BARS.baseline.y2}`}
        stroke="currentColor"
        strokeWidth={BARS.width}
        strokeLinecap="square"
      />
      {/* The goal track: taller, and in the live colour because it is the part
          that moves. Having these two the wrong way round says the opposite
          about the product, which is why the geometry is named rather than
          written inline. */}
      <path
        d={`M${BARS.goal.x} ${BARS.goal.y1}V${BARS.goal.y2}`}
        className="stroke-accent"
        strokeWidth={BARS.width}
        strokeLinecap="square"
      />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className ?? ''}`}>
      <LogoMark size={18} />
      {/* Set in the mono, uppercase, wide. The wordmark is a readout. */}
      <span className="label text-[13px] font-semibold">Trace</span>
    </span>
  )
}
