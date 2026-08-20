// The signed-in area.
//
// This is where authorisation actually happens for these screens: requireUser
// verifies the token next to the data, rather than trusting the proxy's
// optimistic redirect. Someone who is signed in but has not finished the
// onboarding has no plan to show, so they are sent to build one.

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { loadPlanInput } from '@/lib/db/plan-input'
import { PlanProvider } from '@/components/PlanProvider'
import { BottomNav } from '@/components/BottomNav'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser()

  // Only the question "is there a goal at all" is answered here. The week
  // itself needs the client's date, so the provider fetches it.
  if (!(await loadPlanInput(user.id))) redirect('/onboarding')

  return (
    <PlanProvider>
      <main>{children}</main>
      <BottomNav />
    </PlanProvider>
  )
}
