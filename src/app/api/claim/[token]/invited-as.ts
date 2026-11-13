/**
 * What the company taking a claim link is to the firm that sent it.
 *
 * A company recorded by name and extended later keeps its Kind (the
 * neutral Company, 2026-11-13): Kind is what a company is, a position is
 * what it is to you, and a position never changes the Kind. So the claim
 * page reads the inviting firm's own register row first. A CLIENT row
 * alone says client; a SUPPLIER row alone says supplier; both, or none,
 * fall back to the Kind as before. Pure.
 */
export type InvitedAs = 'CLIENT' | 'SUPPLIER'

export function invitedAsOf(input: { kind: string | null | undefined; relationships: readonly string[] }): InvitedAs {
  const held = new Set(input.relationships)
  const client = held.has('CLIENT')
  const supplier = held.has('SUPPLIER') || held.has('PRIME')
  if (client && !supplier) return 'CLIENT'
  if (supplier && !client) return 'SUPPLIER'
  return input.kind === 'CLIENT' ? 'CLIENT' : 'SUPPLIER'
}

/** The grant reason on the first seat, in the same words. */
export function claimedAsSays(as: InvitedAs, byId: string): string {
  return `Claimed a ${as === 'CLIENT' ? 'client' : 'supplier'} invitation from ${byId}`
}
