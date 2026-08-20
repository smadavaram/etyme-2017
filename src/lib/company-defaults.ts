import type { Permission } from '@/lib/permissions'

/**
 * What a company gets on the day it signs up.
 *
 * Before this existed, a new company received exactly one row and one role
 * called Owner. Which meant: no cycle calendar, so nothing was ever due;
 * no holidays, so business-day shifting only avoided weekends; and one
 * role to grant, so the access screen offered a new colleague total
 * control or nothing.
 *
 * The rule here is that a default is a starting point, never a decision
 * taken away. Everything below can be edited afterwards. What it must not
 * do is leave the company unable to start, which is the state an empty
 * setup produces.
 *
 * Roles differ by what the company is, because they have to. A client's
 * "Recruiter" is meaningless and a vendor's "Hiring Manager" is
 * meaningless, and offering both to both is how a permissions screen
 * becomes noise.
 */

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

export interface RoleSeed {
  name: string
  /** What the person holding it actually does, in their words. */
  blurb: string
  permissions: Permission[]
  /** Given to the person who creates the company. Exactly one per set. */
  isOwner?: boolean
}

// ── Building blocks ───────────────────────────────────────────────────
// Named so the role lists below read as sentences rather than as arrays.

const SEE_PEOPLE: Permission[] = ['consultants.read']
const RUN_DEMAND: Permission[] = ['requirements.read', 'requirements.write', 'requirements.distribute']
const SEE_DEMAND: Permission[] = ['requirements.read']
const SEE_SUPPLY: Permission[] = ['submissions.read']
const SEND_SUPPLY: Permission[] = ['submissions.read', 'submissions.create', 'submissions.rate']
const SEE_WORK: Permission[] = ['assignments.read', 'timesheets.read']
const APPROVE_WORK: Permission[] = ['timesheets.read', 'timesheets.approve']
const RUN_MONEY_IN: Permission[] = ['invoices.read', 'invoices.issue', 'payments.record']
const SEE_MONEY: Permission[] = ['invoices.read']
const RUN_PAYROLL: Permission[] = ['payroll.read', 'payroll.run', 'payroll.approve']
const OWN_PRICE: Permission[] = ['rates.read', 'rates.write']
const OWN_RULES: Permission[] = ['governance.read', 'governance.write']
const SEE_RULES: Permission[] = ['governance.read']
/**
 * Looking outside the company at all: other firms' consultants, who is
 * coming free, which suppliers exist.
 *
 * Only where it is somebody's actual job. At a delivery firm that is the
 * contractor desk and the supplier manager — never the delivery managers,
 * who between them are most of the company.
 */
const SEE_OUTSIDE: Permission[] = ['network.read']

/** Everything. Only the owner set uses it. */
function everything(): Permission[] {
  // Imported lazily through the type rather than the value so this module
  // stays a pure description with no import cycle back into permissions.
  return ALL as Permission[]
}

// Kept in step with PERMISSIONS by a test, rather than by hope.
const ALL: string[] = [
  'consultants.read', 'consultants.write', 'consultants.cost',
  'requirements.read', 'requirements.write', 'requirements.distribute',
  'submissions.read', 'submissions.create', 'submissions.rate',
  'assignments.read', 'assignments.write', 'assignments.terminate',
  'timesheets.read', 'timesheets.approve',
  'invoices.read', 'invoices.issue',
  'rates.read', 'rates.write',
  'payments.record',
  'payroll.read', 'payroll.run', 'payroll.approve',
  'vendors.read', 'vendors.manage', 'network.read',
  'utilization.read', 'margin.read', 'pnl.read',
  'team.manage', 'settings.manage',
  'governance.read', 'governance.write',
]

function uniq(...groups: Permission[][]): Permission[] {
  return Array.from(new Set(groups.flat()))
}

// ── A staffing supplier ───────────────────────────────────────────────

const SUPPLIER_ROLES: RoleSeed[] = [
  {
    name: 'Owner',
    blurb: 'Everything, including profit and loss.',
    permissions: everything(),
    isOwner: true,
  },
  {
    name: 'Admin',
    blurb: 'Runs the company day to day. Cannot see profit and loss.',
    permissions: everything().filter((p) => p !== 'pnl.read'),
  },
  {
    name: 'Recruiter',
    blurb: 'Finds and submits people. Cannot see what anyone costs.',
    // The single exclusion that matters: no *.cost, no margin, no P&L, so
    // a bench total cannot be worked backwards into somebody's salary.
    permissions: uniq(SEE_PEOPLE, ['consultants.write'], SEE_DEMAND, SEND_SUPPLY, SEE_WORK, ['vendors.read']),
  },
  {
    name: 'Resource Manager',
    blurb: 'Owns the bench and who goes where.',
    permissions: uniq(SEE_PEOPLE, ['consultants.write'], SEE_DEMAND, SEND_SUPPLY, SEE_WORK, ['assignments.write', 'utilization.read']),
  },
  {
    name: 'Accountant',
    blurb: 'Bills, pays, and closes the month.',
    permissions: uniq(APPROVE_WORK, RUN_MONEY_IN, RUN_PAYROLL, ['pnl.read']),
  },
  {
    name: 'Compliance Officer',
    blurb: 'Checks documents and work authorisation. Reads only.',
    permissions: uniq(SEE_PEOPLE, ['assignments.read'], ['timesheets.read'], SEE_RULES),
  },
]

