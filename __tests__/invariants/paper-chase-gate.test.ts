import { describe, it, expect } from 'vitest'
import { gateChases, partyOfShape, withheldDetail, workerPartyAt } from '@/lib/document-stages/chase-gate'
import { asFindings, type DocumentWatch } from '@/lib/document-request'
import { contractClearance } from '@/lib/contract-clearance'
import { paperChaseGate } from '@/lib/setup-gate-rules'

/**
 * "No I-9 chased for a party whose set was never confirmed" (the founder,
 * 2026-10-22). The rule is `mayChasePaper` in lib/setup-gates; this is
 * the nightly chase asking it, and the start gate not asking it.
 */

const on = new Date('2026-10-28T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

/** A database that knows only which company confirmed which party. */
function setsConfirmed(...pairs: string[]) {
  const confirmed = new Set(pairs)
  return {
    documentRequirement: {
      count: async ({ where }: { where: { companyId: string; party: string } }) =>
        confirmed.has(`${where.companyId}:${where.party}`) ? 3 : 0,
    },
  } as never
}

interface Chase { id: string; companyId: string | null; party: any; document: string }
const chase = (id: string, companyId: string | null, party: any, document: string): Chase => ({ id, companyId, party, document })
const forOf = (c: Chase) => ({ companyId: c.companyId, party: c.party })
const docOf = (c: Chase) => c.document

const emptyWatch = (withheld: DocumentWatch['withheld']): DocumentWatch => ({
  on, windowDays: 60, lapsing: [], lapsed: [], byParty: [], withheld,
})

describe('the nightly chase asks for papers only where the company said what it requires', () => {
  it('no paper is chased for a party whose set was never confirmed, and the night says so', async () => {
    const tonight = [
      chase('1', 'brightmoor', 'SUB_VENDORS', 'Certificate of insurance'),
      chase('2', 'brightmoor', 'SUB_VENDORS', 'Certificate of good standing'),
      chase('3', 'brightmoor', 'SUB_VENDORS', 'Certificate of insurance'),
    ]
    const { chase: sent, withheld } = await gateChases(tonight, forOf, docOf, setsConfirmed())
    expect(sent).toEqual([])
    expect(withheld).toHaveLength(1)
    expect(withheld[0].companyId).toBe('brightmoor')
    expect(withheld[0].party).toBe('SUB_VENDORS')
    expect(withheld[0].says).toBe(
      'Etyme does not chase the suppliers you buy from for papers until you confirm what you require of them, under Setup → Papers you require.'
    )
    // Each paper named once, however many lines it ran out on.
    expect(withheld[0].documents).toEqual(['Certificate of insurance', 'Certificate of good standing'])

    // The night's findings carry it, in the sentence, to the company.
    const findings = asFindings(emptyWatch(withheld))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: 'PAPER_CHASE_WITHHELD',
      companyId: 'brightmoor',
      headline: withheld[0].says,
      action: 'NOTIFY_ONLY',
      urgency: 'WORTH_KNOWING',
    })
    expect(findings[0].detail).toBe(
      'Not asked for tonight: Certificate of insurance, Certificate of good standing. A paper that has run out still stops a start; only the letter waits.'
    )
    expect(findings[0].detail).not.toMatch(/[A-Z]{2,}_[A-Z]/)
  })

  it('a confirmed set chases exactly what it lists', async () => {
    const tonight = [
      chase('1', 'techpeple', 'WORKERS_W2', 'I-9'),
      chase('2', 'techpeple', 'CORP_TO_CORP', 'W-9'),
      chase('3', 'techpeple', 'SUB_VENDORS', 'Certificate of insurance'),
      // A chase nobody can place on a set passes as it did before.
      chase('4', null, null, 'NDA'),
    ]
    const { chase: sent, withheld } = await gateChases(
      tonight, forOf, docOf, setsConfirmed('techpeple:WORKERS_W2', 'techpeple:SUB_VENDORS')
    )
    expect(sent.map((c) => c.id)).toEqual(['1', '3', '4'])
    expect(withheld.map((w) => [w.party, w.documents])).toEqual([['CORP_TO_CORP', ['W-9']]])

    // Every party confirmed: everything goes, nothing is held back, and
    // the night has nothing to say about it.
    const all = await gateChases(
      tonight, forOf, docOf,
      setsConfirmed('techpeple:WORKERS_W2', 'techpeple:SUB_VENDORS', 'techpeple:CORP_TO_CORP')
    )
    expect(all.chase).toEqual(tonight)
    expect(all.withheld).toEqual([])
    expect(asFindings(emptyWatch(all.withheld))).toEqual([])
  })

  it('a line is chased under the party whose set it reads as its floor', () => {
    expect(partyOfShape('W2')).toBe('WORKERS_W2')
    expect(partyOfShape('CORP_TO_CORP')).toBe('CORP_TO_CORP')
    expect(partyOfShape('SUB_VENDOR')).toBe('SUB_VENDORS')
    expect(partyOfShape('CUSTOMER')).toBe('CUSTOMERS')
  })

  it('a long list of papers held back is shortened, never cut silently', () => {
    expect(
      withheldDetail({ companyId: 'c', party: 'WORKERS_W2', says: '', documents: ['A', 'B', 'C', 'D', 'E'] })
    ).toBe('Not asked for tonight: A, B, C and 2 more. A paper that has run out still stops a start; only the letter waits.')
  })

  it('a lapsed work authorization still blocks a start whether or not the set is confirmed', () => {
    // The set was never confirmed: the letter waits.
    expect(paperChaseGate('WORKERS_W2', []).ok).toBe(false)
    // The start does not read the gate at all, and the law's block stands.
    const v = contractClearance({
      personName: 'Priya Raman',
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', expiresAt: inDays(-5) },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
      supplierName: 'Techpeple',
      supplierCertificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: inDays(200), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(200), verifiedAt: on },
      ] as never,
      clientName: 'Harlow Health',
      on,
      extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
    // And it is the same verdict a confirmed set would get: nothing in it
    // depends on setup.
    expect(paperChaseGate('WORKERS_W2', ['WORKERS_W2']).ok).toBe(true)
  })
})

