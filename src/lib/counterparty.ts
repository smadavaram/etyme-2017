/**
 * Who a firm works with, and as what.
 *
 * ── The model this replaces ──────────────────────────────────────────
 *
 * Partnership: symmetric, untyped, and never written by anything in the
 * product's life — the audit found `partnership.create` appears zero
 * times in the repository. A status enum nothing could move out of
 * PENDING, because nothing inserted a row.
 *
 * The replacement is directional and typed, because "Wipro" is not a
 * fact about a relationship. Wipro is somebody's client, somebody
 * else's prime, and a third firm's supplier, all in the same week. Each
 * firm keeps its own register, and the register is private — who you
 * sell to is commercial information.
 *
 * ── Where the register meets the agreements ──────────────────────────
 *
 * A MasterAgreement already implies a relationship: its vendor sells to
 * its client. The register does not duplicate that — it derives it, and
 * adds what agreements cannot hold: the prospect you are courting, the
 * prime you sit under without paper yet, the firm you have blocked.
 * Deriving instead of duplicating means the two can never disagree.
 */

export type Relationship = 'CLIENT' | 'SUPPLIER' | 'PRIME' | 'MSP'
export type Status = 'PROSPECT' | 'ACTIVE' | 'DORMANT' | 'BLOCKED'

export const RELATIONSHIPS: Record<Relationship, { label: string; means: string }> = {
  CLIENT: { label: 'Client', means: 'They buy from us. Our invoices go to them.' },
  SUPPLIER: { label: 'Supplier', means: 'We buy from them. Their people, our placements.' },
  PRIME: { label: 'Prime', means: 'They hold the client relationship; our work flows through them.' },
  MSP: { label: 'MSP', means: 'They run the program our work goes into.' },
}

export interface RegisterRow {
  otherCompanyId: string
  otherCompanyName: string
  relationship: Relationship
  status: Status
  /** True where an agreement backs it, false where it is register-only. */
  hasAgreement: boolean
  says: string
}

export interface MsaLite {
  vendorId: string
  clientId: string
  otherName: string
}

export interface StoredRow {
  otherCompanyId: string
  otherCompanyName: string
  relationship: string
  status: string
}

/**
 * The register a screen shows: stored rows, unioned with what the
 * agreements already prove.
 *
 * An MSA where we are the vendor makes the other side a CLIENT; where we
 * are the client, a SUPPLIER. A stored row for the same pair and
 * relationship wins on status — an agreement proves you trade, not that
 * you still want to.
 */
export function register(
  companyId: string,
  stored: StoredRow[],
  msas: MsaLite[]
): RegisterRow[] {
  const out = new Map<string, RegisterRow>()

  for (const m of msas) {
    const isVendor = m.vendorId === companyId
    const otherId = isVendor ? m.clientId : m.vendorId
    const relationship: Relationship = isVendor ? 'CLIENT' : 'SUPPLIER'
    out.set(`${otherId}:${relationship}`, {
      otherCompanyId: otherId,
      otherCompanyName: m.otherName,
      relationship,
      status: 'ACTIVE',
      hasAgreement: true,
      says: `${RELATIONSHIPS[relationship].label} — an agreement is on file.`,
    })
  }

  for (const r of stored) {
    if (!(r.relationship in RELATIONSHIPS)) continue
    const key = `${r.otherCompanyId}:${r.relationship}`
    const fromMsa = out.get(key)
    out.set(key, {
      otherCompanyId: r.otherCompanyId,
      otherCompanyName: r.otherCompanyName,
      relationship: r.relationship as Relationship,
      // The stored status wins: an agreement proves you trade, not that
      // you still want to. BLOCKED on the register blocks, MSA or not.
      status: (r.status in { PROSPECT: 1, ACTIVE: 1, DORMANT: 1, BLOCKED: 1 }
        ? r.status
        : 'ACTIVE') as Status,
      hasAgreement: fromMsa?.hasAgreement ?? false,
      says:
        r.status === 'BLOCKED'
          ? `Blocked. Nothing moves between you until somebody unblocks it.`
          : r.status === 'PROSPECT'
            ? `${RELATIONSHIPS[r.relationship as Relationship].label} you are courting — no agreement yet.`
            : `${RELATIONSHIPS[r.relationship as Relationship].label}${fromMsa ? ' — an agreement is on file.' : '.'}`,
    })
  }

  return [...out.values()].sort(
    (a, b) => a.otherCompanyName.localeCompare(b.otherCompanyName) || a.relationship.localeCompare(b.relationship)
  )
}

export interface RemoveVerdict {
  may: boolean
  says: string
}

/**
 * Whether a counterparty may be removed from the register.
 *
 * Not while money or people are live between you. Removing the register
 * row under a running contract does not end the contract — it just makes
 * the contract's counterparty invisible on the one screen that lists who
 * you deal with, which is worse than either keeping or ending it.
 */
