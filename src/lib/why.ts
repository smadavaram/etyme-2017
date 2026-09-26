/**
 * Why can I see this? Why can't I?
 *
 * Access in this system is decided by six separate rule sets — the
 * permission a surface needs, whether your company is party to the record,
 * whether you may look outside your own company at all, which client
 * account inside your firm you sit on, whether the person consented, and
 * which fields your role may read. Fifteen routes compose those by hand,
 * and one of them composed them wrongly and showed a walled manager every
 * contract on the platform.
 *
 * Two things follow from that, and this module is both.
 *
 * **One place decides.** The rules live here and are checked in one order,
 * so a new surface inherits the whole model rather than reassembling four
 * fifths of it.
 *
 * **Every answer explains itself.** The reason a person cannot see
 * something is not a support ticket, it is a sentence — and the sentence
 * says what to do about it. Enterprise software has trained everybody to
 * expect "insufficient privileges" and a shrug; a product that answers the
 * question instead is the difference between an admin who trusts it and an
 * admin who works around it.
 *
 * The same engine answers for somebody else — "why can Priya not see this?"
 * — which is the question an administrator actually has.
 */

export type Rule =
  /** It is about you. */
  | 'SUBJECT'
  /** The permission the surface asks for. */
  | 'PERMISSION'
  /** Your company owns the record. */
  | 'OWN_COMPANY'
  /** Your company is one of the parties on it. */
  | 'PARTY'
  /** You were invited to it. */
  | 'INVITED'
  /** It was deliberately opened to the network. */
  | 'OPEN_MARKET'
  /** Whether anybody here may look outside this company. */
  | 'OUTSIDE_WALL'
  /** Which client account inside the firm you sit on. */
  | 'ACCOUNT_WALL'
  /** The person's own consent. */
  | 'CONSENT'

export interface Check {
  rule: Rule
  passed: boolean
  /** One line, readable by the person who was refused. */
  said: string
}

export interface Hidden {
  field: string
  because: string
}

export interface Why {
  visible: boolean
  /** The single sentence to show. */
  because: string
  /** Every rule that was consulted, in the order it was consulted. */
  checks: Check[]
  /** Fields withheld from a record they can otherwise see. */
  hidden: Hidden[]
  /** What to do about it. Null when there is nothing to do. */
  fix: string | null
}

export interface Viewer {
  personId: string
  name?: string
  companyId: string | null | undefined
  companyName?: string
  /** ALLOWED · NAMED_ONLY · CLOSED */
  outsideAccess: string
  permissions: readonly string[]
  /** The account they sit on inside their own firm, if any. */
  orgUnitId?: string | null
  /** Units they may read: null means the whole firm. */
  unitsVisible: string[] | null
  unitName?: string | null
}

function holds(v: Viewer, p: string): boolean {
  return v.permissions.includes('*') || v.permissions.includes(p)
}

function no(checks: Check[], because: string, fix: string | null, hidden: Hidden[] = []): Why {
  return { visible: false, because, checks, hidden, fix }
}

function yes(checks: Check[], because: string, hidden: Hidden[] = []): Why {
  return { visible: true, because, checks, hidden, fix: null }
}

/** The sentence an admin acts on, rather than one the reader can only resent. */
function askFor(permission: string): string {
  return `Their role does not include ${permission}. Someone with team.manage can add it, or move them to a role that has it.`
}

// ── A placement ───────────────────────────────────────────────────────

export interface ContractFacts {
  personId: string
  /** The vendor selling the work. */
  companyId: string
  /** Who is billed. */
  clientCompanyId: string
  /** Where the work happens, when that differs. */
  endClientCompanyId: string | null
  /** The account inside the selling firm. */
  deliveryUnitId: string | null
  /** The department inside the buying firm. */
  orgUnitId: string | null
}

