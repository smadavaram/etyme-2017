/**
 * Whose names a company may read in the directory.
 *
 * ── What the walk found ──────────────────────────────────────────────
 *
 * `/dashboard/companies` — headed "Manage vendor, client, MSP, and GSI
 * companies on the platform" — listed **all twenty-seven companies**,
 * with slug and domain, to Northbend Athletic's program manager, to
 * CloudEPA's owner (a sub-vendor two rungs down somebody else's chain),
 * and to Colleen Byrne's one-person nursing corporation. Northbend's AP
 * clerk correctly saw one. Found on the browser walk, 2026-09-21.
 *
 * The rule it replaced said a vendor sees the market on purpose, and
 * that was a real decision about a staffing firm's own business. It
 * never said a client should be able to read every other client by
 * name, or that a bench vendor two rungs down should be able to
 * enumerate every enterprise on the platform. Both of those it did
 * anyway, because "the market" was expressed as `{ isDemo: false }` —
 * every real company there is.
 *
 * ── The rule now: you see the firms you trade with ───────────────────
 *
 * Decided 2026-09-21, and it is a decision rather than a derivation, so
 * it is written here where it can be overruled in one place:
 *
 *   · **A firm sees its counterparties** — the firms it has a deal
 *     with, on the register, under an agreement, on a contract, through
 *     an invitation, or through a seat it holds or granted. Plus
 *     itself, always.
 *   · **Nobody sees a stranger.** There is no browsable market of
 *     enterprises. Etyme is the record between a company and its
 *     suppliers, not a place to shop for clients: it places nobody, it
 *     runs no bench, and a page that lists every enterprise by name to
 *     every bench vendor is a lead list the platform has no business
 *     handing out. It is also the same sentence the chain rules already
 *     hold — "the platform carries no thread from a sub to a client it
 *     has no deal with".
 *   · **A consultant sees the benches they are on** and the places they
 *     are placed. They are in the market; they do not shop it. This was
 *     already true and is unchanged.
 *   · **Etyme's own staff see everything**, because somebody has to be
 *     able to answer "which companies are on this deployment" and that
 *     somebody is named in `lib/staff`.
 *   · **A demo sandbox sees its own sandbox.** Unchanged, and now a
 *     special case of the same sentence rather than a branch of its own.
 *
 * What this costs: a staffing vendor can no longer browse the platform
 * for firms to sell to. That was never a feature anybody could act on —
 * there is no button on that page to approach a stranger — and if
 * selling into the network becomes a product, it gets a screen that
 * says so, with the neutrality rules written on it, rather than a
 * directory that leaks one by accident.
 */

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

export type Reader =
  /** Named in lib/staff. Answers "what is on this deployment". */
  | { as: 'STAFF' }
  /** A person on somebody's bench, of no firm. */
  | { as: 'CONSULTANT' }
  | { as: 'COMPANY'; kind: CompanyKind; isDemo: boolean }
  /** Signed in, seated nowhere. */
  | { as: 'NOBODY' }

export interface Verdict {
  /**
   * `ALL` — every company on the deployment.
   * `NAMED` — only the companies the caller has dealings with, which the
   * route gathers and passes back in.
   */
  reach: 'ALL' | 'NAMED'
  /** Whether the caller's own company is in the answer whatever else is. */
  includesOwn: boolean
  /** Why, in a sentence. Shown on the page and readable in a test. */
  says: string
}

export function directoryScope(reader: Reader): Verdict {
  switch (reader.as) {
    case 'STAFF':
      return {
        reach: 'ALL',
        includesOwn: true,
        says: 'Etyme staff see every company on this deployment.',
      }

    case 'CONSULTANT':
      return {
        reach: 'NAMED',
        includesOwn: false,
        says:
          'You see the firms that list you and the places you are placed. ' +
          'You are in this market rather than shopping it.',
      }

    case 'COMPANY':
      return {
        reach: 'NAMED',
        includesOwn: true,
        says: reader.isDemo
          ? 'This is a sandbox. You see your own companies and nobody else’s.'
          : 'You see the firms you trade with: on your register, under an agreement, ' +
            'on a contract, on an invitation, or at a desk granted either way.',
      }

    case 'NOBODY':
      return {
        reach: 'NAMED',
        includesOwn: false,
        says: 'A directory is a company’s own register. Join or create one first.',
      }
  }
}

/**
 * What the page is called, for the reader in front of it.
 *
 * It read "Manage vendor, client, MSP, and GSI companies on the
 * platform" for everybody, which is a platform administrator's sentence
 * shown to a nurse's own corporation. A page says what the reader's list
 * is: their counterparties.
 */
export function directoryCopy(kind: CompanyKind | null): { title: string; subtitle: string } {
  switch (kind) {
    case 'CLIENT':
      return {
        title: 'Companies',
        subtitle: 'The suppliers and program offices you buy through, and your own entry.',
      }
    case 'MSP':
      return {
        title: 'Companies',
        subtitle: 'The clients whose programs you run and the suppliers on their panels.',
      }
    case 'GSI':
      return {
        title: 'Companies',
        subtitle: 'The clients you deliver for and the firms you buy people from.',
      }
    case 'CONSULTANT_CORP':
      return {
        title: 'Companies',
        subtitle: 'The firms you contract with, and your own company.',
      }
    case 'VENDOR':
      return {
        title: 'Companies',
        subtitle: 'The clients you supply, the firms you supply through, and the firms you buy from.',
      }
    default:
      return {
        title: 'Companies',
        subtitle: 'The firms you have dealings with.',
      }
  }
}
