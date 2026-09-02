'use client'

// What "reload" means inside the app.
//
// Two halves, and either one alone leaves half the screen stale. The week
// lives in client state and is re-fetched through the provider; everything
// else on these screens — the impulse on Insights, the profile, the playbook —
// is server-rendered, and only `router.refresh()` brings that back.
//
// Separate from PullToRefresh because the gesture is not the only way to ask
// for this, and because a component that owns a gesture should not also decide
// what the app's data is.

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { PullToRefresh } from '@/components/PullToRefresh'
import { usePlan } from '@/components/PlanProvider'

export function AppRefresh({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { refresh } = usePlan()

  const both = useCallback(async () => {
    // Awaited so the indicator is honest: it stays until the data is actually
    // back, rather than disappearing the moment the request leaves.
    await refresh()
    router.refresh()
  }, [refresh, router])

  return <PullToRefresh onRefresh={both}>{children}</PullToRefresh>
}
