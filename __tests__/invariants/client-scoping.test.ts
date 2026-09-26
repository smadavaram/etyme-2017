/**
 * Client company entitlement — who may read a client's workforce.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * BUILD.md §2: "Every read path filters by context from the first commit,
 * or you audit every query later."
 *
 * The client-facing surfaces (program, tenure, alumni, compliance) all
 * answer the same question: who is working at this client? Before this
 * module existed each route read ?clientCompanyId= straight from the
 * query string with no check, so any authenticated user could read any
 * client's tenure ledger by editing the URL.
 *
 * Three legitimate callers:
 *   1. The client themselves — they are the subject.
 *   2. A program office sitting in a seat the client granted it. It
 *      places nobody, so no contract can ever prove it belongs there;
 *      the client saying so is the proof (lib/program-seat, 2026-09-20).
 *   3. A vendor/MSP/GSI who actually places people there, proven by a
 *      SellContract resolved through endClientFilter.
 * Everyone else is refused.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolveClientCompany,
  sellContractScope,
  buyContractScope,
  expenseScope,
} from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'

const ALL_PERMS = ['assignments.read', 'consultants.read', 'timesheets.read'] as const

function caller(overrides: {
  companyId?: string
  companyName?: string
  companyKind?: string
  permissions?: readonly string[]
  hasCompany?: boolean
}): CallerContext {
  const {
    companyId = 'vendor-cloudepa',
    companyName = 'Cloudepa Inc.',
    companyKind = 'VENDOR',
    permissions = ALL_PERMS,
    hasCompany = true,
  } = overrides

  return {
    person: { id: 'person-1', name: 'Test Caller', primaryEmail: 'caller@example.com', timezone: null },
    context: { id: 'ctx-1', type: 'EMPLOYEE', companyId: hasCompany ? companyId : null, roleId: 'role-1' },
    company: hasCompany
      ? {
          id: companyId, name: companyName, slug: 'test-co', kind: companyKind,
          outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false,
        }
      : null,
    permissions,
  }
}

const TERUMO = { id: 'client-terumo', name: 'Talvern Medical', slug: 'terumobct', kind: 'CLIENT' }
const NIKE = { id: 'client-nike', name: 'Northbend Athletic Inc.', slug: 'nike', kind: 'CLIENT' }

beforeEach(() => {
  vi.mocked(prisma.company.findUnique).mockReset()
  vi.mocked(prisma.sellContract.findFirst).mockReset()
  // No seat unless a test grants one. Every resolution asks.
  vi.mocked(prisma.programSeat.findFirst).mockReset()
  vi.mocked(prisma.programSeat.findFirst).mockResolvedValue(null as never)
})

/** The shape lib/program-seat selects, for the tests that grant one. */
const SEAT_AT_NIKE = {
  id: 'seat-1',
  orgUnitId: null,
  grantedAt: new Date('2026-03-01'),
  reason: 'They run our program and place nobody here.',
  clientCompany: NIKE,
  officeCompany: { id: 'msp-kestrel', name: 'Kestrel MSP' },
  role: { id: 'role-pm', name: 'Program Manager', permissions: ['assignments.read', 'governance.read'] },
}

// ── The client viewing itself ──────────────────────────