// ── An enterprise that hires contractors ──────────────────────────────

const CLIENT_ROLES: RoleSeed[] = [
  {
    name: 'Owner',
    blurb: 'Everything, including what the programme costs.',
    permissions: everything(),
    isOwner: true,
  },
  {
    name: 'Programme Manager',
    blurb: 'Runs the contingent workforce programme. Sets the rules.',
    permissions: uniq(SEE_PEOPLE, RUN_DEMAND, SEE_SUPPLY, SEE_WORK, ['assignments.write'], OWN_PRICE, OWN_RULES, SEE_MONEY, SEE_OUTSIDE, ['vendors.read', 'vendors.manage', 'utilization.read']),
  },
  {
    name: 'Hiring Manager',
    blurb: 'Raises requisitions and approves their own team’s hours.',
    // Deliberately cannot distribute. Choosing which suppliers see a
    // requisition is a programme decision, not a hiring one — that is the
    // control that stops a manager routing work to a friend.
    permissions: uniq(SEE_PEOPLE, ['requirements.read', 'requirements.write'], SEE_SUPPLY, ['assignments.read'], APPROVE_WORK),
  },
  {
    name: 'Approver',
    blurb: 'Sits in the approval chain. Sees what they are asked to decide.',
    permissions: uniq(SEE_DEMAND, SEE_SUPPLY, ['assignments.read'], SEE_RULES, ['rates.read']),
  },
  {
    name: 'AP Clerk',
    blurb: 'Matches and pays supplier invoices.',
    // No rates.write. An invoice failing the price check is a contract
    // amendment somebody must approve, not a number this desk can change.
    permissions: uniq(['timesheets.read'], SEE_MONEY, ['payments.record', 'rates.read']),
  },
  {
    name: 'Compliance Officer',
    blurb: 'Owns tenure, work authorisation and supplier insurance.',
    permissions: uniq(SEE_PEOPLE, ['assignments.read', 'timesheets.read', 'vendors.read'], SEE_RULES),
  },
  {
    name: 'Viewer',
    blurb: 'Reads the programme. Changes nothing.',
    permissions: uniq(SEE_DEMAND, SEE_SUPPLY, ['assignments.read', 'timesheets.read', 'utilization.read']),
  },
]

// ── An MSP running somebody else's programme ──────────────────────────

const MSP_ROLES: RoleSeed[] = [
  {
    name: 'Owner',
    blurb: 'Everything.',
    permissions: everything(),
    isOwner: true,
  },
  {
    name: 'Programme Manager',
    blurb: 'Runs the client’s programme and its supplier panel.',
    permissions: uniq(SEE_PEOPLE, RUN_DEMAND, SEE_SUPPLY, SEE_WORK, ['assignments.write'], OWN_PRICE, OWN_RULES, SEE_MONEY, ['vendors.read', 'vendors.manage', 'utilization.read']),
  },
  {
    name: 'Supplier Manager',
    blurb: 'Owns the vendor panel — who is on it and how they perform.',
    permissions: uniq(['vendors.read', 'vendors.manage'], SEE_DEMAND, SEE_SUPPLY, ['assignments.read', 'rates.read']),
  },
  {
    name: 'Coordinator',
    blurb: 'Moves requisitions and submissions through the day.',
    permissions: uniq(SEE_PEOPLE, RUN_DEMAND, SEE_SUPPLY, SEE_WORK),
  },
  {
    name: 'AP Clerk',
    blurb: 'Consolidates supplier invoices and pays them.',
    permissions: uniq(['timesheets.read'], RUN_MONEY_IN, ['rates.read']),
  },
  {
    name: 'Compliance Officer',
    blurb: 'Owns tenure, work authorisation and supplier insurance.',
    permissions: uniq(SEE_PEOPLE, ['assignments.read', 'timesheets.read', 'vendors.read'], SEE_RULES),
  },
]

// ── A consultant's own corporation ────────────────────────────────────

