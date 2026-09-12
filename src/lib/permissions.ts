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
