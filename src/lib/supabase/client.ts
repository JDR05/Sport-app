// Supabase in the browser.
//
// createBrowserClient is a singleton internally, so calling this repeatedly is
// free. Used only where a Client Component genuinely needs Supabase — signing
// in, signing out. Reading data belongs on the server.

import { createBrowserClient } from '@supabase/ssr'
import { supabasePublishableKey, supabaseUrl } from './env'

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey())
}
