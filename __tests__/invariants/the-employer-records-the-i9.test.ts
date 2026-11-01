import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  employerOnChain,
  employedElsewhere,
  linesForWorker,
  sellersBelow,
  type ChainLine,
  type EmploymentFact,
} from '@/lib/document-stages/employer'
import { mayRecordCheck } from '@/lib/attestation'
import { whoPutsItOnFile } from '@/app/dashboard/compliance/says'

/**
 * The second Tapin walk, 2026-10-30. Ravi is Tapin's own W2, sold to
 * Brightmoor Staffing and on to Northbend Athletic. Tapin's compliance
 * page listed only the starts where Tapin was the buyer, his I-9 sent
 * from his own page landed on the Northbend–Brightmoor line, and
 * Brightmoor was told. The employer completes the I-9 with the person;
 * nobody above it does.
 */

const DB = vi.hoisted(() => ({
  lines: [] as { id: string; companyId: string; clientCompanyId: string | null; personId: string }[],
  seats: [] as { personId: string; companyId: string }[],
  payroll: [] as { personId: string; companyId: string }[],
  companies: new Map<string, string>(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    sellContract: {
      findMany: vi.fn(async ({ where }: any) => DB.lines.filter((l) => l.personId === where.personId)),
    },
    context: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where.personId?.in ?? [where.personId]
        return DB.seats.filter((s) => ids.includes(s.personId))
      }),
    },
    buyContractCandidate: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where.personId?.in ?? [where.personId]
        return DB.payroll.filter((p) => ids.includes(p.personId)).map((p) => ({ personId: p.personId, buyContract: { companyId: p.companyId } }))
      }),
    },
    company: {
      findUnique: vi.fn(async ({ where }: any) => (DB.companies.has(where.id) ? { name: DB.companies.get(where.id) } : null)),
    },
  },
}))

import { employerOfRecord, employedPairs } from '@/app/api/compliance/verifications/record'

// Northbend ← Brightmoor ← Tapin, for Ravi.
const TOP: ChainLine = { id: 'line-a', companyId: 'brightmoor', clientCompanyId: 'northbend' }
const SUB: ChainLine = { id: 'line-b', companyId: 'tapin', clientCompanyId: 'brightmoor' }
const RAVI: ChainLine[] = [TOP, SUB]
const TAPIN_EMPLOYS: EmploymentFact[] = [{ companyId: 'tapin', how: 'EMPLOYEE' }]

const may = (over: Partial<Parameters<typeof mayRecordCheck>[0]>) =>
  mayRecordCheck({
    about: 'PERSON', side: 'EMPLOYER', type: 'I9_EVERIFY',
    holds: (p) => p === 'consultants.write',
    callerFirm: 'Brightmoor Staffing', subjectName: 'Ravi Kumar',
    employerName: 'Brightmoor Staffing', buyerName: 'Northbend Athletic',
    ...over,
  })

