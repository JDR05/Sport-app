// What a tap on the bottom bar looks like before the server answers.
//
// Every screen here is force-dynamic, so a navigation is a real round trip.
// Without a loading boundary Next keeps the *old* page on screen for the whole
// of it — the tab is tapped, nothing moves, and the app reads as frozen. That
// was the complaint: not that the data is slow, but that nothing acknowledged
// the tap.

import { ScreenSkeleton } from '@/components/Skeleton'
import { Screen } from '@/components/ui'

export default function Loading() {
  return (
    <Screen>
      <ScreenSkeleton />
    </Screen>
  )
}
