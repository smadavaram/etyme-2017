import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readAsk, whereAnswer, menuOf, pictureSays, type Answer, type Picture } from '@/app/api/conversations/twin/ask'
import { pageFraming } from '@/lib/page-framing'

/**
 * The words that moved — the founder, 2026-11-03: "People = candidates.
 * And Candidates = submissions", and "Contracts, not Contractors". Ask
 * Etyme and every page heading say the links the menu now carries.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const CLIENT = { companyKind: 'CLIENT' as const, party: 'CLIENT' as const, permissions: ['*'] }
const SUPPLIER = { companyKind: 'VENDOR' as const, party: 'FIRM' as const, permissions: ['*'] }

function where(question: string, seat: typeof CLIENT | typeof SUPPLIER): Extract<Answer, { kind: 'TEXT' }> {
  const i = readAsk(question)
  if (i.kind !== 'WHERE' && i.kind !== 'GO') throw new Error(`${question} was read as ${i.kind}`)
  const a = whereAnswer(i, menuOf(seat))
  if (a.kind !== 'TEXT') throw new Error('not text')
  return a
}
const hrefs = (a: Extract<Answer, { kind: 'TEXT' }>) => (a.links ?? []).map((l) => l.href)

describe('where a page is, in the words of the new menu', () => {
  it('a client asks “Where are my contractors?” and is sent to HR, Contracts, with the link', () => {
    const a = where('Where are my contractors?', CLIENT)
    expect(a.says).toBe('Your contractors are under HR, Contracts.')
    expect(hrefs(a)).toEqual(['/dashboard/contracts'])
  })

  it('a supplier asks “Where are my contractors?” and is sent to its sell and buy contracts', () => {
    const a = where('Where are my contractors?', SUPPLIER)
    expect(a.says).toBe('Your contractors are under HR, Contracts, and on its Buy contracts tab.')
    expect(hrefs(a)).toEqual(['/dashboard/contracts?side=sell', '/dashboard/contracts?side=buy'])
  })

  it('a client asks “Where are my candidates?” and is sent to the people it met through its suppliers', () => {
    const a = where('Where are my candidates?', CLIENT)
    expect(a.says).toBe('Your candidates are under Network, Candidates.')
    expect(hrefs(a)).toEqual(['/dashboard/people'])
  })

  it('a supplier asks “Where are my candidates?” and is sent to its candidates and its bench', () => {
    const a = where('Where are my candidates?', SUPPLIER)
    expect(a.says).toBe('Your candidates are under Network, Candidates, and on its Bench tab.')
    expect(hrefs(a)).toEqual(['/dashboard/consultants', '/dashboard/bench'])
  })

  for (const [who, seat] of [['client', CLIENT], ['supplier', SUPPLIER]] as const) {
    it(`a ${who} asks “Where are submissions?” and is sent to Submissions`, () => {
      const a = where('Where are submissions?', seat)
      expect(a.says).toBe('Your submissions are under Submissions.')
      expect(hrefs(a)[0]).toBe('/dashboard/submissions')
    })

    it(`a ${who} asks “Where can I see who applied?” and is sent to Submissions`, () => {
      expect(hrefs(where('Where can I see who applied?', seat))[0]).toBe('/dashboard/submissions')
    })
  }

  it('“Who applied?” answers with the list and a link that says Submissions, the page it opens', () => {
    const ask = read('src/app/api/conversations/twin/ask.ts')
    expect(ask).toContain("links: [{ label: 'Open Submissions', href: '/dashboard/submissions' }]")
    expect(ask).not.toContain("'Open Candidates', href: '/dashboard/submissions'")
  })

  it('no answer about where a page is names People or Contractors as a link', () => {
    for (const q of ['Where are my people?', 'Where are my consultants?', 'Where are my contractors?', 'Where are my candidates?']) {
      for (const seat of [CLIENT, SUPPLIER]) expect(where(q, seat).says, q).not.toMatch(/under (People|Contractors)\b/)
    }
  })
})

describe('the greeting and the page headings say the new links', () => {
  it('“Seven contractors are on site today” opens Contracts, where the people working here are', () => {
    const line = pictureSays({ onSite: 7, suppliers: 4 } as Picture)
    expect(line?.links).toEqual([{ text: 'Seven contractors', href: '/dashboard/contracts' }])
  })

  it('a client’s people page is headed Candidates, and its contracts list Contracts', () => {
    expect(pageFraming('CLIENT', 'consultants').title).toBe('Candidates')
    expect(pageFraming('CLIENT', 'contracts.sell').title).toBe('Contracts')
  })

  it('a supplier’s people pages are headed Candidates and its put-forward pages Submissions', () => {
    expect(pageFraming('VENDOR', 'consultants').title).toBe('Candidates')
    expect(pageFraming('VENDOR', 'submissions').title).toBe('Submissions')
    expect(pageFraming('CLIENT', 'submissions').title).toBe('Submissions')
  })

  it('an MSP seated at a client reads the client’s candidates, by name', () => {
    expect(pageFraming('MSP', 'consultants', { seated: true, clientName: 'Cavanaugh Glassworks' }).whose)
      .toMatch(/Cavanaugh Glassworks.? candidates/)
  })
})

describe('where a page is, in the words of the Dashboard column (founder, 2026-11-08)', () => {
  it('a supplier asks where its bills are and is told Accounting, Receivables', () => {
    expect(where('Where are my bills?', SUPPLIER).says).toMatch(/^What you billed is under Accounting, Receivables\b/)
  })

  it('a supplier asks where its expenses are and is told HR, Expenses', () => {
    expect(where('Where are my expenses?', SUPPLIER).says).toBe('Your expenses are under HR, Expenses.')
  })

  it('a supplier asks where its reports are and is told Accounting, Reports', () => {
    expect(where('Where are my reports?', SUPPLIER).says).toBe('Reports are under Accounting, Reports.')
  })

  it('a supplier asks where profitability is and is told it is under Accounting, Reports, now that Reports is cash flow and profitability', () => {
    expect(where('Where is profitability?', SUPPLIER).says).toBe('Profitability is under Accounting, Reports, on the Profitability tab.')
  })

  it('anybody asking where Ask Etyme is is told it is the switch at the top of the left column, not a menu link', () => {
    for (const seat of [CLIENT, SUPPLIER]) {
      const a = where('Where is Ask Etyme?', seat)
      expect(a.says).toBe('Ask Etyme is the switch at the top of the left column, beside Dashboard. Press it to come back here.')
      expect(a.links ?? []).toEqual([])
    }
  })
})

describe('Settings reads People, Company and Records, and Ask Etyme says the same words', () => {
  it('a supplier asks “Where is the activity log?” and is sent to Activity log under Settings, Records', () => {
    const a = where('Where is the activity log?', SUPPLIER)
    expect(a.says).toBe('The activity log is under Settings, Records, on the Activity log tab.')
    expect(hrefs(a)).toEqual(['/dashboard/automation'])
  })

  it('“Where is the audit log?” and “Where is automation?” are the activity log too', () => {
    expect(hrefs(where('Where is the audit log?', SUPPLIER))).toEqual(['/dashboard/automation'])
    expect(hrefs(where('Where is automation?', SUPPLIER))).toEqual(['/dashboard/automation'])
  })

  it('a client, whose menu has no activity log, is told so and is never sent to one', () => {
    const a = where('Where is the activity log?', CLIENT)
    expect(a.says).toMatch(/^None of your pages shows the activity log\./)
    expect(a.links ?? []).toEqual([])
  })

  it('“Where do I import records?” says Import records, never Import alone', () => {
    const a = where('Where do I import records?', SUPPLIER)
    expect(a.says).toBe('Import records is under Settings, Company, on the Import records tab.')
    expect(hrefs(a)).toEqual(['/dashboard/data'])
  })

  it('“Where can I read teams from our directory?” is sent to Team structure, not the records import', () => {
    const a = where('Where can I read teams from our directory?', SUPPLIER)
    expect(a.says).toMatch(/^Team structure is under Settings, (People|Company|Records), on the Team structure tab\.$/)
    expect(hrefs(a)).toEqual(['/dashboard/settings/team-structure'])
  })

  it('“Where is my team?” still opens Users & permissions', () => {
    expect(hrefs(where('Where is my team?', SUPPLIER))).toEqual(['/dashboard/access'])
  })
})
