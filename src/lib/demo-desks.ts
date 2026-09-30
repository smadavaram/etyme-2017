/**
 * The desks a visitor may ask for at a seeded firm, and what the door
 * says when the one asked for is not held.
 *
 * Moved out of `app/api/demo/route.ts` on 2026-09-30 so the refusal is
 * a sentence a test can read. The browser walk that moved it: asking for
 * the AP desk at Teleworld Solutions was answered "nobody is seated at
 * any desk there yet", while the owner's desk at the same firm opened.
 * Two things were wrong. The list of held desks counted only the
 * fourteen keyed desks, so a firm whose people hold other roles —
 * Owner, Delivery manager, Validation Engineer — read as empty. And "AP"
 * at a firm that sells is the AP & Payroll desk; the door looked only
 * for a client's AP Clerk.
 *
 * Pure: no database. The route reads the roles and hands them in.
 */

// The client program desks first, then the desks a supplier runs on.
export const DESKS = [
  'programme', 'hiring', 'hr', 'procurement', 'vp', 'ap', 'compliance',
  'account', 'recruiter', 'resourcing', 'contracts', 'ar', 'payroll', 'finance',
] as const
export type Desk = (typeof DESKS)[number]

/**
 * Which seat a desk is, by the role it holds.
 *
 * A role is the fact; an address is a handle. Two names where one word
 * means different desks at different firms: "HR Partner" reads a role
 * at a client and "HR" keeps a supplier's own people's paperwork; "AP"
 * is the AP Clerk at a client and AP & Payroll at a firm that sells,
 * because paying the people below is the same desk as paying suppliers
 * there. No kind of firm holds both AP roles, so one list serves all.
 */
export const DESK_ROLES: Record<Desk, string[]> = {
  programme: ['Program Manager'],
  hiring: ['Hiring Manager'],
  hr: ['HR Partner', 'HR'],
  procurement: ['Procurement Lead'],
  vp: ['Approver'],
  ap: ['AP Clerk', 'AP & Payroll'],
  compliance: ['Compliance Officer'],
  account: ['Account Manager'],
  recruiter: ['Recruiter'],
  resourcing: ['Resource Manager'],
  contracts: ['Contract Manager'],
  ar: ['Accounts Receivable'],
  payroll: ['AP & Payroll'],
  finance: ['Finance'],
}

/** A desk key from a request body, or null for "the firm's first seat". */
export function deskFrom(asked: unknown): Desk | null {
  return typeof asked === 'string' && (DESKS as readonly string[]).includes(asked) ? (asked as Desk) : null
}

/**
 * The desk's name as this kind of firm calls it — the role's own name,
 * so the sentence says "AP & Payroll" at a supplier and "AP Clerk" at a
 * client rather than a word of the door's own.
 */
export function deskName(desk: Desk, kind: string): string {
  const roles = DESK_ROLES[desk]
  if (desk === 'ap') return kind === 'CLIENT' || kind === 'MSP' ? 'AP Clerk' : 'AP & Payroll'
  if (desk === 'hr') return kind === 'CLIENT' ? 'HR Partner' : 'HR'
  return roles[0]
}

/** Every keyed desk a set of held role names opens. */
export function desksOpen(roleNames: Iterable<string>): Desk[] {
  const held = new Set(roleNames)
  return DESKS.filter((d) => DESK_ROLES[d].some((r) => held.has(r)))
}

/** "A", "A or B", "A, B or C". */
function orList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

export interface DeskRefusal {
  /** The sentence the visitor reads. */
  message: string
  /** The keyed desks that do open here, so a caller can retry without parsing. */
  desks: Desk[]
}

/**
 * What the door says when no seat answered.
 *
 * `heldRoles` is the role name of every live seat at the firm, oldest
 * grant first, repeats allowed — the first is the seat asking with no
 * desk opens. `company` is null where the slug is not in the world.
 */
export function deskRefusal(input: {
  asWorld: string
  company: { name: string; kind: string } | null
  desk: Desk | null
  heldRoles: string[]
}): DeskRefusal {
  const { asWorld, company, desk } = input
  if (!company) {
    return {
      message: `There is no ${asWorld} in this deployment's world. POST /api/seed-world to build it first.`,
      desks: [],
    }
  }
  const seated = Array.from(new Set(input.heldRoles.filter(Boolean)))
  const open = desksOpen(seated)
  if (seated.length === 0) {
    return {
      message: `Nobody is seated at ${company.name} yet. POST /api/seed-world to build it first.`,
      desks: [],
    }
  }
  // Only reached with a desk: without one the firm's first seat opens,
  // and a firm with any seat has a first one.
  const asked = desk ? deskName(desk, company.kind) : 'asked-for'
  const ways: string[] = []
  if (open.length > 0) {
    ways.push(`Ask for ${orList(open.map((d) => `"${d}"`))} by name.`)
  }
  ways.push(`Ask with no desk to sit as the ${seated[0]}.`)
  return {
    message:
      `Nobody holds the ${asked} desk at ${company.name} in the demo; ` +
      `these desks are seated: ${seated.join(', ')}. ${ways.join(' ')}`,
    desks: open,
  }
}
