import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { senderAsTheClientSees, checkApprover, needsSigningInEtyme, hashLinkToken, type WeekChain } from '@/lib/week-approval'
import { topDown, signersOf, type LadderRung } from '@/app/api/timesheets/chain-turn'

/**
 * The door to a client's approval given outside Etyme (lib/week-approval).
 * The rules themselves are tested in approve-by-email.test.ts; these are
 * the decisions the door adds on top of them.
 *
 * Northbend Athletic ← Computer Systems ← CloudEPA, Helena Marsh.
 */

const CLOUDEPA_RUNG: LadderRung = { sellContractId: 'cloudepa-rung', companyId: 'cloudepa', clientCompanyId: 'cs', endClientCompanyId: 'northbend', supplierSellContractId: null }
const CS_RUNG: LadderRung = { sellContractId: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend', endClientCompanyId: null, supplierSellContractId: 'cloudepa-rung' }
const LADDER = topDown([CLOUDEPA_RUNG, CS_RUNG])

function chain(over: Partial<WeekChain['week']> = {}, contract: { overtimeAfterHours?: number | null } = {}): WeekChain {
  const days = { '2026-09-21': 8, '2026-09-22': 8, '2026-09-23': 8, '2026-09-24': 8, '2026-09-25': 8 }
  return {
    week: {
      id: 'w', personId: 'helena', personName: 'Helena Marsh', personEmail: 'h@x.example',
      periodStart: new Date('2026-09-20T00:00:00Z'), periodEnd: new Date('2026-09-26T00:00:00Z'),
      totalHours: 40, days, leaveDays: {}, status: 'SUBMITTED', submittedAt: new Date('2026-09-26T00:00:00Z'),
      clientApprovedAt: null, employerAcceptedAt: null, sellContractId: 'cloudepa-rung',
      anomalyScore: null, anomalyReason: null, hoursPerWeek: 40, contractEnd: null, decisions: [],
      ...over,
    },
    ladder: LADDER,
    rungs: new Map([
      ['cs-rung', { id: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend', endClientCompanyId: null, sellerName: 'Computer Systems Inc', buyerName: 'Northbend Athletic', billRate: 14500, overtimeAfterHours: contract.overtimeAfterHours ?? null, overtimeMultiplierBps: null }],
      ['cloudepa-rung', { id: 'cloudepa-rung', companyId: 'cloudepa', clientCompanyId: 'cs', endClientCompanyId: 'northbend', sellerName: 'CloudEPA', buyerName: 'Computer Systems Inc', billRate: 11800, overtimeAfterHours: null, overtimeMultiplierBps: null }],
    ]),
    signers: signersOf(LADDER),
    clientId: 'northbend',
    clientName: 'Northbend Athletic',
    employerId: 'cloudepa',
    names: new Map([['northbend', 'Northbend Athletic'], ['cs', 'Computer Systems Inc'], ['cloudepa', 'CloudEPA']]),
  }
}

describe('what the client’s approver is told about who sent the link', () => {
  it('the worker who sent it is named, with the firm the client pays, never the firm that employs her', () => {
    expect(senderAsTheClientSees(chain(), { personId: 'helena', name: 'Helena Marsh', companyId: 'cloudepa' }))
      .toEqual({ senderName: 'Helena Marsh', senderFirm: 'Computer Systems Inc', askFirm: 'Computer Systems Inc' })
  })

  it('a desk at the firm the client pays is named', () => {
    expect(senderAsTheClientSees(chain(), { personId: 'victor', name: 'Victor Hale', companyId: 'cs' }).senderName).toBe('Victor Hale')
  })

  it('a desk at a sub-vendor is not named, and neither is its firm, so the client never learns who is below its supplier', () => {
    const told = senderAsTheClientSees(chain(), { personId: 'bhavesh', name: 'Bhavesh Nair', companyId: 'cloudepa' })
    expect(told).toEqual({ senderName: 'The timesheet desk', senderFirm: 'Computer Systems Inc’s side of this placement', askFirm: 'Computer Systems Inc' })
    expect(JSON.stringify(told)).not.toMatch(/CloudEPA|Bhavesh/)
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
