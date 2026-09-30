import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'
import { SUPPLIERS_OPEN_TO, maySeeSuppliers, CANNOT_SEE_SUPPLIERS, ADDS_SUPPLIERS, CANNOT_ADD_SUPPLIER, CANNOT_JOIN_SUPPLIERS } from '@/lib/supplier-list'
import { QUEUE_OPENS_FOR, CANNOT_SEE_QUEUE, isAboutAPerson } from '@/lib/review'

/**
 * Two pages every seat at a firm was shown, because their routes asked
 * for nothing past being staff.
 *
 * CLAUDE.md: "A menu entry the route will refuse is a menu entry that
 * lies" — and the other half of it, a menu entry the route will NOT
 * refuse is a page any seat opens. On the seeded world Karthik Menon, a
 * Teleworld delivery engineer who staffs nobody, sells nobody and sees no
 * money, was shown Suppliers and the Check queue and could read both.
 *
 * The gates are walked here through every default role of every kind of
 * company, because the bug these prevent — a desk locked out of the page
 * it is named for — is invisible until somebody sits in the seat.
 */

const KARTHIK = ['assignments.read', 'timesheets.read']

const KINDS: CompanyKind[] = ['VENDOR', 'GSI', 'CLIENT', 'MSP', 'CONSULTANT_CORP']

