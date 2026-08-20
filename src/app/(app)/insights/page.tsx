// The adaptive engine, pointed at real data for the first time.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { serverToday } from '@/lib/db/today'
import { weeklyReview } from '@/lib/db/analysis'
import { concludeIfDue, loadRunningExperiment } from '@/lib/db/experiments'
import { InsightsView, type InsightsData } from './InsightsView'

export default async function InsightsPage() {
  const user = await requireUser()
  const today = await serverToday()

  // Settling a finished experiment before reading the analysis matters: its
  // rule has to be in place before the next plan is built, or the change the
  // person agreed to would silently skip a week.
  const concluded = await concludeIfDue(user.id, today)
  const running = await loadRunningExperiment(user.id)

  const review = await weeklyReview(user.id, today)
  if (!review) redirect('/onboarding')

  const { analysis } = review

  const data: InsightsData = {
    today,
    // While one is running, no second proposal is shown. One variable at a
    // time is what makes either result readable.
    insights: analysis.insights,
    experiment: running
      ? null
      : analysis.experiment
      ? {
          hypothesis: analysis.experiment.hypothesis,
          changeDescription: analysis.experiment.changeDescription,
          endDate: analysis.experiment.endDate,
          evidenceCount: analysis.experiment.evidence.length,
        }
      : null,
    running: running
      ? {
          hypothesis: running.hypothesis,
          changeDescription: running.changeDescription,
          endDate: running.endDate,
        }
      : null,
    concluded: concluded
      ? {
          hypothesis: concluded.hypothesis,
          reason: concluded.evaluation.reason,
          ruleWritten: concluded.ruleWritten,
        }
      : null,
    patchNotes: analysis.patch.notes,
    moveCount: analysis.patch.moves.length,
    removalCount: analysis.patch.removals.length,
    weeksWithData: review.weeksWithData,
  }

  return <InsightsView data={data} />
}
