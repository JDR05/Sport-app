// Making a failed model call findable.
//
// Every AI failure in this app is a value, not an exception — deliberately, so
// no call site can forget to handle one. The cost of that discipline showed up
// the first time something actually broke: the screen said "the model gave
// nothing", the server returned 200, the request took under a second, and
// there was no way to tell a wrong key from a wrong model name from a refusal.
// A subsystem that cannot fail loudly cannot be fixed at all.
//
// So a failure is now written once, on the server, where the call happened.
// What is written is bounded on purpose: the provider, the model, the reason
// and the first part of whatever the provider said. Never the key, and never
// the prompt — the prompt is the person's goal, sleep and eating habits, and a
// log line is exactly the wrong place for it.

type Failure = {
  /** Which adapter — 'claude', or the compatible provider's label. */
  adapter: string
  /** Which of the four tasks. */
  task: string
  model: string
  reason: string
  /**
   * The provider's own words, already truncated by the caller. Passed through
   * rather than interpreted: the whole point is to see what actually came back
   * when the reason alone does not explain it — "404 model not found" and
   * "401 invalid key" both look like `api_error` from the outside.
   */
  detail: string
}

/**
 * One line, at warn level, so it stands out in a log full of 200s.
 *
 * Not an error: a model that declines is a working system taking the
 * documented fallback, and paging somebody for it would be wrong. But it is
 * not information either — something a person configured is not doing what
 * they think it is doing.
 */
export function logAiFailure(f: Failure): void {
  console.warn(
    `[ai] ${f.task} failed via ${f.adapter} (${f.model}): ${f.reason} — ${f.detail.slice(0, 300)}`,
  )
}
