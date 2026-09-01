// The shape of a screen that has not arrived yet.
//
// Used in two places on purpose. `loading.tsx` shows it while the server
// renders the route; RequirePlan shows it while the client fetches the week.
// They are consecutive waits on a cold open, and showing a skeleton for the
// first and a blank page for the second is worse than either alone — the
// screen would appear to be loading, then appear to be broken.
//
// A shape rather than a spinner. A spinner says "wait"; the layout the screen
// is about to have says "it is coming, and here is where".

export function Line({ w, h = 'h-4' }: { w: string; h?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded-[3px] bg-sunken`} />
}

function CardSkeleton() {
  return (
    <div className="rounded-[3px] border border-line bg-surface p-4">
      <div className="flex flex-col gap-2.5">
        <Line w="w-2/3" />
        <Line w="w-full" h="h-3" />
        <Line w="w-4/5" h="h-3" />
      </div>
    </div>
  )
}

export function ScreenSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    // aria-busy rather than a visually hidden "Lädt": a screen reader is told
    // the region is updating without a word being announced on every tap.
    <div aria-busy="true" aria-live="polite">
      <header className="mb-6 flex flex-col gap-2.5">
        <Line w="w-40" h="h-7" />
        <Line w="w-56" h="h-4" />
      </header>

      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
