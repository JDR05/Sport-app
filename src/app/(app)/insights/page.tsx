// The adaptive engine, pointed at real data for the first time.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { weeklyReview } from '@/lib/db/analysis'
import { InsightsView, type InsightsData } from './InsightsView'

export default async function InsightsPage() {
  const user = await requireUser()
  const today = new Date().toISOString().slice(0, 10)
  const review = await weeklyReview(user.id, today)
  if (!review) redirect('/onboarding')

  const { analysis } = review

  const data: InsightsData = {
    insights: analysis.insights,
    experiment: analysis.experiment
      ? {
          hypothesis: analysis.experiment.hypothesis,
          changeDescription: analysis.experiment.changeDescription,
          endDate: analysis.experiment.endDate,
          evidenceCount: analysis.experiment.evidence.length,
        }
      : null,
    patchNotes: analysis.patch.notes,
    moveCount: analysis.patch.moves.length,
    removalCount: analysis.patch.removals.length,
    weeksWithData: review.weeksWithData,
  }

  return <InsightsView data={data} />
}
