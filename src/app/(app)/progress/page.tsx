// Progress, read from what was actually recorded.
//
// The goal metric is loaded here rather than in the client, so the history and
// the plan come from the same place and cannot disagree.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { serverToday } from '@/lib/db/today'
import { loadPlanInput } from '@/lib/db/plan-input'
import { loadMeasurements } from '@/lib/db/tracking'
import { weeklyReview } from '@/lib/db/analysis'
import { isResolved } from '@/lib/adaptive/detect'
import { ProgressView, type ProgressData } from './ProgressView'
import type { MetricSpec } from '@/components/MetricEntry'

// What each metric is called on screen. Only the metric belonging to the
// active goal ever appears here — a sleep goal shows hours, never kilograms,
// even though the weight is stored and still informs the plan.
const UNIT_LABEL: Record<string, string> = {
  weight_kg: 'Gewicht',
  distance_km: 'Wochenumfang',
  load_kg: 'Trainingslast',
  sleep_hours: 'Schlaf',
}

export default async function ProgressPage() {
  const user = await requireUser()
  const input = await loadPlanInput(user.id)
  if (!input) redirect('/onboarding')

  const today = await serverToday()
  const review = await weeklyReview(user.id, today)

  const metric = input.metrics[0]
  const spec: MetricSpec | null = metric
    ? {
        metricKey: metric.metricKey,
        unit: metric.unit,
        label: UNIT_LABEL[metric.metricKey] ?? 'Zielwert',
        target: metric.targetValue,
      }
    : null

  const history = spec
    ? (await loadMeasurements(user.id, spec.metricKey)).map((m) => ({
        value: m.value,
        measuredAt: m.measuredAt,
      }))
    : []

  const data: ProgressData = {
    spec,
    history,
    completion: review?.completion ?? null,
    completionThisWeek: review?.completionThisWeek ?? null,
    weeksWithData: review?.weeksWithData ?? 0,
    resolvedCount: review?.observations.filter(isResolved).length ?? 0,
  }

  return <ProgressView data={data} />
}
