/**
 * Whose name a client may read, in a chain.
 *
 * `lib/chain-top` answers this question for rates: in a chain — a client
 * buys from a prime, the prime buys from a sub — the client is priced at
 * the rung it pays and never at the one underneath. This answers the same
 * question for names, and the two must never disagree. They are one rule
 * read twice, which is why they sit beside each other: a surface that
 * closed the rate and left the name open has closed nothing, because a
 * sub-vendor named on a client's own page is the prime's supplier list
 * given away for free.
 *
 * ── The rule, ratified 2026-09-17 ────────────────────────────────────
 *
 * The NDA between a prime and its sub is what stops the sub going round
 * the prime to reach the end client. So the client sees the rung it pays
 * and nothing below it — unless the client's agreement with the prime
 * requires disclosure, in which case it sees the sub by name. That is a
 * term on the `MasterAgreement` between client and prime
 * (`disclosesSubVendors`), off by default, and it is the client's to
 * demand at signing rather than the platform's to grant.
 *
 * ── What is never withheld ───────────────────────────────────────────
 *
 * The standing of whoever employs the person on the client's site:
 * insured or not, authorized or not, cover lapsed or current. That
 * exposure is the client's own and no NDA moves it. Nothing in this file
 * touches a certificate, a verification or a gate — it decides one thing,
 * which is whether a firm's name may be printed, and everything else on
 * the row travels exactly as it did.
 *
 * ── Why a withheld name is a sentence and not a blank ────────────────
 *
 * A dash reads as missing data, and a client reading missing data on a
 * compliance page raises a ticket. A withheld name says who it comes
 * through — "Supplied through Computer Systems Inc." — which is both true
 * and the only thing the client can act on, because the firm it can call
 * about this person is the firm it pays.
 *
 * So the display name handed back is always a readable string. A caller
 * that needs to know whether it is a firm's own name reads `masked`.
 */

/** One rung of a chain, as the client-facing queries already select it. */
export interface ChainRung {
  id: string
  personId: string
  /** The firm on this rung — the seller, and at the bottom the employer. */
  companyId: string
  companyName: string
  /** Who buys this rung. The client's own id on the rung the client pays. */
  clientCompanyId: string
}

/**
 * The disclosure term as it stands on an agreement between two firms.
 *
 * `status` is here because a term in a torn-up agreement binds nobody. An
 * agreement that has been TERMINATED or has EXPIRED no longer requires
 * anything of anybody, and going on disclosing a sub-vendor's name under
 * it would be the platform granting what it was never asked to grant. A
 * DRAFT does bind: it is the honest placeholder the award path writes for
 * a relationship that plainly exists, and refusing to read a term off it
 * would mean a client that demanded disclosure at signing does not get it
 * until somebody uploads a PDF.
 */
export interface DisclosureTerm {
  clientId: string
  vendorId: string
  disclosesSubVendors: boolean
  status: string
}

const NOT_BINDING = new Set(['TERMINATED', 'EXPIRED'])

/**
 * May this client read the names of the firms below the prime it pays?
 *
 * The whole decision, in one place. Reads the client↔prime agreement and
 * nothing else — not the sub's agreement with the prime, which is a
 * different deal the client is not a party to, and not a permission,
 * because no seat at the client can grant what the client's own paper
 * does not.
 */
export function mayNameSubVendors(
  terms: DisclosureTerm[],
  clientCompanyId: string,
  primeCompanyId: string
): boolean {
  return terms.some(
    (t) =>
      t.clientId === clientCompanyId &&
      t.vendorId === primeCompanyId &&
      t.disclosesSubVendors &&
      !NOT_BINDING.has(t.status)
  )
}

/**
 * The rung above this one, walking up toward the client.
 *
 * The buyer of one rung is the seller of the next, so the parent of a
 * rung is the rung whose `companyId` is this rung's `clientCompanyId`.
 * Null where there is none on file or where two of them claim the place —
 * the same refusal `payerRung` makes, and for the same reason: a chain
 * nobody can read must not be guessed at.
 */
function parentOf<T extends ChainRung>(rung: T, all: T[]): T | null {
  const above = all.filter(
    (c) => c.personId === rung.personId && c.companyId === rung.clientCompanyId && c.id !== rung.id
  )
  return above.length === 1 ? above[0] : null
}