describe('which firm on a chain employs the person', () => {
  it('the firm that employs the person is found below the prime that sells their time', () => {
    expect(sellersBelow('line-a', RAVI)).toEqual(['brightmoor', 'tapin'])
    expect(employerOnChain({ fromLineId: 'line-a', lines: RAVI, facts: TAPIN_EMPLOYS })).toEqual({ companyId: 'tapin', how: 'EMPLOYEE' })
    expect(employerOnChain({ fromLineId: 'line-b', lines: RAVI, facts: TAPIN_EMPLOYS })).toEqual({ companyId: 'tapin', how: 'EMPLOYEE' })
  })

  it('a firm that pays the person on its own payroll line is the employer where nobody holds an employee seat', () => {
    expect(employerOnChain({ fromLineId: 'line-a', lines: RAVI, facts: [{ companyId: 'tapin', how: 'PAYROLL' }] }))
      .toEqual({ companyId: 'tapin', how: 'PAYROLL' })
  })

  it('the lowest employer on the chain wins, so a sub-vendor’s own W2 is the sub-vendor’s', () => {
    const both: EmploymentFact[] = [{ companyId: 'brightmoor', how: 'EMPLOYEE' }, { companyId: 'tapin', how: 'EMPLOYEE' }]
    expect(employerOnChain({ fromLineId: 'line-a', lines: RAVI, facts: both })?.companyId).toBe('tapin')
  })

  it('with nothing on the record, the firm at the foot of the chain is the best reading and refuses nobody', () => {
    const e = employerOnChain({ fromLineId: 'line-a', lines: RAVI, facts: [] })
    expect(e).toEqual({ companyId: 'tapin', how: 'BOTTOM' })
    expect(employedElsewhere(e, 'brightmoor')).toBe(false)
  })

  it('a chain nobody can read is not walked by guessing', () => {
    const two: ChainLine[] = [TOP, SUB, { id: 'line-c', companyId: 'other', clientCompanyId: 'brightmoor' }]
    expect(sellersBelow('line-a', two)).toEqual(['brightmoor'])
  })

  it('a firm on a line that is not the person’s reads no employer at all', () => {
    expect(employerOnChain({ fromLineId: 'nobody', lines: RAVI, facts: TAPIN_EMPLOYS })).toBeNull()
  })
})