describe('a worker is chased as the worker the line about to start says she is', () => {
  /** A database holding buy lines by state, answering findFirst the way Prisma would for one state list. */
  function linesAt(lines: Array<{ state: string; startDate: Date; contractType: string; vendorCompanyId: string | null; vendorKind: string | null }>) {
    return {
      buyContract: {
        findFirst: async ({ where, orderBy }: { where: { state: { in: string[] } }; orderBy: { startDate: 'asc' | 'desc' } }) => {
          const hit = lines
            .filter((l) => where.state.in.includes(l.state))
            .sort((a, b) => (orderBy.startDate === 'asc' ? 1 : -1) * (a.startDate.getTime() - b.startDate.getTime()))[0]
          return hit ? { contractType: hit.contractType, vendorCompanyId: hit.vendorCompanyId, vendorCompany: hit.vendorKind ? { kind: hit.vendorKind } : null } : null
        },
      },
    } as never
  }

  it('a corp-to-corp worker who has not started is chased against the corp-to-corp set', async () => {
    const db = linesAt([{ state: 'VERIFIED', startDate: inDays(7), contractType: 'C2C', vendorCompanyId: null, vendorKind: null }])
    expect(await workerPartyAt('p', 'c', db)).toBe('CORP_TO_CORP')
    const viaHerOwnFirm = linesAt([{ state: 'DRAFT', startDate: inDays(3), contractType: 'C2C', vendorCompanyId: 'llc', vendorKind: 'CONSULTANT_CORP' }])
    expect(await workerPartyAt('p', 'c', viaHerOwnFirm)).toBe('CORP_TO_CORP')
  })

  it('a running line decides over one about to start, and with neither the worker is taken as the firm’s own', async () => {
    const db = linesAt([
      { state: 'IN_PROGRESS', startDate: inDays(-90), contractType: 'W2', vendorCompanyId: null, vendorKind: null },
      { state: 'VERIFIED', startDate: inDays(10), contractType: 'C2C', vendorCompanyId: null, vendorKind: null },
    ])
    expect(await workerPartyAt('p', 'c', db)).toBe('WORKERS_W2')
    expect(await workerPartyAt('p', 'c', linesAt([{ state: 'ENDED', startDate: inDays(-400), contractType: 'C2C', vendorCompanyId: null, vendorKind: null }]))).toBe('WORKERS_W2')
  })
})
