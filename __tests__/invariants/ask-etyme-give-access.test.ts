import { describe, it, expect, vi } from 'vitest'
import { respond, readAsk, type Readers, type MarginRow } from '@/app/api/conversations/twin/ask'
import { GIVE_ACCESS_FIELDS } from '@/lib/permission-grants/form'
import {
  scopeLine, noAccessSays, teamsGranted, readGiveAccess, readWhoHolds, draftGiveAccess, whoHoldsSays,
  type GrantOffer,
} from '@/app/api/conversations/twin/access'

/**
 * The Owner decides who sees what, by team, by role or for the whole
 * company (founder, 2026-11-08). Ask Etyme's part: a refused or narrowed
 * read says how far the reader reaches and who may give more; the Owner's
 * words become a give-access card whose yes posts to the one route; and
 * "Who can see margin?" is answered by name.
 */

function readers(over: Partial<Readers> = {}): Readers {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
    model: async () => null, logPrompt: async () => undefined,
    ...over,
  } as Readers
}
const asFirm = (text: string, r: Readers, more: Record<string, unknown> = {}) =>
  respond(text, r, { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Tapin', permissions: ['*'], ...more })

const OFFER: GrantOffer = {
  canGive: true,
  isOwner: true,
  permissions: [
    { key: 'margin.read', label: 'read what placements make', personOnly: false, scopes: ['COMPANY', 'UNIT', 'PERSON'] },
    { key: 'rates.read', label: 'read agreed rates', personOnly: false, scopes: ['COMPANY'] },
    { key: 'payroll.read', label: 'read payroll', personOnly: true, scopes: ['COMPANY'] },
  ],
  roles: [{ id: 'r-rec', name: 'Recruiter' }, { id: 'r-am', name: 'Account Manager' }],
  people: [
    { contextId: 'c-maya', name: 'Maya Lopez', roleName: 'Account Manager' },
    { contextId: 'c-dana', name: 'Dana Whitfield', roleName: 'Recruiter' },
  ],
  units: [{ id: 'u-day', name: 'Dayton', parentId: null }, { id: 'u-day-w', name: 'Dayton West', parentId: 'u-day' }],
}

const ROW: MarginRow = {
  personId: 'p', person: 'Rajesh Iyer', client: 'Northbend Athletic', live: true,
  spreadMinor: 3900, spreadPct: 30, spreadMissing: null,
  earnedMinor: 75920, earnedRevenueMinor: 520000, earnedPct: 14.6, currency: 'USD', href: '/dashboard/placements/s1',
}

describe('a read says how far the reader reaches', () => {
  it('a seat given margin for one team is told so beside the figures, and to ask the Owner for the firm’s', async () => {
    const a = await asFirm('What is our margin?', readers({
      margins: async () => ({ ok: true as const, rows: [ROW] }),
      scopeLine: async () => scopeLine('margin.read', 'UNIT', ['Dayton']),
    }))
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.says.endsWith('You read what placements make for the Dayton team; ask the Owner for the firm’s.')).toBe(true)
  })

  it('a seat given margin for its own work is told it reads its own work only', () => {
    expect(scopeLine('margin.read', 'PERSON')).toBe('You read what placements make for your own work; ask the Owner for the firm’s.')
  })

  it('a seat that reads the firm’s margin is told nothing extra', async () => {
    expect(scopeLine('margin.read', 'COMPANY')).toBeNull()
    const a = await asFirm('What is our margin?', readers({ margins: async () => ({ ok: true as const, rows: [ROW] }), scopeLine: async () => null }))
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.says).not.toContain('ask the Owner')
  })

  it('a team granted with the teams under it is named once, at the team that was granted', () => {
    expect(teamsGranted(['u-day', 'u-day-w'], OFFER.units)).toEqual(['Dayton'])
  })

  it('somebody the Owner gave the right to give access is named beside the Owner', () => {
    expect(scopeLine('margin.read', 'UNIT', ['Dayton'], ['Dana Whitfield'])).toBe('You read what placements make for the Dayton team; ask the Owner or Dana Whitfield for the firm’s.')
  })

  it('a seat with no margin at all is told who reads it and that the Owner gives access, in one sentence', () => {
    const says = noAccessSays({ reads: 'what your placements earn', desks: ['Finance'], holdsDesk: true })
    expect(says).toBe('Your Finance reads what your placements earn; ask them, or ask the Owner to give you access.')
    expect(says.split('. ').length).toBe(1)
    expect(says).not.toMatch(/[A-Z_]{4,}|margin\.read/)
  })

  it('where the Owner is one of the roles that read it, the Owner is asked once', () => {
    expect(noAccessSays({ reads: 'what your placements earn', desks: ['Owner', 'Admin'], holdsDesk: true }))
      .toBe('Your Owner or Admin reads what your placements earn; ask the Owner to give you access.')
  })

  it('a profit question is read as the margin question, through the same Profitability read', () => {
    expect(readAsk('How much profit did we make?').kind).toBe('MARGIN')
  })
})

