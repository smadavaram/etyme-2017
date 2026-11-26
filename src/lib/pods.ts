/**
 * Project teams (record 120, pods): the supplier side's pure rules.
 *
 * No database here. The routes under /api/pods gather the facts and ask
 * these functions to decide; every refusal is one sentence that says what
 * is wrong and what to do. "Pod" is a machine name only: a person reads
 * team, role, member and price.
 */

// ── Who may be on a team ──────────────────────────────────────────────

export interface RosterFacts {
  name: string
  /** The firm holds a live EMPLOYEE seat for her. */
  employee: boolean
  /** Her listing at this firm, if any. */
  listing: { state: string; revokedAt: Date | null } | null
}

export type Verdict = { ok: true; kind: 'EMPLOYEE' | 'BENCH' } | { ok: false; says: string }

/**
 * A member is the firm's own employee (told, not asked) or somebody on its
 * own bench who granted the listing and has not taken it back. Anybody
 * else is refused, and the reason is named.
 */
export function rosterRule(f: RosterFacts): Verdict {
  if (f.employee) return { ok: true, kind: 'EMPLOYEE' }
  if (!f.listing) return { ok: false, says: `${f.name} is not on your bench and does not work for you, so she cannot join a team.` }
  if (f.listing.revokedAt) return { ok: false, says: `${f.name} took her bench listing back, so she cannot join a team.` }
  if (f.listing.state === 'INVITED') return { ok: false, says: `${f.name} has not said yes to your bench yet, so she cannot join a team.` }
  if (f.listing.state !== 'GRANTED') return { ok: false, says: `${f.name} did not say yes to your bench, so she cannot join a team.` }
  return { ok: true, kind: 'BENCH' }
}

// ── Prices ────────────────────────────────────────────────────────────

export const PRICINGS = ['SPRINT_PRICE', 'RATE_CARD'] as const
export type Pricing = (typeof PRICINGS)[number]

/** A whole number of cents, above zero. */
export function isWholeCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0
}

export interface PricingFacts {
  pricing: string
  sprintPriceCents?: number | null
  sprintWeeks?: number | null
  roles: { title: string; rateCents?: number | null }[]
}

/** Null where the price is complete; otherwise the one sentence that says what is missing. */
export function pricingRule(f: PricingFacts): string | null {
  if (f.pricing === 'SPRINT_PRICE') {
    if (!isWholeCents(f.sprintPriceCents)) return 'A sprint price needs the price, in whole cents, above zero.'
    if (typeof f.sprintWeeks !== 'number' || !Number.isInteger(f.sprintWeeks) || f.sprintWeeks < 1) return 'A sprint price needs the number of weeks, one or more.'
    return null
  }
  if (f.pricing === 'RATE_CARD') {
    for (const r of f.roles) {
      if (!isWholeCents(r.rateCents)) return `The role ${r.title} needs a rate, in whole cents, above zero.`
    }
    return null
  }
  return 'Choose a sprint price or a rate card.'
}

// ── Deliverables ──────────────────────────────────────────────────────

export type DeliverableState = 'planned' | 'in progress' | 'submitted' | 'accepted' | 'rejected' | 'cancelled'

/** What the milestone and its start say, in the words a person acts on. Null where the status is not one the rule knows. */
export function deliverableState(m: { status: string; rejectionReason?: string | null }, startedAt: Date | null): { state: DeliverableState; reason: string | null } | null {
  switch (m.status) {
    case 'PENDING': return { state: startedAt ? 'in progress' : 'planned', reason: null }
    case 'DELIVERED': return { state: 'submitted', reason: null }
    case 'ACCEPTED':
    case 'INVOICED': return { state: 'accepted', reason: null }
    case 'REJECTED': return { state: 'rejected', reason: m.rejectionReason ?? null }
    case 'CANCELLED': return { state: 'cancelled', reason: null }
    default: return null
  }
}

/** Fulfilled: at least one deliverable, and every one accepted. A cancelled one is not accepted. */
export function fulfilled(states: readonly (DeliverableState | null)[]): boolean {
  return states.length > 0 && states.every((s) => s === 'accepted')
}

/** A fixed or milestone sale: the deliverable amounts add up to the price exactly. Null where they do. */
export function amountsRule(priceCents: number, amounts: readonly number[]): string | null {
  if (amounts.length === 0) return 'Add at least one deliverable.'
  if (amounts.some((a) => !isWholeCents(a))) return 'Every deliverable amount is in whole cents, above zero.'
  const sum = amounts.reduce((a, b) => a + b, 0)
  if (sum !== priceCents) return `The deliverables add up to ${sum} cents, and the price is ${priceCents} cents. They must match exactly.`
  return null
}

// ── Roles and headcount ───────────────────────────────────────────────

/** A role takes members up to its headcount. Null where there is room. */
export function roleRoom(role: { title: string; headcount: number }, members: number): string | null {
  if (members >= role.headcount) return `The role ${role.title} is full: ${role.headcount} ${role.headcount === 1 ? 'person' : 'people'} already. Raise its headcount first.`
  return null
}

/** A headcount is a whole number of people, one or more. */
export function isHeadcount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 500
}

// ── A team that is sold ───────────────────────────────────────────────

/**
 * The sentence that refuses a change to a team while a project it was sold
 * on is not fulfilled. The project carries the deal; the team is what the
 * client bought. Null where nothing is open.
 */
