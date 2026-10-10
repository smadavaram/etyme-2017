import { describe, it, expect } from 'vitest'
import { isConsultantSeat, staffOnly, ownRecordsOnly } from '@/lib/seat'
import {
  sellContractScope, buyContractScope, expenseScope,
  invoiceScope, requirementScope, raisedIt,
} from '@/lib/resolve-client-company'
import type { CallerContext } from '@/lib/api-context'

/**
 * A consultant on an agency's bench gets a context pointing at that agency.
 * True, and not employment — but every scope helper read it as employment
 * and handed a contractor the agency's whole book. Probed on a running
 * server: nine contracts, nine timesheets, six other people's rate
 * movements, twenty-seven automation entries, the role definitions.
 *
 * And the other direction: a competitor holding an id read an invoice, its
 * purchase order ceiling, and the named shortlist behind somebody else's
 * role. Those routes authenticated the caller and then threw them away.
 */

function staff(over: Partial<CallerContext> = {}): CallerContext {
  return {
    person: { id: 'rec-1', name: 'Ravi', primaryEmail: 'ravi@techpeple.example', timezone: null },
    context: { id: 'ctx', type: 'EMPLOYEE', companyId: 'techpeple', roleId: 'role-1' },
    company: {
      id: 'techpeple', name: 'Techpeple Inc.', slug: 'techpeple', kind: 'VENDOR',
      outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false,
    },
    permissions: ['requirements.read', 'consultants.cost'],
    ...over,
  }
}

function onTheBench(over: Partial<CallerContext> = {}): CallerContext {
  return {
    ...staff(),
    person: { id: 'anita', name: 'Anita Desai', primaryEmail: 'anita@techpeple.example', timezone: null },
    // The agency's id, because she is listed there. No role, because she
    // does not work there.
    context: { id: 'ctx', type: 'CONSULTANT', companyId: 'techpeple', roleId: null },
    permissions: [],
    ...over,
  }
}

describe('telling staff from the person the records are about', () => {
  it('reads a consultant context as somebody on the bench, not an employee', () => {
    expect(isConsultantSeat(onTheBench())).toBe(true)
    expect(isConsultantSeat(staff())).toBe(false)
  })

  it('does not promote a session with a missing company into a consultant', () => {
    // Two different faults with two different answers. A consultant with no
    // bench yet gets their own records; an employee whose company failed to
    // resolve gets nothing at all. Folding them together fails upward.
    expect(isConsultantSeat(staff({ company: null }))).toBe(false)
    expect(sellContractScope(staff({ company: null }))).toBeNull()
  })

  it('still gives a consultant who has joined no bench their own records', () => {
    const unlisted = onTheBench({ company: null })
    expect(isConsultantSeat(unlisted)).toBe(true)
    expect(sellContractScope(unlisted)).toEqual({ personId: 'anita' })
  })
})

describe('a consultant asking for the agency’s book', () => {
  it('is refused, and told which page is theirs', () => {
    const said = staffOnly(onTheBench(), 'Company settings')
    expect(said).not.toBeNull()
    expect(said!.status).toBe(403)
  })

  it('does not put two full stops in the sentence when the company name ends in one', async () => {
    const body = await staffOnly(onTheBench(), 'Company settings')!.json()
    expect(body.error.message).toContain('belongs to Techpeple Inc. You are')
  })

  it('tells a candidate on nobody’s bench that she is not signed in at a company, never that she is on an agency’s bench', async () => {
    // Round six of the sign-up walk, problem 8: Nina signed up as herself
    // and read "belongs to this agency. You are on their bench" on twenty pages.
    const nina = onTheBench({
      person: { id: 'nina', name: 'Nina', primaryEmail: 'nina@walk.test', timezone: null },
      context: { id: 'ctx', type: 'CONSULTANT', companyId: null, roleId: null },
      company: null,
    })
    const body = await staffOnly(nina, 'Users & permissions')!.json()
    expect(body.error.message).toBe('You are not signed in at a company. Your own work is under Your work.')
    expect(body.error.message).not.toMatch(/bench|agency/)
  })

  it('keeps the bench sentence, naming the firm, for somebody actually listed at that firm', async () => {
    const body = await staffOnly(onTheBench(), 'Automation')!.json()
    expect(body.error.message).toBe(
      'Automation belongs to Techpeple Inc. You are on their bench, not on their staff — your own work is under Your work.'
    )
  })

  it('lets staff straight through', () => {
    expect(staffOnly(staff(), 'Company settings')).toBeNull()
  })
})