describe('the Owner gives access in words', () => {
  it('“let Maya read margin for the Dayton team” is read as who, what and how far, with the sentence kept as the reason', () => {
    expect(readGiveAccess('let Maya read margin for the Dayton team')).toEqual({
      who: 'Maya', permission: 'margin.read', scope: 'UNIT', team: 'Dayton', quote: 'let Maya read margin for the Dayton team',
    })
  })

  it('“let me see margin” is somebody asking to read it, never giving it', () => {
    expect(readGiveAccess('let me see margin')).toBeNull()
    expect(readAsk('let me see our margin').kind).toBe('MARGIN')
  })

  it('the card asks the Owner in plain words and its yes is exactly what Give access posts', () => {
    const d = draftGiveAccess(readGiveAccess('let Maya read margin for the Dayton team')!, OFFER)
    if (!d.ok) throw new Error(d.says)
    expect(d.question).toBe('Give Maya Lopez the right to read what placements make for the Dayton team?')
    expect(d.body).toEqual({
      permission: 'margin.read', roleId: null, contextId: 'c-maya', scope: 'UNIT', orgUnitId: 'u-day',
      reason: 'Asked in Ask Etyme: “let Maya read margin for the Dayton team”',
    })
  })

  it('every question Give access’s route asks, the card’s yes already answers', () => {
    const d = draftGiveAccess(readGiveAccess('let Maya read margin for the Dayton team')!, OFFER)
    if (!d.ok) throw new Error(d.says)
    const answered: Record<string, boolean> = {
      permission: !!d.body.permission,
      who: Boolean(d.body.roleId) !== Boolean(d.body.contextId),
      scope: !!d.body.scope,
      orgUnitId: d.body.scope !== 'UNIT' || !!d.body.orgUnitId,
      reason: d.body.reason.trim().length > 0,
    }
    for (const f of GIVE_ACCESS_FIELDS) expect(answered[f], f).toBe(true)
  })

  it('a role can be given access by its name, for the whole company', () => {
    const d = draftGiveAccess(readGiveAccess('Allow the recruiters to see rates')!, OFFER)
    if (!d.ok) throw new Error(d.says)
    expect(d.question).toBe('Give everybody in Recruiter the right to read agreed rates for the company?')
    expect(d.body.roleId).toBe('r-rec')
    expect(d.body.contextId).toBeNull()
  })

  it('no card is drawn for a seat that may not give access', () => {
    const d = draftGiveAccess(readGiveAccess('let Maya read margin')!, { ...OFFER, canGive: false, isOwner: false })
    expect(d).toEqual({ ok: false, says: 'Only the Owner gives access here, or somebody the Owner has given that right to by name.' })
  })

  it('payroll is never offered to a role, only to a person by name', () => {
    const d = draftGiveAccess(readGiveAccess('let the recruiters see payroll')!, OFFER)
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.says).toBe('The right to read payroll goes to one person by name, never to a role. Say the person.')
  })

  it('a team grant the page cannot yet narrow is refused before any card, never widened to the firm', () => {
    const d = draftGiveAccess(readGiveAccess('let Maya see rates for the Dayton team')!, OFFER)
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.says).toMatch(/^Etyme does not yet narrow the right to read agreed rates/)
  })

  it('a name two people share asks for the full name rather than guessing', () => {
    const offer = { ...OFFER, people: [...OFFER.people, { contextId: 'c-maya2', name: 'Maya Chen', roleName: null }] }
    const d = draftGiveAccess(readGiveAccess('let Maya read margin')!, offer)
    expect(d).toEqual({ ok: false, says: 'More than one person here is called Maya: Maya Lopez and Maya Chen. Say the full name.' })
  })

  it('the chat draws the card only where the role contract holds access.grant, and writes nothing itself', async () => {
    const grantOffer = vi.fn(async () => ({ ok: true as const, offer: OFFER }))
    const card = await asFirm('let Maya read margin for the Dayton team', readers({ grantOffer }), { giveAccessAct: true })
    expect(card.kind).toBe('GIVE_ACCESS')
    if (card.kind === 'GIVE_ACCESS') expect(card.body.contextId).toBe('c-maya')

    const none = await asFirm('let Maya read margin for the Dayton team', readers({ grantOffer }), { giveAccessAct: false })
    expect(none.kind).toBe('TEXT')
    if (none.kind === 'TEXT') {
      expect(none.says).toBe('Ask Etyme cannot give access yet. On Users & permissions, choose Give access: Maya Lopez, “read what placements make”, the team Dayton.')
      expect(none.links).toEqual([{ label: 'Open Users & permissions', href: '/dashboard/access' }])
    }
  })
})

