'use client'

// Guard for every screen that needs a plan.
//
// Whether answers exist is settled on the server now: the app layout redirects
// to the onboarding before any of these screens render. What is left here is
// the case the server cannot decide — a plan the safety invariants refused —
// plus the first paint, before the client clock is known.

import { usePlan } from '@/components/PlanProvider'
import { Card, Screen, ScreenTitle } from '@/components/ui'
import type { PlanResult } from '@/lib/domain/types'

export function RequirePlan({ children }: { children: (plan: PlanResult) => React.ReactNode }) {
  const { ready, plan, planError } = usePlan()

  if (!ready) return null

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
