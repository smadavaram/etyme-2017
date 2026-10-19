import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { senderAsTheClientSees, checkApprover, needsSigningInEtyme, hashLinkToken, offPlatformRecord, approvalWords, type WeekChain } from '@/lib/week-approval'
import { recordClientContact } from '@/lib/off-system'
import { topDown, signersOf, type LadderRung } from '@/app/api/timesheets/chain-turn'
import { whoAskedSentence } from '@/app/api/timesheets/approval-by-email'

/**
 * The door to a client's approval given outside Etyme (lib/week-approval).
 * The rules themselves are tested in approve-by-email.test.ts; these are
 * the decisions the door adds on top of them.
 *
 * Northbend Athletic ← Computer Systems ← Techpeple, Helena Marsh.
 */

const TECHPEPLE_RUNG: LadderRung = { sellContractId: 'techpeple-rung', companyId: 'techpeple', clientCompanyId: 'cs', endClientCompanyId: 'northbend', supplierSellContractId: null }
const CS_RUNG: LadderRung = { sellContractId: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend', endClientCompanyId: null, supplierSellContractId: 'techpeple-rung' }
const LADDER = topDown([TECHPEPLE_RUNG, CS_RUNG])

function chain(over: Partial<WeekChain['week']> = {}, contract: { overtimeAfterHours?: number | null } = {}): WeekChain {
  const days = { '2026-09-21': 8, '2026-09-22': 8, '2026-09-23': 8, '2026-09-24': 8, '2026-09-25': 8 }
  return {
    week: {
      id: 'w', personId: 'helena', personName: 'Helena Marsh', personEmail: 'h@x.example',
      periodStart: new Date('2026-09-20T00:00:00Z'), periodEnd: new Date('2026-09-26T00:00:00Z'),
      totalHours: 40, days, leaveDays: {}, status: 'SUBMITTED', submittedAt: new Date('2026-09-26T00:00:00Z'),
      clientApprovedAt: null, employerAcceptedAt: null, sellContractId: 'techpeple-rung',
      anomalyScore: null, anomalyReason: null, hoursPerWeek: 40, contractEnd: null, decisions: [],
      ...over,
    },
    ladder: LADDER,
    rungs: new Map([
      ['cs-rung', { id: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend', endClientCompanyId: null, sellerName: 'Computer Systems Inc', buyerName: 'Northbend Athletic', billRate: 14500, overtimeAfterHours: contract.overtimeAfterHours ?? null, overtimeMultiplierBps: null }],
      ['techpeple-rung', { id: 'techpeple-rung', companyId: 'techpeple', clientCompanyId: 'cs', endClientCompanyId: 'northbend', sellerName: 'Techpeple', buyerName: 'Computer Systems Inc', billRate: 11800, overtimeAfterHours: null, overtimeMultiplierBps: null }],
    ]),
    signers: signersOf(LADDER),
    clientId: 'northbend',
    clientName: 'Northbend Athletic',
    employerId: 'techpeple',
    names: new Map([['northbend', 'Northbend Athletic'], ['cs', 'Computer Systems Inc'], ['techpeple', 'Techpeple']]),
  }
}

describe('what the client’s approver is told about who sent the link', () => {
  it('the worker who sent it is named, with the firm the client pays, never the firm that employs her', () => {
    expect(senderAsTheClientSees(chain(), { personId: 'helena', name: 'Helena Marsh', companyId: 'techpeple' }))
      .toEqual({ sentFrom: { kind: 'NAMED', name: 'Helena Marsh', firm: 'Computer Systems Inc' }, askFirm: 'Computer Systems Inc' })
  })

  it('a desk at the firm the client pays is named', () => {
    expect(senderAsTheClientSees(chain(), { personId: 'victor', name: 'Victor Hale', companyId: 'cs' }).sentFrom).toEqual({ kind: 'NAMED', name: 'Victor Hale', firm: 'Computer Systems Inc' })
  })

  it('a desk at a sub-vendor is not named, and neither is its firm, so the client never learns who is below its supplier', () => {
    const told = senderAsTheClientSees(chain(), { personId: 'bhavesh', name: 'Bhavesh Nair', companyId: 'techpeple' })
    expect(told).toEqual({ sentFrom: { kind: 'BELOW', askFirm: 'Computer Systems Inc' }, askFirm: 'Computer Systems Inc' })
    expect(JSON.stringify(told)).not.toMatch(/Techpeple|Bhavesh/)
  })

  it('the approval page says who asked in the same sentence the letter does, and from a desk below the supplier it names only the supplier', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/answer/week/[token]/page.tsx'), 'utf8')
    expect(page).not.toMatch(/side of this placement/)
    expect(page).toContain('{view.askedBy}')
    const lib = readFileSync(join(process.cwd(), 'src/lib/week-approval.ts'), 'utf8')
    expect(lib).toContain('askedBy: whoAskedSentence(told.sentFrom, c.week.personName)')
    const told = senderAsTheClientSees(chain(), { personId: 'bhavesh', name: 'Bhavesh Nair', companyId: 'techpeple' })
    const said = whoAskedSentence(told.sentFrom, 'Helena Marsh')
    expect(said).toBe('Helena Marsh’s supplier asked us to send you the week to approve. If anything in it looks wrong, ask Computer Systems Inc.')
    expect(said).not.toMatch(/timesheet desk|Techpeple|Bhavesh/)
  })
})

describe('the approver a link is sent to', () => {
  it('a link needs the approver’s name and email address, said in a sentence', () => {
    expect(checkApprover('', '', 'Northbend Athletic')).toEqual({ ok: false, field: 'approverName', says: 'Name the person at Northbend Athletic who approves this week, and give their email address.' })
    expect(checkApprover('Dana Whitfield', '', 'Northbend Athletic')).toEqual({ ok: false, field: 'approverEmail', says: 'Give Dana Whitfield’s email address, so the link reaches them.' })
    expect(checkApprover('Dana Whitfield', 'dana@', 'Northbend Athletic').ok).toBe(false)
    expect(checkApprover(' Dana Whitfield ', 'Dana@Northbend.example', 'Northbend Athletic')).toEqual({ ok: true, name: 'Dana Whitfield', email: 'dana@northbend.example' })
  })
})

describe('the weeks only a person in Etyme can sign', () => {
  it('an ordinary week inside its hours can be approved by email', () => {
    expect(needsSigningInEtyme(chain())).toBeNull()
  })

  it('a week over the job’s hours is signed in Etyme with a reason, never by email', () => {
    const says = needsSigningInEtyme(chain({ totalHours: 44, days: { '2026-09-21': 12, '2026-09-22': 8, '2026-09-23': 8, '2026-09-24': 8, '2026-09-25': 8 } }))
    expect(says).toMatch(/A week like this is signed in Etyme by somebody at Northbend Athletic, with the reason it is right, so it cannot be approved by email\.$/)
  })

  it('hours over the overtime line on the client’s own contract wait for somebody to price them in Etyme', () => {
    const says = needsSigningInEtyme(chain({ hoursPerWeek: 50 }, { overtimeAfterHours: 36 }))
    expect(says).toBe(
      'Helena Marsh worked past the 36-hour line this week, and what the extra hours are worth is decided when the week is signed. ' +
        'Somebody at Northbend Athletic signs it in Etyme, so it cannot be approved by email.'
    )
  })

  it('a client that employs the worker itself approves in Etyme, because there is nobody outside to ask', () => {
    expect(needsSigningInEtyme({ ...chain(), employerId: 'northbend' })).toBe('Northbend Athletic employs Helena Marsh and is also the client on this week, so it approves the week in Etyme.')
  })
})

describe('the link’s token', () => {
  it('only a hash of the token is kept, so the table cannot be used to sign for a client', () => {
    expect(hashLinkToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashLinkToken('abc')).not.toContain('abc')
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const model = schema.match(/^model WeekApproval \{([\s\S]*?)^\}/m)![1]
    expect(model).toMatch(/tokenHash\s+String\?\s+@unique/)
    expect(model).not.toMatch(/^\s+token\s/m)
  })
})

describe('a client that is not on Etyme', () => {
  const NOW = new Date('2026-10-19T15:00:00Z')
  const listed = {
    claimedAt: null, listedById: 'tapin',
    invites: [
      { byId: 'tapin', email: 'Dana.Whitfield@Larkspur-Freight.example', state: 'PENDING' },
      { byId: 'tapin', email: 'old.contact@larkspur-freight.example', state: 'REVOKED' },
      { byId: 'another-supplier', email: 'someone@larkspur-freight.example', state: 'PENDING' },
    ],
    contacts: [{ companyId: 'tapin', email: 'ap@larkspur-freight.example' }, { companyId: 'tapin', email: null }],
    listerSeatedEmails: ['oliver@etyme.com'],
    listerDomains: ['tapin.example'],
    workerEmail: 'helena.marsh@seed.etyme.invalid',
  }

  it('a supplier whose client is not on Etyme sends the approval link to the person it recorded for that client, and the signature says the client was not on Etyme', () => {
    expect(offPlatformRecord(listed)).toEqual({
      offPlatform: true,
      recordedContacts: ['dana.whitfield@larkspur-freight.example', 'ap@larkspur-freight.example'],
    })
    expect(approvalWords({
      approverName: 'Dana Whitfield', approverEmail: 'dana.whitfield@larkspur-freight.example', clientName: 'Larkspur Freight',
      clientOffPlatform: true, on: NOW, how: 'LINK', now: NOW,
    })).toBe('Approved by email: Dana Whitfield, dana.whitfield@larkspur-freight.example — Larkspur Freight was not on Etyme')
  })

  it('an address the supplier never recorded for an off-platform client is still refused: another firm’s record, a revoked one, the supplier’s own people and the worker do not count', () => {
    const rec = offPlatformRecord({
      ...listed,
      invites: [...listed.invites, { byId: 'tapin', email: 'oliver@etyme.com', state: 'PENDING' }, { byId: 'tapin', email: 'sam@ops.tapin.example', state: 'PENDING' }],
      contacts: [...listed.contacts, { companyId: 'tapin', email: 'Helena.Marsh@seed.etyme.invalid' }],
    })
    expect(rec.recordedContacts).not.toContain('someone@larkspur-freight.example')
    expect(rec.recordedContacts).not.toContain('old.contact@larkspur-freight.example')
    expect(rec.recordedContacts).not.toContain('oliver@etyme.com')
    expect(rec.recordedContacts).not.toContain('sam@ops.tapin.example')
    expect(rec.recordedContacts).not.toContain('helena.marsh@seed.etyme.invalid')
    expect(offPlatformRecord({ ...listed, listedById: null }).recordedContacts).toEqual([])
  })

  it('once the client claims its record, its own domain and seats decide, as before, and nothing the supplier recorded counts', () => {
    expect(offPlatformRecord({ ...listed, claimedAt: new Date('2026-10-20T00:00:00Z') })).toEqual({ offPlatform: false, recordedContacts: [] })
  })

  it('an approval given while the client was off the platform still says so after it claims its record, and one given on the platform reads as before', () => {
    const words = (clientOffPlatform: boolean | null) => approvalWords({
      approverName: 'Dana Whitfield', approverEmail: 'dana.whitfield@larkspur-freight.example', clientName: 'Larkspur Freight',
      clientOffPlatform, on: new Date('2026-10-02T12:00:00Z'), how: 'EVIDENCE', now: NOW,
    })
    expect(words(true)).toMatch(/Larkspur Freight was not on Etyme$/)
    expect(words(false)).toBe('Approved by email: Dana Whitfield, Oct 2 — evidence attached')
    expect(words(null)).toBe('Approved by email: Dana Whitfield, Oct 2 — evidence attached')
  })
})

describe('the person a supplier records at a client that is not on Etyme', () => {
  const shell = { id: 'larkspur', name: 'Larkspur Freight', claimedAt: null, listedById: 'tapin' }
  const record = (over: Partial<Parameters<typeof recordClientContact>[0]> = {}) =>
    recordClientContact({ callerCompanyId: 'tapin', client: shell, email: 'Dana.Whitfield@larkspur-freight.example', contactName: 'Dana Whitfield', ownSeatEmails: ['oliver@etyme.com'], ...over })

  it('a supplier that listed a client with no address can record the person there later, and is told a colleague at the same company address may approve too', () => {
    expect(record()).toEqual({
      ok: true, email: 'dana.whitfield@larkspur-freight.example', contactName: 'Dana Whitfield', remove: false,
      says:
        'Dana Whitfield (dana.whitfield@larkspur-freight.example) is recorded at Larkspur Freight. While Larkspur Freight is not on Etyme, ' +
        'Dana Whitfield, or a colleague at @larkspur-freight.example, can approve a week by email, and the approval says Larkspur Freight was not on Etyme.',
    })
  })

  it('a personal address lets that one person approve and is not offered as a company address', () => {
    const v = record({ email: 'dana.w@gmail.com' })
    expect(v.ok && v.says).not.toMatch(/colleague/)
  })

  it('a supplier cannot record its own staffer as the client’s person', () => {
    expect(record({ email: 'oliver@etyme.com' })).toMatchObject({ ok: false, field: 'email', says: 'oliver@etyme.com is somebody at your own firm. Record the person at Larkspur Freight who approves the hours.' })
  })

  it('an address is recorded only with the person’s name, and only by the firm that listed the client', () => {
    expect(record({ contactName: '' })).toMatchObject({ ok: false, field: 'contactName', says: 'Name the person at Larkspur Freight whose address this is.' })
    expect(record({ callerCompanyId: 'someone-else' })).toMatchObject({ ok: false, status: 404 })
  })

  it('once the client claims its record, the supplier no longer edits who approves for it', () => {
    expect(record({ client: { ...shell, claimedAt: new Date() } })).toMatchObject({
      ok: false, status: 409,
      says: 'Larkspur Freight is on Etyme now, so its own people decide who approves for it. Ask them to seat the person you mean.',
    })
  })

  it('a recorded address can be taken off, and approvals already given stand', () => {
    expect(record({ remove: true, contactName: undefined })).toMatchObject({ ok: true, remove: true, says: 'dana.whitfield@larkspur-freight.example is no longer recorded for Larkspur Freight, so it cannot be named as its approver. Approvals already given stand.' })
  })
})
