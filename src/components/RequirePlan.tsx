'use client'

// Guard for every screen that needs a plan.
//
// Whether a goal exists is settled on the server: the app layout redirects to
// the onboarding before any of these screens render. What is left here is the
// wait for the week to arrive, and the one case the server cannot decide away —
// a plan the safety invariants refused.

import Link from 'next/link'
import { usePlan, type StoredWeek } from '@/components/PlanProvider'
import { Button, Card, Screen, ScreenTitle } from '@/components/ui'

export function RequirePlan({ children }: { children: (week: StoredWeek) => React.ReactNode }) {
  const { ready, week, planError } = usePlan()

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

        {/* Every screen behind this guard shows the same thing, so without a way
            out from here the person is stuck: the only route back to the
            onboarding used to sit inside this very guard. */}
        <div className="mt-4">
          <Link href="/onboarding">
            <Button variant="quiet">Angaben ändern</Button>
          </Link>
        </div>
      </Screen>
    )
  }

  if (!ready || !week) return null
  return <>{children(week)}</>
}
