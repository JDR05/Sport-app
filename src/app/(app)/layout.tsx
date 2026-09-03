// The signed-in area.
//
// This is where authorisation actually happens for these screens: requireUser
// verifies the token next to the data, rather than trusting the proxy's
// optimistic redirect. Someone who is signed in but has not finished the
// onboarding has no plan to show, so they are sent to build one.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { hasCompletedIntake } from '@/lib/db/plan-input'
import { PlanProvider } from '@/components/PlanProvider'
import { BottomNav } from '@/components/BottomNav'
import { TimeZoneSync } from '@/components/TimeZoneSync'
import { AppHeader } from '@/components/AppHeader'
import { AppRefresh } from '@/components/AppRefresh'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser()

  // Only the question "is there a goal at all" is answered here, and it is
  // answered with two indexed lookups rather than by loading the whole plan
  // input. On Heute and Plan — client shells that fetch their week themselves —
  // that used to be seven selects per tab tap with nothing reading the result.
  if (!(await hasCompletedIntake(user.id))) redirect('/onboarding')

  return (
    <PlanProvider>
      <TimeZoneSync />
      {/* Inside the provider, because refreshing means re-fetching the week as
          well as re-rendering the server components. */}
      <AppRefresh>
        <AppHeader />
        <main>{children}</main>
        <BottomNav />
      </AppRefresh>
    </PlanProvider>
  )
}