describe('A client company reading its own workforce', () => {

  it('a client caller resolves to their own company without naming it', async () => {
    const result = await resolveClientCompany(
      caller({ companyId: TERUMO.id, companyName: TERUMO.name, companyKind: 'CLIENT' }),
      null
    )
    expect(result.error).toBeNull()
    expect(result.client?.id).toBe(TERUMO.id)
  })

  it('a client caller may name their own company explicitly', async () => {
    const result = await resolveClientCompany(
      caller({ companyId: TERUMO.id, companyName: TERUMO.name, companyKind: 'CLIENT' }),
      TERUMO.id
    )
    expect(result.error).toBeNull()
    expect(result.client?.id).toBe(TERUMO.id)
  })

  it('a client caller cannot read another client by changing the URL', async () => {
    const result = await resolveClientCompany(
      caller({ companyId: TERUMO.id, companyName: TERUMO.name, companyKind: 'CLIENT' }),
      NIKE.id
    )
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('a client caller never needs a placement relationship to see themselves', async () => {
    await resolveClientCompany(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' }),
      null
    )
    // No contract lookup happens — the client IS the subject
    expect(prisma.sellContract.findFirst).not.toHaveBeenCalled()
  })
})

// ── A supplier is not handed the buyer's book ──────────
//
// Until 2026-09-21 placing somebody at a client was itself the
// entitlement to read that client's whole program. Two suppliers
// competing to staff Corveldt Aerospace, and a validation engineer at
// one of them, each opened Corveldt's own dashboard: how many
// contractors were on site, what the month cost, and which other firms
// it bought from.

describe('A supplier reading the client it supplies', () => {

  it('a supplier is not handed a client\u2019s program because it has a contract there', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(caller({}), TERUMO.id)

    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('the refusal names what would open the program, and never promises a placement will', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(caller({ companyName: 'Teleworld' }), TERUMO.id)
    const body = await result.error!.json()

    expect(body.error.message).toContain('Talvern Medical')
    expect(body.error.message).toMatch(/seat in their program office/)
    expect(body.error.message).toMatch(/own placements, contracts, weeks and bills/)
  })

  it('a supplier with no placement at the named client is refused', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(NIKE as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null)

    const result = await resolveClientCompany(caller({}), NIKE.id)

    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('naming a client that is not on the platform is refused in the same words, so nobody can probe for our customers', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null)

    const a = await resolveClientCompany(caller({}), 'client-does-not-exist')
    vi.mocked(prisma.company.findUnique).mockResolvedValue(NIKE as any)
    const b = await resolveClientCompany(caller({}), NIKE.id)

    expect(a.error?.status).toBe(403)
    expect(b.error?.status).toBe(403)
    const said = await a.error!.json()
    expect(said.error.message).not.toMatch(/not found|does not exist/i)
  })

  it('a caller with no company context is refused', async () => {
    const result = await resolveClientCompany(caller({ hasCompany: false }), TERUMO.id)
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })
})

// ── No client named is no longer a licence to pick one ─

describe('A supplier that names no client at all', () => {

  it('a supplier with a contract somewhere reads its own workforce, not that client\u2019s', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({
      clientCompany: TERUMO,
      endClientCompany: null,
    } as any)

    const result = await resolveClientCompany(caller({ companyId: 'vendor-brightmoor' }), null)

    expect(result.error).toBeNull()
    expect(result.client?.id).toBe('vendor-brightmoor')
    expect(result.client?.id).not.toBe(TERUMO.id)
  })

  it('a supplier in a chain is not handed the end client\u2019s program either', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({
      clientCompany: { id: 'msp-globalstaff', name: 'GlobalStaff MSP', slug: 'globalstaff', kind: 'MSP' },
      endClientCompany: TERUMO,
    } as any)

    const result = await resolveClientCompany(caller({ companyId: 'vendor-brightmoor' }), null)

    expect(result.client?.id).toBe('vendor-brightmoor')
  })

  it('a program office, which places nobody, is told what is missing rather than shown its own empty program', async () => {
    vi.mocked(prisma.programSeat.findFirst).mockResolvedValue(null as never)
    const result = await resolveClientCompany(
      caller({ companyId: 'msp-kestrel', companyName: 'Kestrel MSP', companyKind: 'MSP' }),
      null
    )
    expect(result.client).toBeNull()
    const body = await result.error!.json()
    expect(body.error.message).toMatch(/not tied to a client yet/)
  })

  it('no contract is read at all, because a contract is no longer the question', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockClear()

    await resolveClientCompany(caller({}), null)

    expect(vi.mocked(prisma.sellContract.findFirst)).not.toHaveBeenCalled()
  })
})

// ── Query scoping by side of the placement ─────────────

describe('Contract list scoping — every caller sees only their own side', () => {

  it('a vendor sees the contracts they sell', () => {
    const scope = sellContractScope(caller({ companyId: 'vendor-cloudepa' }))
    expect(scope).toEqual({ companyId: 'vendor-cloudepa' })
  })

  it('a client sees the contracts it is billed on, and not the ones underneath them', () => {
    // This used to be endClientFilter, which matches every rung of
    // every chain at this client's sites. In a chain the sub-vendor's
    // contract also names the client as its end client, so the client
    // read what its prime pays — and the difference between the two
    // rows is the prime's whole margin.
    const scope = sellContractScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    )
    expect(scope).toEqual({ clientCompanyId: TERUMO.id })
  })

  it('a client is shown nothing rather than its supplier\u2019s cost where a chain has no top rung', () => {
    // Three-party: Cloudepa bills GlobalStaff MSP, consultant works at
    // Talvern Medical, and no contract names Talvern Medical as the buyer. Talvern Medical is not
    // a party to the money of that row, so it is not on this list —
    // who is on site is endClientFilter's question, asked on the
    // screens built for it, where no rate is shown.
    const scope = sellContractScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    ) as any
    expect(scope.OR).toBeUndefined()
    expect(JSON.stringify(scope)).not.toContain('endClientCompanyId')
  })

  it('an MSP sees contracts they sell and contracts they pay for', () => {
    const scope = sellContractScope(
      caller({ companyId: 'msp-globalstaff', companyKind: 'MSP' })
    )
    expect(scope).toEqual({
      OR: [
        { companyId: 'msp-globalstaff' },
        { clientCompanyId: 'msp-globalstaff' },
      ],
    })
  })

  it('a caller with no company is entitled to no contracts', () => {
    expect(sellContractScope(caller({ hasCompany: false }))).toBeNull()
  })

  it('the scope is never empty, so a list route cannot return every contract', () => {
    // The bug this replaces: `const where = {}` when no ?companyId= was passed
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI']) {
      const scope = sellContractScope(caller({ companyKind: kind }))
      expect(scope).not.toBeNull()
      expect(Object.keys(scope!).length).toBeGreaterThan(0)
    }
  })
})

