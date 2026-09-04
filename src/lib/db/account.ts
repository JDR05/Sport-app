// The two rights a person has over their own data.
//
// Article 15/20 GDPR — a copy, in a machine-readable form — and Article 17,
// erasure. For an app processing health data under Article 9 neither is
// optional, and neither is served by "write us an email": the whole point is
// that the person does not have to ask anyone.
//
// Both go through the user's own session, so row level security is what scopes
// them. There is no profile id parameter to get wrong: the database answers
// with this person's rows because it is this person asking, which is the same
// property that makes the rest of the app safe.

import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Every table that holds something about a person.
 *
 * Written out rather than discovered, because an export that silently misses a
 * table is worse than no export — it answers "is that everything?" with a
 * confident yes. The list is checked against the schema by a test, so adding a
 * table without adding it here fails the build rather than quietly shipping a
 * partial answer.
 */
export const EXPORTED_TABLES = [
  'profiles',
  'goals',
  'goal_metrics',
  'schedules',
  'constraints',
  'plans',
  'plan_items',
  'check_ins',
  'measurements',
  'insights',
  'experiments',
  'experiment_results',
  'personal_rules',
  'weekly_notes',
  'ai_questions',
  'app_questions',
] as const

export type AccountExport = {
  exportedAt: string
  /** What this file is, in the file itself. */
  about: string
  tables: Record<string, unknown[]>
}

/**
 * Everything stored about the signed-in person, as one object.
 *
 * Deliberately raw rows rather than a prettied-up summary. The point of a data
 * export is that it is *the data*, not this app's opinion about it — somebody
 * checking what was kept about them is entitled to the columns, not to a
 * readable digest of them.
 */
export async function exportEverything(): Promise<AccountExport> {
  const supabase = await createClient()

  const tables: Record<string, unknown[]> = {}
  for (const table of EXPORTED_TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    // A failed read is reported inside the file rather than silently omitted.
    // A missing table would read as "nothing was stored", which is a different
    // and much worse answer than "this could not be read".
    tables[table] = error ? [{ __error: error.message }] : (data ?? [])
  }

  return {
    exportedAt: new Date().toISOString(),
    about:
      'Vollständiger Export deiner Daten aus Trace (Art. 15 und 20 DSGVO). ' +
      'Eine Zeile hier ist eine Zeile in der Datenbank — nichts ist zusammengefasst ' +
      'oder weggelassen.',
    tables,
  }
}

/**
 * Deletes the account and, by cascade, every row belonging to it.
 *
 * Calls a `security definer` function in the database rather than deleting rows
 * from here. Two reasons, and the second is the one that matters: the login
 * itself lives in `auth.users`, which no ordinary session may touch — deleting
 * only the `public` rows would leave an email address behind and call it
 * erasure. And every table cascades from that one row, so there is no list to
 * keep in step with the schema.
 */
export async function deleteOwnAccount(): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_own_account')
  return { ok: error === null, error: error?.message ?? null }
}
