/**
 * The one person who decides a sold deliverable (record 120, owner's ruling 2).
 *
 * Where a milestone is a deliverable of a sold team, only the acceptor named
 * on the deal accepts or rejects it. Any other milestone is unchanged. The
 * refusal says who decides and never says anything about the team.
 */
export interface NamedAcceptor { personId: string; name: string }

/** Null where this person may decide; otherwise the one sentence that says who does. Pure. */
export function acceptorRefusal(deciderPersonId: string | null, acceptor: NamedAcceptor | null): string | null {
  if (!acceptor) return null
  if (deciderPersonId && deciderPersonId === acceptor.personId) return null
  return `${acceptor.name} was named on this deal as the one who accepts or rejects its deliverables. Ask ${acceptor.name} to decide.`
}