export function mayRemove(liveContracts: number, unpaidInvoices: number): RemoveVerdict {
  if (liveContracts > 0) {
    return {
      may: false,
      says: `${liveContracts} live contract${liveContracts === 1 ? '' : 's'} run between you. End or reassign them first — removing the register row would only hide them.`,
    }
  }
  if (unpaidInvoices > 0) {
    return {
      may: false,
      says: `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? '' : 's'} sit between you. Settle or write off before removing them from the register.`,
    }
  }
  return { may: true, says: 'Nothing live between you. Mark them DORMANT to keep the history, or remove the row.' }
}

// ── The judgment somebody sets on a counterparty ─────────────────────

export const RISK_LEVELS = ['OK', 'WATCH', 'AT_RISK'] as const

export interface RiskJudgementVerdict {
  ok: boolean
  says: string
}

/**
 * A risk level is a judgment, and a judgment needs a date to be
 * remade. One set without a review date is one nobody will remember to
 * revisit — the supplier-risk sweep flags exactly that, and refusing it
 * at the door beats flagging it forever.
 */
export function riskJudgement(level: string, reviewBy: Date | null, on: Date): RiskJudgementVerdict {
  if (!RISK_LEVELS.includes(level as any)) {
    return { ok: false, says: `A risk level is ${RISK_LEVELS.join(', ')} — not "${level}".` }
  }
  if (!reviewBy) {
    return {
      ok: false,
      says: 'Set a date to look again. A judgment with no review date is one nobody will remember to remake.',
    }
  }
  if (reviewBy.getTime() <= on.getTime()) {
    return { ok: false, says: 'The review date has to be in the future, or it is already overdue.' }
  }
  return { ok: true, says: `${level}, to be looked at again by ${reviewBy.toISOString().slice(0, 10)}.` }
}

// ── Who may put a firm on the register, and what it makes them ────────

export interface AddAsk {
  /** Does the caller already hold a seat at a company? */
  seatedAt: { id: string; name: string } | null
  /** What that seat holds. Empty for somebody with no seat. */
  permissions: readonly string[]
  /** What the new firm is to the caller's firm, if they said. */
  relationship?: string | null
}

export interface AddVerdict {
  ok: boolean
  /**
   * Whether creating it seats the creator as its Owner.
   *
   * True only at the sign-up door — somebody with no seat anywhere
   * registering their own firm. A record of a firm you trade with never
   * makes you its owner, whatever else it does.
   */
  ownsIt: boolean
  says: string
}

/**
 * Whether this caller may create a company, and what it makes them.
 *
 * ── The walk that produced this ──────────────────────────────────────
 *
 * 2026-09-21, signed in as Karthik Menon — an integrator's own W2
 * holding two read permissions. "Add company" worked: a real company
 * (`isDemo: false`), with Karthik granted **Owner, permissions `*`**.
 * Because a person's contexts are read most-recently-granted first,
 * that seat then outranked his employer's, and every page he opened
 * read "Walk test — functional review" instead of Teleworld Solutions.
 * No confirmation, no refusal, no "you already work at Teleworld".
 *
 * Two different acts wear one button:
 *
 *   · **Founding a firm** — the sign-up door. Somebody with no seat
 *     anywhere, including a consultant registering their own one-person
 *     corporation, becomes its Owner. That is what registering means.
 *   · **Recording a counterparty** — somebody already seated writing
 *     down a firm they trade with, so a contract, an invitation or an
 *     invoice has something to point at. That is the register
 *     (`Counterparty`), it needs the permission that manages the
 *     register, and it makes the creator nothing at all at the new firm.
 *     A client of ours is not a company we own.
 *
 * The permission is `vendors.manage`, the one that already governs the
 * supplier register, rather than a new key: who a firm trades with is
 * one desk's job whichever direction the trade runs.
 */
export function mayAddCompany(ask: AddAsk): AddVerdict {
  if (!ask.seatedAt) {
    return {
      ok: true,
      ownsIt: true,
      says: 'Registering a firm of your own makes you its owner. That is what registering means.',
    }
  }

  if (!ask.permissions.includes('*') && !ask.permissions.includes('vendors.manage')) {
    return {
      ok: false,
      ownsIt: false,
      says:
        `Adding a firm to ${ask.seatedAt.name}'s register is the desk that manages who you ` +
        `trade with. Ask whoever runs your suppliers and clients to add it, or ask them for ` +
        `that access.`,
    }
  }

  const relationship = String(ask.relationship ?? '')
  if (!(relationship in RELATIONSHIPS)) {
    return {
      ok: false,
      ownsIt: false,
      says:
        `Say what this firm is to ${ask.seatedAt.name} — a client, a supplier, a prime or a ` +
        `program office. A company on the register with no relationship on it is a name ` +
        `nothing can point at.`,
    }
  }

  return {
    ok: true,
    ownsIt: false,
    says:
      `Recorded on ${ask.seatedAt.name}'s register as a ${RELATIONSHIPS[relationship as Relationship].label.toLowerCase()}. ` +
      `You are not seated there: a firm you trade with is not a firm you own.`,
  }
}
