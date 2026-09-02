// Changing the week you already have, after the onboarding.
//
// It could only be entered once, at signup, which is wrong twice over: nobody
// has their week straight on the day they sign up, and a week is not a fixed
// thing — a season starts, a shift pattern changes, a course ends. The app
// then plans around a life the person no longer has, and there was no way to
// tell it otherwise short of redoing the whole intake and losing the goal's
// history with it.

import { requireUser } from '@/lib/auth/session'
import { loadCommitments } from '@/lib/db/commitments'
import { CommitmentsView } from './CommitmentsView'

export default async function CommitmentsPage() {
  const user = await requireUser()
  return <CommitmentsView initial={await loadCommitments(user.id)} />
}
