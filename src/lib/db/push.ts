// Storing and removing a device's reminder subscription.
//
// A push subscription is an endpoint the browser's push service issued, plus
// two keys used to encrypt the payload for it. It is not a fact about a person
// — which is why reminders cost no new data category, and why the row holds
// nothing but the endpoint, the keys, an hour and a time zone.

import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type PushSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  remindHour: number
  timeZone: string
}

export type ReminderSettings = { enabled: boolean; remindHour: number }

/**
 * Saves this device's subscription, or updates it in place.
 *
 * Keyed on the endpoint because re-subscribing on the same device returns the
 * same one — without the conflict clause, a person who reinstalls gets two rows
 * and two notifications for one reminder.
 */
export async function saveSubscription(
  profileId: string,
  sub: PushSubscriptionInput,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      remind_hour: sub.remindHour,
      time_zone: sub.timeZone,
    },
    { onConflict: 'endpoint' },
  )
  return { ok: error === null }
}

/** Changes the hour on every device this person has. */
export async function setReminderHour(
  profileId: string,
  hour: number,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ remind_hour: hour })
    .eq('profile_id', profileId)
  return { ok: error === null }
}

/**
 * Removes a subscription.
 *
 * Turning reminders off deletes the row rather than flagging it. A disabled
 * subscription is still a stored endpoint, and "I turned it off" should mean
 * the app no longer holds a way to reach that device.
 */
export async function removeSubscription(
  profileId: string,
  endpoint: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('profile_id', profileId)
    .eq('endpoint', endpoint)
  return { ok: error === null }
}

/** What the settings screen shows. */
export async function reminderSettings(profileId: string): Promise<ReminderSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('push_subscriptions')
    .select('remind_hour')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle()

  return { enabled: data !== null, remindHour: data?.remind_hour ?? 20 }
}
