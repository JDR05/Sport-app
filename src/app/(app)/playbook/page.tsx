// The personal model, read from the database.
//
// Only confirmed experiments write here (ADR-013), so whatever this screen
// shows has been earned rather than guessed.

import { requireUser } from '@/lib/auth/session'
import { loadPersonalRules } from '@/lib/db/experiments'
import { PlaybookView } from './PlaybookView'

export default async function PlaybookPage() {
  const user = await requireUser()
  return <PlaybookView rules={await loadPersonalRules(user.id)} />
}
