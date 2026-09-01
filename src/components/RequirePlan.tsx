'use client'

// Guard for every screen that needs a plan.
//
// Whether a goal exists is normally settled on the server: the app layout
// redirects to the onboarding before any of these screens render. This guard
// handles what is left — the wait for the week to arrive, and the three ways it
// can fail to.
//
// Every one of them used to render nothing. `no_goal` fell through to
// `return null`, and a request that threw left the provider stuck on "not
// loaded" for ever. From the sofa both look the same: the app opens to a blank
// screen and stays there, with no way to tell whether it is thinking, broken,
// or waiting for something. So each state says what it knows and offers the
// one thing that helps.

import Link from 'next/link'
import { usePlan, type StoredWeek } from '@/components/PlanProvider'
import { ScreenSkeleton } from '@/components/Skeleton'
import { Button, Card, Screen, ScreenTitle } from '@/components/ui'

export function RequirePlan({ children }: { children: (week: StoredWeek) => React.ReactNode }) {
  const { state, week, planError, retry } = usePlan()

  if (state === 'unsafe') {
    return (
      <Screen>
        <ScreenTitle title="Plan nicht möglich" />
        <Card tone="warn">
          <p className="text-sm leading-relaxed text-ink">
            Die App hat den Plan abgelehnt, weil er eine Sicherheitsgrenze verletzt hätte. Das ist
            gewollt: lieber kein Plan als ein riskanter.
          </p>
          {planError && <p className="mt-2 font-mono text-xs text-muted">{planError}</p>}
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

  if (state === 'no_goal') {
    return (
      <Screen>
        <ScreenTitle title="Noch kein Ziel" />
        <Card>
          <p className="text-sm leading-relaxed text-ink">
            Für einen Plan fehlt noch dein Ziel. Sobald du es beschrieben hast, entsteht daraus
            deine Woche.
          </p>
        </Card>
        <div className="mt-4">
          <Link href="/onboarding">
            <Button>Ziel festlegen</Button>
          </Link>
        </div>
      </Screen>
    )
  }

  if (state === 'failed') {
    return (
      <Screen>
        <ScreenTitle title="Plan nicht geladen" />
        <Card tone="warn">
          <p className="text-sm leading-relaxed text-ink">
            Deine Woche konnte nicht geladen werden. Das liegt an der Verbindung oder am Server,
            nicht an deinen Angaben — es ist nichts verloren gegangen.
          </p>
        </Card>
        <div className="mt-4">
          <Button onClick={retry}>Erneut versuchen</Button>
        </div>
      </Screen>
    )
  }

  // Loading, and the moment between "ready" and the week arriving in state.
  //
  // The same skeleton `loading.tsx` shows, because on a cold open the two
  // waits are consecutive: the server renders the route, then the client
  // fetches the week. A skeleton for the first and a blank page for the second
  // is worse than either — the screen appears to load, then appears to break.
  if (state !== 'ready' || !week) {
    return (
      <Screen>
        <ScreenSkeleton />
      </Screen>
    )
  }
  return <>{children(week)}</>
}
