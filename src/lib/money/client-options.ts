/**
 * Whom "Record a placement" offers as the client it bills.
 *
 * The list used to be read only off this firm's existing sell contracts,
 * so a supplier recording its first contract — Tapin on its first day —
 * was offered nobody, even after putting its client on its register from
 * Companies. Now the register comes first (`GET /api/clients`: firms it
 * has an agreement with, firms it listed, and its CLIENT counterparties),
 * and the clients on its contracts are added after it.
 *
 * A client that is only on this firm's register says so beside its name,
 * because a bill to a firm not on Etyme goes by email, not to a desk.
 */

/** One row of `GET /api/clients`, as far as this reads it. */
export interface RegisterClient {
  id: string
  name: string
  onEtyme: boolean
}

/** A client named on one of this firm's sell contracts. */
export interface ContractClients {
  clientCompany?: { id?: string | null; name?: string | null } | null
  endClientCompany?: { id?: string | null; name?: string | null } | null
}

export interface ClientOption {
  id: string
  name: string
}

/** What the form says under the field when there is nobody to offer. */
export const NO_CLIENTS_SAYS = 'No clients yet. Add one from Companies — they do not need to be on Etyme.'

/** Where that sentence sends the reader. */
export const NO_CLIENTS_HREF = '/dashboard/companies'

/** How a client only on this firm's register reads in the list. */
export function clientLabel(c: RegisterClient): string {
  return c.onEtyme ? c.name : `${c.name} — not on Etyme yet`
}

/**
 * Every client the form may offer, each once, by name.
 *
 * The register's row wins over a contract's, so a client not on Etyme
 * keeps its "not on Etyme yet" however many contracts name it.
 */
export function clientOptions(register: readonly RegisterClient[], contracts: readonly ContractClients[]): ClientOption[] {
  const seen = new Map<string, string>()
  for (const c of register) {
    if (c.id && c.name) seen.set(c.id, clientLabel(c))
  }
  for (const c of contracts) {
    for (const party of [c.clientCompany, c.endClientCompany]) {
      if (party?.id && party.name && !seen.has(party.id)) seen.set(party.id, party.name)
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
