// Generates the key pair that lets this deployment send push notifications.
//
// Run once, locally:  npx tsx scripts/vapid-keys.ts
//
// The public key goes in NEXT_PUBLIC_VAPID_PUBLIC_KEY and reaches browsers by
// design — it is what a browser encrypts a subscription to. The private key is
// a secret: it belongs in the deployment's environment variables and nowhere
// else, least of all in a chat window or a commit.

import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log(`
Add these to your deployment's environment variables:

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}
  VAPID_SUBJECT=mailto:deine@adresse.de

And a shared secret for the scheduler, in two places that must match:

  CRON_SECRET=<generate one, e.g. openssl rand -hex 32>

  …and in the database:
  insert into public.app_secrets (key, value)
  values ('cron_secret', '<the same value>')
  on conflict (key) do update set value = excluded.value;

The private key is a secret. Do not paste it anywhere but the environment.
`)
