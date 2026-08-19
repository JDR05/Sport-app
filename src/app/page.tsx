'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlan } from '@/components/PlanProvider'

export default function RootPage() {
  const router = useRouter()
  const { ready, answers } = usePlan()

  useEffect(() => {
    if (!ready) return
    router.replace(answers ? '/today' : '/onboarding')
  }, [ready, answers, router])

  return null
}