describe('only the employer completes the I-9', () => {
  it('a prime that buys a sub-vendor’s W2 is refused that W2’s I-9, in a sentence naming the employer', () => {
    const v = may({ employedBy: 'Tapin' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_YOURS_TO_RECORD')
      expect(v.message).toContain('Tapin employs Ravi Kumar')
      expect(v.message).toContain('Brightmoor Staffing reads it on the placement')
    }
  })

  it('the employer records its own W2’s I-9', () => {
    expect(may({ callerFirm: 'Tapin', employerName: 'Tapin', employedBy: null }).ok).toBe(true)
  })

  it('a prime may still record what is not the employer’s alone, such as a license', () => {
    expect(may({ type: 'PROFESSIONAL_LICENSE', employedBy: 'Tapin' }).ok).toBe(true)
  })

  it('a right to work check is the employer’s alone, the same as the I-9', () => {
    expect(may({ type: 'RIGHT_TO_WORK', employedBy: 'Tapin' }).ok).toBe(false)
  })
})

describe('a worker’s paper goes to her employer', () => {
  const candidates = [
    { side: 'SELL' as const, lineId: 'line-a', companyId: 'brightmoor', companyName: 'Brightmoor Staffing' },
    { side: 'SELL' as const, lineId: 'line-b', companyId: 'tapin', companyName: 'Tapin' },
  ]

  it('a worker’s I-9 sent from her own page goes to her employer, never to the prime', () => {
    const tried = linesForWorker({ candidates, sellLines: RAVI, facts: TAPIN_EMPLOYS, key: 'I9_EVERIFY' })
    expect(tried.map((c) => c.companyId)).toEqual(['tapin'])
  })

  it('a worker’s other papers try her employer’s line first, then the rest', () => {
    const tried = linesForWorker({ candidates, sellLines: RAVI, facts: TAPIN_EMPLOYS, key: 'NDA' })
    expect(tried.map((c) => c.companyId)).toEqual(['tapin', 'brightmoor'])
  })

  it('with no employer on the record, the foot of the chain is tried first and nobody is left out', () => {
    const tried = linesForWorker({ candidates, sellLines: RAVI, facts: [], key: 'I9_EVERIFY' })
    expect(tried.map((c) => c.companyId)).toEqual(['tapin', 'brightmoor'])
  })

  it('a seat left open at a past employer does not decide who she answers to', () => {
    const tried = linesForWorker({ candidates, sellLines: RAVI, facts: [{ companyId: 'old-firm', how: 'EMPLOYEE' }], key: 'I9_EVERIFY' })
    expect(tried.map((c) => c.companyId)).toEqual(['tapin', 'brightmoor'])
  })
})

describe('the record says who employs, read from the database', () => {
  beforeEach(() => {
    DB.lines = [
      { ...TOP, personId: 'ravi' },
      { ...SUB, personId: 'ravi' },
    ]
    DB.seats = [{ personId: 'ravi', companyId: 'tapin' }]
    DB.payroll = []
    DB.companies = new Map([['tapin', 'Tapin'], ['brightmoor', 'Brightmoor Staffing']])
  })

  it('Ravi’s employer, read from the Northbend–Brightmoor line, is Tapin, by its employee seat', async () => {
    expect(await employerOfRecord('ravi', 'line-a')).toEqual({ companyId: 'tapin', how: 'EMPLOYEE', name: 'Tapin' })
  })

  it('a firm’s employee seats and its own payroll lines both say it employs the person', async () => {
    DB.payroll = [{ personId: 'lena', companyId: 'brightmoor' }]
    const pairs = await employedPairs(['ravi', 'lena'])
    expect(pairs.has('tapin:ravi')).toBe(true)
    expect(pairs.has('brightmoor:lena')).toBe(true)
    expect(pairs.has('brightmoor:ravi')).toBe(false)
  })
})

describe('what the screens say about whose papers they are', () => {
  it('a client’s page names the prime it pays and never says the prime employs a sub-vendor’s W2', () => {
    const said = whoPutsItOnFile({ supplier: 'Brightmoor Staffing', personName: 'Ravi Kumar', employs: 'BELOW', own: false })
    expect(said).not.toContain('Brightmoor Staffing employs')
    expect(said).not.toContain('Tapin')
    expect(said).toContain('the firm that employs Ravi Kumar')
    expect(said).toContain('Ask Brightmoor Staffing')
  })

  it('where the supplier employs the person, the page says so', () => {
    expect(whoPutsItOnFile({ supplier: 'Tapin', personName: 'Ravi Kumar', employs: 'THIS_FIRM', own: false }))
      .toBe('Tapin employs Ravi Kumar and puts these on file. Ask them — you do not collect the documents yourself.')
  })

  it('where the record cannot say who employs, the supplier is said to place the person, not employ them', () => {
    expect(whoPutsItOnFile({ supplier: 'Tapin', personName: 'Ravi Kumar', employs: 'UNKNOWN', own: false })).not.toContain('employs')
  })

  it('the employer reading its own page is told the I-9 is its own to complete', () => {
    expect(whoPutsItOnFile({ supplier: 'Tapin', personName: 'Ravi Kumar', employs: 'THIS_FIRM', own: true }))
      .toContain('You employ Ravi Kumar, so these are yours to put on file: complete the I-9 with Ravi Kumar')
  })
})

describe('every door asks who employs the person', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('the employer’s compliance page lists the starts of the people it employs, with Record the I-9 on the row', () => {
    const route = read('src/app/api/compliance/route.ts')
    const page = read('src/app/dashboard/compliance/page.tsx')
    expect(route).toContain('employedPairs')
    expect(route).toContain('ownStarts')
    expect(page).toContain('setRecordingStart')
    expect(page).toContain('Record the I-9')
  })

  it('recording a check and reviewing a paper both ask who employs the person, and one writer still writes the record', () => {
    const route = read('src/app/api/compliance/verifications/route.ts')
    const review = read('src/app/api/packets/examination.ts')
    expect(route).toContain('employerOfRecord')
    expect(review).toContain('employerOfRecord')
    expect(route.match(/writeCheck\(/g)?.length).toBe(1)
  })

  it('a prime’s start papers ask leaves a sub-vendor’s W2 to the firm that employs him', () => {
    expect(read('src/app/api/compliance/clearance/ask.ts')).toContain('employedElsewhere(employer, contract.companyId)')
  })

  it('a worker’s own page sends a paper to her employer’s line first', () => {
    expect(read('src/app/api/me/papers/route.ts')).toContain('linesForWorker')
  })
})
