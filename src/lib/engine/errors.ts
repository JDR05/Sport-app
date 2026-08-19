/**
 * Thrown when a plan would violate a safety limit. Its own module so the
 * archetype strategies can throw it without importing the shared safety layer
 * that calls them.
 */
export class PlanInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanInvariantError'
  }
}
