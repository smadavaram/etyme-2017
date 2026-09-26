/**
 * Permissions — BUILD.md §2.
 *
 * One flat list. Roles are bundles; the template pack ships seven of them.
 * "Cannot be retrofitted. Every read path filters by context from the
 * first commit, or you audit every query later." — BUILD.md §8
 */

// ── The flat list ──────────────────────────────────────────────

export const PERMISSIONS = [
  'consultants.read',
  'consultants.write',
  'consultants.cost',
  'requirements.read',
  'requirements.write',
  'requirements.distribute',
  'submissions.read',
  'submissions.create',
  'submissions.rate',
  'assignments.read',
  'assignments.write',
  'assignments.terminate',
  'timesheets.read',
  'timesheets.approve',
  'invoices.read',
  'invoices.issue',
  // Price is procurement's to set and to amend. Separate from
  // assignments.write because the team that owns rates at a client is not
  // the team that creates contracts.
  'rates.read',
  'rates.write',
  'payments.record',
  'payroll.read',
  'payroll.run',
  'payroll.approve',
  'vendors.read',
  'vendors.manage',
  // Seeing anything outside your own company: other firms' consultants,
  // who is coming free, which suppliers exist. Held apart from
  // consultants.read because at a delivery firm those are different jobs —
  // reading the contractors you already have is not the same as browsing
  // the market, and thirty thousand engineers need the first and none of
  // the second.
  'network.read',
  'utilization.read',
  'margin.read',
  'pnl.read',
  'team.manage',
  'settings.manage',
  // Who may change the rules everyone else is measured against. Held
  // apart from settings.manage because editing the approval chain is not
  // the same job as changing the company address, and apart from
  // rates.write because writing the rule is not approving the spend.
  'governance.read',
  'governance.write',
  // Acting on somebody else's data rights: logging and answering a data
  // request for another person, placing and lifting a legal hold, and
  // running a breach — opening one, setting its clocks, recording that a
  // notice went, closing it. Held apart from governance.write because
  // writing an approval rule is not the same job as deciding what
  // happens to a person's record, and apart from governance.read
  // because reading the queue is not acting on it. A person's own
  // request about their own data asks for none of these: a gate on your
  // own file is one the person it protects cannot open.
  'privacy.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// ── The seven default roles ────────────────────────────────────

export interface RoleDefinition {
  name: string
  permissions: readonly Permission[]
  isDefault: boolean
}

/**
 * The recruiter gets everything EXCEPT *.cost, margin.read, pnl.read.
 * That single exclusion is what stops them back-calculating salaries
 * from a bench total. — BUILD.md §2
 */
const RECRUITER_PERMISSIONS: readonly Permission[] = [
  'consultants.read',
  'consultants.write',
  'requirements.read',
  'submissions.read',
  'submissions.create',
  'assignments.read',
  'timesheets.read',
  'vendors.read',
]

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    name: 'Owner',
    permissions: [...PERMISSIONS], // all permissions
    isDefault: true,
  },
  {
    name: 'Admin',
    permissions: PERMISSIONS.filter((p) => p !== 'pnl.read'),
    isDefault: true,
  },
  {
    name: 'Recruiter',
    permissions: RECRUITER_PERMISSIONS,
    isDefault: true,
  },
  {
    name: 'Accountant',
    permissions: [
      'timesheets.read',
      'timesheets.approve',
      'invoices.read',
      'invoices.issue',
      'payments.record',
      'payroll.read',
      'payroll.run',
      'payroll.approve',
      'pnl.read',
    ],
    isDefault: true,
  },
  {
    name: 'Project Manager',
    permissions: [
      'consultants.read',
      'requirements.read',
      'requirements.write',
      'submissions.read',
      'assignments.read',
      'timesheets.read',
      'timesheets.approve',
      'utilization.read',
    ],
    isDefault: true,
  },
  {
    name: 'Resource Manager',
    permissions: [
      'consultants.read',
      'consultants.write',
      'requirements.read',
      'submissions.read',
      'submissions.create',
      'assignments.read',
      'assignments.write',
      'utilization.read',
    ],
    isDefault: true,
  },
  {
    name: 'Compliance Officer',
    permissions: [
      'consultants.read',
      'assignments.read',
      'timesheets.read',
    ],
    isDefault: true,
  },
]

// ── Permission checker ─────────────────────────────────────────

export function hasPermission(
  userPermissions: readonly string[],
  required: Permission
): boolean {
  return userPermissions.includes('*') || userPermissions.includes(required)
}

export function hasAnyPermission(
  userPermissions: readonly string[],
  required: readonly Permission[]
): boolean {
  if (userPermissions.includes('*')) return true
  return required.some((p) => userPermissions.includes(p))
}