export function whyContract(v: Viewer, c: ContractFacts): Why {
  const checks: Check[] = []

  if (v.personId === c.personId) {
    checks.push({ rule: 'SUBJECT', passed: true, said: 'It is their own placement.' })
    return yes(checks, 'It is their own placement, and their own work is always theirs to read.')
  }

  const canRead = holds(v, 'assignments.read')
  checks.push({
    rule: 'PERMISSION',
    passed: canRead,
    said: canRead ? 'Their role includes assignments.read.' : 'Their role does not include assignments.read.',
  })
  if (!canRead) {
    return no(checks, 'Reading placements needs assignments.read.', askFor('assignments.read'))
  }

  const party =
    v.companyId === c.companyId ||
    v.companyId === c.clientCompanyId ||
    v.companyId === c.endClientCompanyId
  checks.push({
    rule: 'PARTY',
    passed: party,
    said: party
      ? `${v.companyName ?? 'Their company'} is a party to this placement.`
      : `${v.companyName ?? 'Their company'} is not the vendor, the payer or the client on this placement.`,
  })
  if (!party) {
    return no(
      checks,
      'It belongs to companies theirs has nothing to do with.',
      'Nothing to change. A placement is readable only by the vendor, the company being billed, and the client where the work happens.'
    )
  }

  // Inside their own firm: which account.
  if (v.unitsVisible !== null) {
    // The side of the contract their company owns. A buyer's departments
    // and a supplier's accounts are two different org charts.
    const ourUnit = v.companyId === c.companyId ? c.deliveryUnitId : c.orgUnitId
    const walled = ourUnit !== null && !v.unitsVisible.includes(ourUnit)
    checks.push({
      rule: 'ACCOUNT_WALL',
      passed: !walled,
      said: walled
        ? `It sits on an account they are not on. They are on ${v.unitName ?? 'one account'} and see only that.`
        : `It sits on ${v.unitName ?? 'their own account'}, or on no account at all.`,
    })
    if (walled) {
      return no(
        checks,
        `It belongs to another client's account. ${v.name ?? 'They'} can read ${v.unitName ?? 'their own account'} and nothing beside it.`,
        `Move them onto that account, or take them off accounts altogether to give them the whole firm. Both are done where people are given their seats.`
      )
    }
  }

  const hidden: Hidden[] = []
  if (!holds(v, 'margin.read') && !holds(v, 'rates.read')) {
    hidden.push({ field: 'billRate', because: 'What the client is billed needs margin.read or rates.read.' })
  }
  if (!holds(v, 'consultants.cost')) {
    hidden.push({ field: 'payRate', because: 'What the consultant is paid needs consultants.cost.' })
  }

  return yes(checks, 'Their company is a party to it, and it is on an account they are on.', hidden)
}

// ── A person on a bench ───────────────────────────────────────────────

export interface ConsultantFacts {
  personId: string
  /** Companies holding a live bench listing for them. */
  listedTo: string[]
  /** Companies where they hold a seat. */
  worksAt: string[]
}

export function whyConsultant(v: Viewer, c: ConsultantFacts): Why {
  const checks: Check[] = []

  if (v.personId === c.personId) {
    checks.push({ rule: 'SUBJECT', passed: true, said: 'It is their own profile.' })
    return yes(checks, 'It is their own profile.')
  }

  const canRead = holds(v, 'consultants.read')
  checks.push({
    rule: 'PERMISSION',
    passed: canRead,
    said: canRead ? 'Their role includes consultants.read.' : 'Their role does not include consultants.read.',
  })
  if (!canRead) return no(checks, 'Reading people needs consultants.read.', askFor('consultants.read'))

  const ours =
    (v.companyId != null && c.listedTo.includes(v.companyId)) ||
    (v.companyId != null && c.worksAt.includes(v.companyId))
  checks.push({
    rule: 'CONSENT',
    passed: ours,
    said: ours
      ? 'This person put themselves on their bench, or holds a seat there.'
      : 'This person has not put themselves on their bench.',
  })

  if (ours) {
    const hidden: Hidden[] = []
    if (!holds(v, 'consultants.cost')) {
      hidden.push({ field: 'rateFloor', because: 'What somebody costs needs consultants.cost.' })
    }
    return yes(checks, 'They are on their bench, by their own choice.', hidden)
  }

  // Not ours — so this is a look at the outside market.
  const outside = v.outsideAccess === 'ALLOWED' || holds(v, 'network.read')
  const closed = v.outsideAccess === 'CLOSED'
  checks.push({
    rule: 'OUTSIDE_WALL',
    passed: outside && !closed,
    said: closed
      ? `${v.companyName ?? 'Their company'} does not use the outside market at all.`
      : outside
        ? 'They are one of the people here who may look outside this company.'
        : 'Looking outside this company is kept to named people here.',
  })

  if (closed) {
    return no(
      checks,
      'Their company has closed the outside market to everybody.',
      'An owner can reopen it under Settings → Walls. No role overrides it while it is closed.'
    )
  }
  if (!outside) {
    return no(
      checks,
      'They are not one of the people here who may look outside this company.',
      askFor('network.read')
    )
  }

  return yes(checks, 'They may look outside this company, and this person agreed to be seen.', [
    { field: 'name', because: 'People outside your own bench are shown by skill, not by name, until they agree.' },
  ])
}