describe('what a consultant sees of contracts, hours, rates and expenses', () => {
  it('sees their own contract and not the other eight', () => {
    expect(sellContractScope(onTheBench())).toEqual({ personId: 'anita' })
  })

  it('sees the buy line that names them, not what the agency pays anybody else', () => {
    expect(buyContractScope(onTheBench())).toEqual({
      candidates: { some: { personId: 'anita' } },
    })
  })

  it('sees the expenses they raised', () => {
    expect(expenseScope(onTheBench())).toEqual({ personId: 'anita' })
  })

  it('is not a party to an invoice, because a bill is between two companies', () => {
    expect(invoiceScope(onTheBench())).toBeNull()
  })

  it('does not get the market — they are in it, they do not shop it', () => {
    expect(requirementScope(onTheBench())).toBeNull()
  })

  it('leaves staff scoped to the company, exactly as before', () => {
    expect(sellContractScope(staff())).toEqual({ companyId: 'techpeple' })
    expect(buyContractScope(staff())).toEqual({ companyId: 'techpeple' })
  })

  it('narrows a query to the person when they are on a bench, and not otherwise', () => {
    expect(ownRecordsOnly(onTheBench())).toEqual({ personId: 'anita' })
    expect(ownRecordsOnly(staff())).toBeNull()
  })
})

describe('an invoice, and who is party to it', () => {
  it('scopes to the two companies on the agreement behind it', () => {
    expect(invoiceScope(staff())).toEqual({
      engagement: { msa: { OR: [{ vendorId: 'techpeple' }, { clientId: 'techpeple' }] } },
    })
  })

  it('gives a caller with no company nothing rather than everything', () => {
    expect(invoiceScope(staff({ company: null }))).toBeNull()
  })
})

describe('who may see a role, and who may see the shortlist behind it', () => {
  it('shows a vendor their own roles, roles they were invited to, and the open market', () => {
    const scope = requirementScope(staff()) as any
    expect(scope.OR).toEqual([
      { companyId: 'techpeple' },
      { invitations: { some: { toCompanyId: 'techpeple' } } },
      { openToNetwork: true, status: 'OPEN', company: { isDemo: false } },
    ])
  })

  it('never shows a real company a stranger\u2019s demo sandbox', () => {
    // Open-to-network is the one branch that crosses a company boundary,
    // so it is the one that has to carry the wall.
    const scope = requirementScope(staff()) as any
    expect(scope.OR[2].company).toEqual({ isDemo: false })
  })

  it('keeps a demo visitor off the network entirely', () => {
    // A sandbox has its own demand seeded into it. Letting it read the
    // open market showed a visitor three real customers\u2019 open roles.
    const visitor = staff({
      company: { ...staff().company!, isDemo: true },
    })
    const scope = requirementScope(visitor) as any
    expect(scope.OR).toHaveLength(2)
    expect(scope.OR.some((c: any) => c.openToNetwork)).toBe(false)
  })

  it('drops the open market for a firm that has shut its outside access', () => {
    const walled = staff({
      company: { ...staff().company!, outsideAccess: 'CLOSED' },
    })
    const scope = requirementScope(walled) as any
    expect(scope.OR).toHaveLength(2)
  })

  it('keeps the open market for a named person inside a walled firm', () => {
    const desk = staff({
      company: { ...staff().company!, outsideAccess: 'NAMED_ONLY' },
      permissions: ['network.read'],
    })
    expect((requirementScope(desk) as any).OR).toHaveLength(3)
  })

  it('gives the match list only to the company that raised the role', () => {
    // Seeing a role is one thing — a supplier invited to it should. The
    // shortlist is names, headlines, skills and scores: somebody's bench
    // with the prices taken off.
    expect(raisedIt(staff(), { companyId: 'techpeple' })).toBe(true)
    expect(raisedIt(staff(), { companyId: 'northwind' })).toBe(false)
  })

  it('never gives the match list to the consultant sitting on it', () => {
    expect(raisedIt(onTheBench(), { companyId: 'techpeple' })).toBe(false)
  })
})
