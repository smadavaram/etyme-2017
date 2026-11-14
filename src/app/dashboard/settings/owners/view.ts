/**
 * What Settings → Owners shows after a press, kept out of the page so it
 * can be read as sentences (walk on the Owner rules, 2026-11-12).
 */

/** The addressed-only view, as much of it as this needs. */
type AnyView = { company: string; addressedOnly?: boolean; asks: unknown[] } | null

/**
 * After a person answers an ownership ask, the next read can be refused:
 * they were reading the page only because the ask was addressed to them,
 * and it no longer waits. That refusal never replaces the page. The view
 * becomes the addressed-only view with nothing waiting, so the route's own
 * answer sentence stays on the screen.
 */
export function viewAfterRefusedRead<V extends AnyView>(prev: V): V | { company: string; addressedOnly: true; asks: [] } | null {
  if (!prev) return null
  return { company: prev.company, addressedOnly: true, asks: [] }
}

/**
 * The move form's line and button, by whether the move needs a second
 * Owner's yes. The new Owner moving the Owner who passed it to them to
 * Admin does it alone (movesAloneAfterPass in lib/owner-rules), so nothing
 * is asked and the form does not say it is.
 */
export function moveFormSays(input: { alone: boolean; subjectName: string | null; companyName: string; emailLeaves: boolean }): { line: string; button: string; pending: string } {
  if (input.alone && input.subjectName) {
    return {
      line: `${input.subjectName} passed ${input.companyName}’s ownership to you, so you move them to Admin yourself. Nobody else is asked, and ${input.subjectName} is told ${input.emailLeaves ? 'by email' : 'in Ask Etyme'}.`,
      button: 'Move them to Admin',
      pending: 'Moving…',
    }
  }
  return {
    line: 'This needs the yes of an Owner who did not ask. Nothing changes until they answer, and you can withdraw it. The last Owner is never removed.',
    button: 'Ask for their yes',
    pending: 'Asking…',
  }
}

/**
 * How the person asked to take over hears of it. Email is promised only
 * where it can leave this deployment (`mailLeaves`, read by the route that
 * feeds the page, because a browser page never reads the environment);
 * otherwise Ask Etyme alone (walk, 2026-11-14).
 */
export function passFormSays(emailLeaves: boolean): string {
  return `They say yes on a card in Ask Etyme${emailLeaves ? ' and by email' : ''}. Nothing changes until then. Both changes then happen together.`
}