/** What the client may be shown for one firm on one rung. */
export interface SeenName {
  companyId: string
  /** What to print. The firm's own name, or a sentence naming the prime. */
  name: string
  /** True where this is not the firm's own name. */
  masked: boolean
  /** The prime this rung reaches the client through, where it is known. */
  through: string | null
  /**
   * What to call this firm inside a sentence somebody else writes — a
   * refusal, a cover warning, a chase. "Supplied through Pinnacle" is a
   * cell in a table; "the firm supplied through Pinnacle has no current
   * certificate" is the sentence, and one string cannot be both.
   */
  phrase: string
  /** The whole of it as a sentence, for a row that has room for one. */
  says: string
}

const NO_CHAIN_ABOVE =
  'Supplied through another firm on this site — the rung above this one is not on file, ' +
  'so the supplier cannot be named without guessing.'
const NO_CHAIN_PHRASE = 'the firm below one of your suppliers'

/**
 * What a client may read for one rung of one person's chain.
 *
 * `mayName` is asked about the prime, never about the sub: the term lives
 * on the client's agreement with the firm it pays, and a sub the client
 * has no paper with cannot consent to its own disclosure.
 */
export function nameForClient<T extends ChainRung>(
  rung: T,
  all: T[],
  clientCompanyId: string,
  mayName: (primeCompanyId: string) => boolean
): SeenName {
  const own: SeenName = {
    companyId: rung.companyId,
    name: rung.companyName,
    masked: false,
    through: null,
    phrase: rung.companyName,
    says: rung.companyName,
  }

  // The rung the client pays. Its name is the client's own counterparty
  // and was never anybody's to withhold.
  if (rung.clientCompanyId === clientCompanyId) return own

  // Walk up to the rung the client pays, so the sentence names the firm
  // the client can actually call about this person. A three-deep chain
  // reaches the client through its prime, not through the middle firm it
  // has never heard of either.
  const seen = new Set<string>([rung.id])
  let current: T = rung
  for (;;) {
    const parent = parentOf(current, all)
    if (!parent || seen.has(parent.id)) {
      return {
        ...own,
        name: NO_CHAIN_ABOVE,
        masked: true,
        through: null,
        phrase: NO_CHAIN_PHRASE,
        says: NO_CHAIN_ABOVE,
      }
    }
    seen.add(parent.id)
    current = parent
    if (parent.clientCompanyId === clientCompanyId) break
  }

  const prime = current
  const through = prime.companyName

  if (mayName(prime.companyId)) {
    // The agreement asks for the name, so the name is printed — and it
    // still says through whom, because that is what the client acts on.
    return {
      ...own,
      through,
      says: `${rung.companyName} — supplied through ${through}.`,
    }
  }

  const withheld = `Supplied through ${through}.`
  return {
    companyId: rung.companyId,
    name: withheld,
    masked: true,
    through,
    phrase: `the firm supplied through ${through}`,
    says: withheld,
  }
}

/**
 * The same answer per firm rather than per rung, for a page that lists
 * companies once.
 *
 * A firm is named where any one of its rungs is a rung this client pays.
 * That is not a loophole: a client that buys from Computer Systems for
 * one person already knows Computer Systems, and withholding the name on
 * a second row would say a firm it has a contract with is a secret.
 *
 * Where a firm appears only below, the sentence names the prime it
 * reaches the client through. Two different primes on two rungs of the
 * same hidden firm are both named, because both are firms the client
 * pays and either is somebody it can call.
 */
export function namesForClient<T extends ChainRung>(
  all: T[],
  clientCompanyId: string,
  mayName: (primeCompanyId: string) => boolean
): Map<string, SeenName> {
  const out = new Map<string, SeenName>()

  for (const rung of all) {
    const seen = nameForClient(rung, all, clientCompanyId, mayName)
    const existing = out.get(rung.companyId)

    if (!existing) {
      out.set(rung.companyId, seen)
      continue
    }
    // An unmasked answer wins outright — the client knows this firm.
    if (existing.masked && !seen.masked) {
      out.set(rung.companyId, seen)
      continue
    }
    // Two masked answers through two different primes: say both, so the
    // client is not sent to one desk about a person the other supplied.
    if (existing.masked && seen.masked && seen.through && existing.through) {
      const primes = new Set(existing.through.split(' and ').concat(seen.through))
      if (primes.size > existing.through.split(' and ').length) {
        const through = [...primes].join(' and ')
        const says = `Supplied through ${through}.`
        out.set(rung.companyId, {
          companyId: rung.companyId,
          name: says,
          masked: true,
          through,
          phrase: `the firm supplied through ${through}`,
          says,
        })
      }
    }
  }

  return out
}
