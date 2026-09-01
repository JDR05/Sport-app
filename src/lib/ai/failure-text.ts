// A failed model call, in words the person can act on.
//
// Lives here rather than beside the server action because a file marked
// 'use server' may only export async functions — and it belongs to the AI
// layer anyway: the failure union is defined there, so the text that explains
// it should sit next to the union rather than next to one of its readers.
//
// The point of each sentence is the *next step*, not the diagnosis. "Der
// Anbieter hat den Schlüssel abgelehnt" is useless on its own; which variable
// to look at is the whole message.

import type { AiFailure } from './types'

export const AI_FAILURE_TEXT: Record<AiFailure, string> = {
  no_api_key:
    'Der Anbieter hat den Schlüssel abgelehnt. Prüf AI_COMPAT_KEY in Vercel — und ob der Schlüssel zu der Base-URL gehört, die dort steht.',
  // Deliberately names the most likely cause rather than staying neutral. A
  // wrong model name is by far the commonest way this fails, it looks
  // identical to every other 4xx from the outside, and "gemini-2.5-flash" vs
  // "Gemini 2.5 Flash" is not something anyone guesses unprompted.
  api_error:
    'Der Anbieter hat die Anfrage abgelehnt. Der häufigste Grund ist ein Modellname, den es dort nicht gibt: AI_COMPAT_MODEL muss exakt so heißen wie beim Anbieter, etwa gemini-2.5-flash — nicht „Gemini 2.5 Flash".',
  timeout:
    'Das Modell hat nicht rechtzeitig geantwortet. Beim nächsten Versuch klappt es oft.',
  invalid_json:
    'Das Modell hat keine verwertbare Antwort geschickt. Meist hilft ein anderes Modell.',
  schema_invalid:
    'Die Antwort hatte nicht die Form, die die App braucht. Kleinere Modelle scheitern hier häufiger.',
  implausible:
    'Die Antwort hat die Sicherheitsprüfung nicht bestanden und wurde verworfen. Genau dafür ist sie da — passiert das oft, taugt das Modell für diese Aufgabe nicht.',
  no_consent: 'Ohne Häkchen wird nichts an ein Modell geschickt.',
  disabled: 'Die KI ist in dieser Umgebung abgeschaltet.',
}
