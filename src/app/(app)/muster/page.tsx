// What the app has worked out about you.
//
// Fortschritt and Insights were two tabs answering one question. Fortschritt
// showed how much of the plan happened; Insights showed what that means. Same
// data, two headings, two taps — and the person had to check both to know
// whether the app had anything to say.
//
// The order is deliberate: numbers first, then what the app reads into them.
// A claim is only worth as much as the count behind it, so the count comes
// first and the sentence second.

import { redirect } from 'next/navigation'
import { Card, Screen, ScreenTitle } from '@/components/ui'
import { requireUser } from '@/lib/auth/session'
import { serverToday } from '@/lib/db/today'
import { weeklyReview } from '@/lib/db/analysis'
import { nextInsight } from '@/lib/adaptive/nextInsight'
import { DOMAIN_LABEL } from '@/components/ui'
import { ProgressSection } from '../progress/ProgressSection'
import { InsightsSection } from '../insights/InsightsSection'

export default async function MusterPage() {
  const user = await requireUser()
  const today = await serverToday()
  const review = await weeklyReview(user.id, today)
  if (!review) redirect('/onboarding')

  // `weeklyReview` is memoised per request, so the two sections below reuse
  // this call rather than making their own.
  const waiting = nextInsight(review.observations)

  return (
    <Screen>
      <ScreenTitle title="Muster" subtitle="Was du tust, und was die App daraus liest." />
      <ProgressSection />
      <InsightsSection />

      {waiting !== null && (
        <div className="mt-6">
          <Card depth="flat">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted">
                {waiting.domain === null
                  ? 'Noch keine Aktion bewertet. Ab der ersten kann die App etwas erkennen.'
                  : `Noch ${waiting.missing} ${waiting.missing === 1 ? 'Bewertung' : 'Bewertungen'} bei ${DOMAIN_LABEL[waiting.domain]}.`}
              </p>
              <span className="num shrink-0 text-xs text-faint">
                {waiting.done}/{waiting.needed}
              </span>
            </div>
            <div className="mt-3 h-[3px] w-full overflow-hidden rounded-control bg-sunken">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, (waiting.done / waiting.needed) * 100)}%` }}
              />
            </div>
          </Card>
        </div>
      )}
    </Screen>
  )
}
