// Getting the object out of whatever the model actually sent.
//
// This exists because of a production failure, not a hypothetical. The first
// day the daily brief ran against the configured provider, every call came
// back `invalid_json`, and the logged body was German prose containing a
// self-correction with arrows — the model had written out its reasoning,
// revised a sentence, and left the object somewhere in the middle. The prompt
// said "Antworte ausschliesslich mit JSON". It had said so all along.
//
// A prompt is not a parser. The rule this file enforces is the same one the
// safety checks live under: what the model was told is a request, and what the
// app does with the answer is the guarantee.

import { describe, expect, it } from 'vitest'
import { extractJson, stripCodeFence } from '@/lib/ai/tasks'

const OBJECT = '{"hasSomethingToSay":true,"line":"Ein Satz."}'

describe('the ordinary cases', () => {
  it('leaves a bare object alone', () => {
    expect(extractJson(OBJECT)).toBe(OBJECT)
  })

  it('leaves a bare array alone', () => {
    expect(extractJson('[1,2,3]')).toBe('[1,2,3]')
  })

  it('trims the whitespace providers add', () => {
    expect(extractJson(`\n\n  ${OBJECT}  \n`)).toBe(OBJECT)
  })

  it('unwraps a fence around the whole answer', () => {
    expect(extractJson('```json\n' + OBJECT + '\n```')).toBe(OBJECT)
    expect(extractJson('```\n' + OBJECT + '\n```')).toBe(OBJECT)
  })
})

describe('what actually came back', () => {
  it('finds the object after a sentence of prose', () => {
    // The failure that produced this function.
    const answer =
      'Du hast angegeben, dass du leicht erkältet bist, während heute Abend ein ' +
      'Krafttraining ansteht. Hier ist meine Antwort:\n' + OBJECT
    expect(JSON.parse(extractJson(answer))).toMatchObject({ hasSomethingToSay: true })
  })

  it('finds the object before a trailing explanation', () => {
    const answer = OBJECT + '\n\nIch habe den Satz gekürzt, damit er unter 240 Zeichen bleibt.'
    expect(JSON.parse(extractJson(answer))).toMatchObject({ line: 'Ein Satz.' })
  })

  it('finds a fenced object that is not the whole answer', () => {
    const answer = 'Kurz begründet:\n\n```json\n' + OBJECT + '\n```\n\nPasst das so?'
    expect(JSON.parse(extractJson(answer))).toMatchObject({ hasSomethingToSay: true })
  })

  it('takes the first object when the model shows a before and an after', () => {
    // The shape in the log: one version, an arrow, a revision. The first
    // complete object is the answer; the second is commentary about it.
    const answer = `${OBJECT} -> {"hasSomethingToSay":false,"line":""}`
    expect(JSON.parse(extractJson(answer))).toMatchObject({ hasSomethingToSay: true })
  })
})

describe('what it must not do', () => {
  it('does not swallow a second object into the first', () => {
    // indexOf('{') to lastIndexOf('}') looks equivalent to this function and
    // is not: here it would capture both objects and the arrow between them,
    // and JSON.parse would fail on text that contains a perfectly good answer.
    const answer = `${OBJECT}\n\nund noch einer: {"a":1}`
    expect(extractJson(answer)).toBe(OBJECT)
  })

  it('is not confused by a brace inside a string', () => {
    const withBrace = '{"line":"ein } in der Mitte","ok":true}'
    expect(JSON.parse(extractJson(`Antwort: ${withBrace}`))).toMatchObject({ ok: true })
  })

  it('is not confused by an escaped quote before a brace', () => {
    const tricky = '{"line":"er sagte \\"jetzt}\\" und ging","ok":true}'
    expect(JSON.parse(extractJson(`Also: ${tricky}`))).toMatchObject({ ok: true })
  })

  it('refuses to repair a truncated object', () => {
    // A cut-off answer is a failure. Half of one parsed as though it were
    // whole is a worse failure, because it looks like data.
    //
    // Asserted as "hands back exactly what came in" rather than only "throws":
    // a version that returned everything from the opening brace onwards would
    // also throw, and would also quietly drop the part of the body that says
    // what the provider was doing before it ran out of room. The log line is
    // the only thing anybody has when this happens.
    const cut = 'Hier ist die Antwort: {"hasSomethingToSay":true,"line":"Ein Satz'
    expect(extractJson(cut)).toBe(cut)
    expect(() => JSON.parse(extractJson(cut))).toThrow()
  })

  it('hands back the original when there is no object at all', () => {
    // So the caller's JSON.parse still throws and the log still shows what the
    // provider really said.
    expect(extractJson('Ich kann das leider nicht beantworten.')).toBe(
      'Ich kann das leider nicht beantworten.',
    )
  })
})

describe('the old helper still does its one job', () => {
  // Kept because a fence around the whole answer is worth handling on its own
  // terms, and because removing an exported function to prove a point is how
  // an unrelated call site breaks.
  it('unwraps exactly the fence it was written for', () => {
    expect(stripCodeFence('```json\n' + OBJECT + '\n```')).toBe(OBJECT)
    expect(stripCodeFence(OBJECT)).toBe(OBJECT)
  })
})
