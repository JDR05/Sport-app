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
  // Names the likeliest cause but no longer names a model.
  //
  // It used to suggest "gemini-2.5-flash", and within the afternoon the
  // provider retired that model for new accounts — so the hint was actively
  // wrong. A version number in a hint rots. What does not rot is the
  // provider's own answer, which is shown underneath this line and in that
  // very case read: "Please update your code to use models/gemini-3.6-flash".
  api_error:
    'Der Anbieter hat die Anfrage abgelehnt. Der häufigste Grund ist AI_COMPAT_MODEL: Der Name muss exakt so lauten wie beim Anbieter — kleingeschrieben, mit Bindestrichen, in einer Version, die es dort noch gibt.',
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
