// Fortschritt is part of Muster now. Kept as a redirect rather than deleted:
// the path is in bookmarks, in the service worker's cache and in old links.
import { redirect } from 'next/navigation'

export default function ProgressPage() {
  redirect('/muster')
}
