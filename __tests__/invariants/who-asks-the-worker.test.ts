import { describe, it, expect } from 'vitest'
import { whoAsksTheWorker, type LineCarryingPerson } from '@/lib/document-stages'

/**
 * Which firm asks a worker for her own paperwork.
 *
 * CLAUDE.md, "Where a document lives — on the line, on the side it
 * protects": a person's license, visa and background check live on the
 * buy line of the firm that pays for their work. So that firm asks.
 */

const day = (n: number) => new Date(Date.UTC(2026, 7, 25 + n))

const HALCYON = { id: 'halcyon', name: 'Halcyon Talent' }
const BYRNE = { id: 'byrne', name: 'Byrne Critical Care LLC' }
const HARLOW = { id: 'harlow', name: 'Harlow Health' }

function sell(id: string, from: { id: string; name: string }, to: { id: string }, start = day(0)): LineCarryingPerson {
  return { side: 'SELL', id, companyId: from.id, companyName: from.name, clientCompanyId: to.id, startDate: start }
}
function buy(id: string, by: { id: string; name: string }, from: { id: string } | null, start = day(0)): LineCarryingPerson {
  return { side: 'BUY', id, companyId: by.id, companyName: by.name, vendorCompanyId: from?.id ?? null, startDate: start }
}

// Colleen Byrne, as the seeded world holds her: her own company sells her
// to Halcyon, Halcyon sells her to Harlow Health, and Halcyon's buy line
// pays her company. Every line started the same day.
const colleen = [
  sell('s-halcyon', HALCYON, HARLOW),
  sell('s-byrne', BYRNE, HALCYON),
  buy('b-halcyon', HALCYON, BYRNE),
]

describe('who asks a worker for her own paperwork', () => {
  it('a nurse paid through her own company is asked for her license by the firm that buys from her company, never by her own company', () => {
    const who = whoAsksTheWorker({ lines: colleen, ownCompanyIds: [BYRNE.id] })
    expect(who?.companyName).toBe('Halcyon Talent')
  })

  it('two lines that started on the same day still name one firm, the same one in whatever order the database returns them', () => {
    const orders = [colleen, [...colleen].reverse(), [colleen[1], colleen[2], colleen[0]], [colleen[2], colleen[0], colleen[1]]]
    for (const lines of orders) {
      expect(whoAsksTheWorker({ lines, ownCompanyIds: [BYRNE.id] })?.companyId).toBe(HALCYON.id)
    }
  })

  it('a W2 employee is asked by the employer whose payroll line pays them, not by the client that buys them from it', () => {
    const who = whoAsksTheWorker({
      lines: [sell('s1', HALCYON, HARLOW), buy('b-client', HARLOW, HALCYON), buy('b-payroll', HALCYON, null)],
      ownCompanyIds: [],
    })
    expect(who?.companyName).toBe('Halcyon Talent')
  })

  it('in a chain the firm nearest the worker asks, because its buy line is the one that pays for the person', () => {
    const SUB = { id: 'sub', name: 'Northgate Staffing' }
    const who = whoAsksTheWorker({
      lines: [buy('b-prime', HALCYON, SUB), buy('b-sub', SUB, null), sell('s-sub', SUB, HALCYON), sell('s-prime', HALCYON, HARLOW)],
      ownCompanyIds: [],
    })
    expect(who?.companyName).toBe('Northgate Staffing')
  })

  it('where nobody holds a buy line for the person, the firm that sells them at the bottom of the chain asks', () => {
    const who = whoAsksTheWorker({ lines: [sell('s-halcyon', HALCYON, HARLOW), sell('s-byrne', BYRNE, HALCYON)], ownCompanyIds: [BYRNE.id] })
    expect(who?.companyName).toBe('Halcyon Talent')
  })

  it('a person nobody places is asked by the firm whose bench they sit on', () => {
    const who = whoAsksTheWorker({ lines: [], ownCompanyIds: [], bench: { companyId: HALCYON.id, companyName: HALCYON.name } })
    expect(who?.companyName).toBe('Halcyon Talent')
    expect(who?.because).toMatch(/bench/)
  })

  it('a person whose only firm is her own is asked by nobody, rather than by herself', () => {
    const who = whoAsksTheWorker({
      lines: [sell('s-byrne', BYRNE, HALCYON)],
      ownCompanyIds: [BYRNE.id],
      bench: { companyId: BYRNE.id, companyName: BYRNE.name },
    })
    expect(who).toBeNull()
  })

  it('every answer says in a sentence why that firm is the one asking', () => {
    const who = whoAsksTheWorker({ lines: colleen, ownCompanyIds: [BYRNE.id] })
    expect(who?.because).toBe('Halcyon Talent pays for this person\'s work, and their paperwork lives on the line it pays from.')
  })
})
