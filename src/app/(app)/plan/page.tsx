// The week lives in Heute now, on the strip across the top.
//
// Plan was a tab whose every row was a link back to Heute — seven of them, and
// nothing else. The strip already goes to any day of the week in one tap, so
// the tab was a second way to do the same thing, costing a fifth of the bottom
// bar. Kept as a redirect because the path is bookmarked, cached by the
// service worker, and linked from older notifications.
import { redirect } from 'next/navigation'

export default function PlanPage() {
  redirect('/today')
}
