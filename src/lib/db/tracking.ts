// Check-ins and measurements.
//
// Two kinds of number live here and they are never mixed. A check-in records
// how a day felt; a measurement records what a goal metric stands at. Only the
// first is behaviour, and ADR-012 lets nothing but behaviour decide an
// experiment — a rule derived from two weeks of weight would be a rule derived
// from noise, and it would stay in the personal model.
//
// `metric_class` is written here rather than inferred later, and the database
// refuses to change it afterwards.

import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type CheckIn = {
  checkedInOn: string
  energy: number | null
  mood: number | null
  /** 1..5, and the one scale that reads upwards: 5 is a lot of stress. */
  stress: number | null
  /** Hours, to one decimal. What the person thinks they slept, not a sensor. */
  sleepHours: number | null
  /** 1..5, higher is better. A rough sense of the eating, not a food diary. */
  dietQuality: number | null
  /** 1..5, reads upwards: 5 is heavy soreness. */
  soreness: number | null
  /** Standard drinks. A count, never shown back as a judgement. */
  alcoholUnits: number | null
  /** Caffeine after about four — the part that reaches the night. */
  caffeineLate: boolean | null
  note: string | null
}

export type Measurement = {
  metricKey: string
  value: number
  unit: string
  measuredAt: string
}

/** One per day, replaced rather than appended: a day has one summary. */
export async function saveCheckIn(
  profileId: string,
  checkIn: CheckIn,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase.from('check_ins').upsert(
    {
      profile_id: profileId,
      checked_in_on: checkIn.checkedInOn,
      energy: checkIn.energy,
      mood: checkIn.mood,
      stress: checkIn.stress,
      sleep_hours: checkIn.sleepHours,
      diet_quality: checkIn.dietQuality,
      soreness: checkIn.soreness,
      alcohol_units: checkIn.alcoholUnits,
      caffeine_late: checkIn.caffeineLate,
      note: checkIn.note,
    },
    { onConflict: 'profile_id,checked_in_on' },
  )
  return { ok: error === null }
}

export async function loadCheckIns(profileId: string, since: string): Promise<CheckIn[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('check_ins')
    .select('*')
    .eq('profile_id', profileId)
    .gte('checked_in_on', since)
    .order('checked_in_on', { ascending: true })

  return (data ?? []).map((row) => ({
    checkedInOn: row.checked_in_on,
    energy: row.energy,
    mood: row.mood,
    stress: row.stress,
    sleepHours: row.sleep_hours === null ? null : Number(row.sleep_hours),
    dietQuality: row.diet_quality,
    soreness: row.soreness,
    alcoholUnits: row.alcohol_units === null ? null : Number(row.alcohol_units),
    caffeineLate: row.caffeine_late,
    note: row.note,
  }))
}

/**
 * Appended, never replaced. A goal metric is a series — the whole point is the
 * trend, and overwriting yesterday would destroy exactly the thing that makes
 * it readable.
 */
export async function saveMeasurement(
  profileId: string,
  metricKey: string,
  value: number,
  unit: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase.from('measurements').insert({
    profile_id: profileId,
    metric_key: metricKey,
    // A goal metric is what someone wants to reach, never how they behaved.
    // Writing it as `outcome` is what keeps it out of experiment evaluation.
    metric_class: 'outcome',
    value,
    unit,
  })
  return { ok: error === null }
}

export async function loadMeasurements(
  profileId: string,
  metricKey: string,
): Promise<Measurement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('measurements')
    .select('*')
    .eq('profile_id', profileId)
    .eq('metric_key', metricKey)
    .order('measured_at', { ascending: true })

  return (data ?? []).map((row) => ({
    metricKey: row.metric_key,
    value: Number(row.value),
    unit: row.unit,
    measuredAt: row.measured_at,
  }))
}
