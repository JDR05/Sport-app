// Filling in the days the app has no answers for.
//
// A screen of its own rather than more navigation on Heute, and the reason is
// what Heute is: one day, the one you are in, with the week strip to step
// across it. Teaching it to page backwards through weeks would have made it a
// history browser as well — a second job for the screen whose whole design rule
// is "was ist heute wichtig?".
//
// This does one thing instead. It is not a place to browse, plan or change
// anything: no moves, no reactions, no AI, no week generation. Every action here
// gets one of two answers and then the screen has nothing left to offer.

import { requireUser } from '@/lib/auth/session'
import { serverToday } from '@/lib/db/today'
import { loadCatchUp } from '@/lib/db/catch-up'
import { CatchUpView } from './CatchUpView'

export default async function CatchUpPage() {
  const user = await requireUser()
  // The server's day, not the client's, and this is the one screen where that
  // is the better of the two. Everywhere else the client's clock decides,
  // because a Berlin evening must not be handed yesterday. Here the difference
  // is at most one day at the boundary of a two-week window, and the alternative
  // is rendering nothing until a round trip has told the server what day it is.
  const days = await loadCatchUp(user.id, await serverToday())

  return <CatchUpView days={days} />
}