export function soldTeamSays(teamName: string, clientName: string | null): string {
  return `${teamName} is sold to ${clientName ?? 'a client'}; change the project, not the team.`
}

/** A project is still open until fulfilledAt is set, or every deliverable it has is accepted. */
export function projectIsOpen(p: { fulfilledAt: Date | null; deliverableStates: readonly (DeliverableState | null)[] }): boolean {
  return p.fulfilledAt === null && !fulfilled(p.deliverableStates)
}

/**
 * What the project row says where the margin is not a number: the unknown,
 * named. Nothing accepted reads first; a member with no pay record is named;
 * any other unknown the reader found is passed through unchanged.
 */
export function marginUnknownSays(m: { marginCents: number | null; earnedRevenueCents: number; unknowns: readonly string[] }): string[] {
  if (m.marginCents !== null) return []
  const out: string[] = []
  if (m.earnedRevenueCents === 0) out.push('Margin shows once a deliverable is accepted')
  for (const u of m.unknowns) {
    if (u.startsWith('No deliverable has been accepted')) continue
    const who = /^(.+?) has no pay record on this project/.exec(u)
    out.push(who ? `${who[1]} has no pay record yet` : u)
  }
  return out.length ? out : ['Margin is not known yet']
}

// ── The supplier's proposal ───────────────────────────────────────────

export const OFFER_KINDS = ['MILESTONE', 'FIXED_PRICE', 'TIME_AND_MATERIALS'] as const
export type OfferKind = (typeof OFFER_KINDS)[number]

export interface Offer {
  clientCompanyId: string
  /** The address of the one person at the client who answers and then accepts each deliverable. */
  acceptorEmail: string
  kind: OfferKind
  priceCents: number
  currency: string
  projectName: string
  deliverables: { name: string; amountCents: number; dueOn: Date | null }[]
}

export type OfferRead = { ok: true; offer: Offer } | { ok: false; says: string; field: string }

const OFFER_NAME_SAYS = 'Name the project as your client would — for example ‘Data platform build’.'

/**
 * What a supplier's proposal must say before anything is raised: a client,
 * a named person there, a kind, a price in whole cents, a currency, a name
 * the client would use, and deliverables that add up to the price exactly
 * (none at all on time and materials). Reads the raw body; one sentence
 * and the field on the first thing wrong. Pure.
 */
export function offerRule(body: unknown): OfferRead {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const no = (says: string, field: string): OfferRead => ({ ok: false, says, field })
  const clientCompanyId = typeof b.clientCompanyId === 'string' ? b.clientCompanyId.trim() : ''
  if (!clientCompanyId) return no('Choose the client this is offered to.', 'clientCompanyId')
  const acceptorEmail = typeof b.acceptorEmail === 'string' ? b.acceptorEmail.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acceptorEmail)) return no('Name the person at the client who will accept the work, by her work address.', 'acceptorEmail')
  const kind = b.kind as OfferKind
  if (!(OFFER_KINDS as readonly unknown[]).includes(kind)) return no('Choose milestones, a fixed price, or time and materials.', 'kind')
  if (!isWholeCents(b.priceCents)) return no('The price is a whole number of cents, above zero.', 'priceCents')
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(currency)) return no('Give the currency as three letters, for example USD.', 'currency')
  const projectName = typeof b.projectName === 'string' ? b.projectName.trim().slice(0, 200) : ''
  if (!projectName || /\bpods?\b/i.test(projectName)) return no(OFFER_NAME_SAYS, 'projectName')

  const listed = Array.isArray(b.deliverables) ? (b.deliverables as Record<string, unknown>[]) : []
  if (kind === 'TIME_AND_MATERIALS') {
    if (listed.length > 0) return no('A time-and-materials team bills hours and has no deliverables. Sell it on milestones or a fixed price to list deliverables.', 'deliverables')
    return { ok: true, offer: { clientCompanyId, acceptorEmail, kind, priceCents: b.priceCents, currency, projectName, deliverables: [] } }
  }
  const deliverables: Offer['deliverables'] = []
  for (const d of listed) {
    const name = typeof d?.name === 'string' ? d.name.trim() : ''
    if (name.length < 2) return no('A deliverable needs a name the client will recognize.', 'deliverables')
    const due = typeof d.dueOn === 'string' && d.dueOn ? new Date(d.dueOn) : null
    if (due && Number.isNaN(due.getTime())) return no(`${name} has a due date that is not a date.`, 'deliverables')
    deliverables.push({ name, amountCents: d.amountCents as number, dueOn: due })
  }
  const amounts = amountsRule(b.priceCents, deliverables.map((d) => d.amountCents))
  if (amounts) return no(amounts, 'deliverables')
  return { ok: true, offer: { clientCompanyId, acceptorEmail, kind, priceCents: b.priceCents, currency, projectName, deliverables } }
}

/** What the team's row says about its offer, in the supplier's words. Null where no offer was made. */
export function offerStateSays(o: { client: string; acceptor: string; decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERTAKEN' } | null): string | null {
  if (!o) return null
  if (o.decision === 'PENDING') return `Offered to ${o.client}, waiting for ${o.acceptor}`
  if (o.decision === 'APPROVED') return `Sold to ${o.client}`
  if (o.decision === 'REJECTED') return `Declined by ${o.client}`
  return null
}