function role(kind: CompanyKind, name: string): string[] {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${kind} has no default role called ${name}`)
  return r.permissions as string[]
}

const mayQueue = (p: readonly string[]) => hasPermission(p, QUEUE_OPENS_FOR)

const API = join(__dirname, '..', '..', 'src', 'app', 'api')
const getOf = (route: string): string => {
  const src = readFileSync(join(API, route, 'route.ts'), 'utf8')
  const start = src.indexOf('export async function GET')
  const after = src.indexOf('export async function', start + 10)
  return src.slice(start, after < 0 ? src.length : after)
}

describe('a desk that has no business with suppliers or screening is not shown them', () => {
  it('a delivery engineer is not shown the suppliers or the check queue, and is refused them in a sentence', () => {
    expect(maySeeSuppliers(KARTHIK)).toBe(false)
    expect(mayQueue(KARTHIK)).toBe(false)
    for (const said of [CANNOT_SEE_SUPPLIERS, CANNOT_SEE_QUEUE]) {
      expect(said).toContain('Ask whoever manages roles at your company')
      // A person is never handed a permission code.
      expect(said).not.toMatch(/[a-z]+\.(read|write|record|manage)/)
    }
  })

  it('a team lead at an integrator, who approves one project’s hours, is refused both', () => {
    const lead = role('GSI', 'Team Lead')
    expect(maySeeSuppliers(lead)).toBe(false)
    expect(mayQueue(lead)).toBe(false)
  })

  it('HR at a supplier keeps its own people’s paperwork and is refused the supplier list and the check queue', () => {
    expect(maySeeSuppliers(role('VENDOR', 'HR'))).toBe(false)
    expect(mayQueue(role('VENDOR', 'HR'))).toBe(false)
  })

  it('the money desks at a supplier do not review the machine’s judgment of candidates', () => {
    for (const name of ['Accounts Receivable', 'AP & Payroll', 'Finance']) {
      expect(mayQueue(role('VENDOR', name)), name).toBe(false)
    }
  })
})

describe('every desk that uses the supplier list today still gets in', () => {
  it('the procurement desk still opens its suppliers', () => {
    expect(maySeeSuppliers(role('CLIENT', 'Procurement Lead'))).toBe(true)
  })

  it('the program office still opens its suppliers, at a client and at a program office firm', () => {
    expect(maySeeSuppliers(role('CLIENT', 'Program Manager'))).toBe(true)
    expect(maySeeSuppliers(role('MSP', 'Program Manager'))).toBe(true)
    expect(maySeeSuppliers(role('MSP', 'Supplier Manager'))).toBe(true)
    expect(maySeeSuppliers(role('MSP', 'Coordinator'))).toBe(true)
  })

  it('a hiring manager still opens the supplier list, because recommending a new supplier starts there', () => {
    expect(maySeeSuppliers(role('CLIENT', 'Hiring Manager'))).toBe(true)
  })

  it('the finance desk of supplier onboarding still opens the list, because the bank details are checked there', () => {
    expect(maySeeSuppliers(role('CLIENT', 'AP Clerk'))).toBe(true)
    expect(maySeeSuppliers(role('MSP', 'AP Clerk'))).toBe(true)
  })

  it('the desks that clear a job request — the approver and HR — still read which suppliers were cleared for it', () => {
    expect(maySeeSuppliers(role('CLIENT', 'Approver'))).toBe(true)
    expect(maySeeSuppliers(role('CLIENT', 'HR Partner'))).toBe(true)
  })

  it('recruiters, account and contract managers at a supplier still open the firms it buys from', () => {
    for (const name of ['Recruiter', 'Resource Manager', 'Account Manager', 'Contract Manager']) {
      expect(maySeeSuppliers(role('VENDOR', name)), name).toBe(true)
    }
  })

  it('an integrator’s delivery managers, supplier manager and contractor desk still open the supplier list', () => {
    for (const name of ['Delivery Manager', 'Supplier Manager', 'Contractor Desk']) {
      expect(maySeeSuppliers(role('GSI', name)), name).toBe(true)
    }
  })

  it('every client and program office desk in the default roles still opens the supplier list', () => {
    for (const kind of ['CLIENT', 'MSP'] as const) {
      for (const r of rolesFor(kind)) {
        expect(maySeeSuppliers(r.permissions), `${kind} ${r.name}`).toBe(true)
      }
    }
  })

  it('the owner of every kind of company opens both pages', () => {
    for (const kind of KINDS) {
      const owner = role(kind, 'Owner')
      expect(maySeeSuppliers(owner), kind).toBe(true)
      expect(mayQueue(owner), kind).toBe(true)
    }
  })
})

describe('every desk that screens candidates still opens the check queue', () => {
  it('recruiters and account managers at a supplier still review the machine’s judgment of their candidates', () => {
    for (const name of ['Recruiter', 'Resource Manager', 'Account Manager']) {
      expect(mayQueue(role('VENDOR', name)), name).toBe(true)
    }
  })

  it('the hiring manager and the program office at a client still review what the machine said about the people put forward', () => {
    for (const name of ['Hiring Manager', 'Program Manager', 'Procurement Lead', 'HR Partner', 'Approver']) {
      expect(mayQueue(role('CLIENT', name)), name).toBe(true)
    }
  })

  it('a program office’s coordinator and supplier manager still open the check queue', () => {
    for (const name of ['Program Manager', 'Coordinator', 'Supplier Manager']) {
      expect(mayQueue(role('MSP', name)), name).toBe(true)
    }
  })

  it('an AP clerk and a compliance officer at a client do not review screening', () => {
    expect(mayQueue(role('CLIENT', 'AP Clerk'))).toBe(false)
    expect(mayQueue(role('CLIENT', 'Compliance Officer'))).toBe(false)
  })
})

const mayAdd = (p: readonly string[]) => hasPermission(p, ADDS_SUPPLIERS)

describe('who may add suppliers from a pasted list', () => {
  it('a delivery engineer cannot add a supplier, and is told to recommend one or who to ask', () => {
    expect(mayAdd(KARTHIK)).toBe(false)
    expect(CANNOT_ADD_SUPPLIER).toContain('recommend it from the Suppliers page')
    expect(CANNOT_ADD_SUPPLIER).toContain('ask whoever manages roles at your company')
    expect(CANNOT_ADD_SUPPLIER).not.toMatch(/[a-z]+\.(read|write|record|manage)/)
  })

  it('procurement still adds one', () => {
    expect(mayAdd(role('CLIENT', 'Procurement Lead'))).toBe(true)
  })

  it('the program office and a supplier manager still add suppliers, at a client, a program office firm and an integrator', () => {
    expect(mayAdd(role('CLIENT', 'Program Manager'))).toBe(true)
    expect(mayAdd(role('MSP', 'Program Manager'))).toBe(true)
    expect(mayAdd(role('MSP', 'Supplier Manager'))).toBe(true)
    expect(mayAdd(role('GSI', 'Supplier Manager'))).toBe(true)
  })

  it('a hiring manager, an AP clerk and a compliance officer recommend a supplier through the desks rather than adding one', () => {
    for (const name of ['Hiring Manager', 'AP Clerk', 'Compliance Officer', 'HR Partner', 'Approver', 'Viewer']) {
      expect(mayAdd(role('CLIENT', name)), name).toBe(false)
    }
  })

  it('a recruiter or account manager at a supplier cannot put a firm on the panel by pasting it', () => {
    for (const name of ['Recruiter', 'Account Manager', 'Contract Manager', 'Finance']) {
      expect(mayAdd(role('VENDOR', name)), name).toBe(false)
    }
  })

  it('an owner and an admin still add suppliers', () => {
    expect(mayAdd(role('CLIENT', 'Owner'))).toBe(true)
    expect(mayAdd(role('VENDOR', 'Admin'))).toBe(true)
  })

  it('the add route asks for the panel desk before it writes anything', () => {
    const src = readFileSync(join(API, 'suppliers', 'route.ts'), 'utf8')
    const post = src.slice(src.indexOf('export async function POST'))
    const gate = post.indexOf(`if (!hasPermission(caller.permissions, '${ADDS_SUPPLIERS}'))`)
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(post.indexOf('prisma.'))
  })
})

describe('who may join two records of one supplier', () => {
  const src = readFileSync(join(API, 'suppliers', 'join', 'route.ts'), 'utf8')
  const post = src.slice(src.indexOf('export async function POST'))

  it('a delivery engineer cannot merge two supplier records, and is told it cannot be undone and who to ask', () => {
    expect(mayAdd(KARTHIK)).toBe(false)
    expect(CANNOT_JOIN_SUPPLIERS).toContain('cannot be undone')
    expect(CANNOT_JOIN_SUPPLIERS).toContain('ask whoever manages roles at your company')
    expect(CANNOT_JOIN_SUPPLIERS).not.toMatch(/[a-z]+\.(read|write|record|manage)/)
  })

  it('the join asks for the panel desk before it reads or moves anything', () => {
    const gate = post.indexOf(`if (!hasPermission(caller.permissions, '${ADDS_SUPPLIERS}'))`)
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(post.indexOf('prisma.'))
  })

  it('a merge is recorded with the person who did it and honestly marked as not reversible', () => {
    expect(post).toContain("action: 'SUPPLIER_RECORDS_JOINED'")
    expect(post).toContain('byPersonId: caller.person.id')
    expect(post).toContain('reversible: false')
    // Written inside the same transaction as the move, so a merge is
    // never on the books without its record.
    expect(post.indexOf('tx.automationLog.create')).toBeGreaterThan(post.indexOf('prisma.$transaction'))
  })

  it('the list of duplicates says whether this reader may press the join button, from the same gate', () => {
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(get).toContain(`mayJoin: hasPermission(caller.permissions, '${ADDS_SUPPLIERS}')`)
  })
})

describe('the route asks for exactly what the reasons say', () => {
  it('the supplier list route asks for the same three desks, in the same order, that lib/supplier-list gives reasons for', () => {
    const spelled = [...getOf('suppliers').matchAll(/hasPermission\([^,]+,\s*'([^']+)'\)/g)].map((m) => m[1])
    expect(spelled).toEqual([...SUPPLIERS_OPEN_TO])
  })

  it('the check queue and its review both ask for the one desk that reads submissions', () => {
    expect(getOf('checks/queue')).toContain(`if (!hasPermission(caller.permissions, '${QUEUE_OPENS_FOR}'))`)
    const review = readFileSync(join(API, 'checks', '[id]', 'review', 'route.ts'), 'utf8')
    expect(review).toContain(`if (!hasPermission(caller.permissions, '${QUEUE_OPENS_FOR}'))`)
  })

  it('reading the check queue leaves a trail against the people behind the sample, including when it is refused', () => {
    const body = getOf('checks/queue')
    expect(body).toContain('logBulkAccess(subjects')
    expect(body).toMatch(/allowed: false/)
    // The trail is written before the refusal goes out.
    expect(body.indexOf('allowed: false')).toBeLessThan(body.indexOf('CANNOT_SEE_QUEUE'))
  })

  it('a machine check is about a person when its record is a submission, however the record type was spelled', () => {
    expect(isAboutAPerson('SUBMISSION')).toBe(true)
    expect(isAboutAPerson('Submission')).toBe(true)
    expect(isAboutAPerson('REQUIREMENT')).toBe(false)
    expect(isAboutAPerson('INVOICE')).toBe(false)
  })
})