export function hasAllPermissions(
  userPermissions: readonly string[],
  required: readonly Permission[]
): boolean {
  if (userPermissions.includes('*')) return true
  return required.every((p) => userPermissions.includes(p))
}

// ── Field-level rules (BUILD.md §2) ────────────────────────────
//
// | Field                              | Requires                                        |
// |------------------------------------|-------------------------------------------------|
// | Assignment.payRate                 | consultants.cost OR you are the person          |
// | Assignment.billRate                | margin.read OR you are the client on the MSA    |
// | Bench burn, any aggregate cost     | consultants.cost                                |
// | Margin percentages                 | margin.read                                     |
// | Consultant name in a talent view   | the owning vendor released it                   |
// | Client name on a network req       | the prime released it                            |

export type FieldContext = {
  permissions: readonly string[]
  isSubject?: boolean      // "you are the person"
  isClientOnMsa?: boolean  // "you are the client on the MSA"
  vendorReleased?: boolean // "the owning vendor released it"
  primeReleased?: boolean  // "the prime released it"
}

export function canReadPayRate(ctx: FieldContext): boolean {
  return ctx.isSubject === true || hasPermission(ctx.permissions, 'consultants.cost')
}

export function canReadBillRate(ctx: FieldContext): boolean {
  return ctx.isClientOnMsa === true || hasPermission(ctx.permissions, 'margin.read')
}

export function canReadCostAggregates(ctx: FieldContext): boolean {
  return hasPermission(ctx.permissions, 'consultants.cost')
}

export function canReadMargin(ctx: FieldContext): boolean {
  return hasPermission(ctx.permissions, 'margin.read')
}

export function canReadConsultantName(ctx: FieldContext): boolean {
  return ctx.vendorReleased === true
}

export function canReadClientName(ctx: FieldContext): boolean {
  return ctx.primeReleased === true
}

/**
 * Strip fields the caller cannot see. Applied to every read path.
 * Returns a new object with restricted fields set to undefined.
 */
export function filterAssignmentFields<T extends Record<string, unknown>>(
  assignment: T,
  ctx: FieldContext
): T {
  const filtered = { ...assignment }

  if (!canReadPayRate(ctx)) {
    delete filtered.payRate
  }

  if (!canReadBillRate(ctx)) {
    delete filtered.billRate
    delete filtered.margin
    delete filtered.marginPct
  }

  return filtered
}

// ── Saying no without handing somebody a key ───────────────────
//
// Found by walking 1,181 screens as 38 seats. Three refusals, verbatim:
//
//   "Approving hours needs the timesheets.approve permission."
//   "Extending a placement needs the assignments.write permission.
//    Ask whoever runs your company's access."
//   "You need consultants.read permission"
//
// All three are the same fault CLAUDE.md names under Zero training:
// "Explain in a sentence, not a code. A refusal says what is missing and
// what to do — never `DOCUMENTS_BLOCK`. The code is for the machine; the
// sentence is the product." A permission key IS a code. `timesheets.approve`
// is not a thing anybody at a hospital or a staffing firm has heard of,
// it is not searchable in their own product, and — worst of the three —
// it does not answer the only question the reader actually has, which is
// *who do I go to*.
//
// The answer to that question is already in the product and nobody was
// reading it. `lib/company-defaults` says, per kind of company, which
// named desk holds which permission: at a client the Hiring Manager and
// the Program Manager hold `timesheets.approve`, at a staffing supplier
// it is AP & Payroll and Finance. So the sentence a person should read
// is computable, per company, from data that already exists — and it
// changes on its own when somebody edits the role set, which a
// hand-written sentence would not.
//
// One deliberate omission: Owner and Admin hold everything by
// construction, so naming them in every refusal would make every
// sentence read "ask the owner" and teach the reader nothing. They are
// named only when they are genuinely the only desks that hold it, which
// is itself the useful answer.

import { rolesFor, type CompanyKind } from '@/lib/company-defaults'

/** Held by construction, so naming them says nothing. */
const HOLDS_EVERYTHING = new Set(['Owner', 'Admin'])

/** Beyond this many named desks a sentence stops being a sentence. */
const AT_MOST = 3

const KINDS: readonly CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

function asKind(kind: string | null | undefined): CompanyKind {
  const k = (kind ?? '').toUpperCase() as CompanyKind
  return KINDS.includes(k) ? k : 'VENDOR'
}

/**
 * Which named desks at this kind of company hold one of these
 * permissions, in the company's own words.
 *
 * Read off the shipped role set rather than a second table, so a role
 * that gains a permission gains the sentence in the same commit.
 */