describe('who can see margin', () => {
  it('“Who can see margin?” is a question about who holds it, never a margin read', () => {
    expect(readWhoHolds('Who can see margin?')).toBe('margin.read')
    expect(readAsk('Who can see margin?')).toEqual({ kind: 'WHO_HOLDS', permission: 'margin.read' })
    expect(readAsk('Who has access to payroll?')).toEqual({ kind: 'WHO_HOLDS', permission: 'payroll.read' })
  })

  it('the answer names the roles that hold it with their people, and every grant beyond a role', async () => {
    const margins = vi.fn()
    const a = await asFirm('Who can see margin?', readers({
      margins,
      holdersOf: async () => ({
        ok: true as const,
        roles: [{ role: 'Owner', people: ['Sharath Madavaram'], everything: true }, { role: 'Finance', people: [], everything: false }],
        grants: [{ says: 'Maya Lopez may read what placements make for Dayton and every team under it', grantedBy: 'Sharath Madavaram', reason: 'Runs Dayton' }],
      }),
    }))
    expect(margins).not.toHaveBeenCalled()
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.says).toBe('By their role, Owner (Sharath Madavaram) and Finance (nobody seated) may read what placements make. Given beyond their role: one grant, listed below.')
    expect(a.table?.rows.map((r) => r.cells[0])).toEqual(['Sharath Madavaram', 'Nobody seated', 'Maya Lopez may read what placements make for Dayton and every team under it'])
  })

  it('with no grants, the answer says nobody holds it beyond their role', () => {
    expect(whoHoldsSays('margin.read', [{ role: 'Owner', people: ['Jenna Okafor'], everything: true }], []))
      .toBe('By their role, Owner (Jenna Okafor) may read what placements make. Nobody has been given it beyond their role.')
  })

  it('a seat that may not read who holds what is refused in the route’s own sentence', async () => {
    const says = 'Who holds what at Tapin is read by the Owner, and by whoever manages roles or reads the approval rules there.'
    const a = await asFirm('Who can see margin?', readers({ holdersOf: async () => ({ ok: false as const, says }) }))
    expect(a).toEqual({ kind: 'TEXT', says })
  })
})