const CONSULTANT_CORP_ROLES: RoleSeed[] = [
  {
    name: 'Owner',
    blurb: 'Everything. It is your company.',
    permissions: everything(),
    isOwner: true,
  },
]

/**
 * The roles a company of this kind starts with.
 *
 * A GSI is both a supplier and a buyer, so it gets the supplier set plus
 * the two roles that only make sense when you are also purchasing.
 */
export function rolesFor(kind: CompanyKind): RoleSeed[] {
  switch (kind) {
    case 'CLIENT':
      return CLIENT_ROLES
    case 'MSP':
      return MSP_ROLES
    case 'CONSULTANT_CORP':
      return CONSULTANT_CORP_ROLES
    case 'GSI':
      return [
        ...SUPPLIER_ROLES,
        {
          name: 'Delivery Manager',
          blurb: 'Owns a practice: what it delivers and who staffs it.',
          // No network.read, deliberately. A delivery manager staffs their
          // own practice from people already engaged; browsing the outside
          // market is the contractor desk's job, and at a firm this size
          // the delivery managers are most of the company.
          permissions: uniq(SEE_PEOPLE, RUN_DEMAND, SEE_SUPPLY, SEE_WORK, ['assignments.write', 'utilization.read', 'vendors.read']),
        },
        {
          name: 'Supplier Manager',
          blurb: 'Owns the firms you buy bench from.',
          permissions: uniq(['vendors.read', 'vendors.manage'], SEE_DEMAND, SEE_SUPPLY, SEE_OUTSIDE, ['assignments.read', 'rates.read']),
        },
        {
          name: 'Contractor Desk',
          blurb: 'Hires contractors from outside. The only people here who see the market.',
          permissions: uniq(SEE_PEOPLE, ['consultants.write'], SEE_DEMAND, SEND_SUPPLY, SEE_WORK, SEE_OUTSIDE, ['vendors.read']),
        },
      ]
    case 'VENDOR':
    default:
      return SUPPLIER_ROLES
  }
}

/**
 * Which template pack fits.
 *
 * The pack carries the whole cycle calendar — nineteen kinds of due date,
 * their frequencies and their days — so choosing one is what makes a
 * contract generate anything at all. Getting it approximately right and
 * letting them change it beats asking a question nobody can answer on
 * their first day.
 */
export function packFor(kind: CompanyKind, country: string | null): string {
  const c = (country ?? 'US').toUpperCase()
  if (c === 'IN') return 'IN_DELIVERY'
  if (c === 'GB' || c === 'UK') return 'UK'
  // A GSI in the US is nearly always ERP delivery work, which has its own
  // cycle shape — SAP and Oracle programmes bill and roll differently
  // from general IT contract staffing.
  if (kind === 'GSI') return 'US_SAP'
  return 'US_IT'
}

/**
 * Which country's public holidays to seed.
 *
 * Guessed from the domain suffix, because it is the only signal available
 * at sign-up and a wrong guess costs one edit. An empty calendar costs
 * every cycle date being computed against weekends only, silently.
 */
export function countryFromDomain(domain: string | null): string {
  if (!domain) return 'US'
  const tld = domain.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    in: 'IN', uk: 'GB', co: 'US', ca: 'CA', au: 'AU', de: 'DE', ie: 'IE', sg: 'SG',
  }
  // "terumobct.co.uk" ends in uk; "cloudepa.co" is a .co domain and is US.
  if (domain.endsWith('.co.uk')) return 'GB'
  if (domain.endsWith('.co.in')) return 'IN'
  return map[tld] ?? 'US'
}

/**
 * The one location every company has: wherever they say they are.
 *
 * Created as a placeholder named after the company rather than left empty,
 * because a work location picker with nothing in it reads as broken, and
 * an assignment with no location cannot be reasoned about for tenure or
 * for tax.
 */
export function primaryLocationName(companyName: string): string {
  return `${companyName} — head office`
}

/** What the whole starting kit is, in one place, for the sign-up path. */
export interface CompanyDefaults {
  templatePack: string
  country: string
  roles: RoleSeed[]
  primaryLocationName: string
  /** Seeded so cycle arithmetic has something real to shift against. */
  seedHolidays: boolean
}

export function defaultsFor(
  kind: CompanyKind,
  companyName: string,
  domain: string | null
): CompanyDefaults {
  const country = countryFromDomain(domain)
  return {
    templatePack: packFor(kind, country),
    country,
    roles: rolesFor(kind),
    primaryLocationName: primaryLocationName(companyName),
    // US, UK and India are built in. Elsewhere the company adds its own —
    // seeding another country's dates would look deliberate and nobody
    // would check them again.
    seedHolidays: ['US', 'GB', 'IN'].includes(country),
  }
}