// ── A piece of demand ─────────────────────────────────────────────────

export interface RequirementFacts {
  companyId: string
  openToNetwork: boolean
  status: string
  /** Companies invited to bid. */
  invited: string[]
  endClientVisible: boolean
}

export function whyRequirement(v: Viewer, r: RequirementFacts): Why {
  const checks: Check[] = []

  const canRead = holds(v, 'requirements.read')
  checks.push({
    rule: 'PERMISSION',
    passed: canRead,
    said: canRead ? 'Their role includes requirements.read.' : 'Their role does not include requirements.read.',
  })
  if (!canRead) return no(checks, 'Reading open roles needs requirements.read.', askFor('requirements.read'))

  const own = v.companyId === r.companyId
  checks.push({
    rule: 'OWN_COMPANY',
    passed: own,
    said: own ? 'Their company raised it.' : 'Another company raised it.',
  })
  if (own) return yes(checks, 'Their company raised it.')

  const invited = v.companyId != null && r.invited.includes(v.companyId)
  checks.push({
    rule: 'INVITED',
    passed: invited,
    said: invited ? 'They were invited to bid on it.' : 'They were not invited to bid on it.',
  })

  const hidden: Hidden[] = []
  hidden.push({
    field: 'billMin, billMax',
    because: 'The buyer’s own band is theirs. What a supplier may charge is on their own invitation, so no recipient reads another’s number.',
  })
  if (!r.endClientVisible) {
    hidden.push({
      field: 'endClientCompany',
      because: 'The company that raised it has not said who the work is for. Naming a client hands a supplier the relationship.',
    })
  }

  if (invited) return yes(checks, 'They were invited to bid on it.', hidden)

  const openNow = r.openToNetwork && r.status === 'OPEN'
  checks.push({
    rule: 'OPEN_MARKET',
    passed: openNow,
    said: openNow
      ? 'It was deliberately opened to any supplier.'
      : 'It was not opened to the network — it is invite-only.',
  })
  if (!openNow) {
    return no(
      checks,
      'It is invite-only, and their company was not invited.',
      'Nothing to change on their side. The company that raised it decides who sees it.'
    )
  }

  const outside = v.outsideAccess === 'ALLOWED' || holds(v, 'network.read')
  checks.push({
    rule: 'OUTSIDE_WALL',
    passed: outside,
    said: outside
      ? 'They may look outside their own company.'
      : 'Looking outside this company is kept to named people here.',
  })
  if (!outside) {
    return no(checks, 'It is open to the network, but they may not look outside their own company.', askFor('network.read'))
  }

  return yes(checks, 'It was opened to any supplier, and they may look outside their own company.', hidden)
}

/**
 * The one-line version, for a refusal screen.
 *
 * A refusal that says only "no" teaches people to work around the product.
 * This is what goes in its place.
 */
export function refusalText(w: Why): string {
  return w.fix ? `${w.because} ${w.fix}` : w.because
}
