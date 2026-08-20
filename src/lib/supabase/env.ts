// The two public Supabase values, read once and checked once.
//
// Both are NEXT_PUBLIC_ on purpose: the publishable key is designed to sit in
// the browser bundle. It is an address, not a password. What protects the data
// is row level security — 52 policies, every one filtering on auth.uid(). See
// ADR-034 for why the secret key is deliberately absent from this deployment.
//
// Failing loudly here beats a Supabase client that silently points at
// "undefined" and produces a login screen that never works.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is not set. Add it to .env.local for local development, or to the ` +
        `project's environment variables in the deployment.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabasePublishableKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}
