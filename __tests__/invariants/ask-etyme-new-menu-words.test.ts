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
  it('a client asks “Where are my contractors?” and is sent to Contracts, with the link', () => {
    const a = where('Where are my contractors?', CLIENT)
    expect(a.says).toBe('Your contractors are under Contracts.')
    expect(hrefs(a)).toEqual(['/dashboard/contracts'])
  })

  it('a supplier asks “Where are my contractors?” and is sent to its sell and buy contracts', () => {
    const a = where('Where are my contractors?', SUPPLIER)
    expect(a.says).toBe('Your contractors are under Contracts, on the Sell contracts and Buy contracts tabs.')
    expect(hrefs(a)).toEqual(['/dashboard/contracts?side=sell', '/dashboard/contracts?side=buy'])
  })

  it('a client asks “Where are my candidates?” and is sent to the people it met through its suppliers', () => {
    const a = where('Where are my candidates?', CLIENT)
    expect(a.says).toBe('Your candidates are under Candidates.')
    expect(hrefs(a)).toEqual(['/dashboard/people'])
  })

  it('a supplier asks “Where are my candidates?” and is sent to its candidates and its bench', () => {
    const a = where('Where are my candidates?', SUPPLIER)
    expect(a.says).toBe('Your candidates are under Candidates, on the Candidates and Bench tabs.')
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