describe('Buy contract scoping', () => {

  it('a vendor sees the buy contracts they own', () => {
    expect(buyContractScope(caller({ companyId: 'vendor-cloudepa' })))
      .toEqual({ companyId: 'vendor-cloudepa' })
  })

  it('a client has no buy contracts and sees an empty list, not everyone else\'s', () => {
    const scope = buyContractScope(caller({ companyId: TERUMO.id, companyKind: 'CLIENT' }))
    // Scoped to their own id — they own no buy contracts, so the list is empty
    expect(scope).toEqual({ companyId: TERUMO.id })
  })

  it('a caller with no company is entitled to no buy contracts', () => {
    expect(buyContractScope(caller({ hasCompany: false }))).toBeNull()
  })
})

describe('Expense scoping — a client never sees a vendor\'s internal costs', () => {

  it('a vendor sees every expense their company owns', () => {
    expect(expenseScope(caller({ companyId: 'vendor-cloudepa' })))
      .toEqual({ companyId: 'vendor-cloudepa' })
  })

  it('a client sees only billable expenses raised at their own sites', () => {
    const scope = expenseScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    ) as any
    expect(scope.billable).toBe(true)
    expect(scope.sellContract).toEqual({
      OR: [
        { endClientCompanyId: TERUMO.id },
        { clientCompanyId: TERUMO.id, endClientCompanyId: null },
      ],
    })
  })

  it('a client cannot see a vendor\'s internal non-billable expense', () => {
    const scope = expenseScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    ) as any
    // billable: true is a hard filter — internal vendor costs never match
    expect(scope.billable).toBe(true)
  })

  it('a caller with no company is entitled to no expenses', () => {
    expect(expenseScope(caller({ hasCompany: false }))).toBeNull()
  })
})

// ── The MSP and GSI cases ──────────────────────────────

describe('A program office in a seat the client granted', () => {
  it('a program office that places nobody still reads the program it was seated in', async () => {
    vi.mocked(prisma.programSeat.findFirst).mockResolvedValue(SEAT_AT_NIKE as never)
    vi.mocked(prisma.sellContract.findMany).mockResolvedValue([] as never)
    const r = await resolveClientCompany(
      caller({ companyId: 'msp-kestrel', companyName: 'Kestrel MSP', companyKind: 'MSP', permissions: [] }),
      NIKE.id
    )
    expect(r.error).toBeNull()
    expect(r.client?.id).toBe(NIKE.id)
  })

  it('the seat is the entitlement, so a program office is not asked for a permission its own firm never gave it', async () => {
    // The MSP's own coordinator role holds nothing. What they may do
    // inside is the CLIENT'S role on the seat, not this.
    vi.mocked(prisma.programSeat.findFirst).mockResolvedValue(SEAT_AT_NIKE as never)
    vi.mocked(prisma.sellContract.findMany).mockResolvedValue([] as never)
    const r = await resolveClientCompany(
      caller({ companyId: 'msp-kestrel', companyKind: 'MSP', permissions: [] }),
      null
    )
    expect(r.error).toBeNull()
    expect(r.seat?.role.name).toBe('Program Manager')
  })

  it('a program office with no seat is told what is missing, not shown an empty program', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null as never)
    const r = await resolveClientCompany(
      caller({ companyId: 'msp-kestrel', companyName: 'Kestrel MSP', companyKind: 'MSP' }),
      null
    )
    expect(r.client).toBeNull()
    const body = await r.error!.json()
    expect(body.error.message).toContain('Kestrel MSP')
    expect(body.error.message).toMatch(/seat in their program office/)
    expect(body.error.message).toMatch(/owner or the program manager/)
  })

  it('a seat at one client is no entitlement at another', async () => {
    // Asked for Talvern; the seat is at Northbend, so the seat branch
    // finds nothing and there is nothing else to find — an office that
    // runs one client's program is a stranger to the next one.
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as never)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null as never)
    const r = await resolveClientCompany(
      caller({ companyId: 'msp-kestrel', companyName: 'Kestrel MSP', companyKind: 'MSP' }),
      TERUMO.id
    )
    expect(r.client).toBeNull()
    const body = await r.error!.json()
    expect(body.error.message).toContain('Talvern Medical')
    expect(body.error.message).toContain('Kestrel MSP')
  })
})

describe('MSP and GSI callers are refused the same way a staffing vendor is', () => {

  it('an MSP that supplies people to a client still cannot read that client\u2019s program', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(
      caller({ companyKind: 'MSP', companyName: 'GlobalStaff MSP' }),
      TERUMO.id
    )
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('a systems integrator staffing a client cannot read its headcount and spend', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(
      caller({ companyKind: 'GSI', companyName: 'Teleworld' }),
      TERUMO.id
    )
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('a GSI without a placement at the client is refused', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(NIKE as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null)

    const result = await resolveClientCompany(
      caller({ companyKind: 'GSI', companyName: 'Infosys' }),
      NIKE.id
    )
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })
})