export function desksHolding(
  needs: Permission | readonly Permission[],
  kind: string | null | undefined
): string[] {
  const wanted: readonly Permission[] = Array.isArray(needs)
    ? (needs as readonly Permission[])
    : [needs as Permission]

  const holders = rolesFor(asKind(kind)).filter((r) =>
    wanted.some((p) => (r.permissions as readonly string[]).includes(p))
  )

  const named = holders.filter((r) => !HOLDS_EVERYTHING.has(r.name)).map((r) => r.name)
  // Only when nobody but the owner and the admin hold it — which is the
  // honest answer for settings.manage and team.manage.
  return named.length ? named : holders.map((r) => r.name)
}

/** "the Hiring Manager’s or the Program Manager’s" */
function possessives(desks: readonly string[]): string {
  const shown = desks.slice(0, AT_MOST).map((d) => `the ${d}’s`)
  if (shown.length === 1) return shown[0]
  return shown.slice(0, -1).join(', ') + ' or ' + shown[shown.length - 1]
}

/**
 * The refusal a person reads when their desk does not do this.
 *
 * `doing` is the act, as a gerund phrase and in the reader's words —
 * "Approving hours", "Extending a placement", "Reading who holds what
 * here". Never the route, never the permission.
 *
 * Two shapes, because there are two honest answers:
 *
 *   Somebody here does do it → name them, and say the two ways forward
 *   (ask them, or be seated there). A reader who knows the Program
 *   Manager signs hours can go and ask, which is the whole point.
 *
 *   Nobody here does → say so plainly rather than invent a desk. This
 *   is what a company that has edited its roles down to nothing gets,
 *   and pretending otherwise would send somebody to a person who cannot
 *   help either.
 */
export function askTheDesk(args: {
  doing: string
  needs: Permission | readonly Permission[]
  kind?: string | null
  companyName?: string | null
}): string {
  const desks = desksHolding(args.needs, args.kind)
  const where = args.companyName?.trim() ? args.companyName.trim().replace(/\.$/, '') : 'your company'

  if (desks.length === 0) {
    return (
      `${args.doing} is not something this desk does, and no desk at ${where} is set up for it ` +
      `either. Ask whoever manages roles at ${where}.`
    )
  }

  const among = desks.length > AT_MOST ? ', among other desks there' : ''
  const ask = desks.length === 1 ? 'Ask them' : 'Ask one of them'
  return (
    `${args.doing} is ${possessives(desks)} at ${where}${among}. ${ask}, or ask ` +
    `whoever manages roles there to widen your desk.`
  )
}

/**
 * What each permission lets somebody do, in the words of the trade.
 *
 * Here because a refusal that lists keys — "Account Manager carries
 * things you do not have yourself: consultants.cost, margin.read" — is
 * the same fault as a refusal that names one, multiplied. The reader
 * has to be told what they would be handing over, and `consultants.cost`
 * does not tell them.
 *
 * Each phrase completes "they can …", lower case, no full stop, so the
 * phrases join into a list inside somebody else's sentence.
 */
export const PERMISSION_WORDS: Record<Permission, string> = {
  'consultants.read': 'see the people this firm has on its books',
  'consultants.write': 'add and edit those people',
  'consultants.cost': 'see what each of them costs',
  'requirements.read': 'read open roles',
  'requirements.write': 'write and change roles',
  'requirements.distribute': 'decide which suppliers see a role',
  'submissions.read': 'read who has been put forward',
  'submissions.create': 'put somebody forward',
  'submissions.rate': 'set the rate somebody is offered at',
  'assignments.read': 'read placements',
  'assignments.write': 'write and extend placements',
  'assignments.terminate': 'end a placement',
  'timesheets.read': 'read hours',
  'timesheets.approve': 'sign hours off',
  'invoices.read': 'read bills and invoices',
  'invoices.issue': 'issue a bill to a customer',
  'rates.read': 'read agreed rates',
  'rates.write': 'set and change agreed rates',
  'payments.record': 'record money received',
  'payroll.read': 'read payroll',
  'payroll.run': 'run payroll',
  'payroll.approve': 'approve a payroll run',
  'vendors.read': 'see the suppliers this firm uses',
  'vendors.manage': 'add and remove suppliers',
  'network.read': 'look outside this firm at the wider market',
  'utilization.read': 'see how fully people are booked',
  'margin.read': 'see the margin on a placement',
  'pnl.read': 'see profit and loss',
  'team.manage': 'invite colleagues',
  'settings.manage': 'change company settings and hand out seats',
  'governance.read': 'read the approval rules and who holds what',
  'governance.write': 'change the approval rules',
  'privacy.manage': 'act on somebody else’s data rights',
}

/** "see what each of them costs and see the margin on a placement" */
export function inWords(permissions: readonly string[]): string {
  const said = permissions
    .map((p) => PERMISSION_WORDS[p as Permission])
    .filter((w): w is string => Boolean(w))
  if (said.length === 0) return 'do things this seat does not'
  if (said.length === 1) return said[0]
  return said.slice(0, -1).join(', ') + ' and ' + said[said.length - 1]
}
