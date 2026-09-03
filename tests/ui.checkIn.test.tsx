// The question the app asks about the day.
//
// "Das mit wie es mir heute geht — Essen, Stress — hast du komplett entfernt.
//  Gibt's jetzt einfach nicht mehr."
//
// It had not been removed. It rendered `null` until `getCheckIns` came back and
// there was no catch on that call, so a single failed response left the card
// invisible for the rest of the session with nothing on screen to say why. From
// the sofa that is the same thing as deletion — and everything the adaptive
// engine knows about how a week *felt* comes from this card, so an invisible one
// is a silent hole in the data the whole product is built on.
//
// The rule these tests hold: the scales need no server data to be usable, so
// they are drawn immediately and filled in if an answer arrives.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

// Never resolves: the state the card used to be stuck in for ever.
vi.mock('@/app/(app)/actions', () => ({
  getCheckIns: () => new Promise(() => {}),
  submitCheckIn: async () => ({ ok: true }),
}))

const { CheckInCard } = await import('@/components/CheckInCard')

const draw = (archetype: Parameters<typeof CheckInCard>[0]['archetype']) =>
  renderToStaticMarkup(<CheckInCard today="2026-09-03" archetype={archetype} />)

describe('the card exists before the server answers', () => {
  it('draws its heading and its scales with no data at all', () => {
    const markup = draw('body_composition')
    expect(markup).toContain('Wie war der Tag?')
    expect(markup).toContain('Energie')
    expect(markup).toContain('Stimmung')
  })

  it('asks about eating on a goal where eating is the lever', () => {
    // The specific thing he named. A body-composition goal has to ask it.
    expect(draw('body_composition')).toContain('Gegessen')
  })

  it('asks about stress, whatever the goal', () => {
    for (const archetype of ['body_composition', 'sleep_recovery', 'habit_routine'] as const) {
      expect(draw(archetype), archetype).toContain('Stress')
    }
  })

  it('offers every step of the scale, so a value can be given', () => {
    const markup = draw('body_composition')
    // Five buttons per scale; the labels are what make them answerable.
    expect(markup).toContain('leer')
    expect(markup).toContain('voll da')
  })
})

describe('what it asks follows the goal', () => {
  it('asks a sleep goal about the night', () => {
    expect(draw('sleep_recovery')).toContain('Schlaf')
  })

  it('does not ask everything of everybody', () => {
    // Nine things are recorded across the app. Asking all nine every evening is
    // the second job the brief rules out, and it makes the answers worse.
    const body = draw('body_composition')
    const habit = draw('habit_routine')
    expect(body).not.toBe(habit)
  })
})
