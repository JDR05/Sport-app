'use client'

// Guard for every screen that needs a plan. Sends a user with no answers back to
// the onboarding, and surfaces a refused plan instead of rendering a broken one.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlan } from '@/components/PlanProvider'
import { Card, Screen, ScreenTitle } from '@/components/ui'
import type { PlanResult } from '@/lib/domain/types'

export function RequirePlan({ children }: { children: (plan: PlanResult) => React.ReactNode }) {
  const router = useRouter()
  const { ready, answers, plan, planError } = usePlan()

  useEffect(() => {
    if (ready && !answers) router.replace('/onboarding')
  }, [ready, answers, router])

  if (!ready || !answers) return null

  if (planError) {
    return (
      <Screen>
        <ScreenTitle title="Plan nicht möglich" />
        <Card tone="warn">
          <p className="text-sm leading-relaxed text-ink">
            Die App hat den Plan abgelehnt, weil er eine Sicherheitsgrenze verletzt hätte. Das ist
            gewollt: lieber kein Plan als ein riskanter.
          </p>
          <p className="mt-2 font-mono text-xs text-muted">{planError}</p>
        </Card>
      </Screen>
    )
  }

  if (!plan) return null
  return <>{children(plan)}</>
}
