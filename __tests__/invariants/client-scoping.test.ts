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
 * Two legitimate callers:
 *   1. The client themselves — they are the subject.
 *   2. A vendor/MSP/GSI who actually places people there, proven by a
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
    person: { id: 'person-1', name: 'Test Caller', primaryEmail: 'caller@example.com' },
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

const TERUMO = { id: 'client-terumo', name: 'Terumo BCT', slug: 'terumobct', kind: 'CLIENT' }
const NIKE = { id: 'client-nike', name: 'Nike Inc.', slug: 'nike', kind: 'CLIENT' }

beforeEach(() => {
  vi.mocked(prisma.company.findUnique).mockReset()
  vi.mocked(prisma.sellContract.findFirst).mockReset()
})

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

// ── The vendor viewing a client they supply ────────────

describe('A vendor reading a client where they place people', () => {

  it('a vendor with a placement at the named client is allowed', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(caller({}), TERUMO.id)

    expect(result.error).toBeNull()
    expect(result.client?.id).toBe(TERUMO.id)
  })

  it('a vendor with no placement at the named client is refused', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(NIKE as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null)

    const result = await resolveClientCompany(caller({}), NIKE.id)

    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('naming a client that does not exist returns not found', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null)

    const result = await resolveClientCompany(caller({}), 'client-does-not-exist')

    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(404)
  })

  it('a vendor without assignments.read permission is refused', async () => {
    const result = await resolveClientCompany(
      caller({ permissions: ['consultants.read'] }),
      TERUMO.id
    )
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('a caller with no company context is refused', async () => {
    const result = await resolveClientCompany(caller({ hasCompany: false }), TERUMO.id)
    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(403)
  })
})

// ── Falling back when no client is named ───────────────

describe('A vendor who does not name a client', () => {

  it('falls back to a client the vendor actually places at', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({
      clientCompany: TERUMO,
      endClientCompany: null,
    } as any)

    const result = await resolveClientCompany(caller({}), null)

    expect(result.error).toBeNull()
    expect(result.client?.id).toBe(TERUMO.id)
  })

  it('prefers the end client over the paying customer in the fallback', async () => {
    // Three-party: vendor bills the MSP, consultant works at Terumo
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({
      clientCompany: { id: 'msp-globalstaff', name: 'GlobalStaff MSP', slug: 'globalstaff', kind: 'MSP' },
      endClientCompany: TERUMO,
    } as any)

    const result = await resolveClientCompany(caller({}), null)

    expect(result.client?.id).toBe(TERUMO.id)
    expect(result.client?.name).toBe('Terumo BCT')
  })

  it('a vendor with no contracts at all gets not found', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue(null)

    const result = await resolveClientCompany(caller({}), null)

    expect(result.client).toBeNull()
    expect(result.error?.status).toBe(404)
  })

  it('the fallback is deterministic so two clients never silently swap', async () => {
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({
      clientCompany: TERUMO,
      endClientCompany: null,
    } as any)

    await resolveClientCompany(caller({}), null)

    const call = vi.mocked(prisma.sellContract.findFirst).mock.calls[0][0] as any
    expect(call.orderBy).toBeDefined()
  })
})

// ── Query scoping by side of the placement ─────────────

describe('Contract list scoping — every caller sees only their own side', () => {

  it('a vendor sees the contracts they sell', () => {
    const scope = sellContractScope(caller({ companyId: 'vendor-cloudepa' }))
    expect(scope).toEqual({ companyId: 'vendor-cloudepa' })
  })

  it('a client sees contracts where they are the end client', () => {
    const scope = sellContractScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    )
    // endClientFilter: matches endClientCompanyId, or a direct placement
    expect(scope).toEqual({
      OR: [
        { endClientCompanyId: TERUMO.id },
        { clientCompanyId: TERUMO.id, endClientCompanyId: null },
      ],
    })
  })

  it('a client still sees a consultant billed through an MSP', () => {
    // Three-party: Cloudepa bills GlobalStaff MSP, consultant works at Terumo.
    // The contract carries endClientCompanyId = Terumo, so the first OR arm matches.
    const scope = sellContractScope(
      caller({ companyId: TERUMO.id, companyKind: 'CLIENT' })
    ) as any
    expect(scope.OR[0]).toEqual({ endClientCompanyId: TERUMO.id })
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

describe('MSP and GSI callers follow the vendor path', () => {

  it('an MSP with a placement at the client is allowed', async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(TERUMO as any)
    vi.mocked(prisma.sellContract.findFirst).mockResolvedValue({ id: 'contract-1' } as any)

    const result = await resolveClientCompany(
      caller({ companyKind: 'MSP', companyName: 'GlobalStaff MSP' }),
      TERUMO.id
    )
    expect(result.error).toBeNull()
    expect(result.client?.id).toBe(TERUMO.id)
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
