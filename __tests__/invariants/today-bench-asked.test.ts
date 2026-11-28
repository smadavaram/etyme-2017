import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askedNotAnsweredSays } from '@/lib/today-page'

/**
 * Fix list, layer 5, F3.3: Today's bench said "Nobody on the bench yet."
 * while somebody had been asked and had not answered, as if nobody had
 * been asked at all. Now the card says how many are waiting, beside the
 * bench and never on it, and opens Bench where the seat may open it.
 */

const page = readFileSync(join(__dirname, '../../src/app/dashboard/page.tsx'), 'utf8')
const route = readFileSync(join(__dirname, '../../src/app/api/today/route.ts'), 'utf8')
const reads = readFileSync(join(__dirname, '../../src/app/api/today/reads.ts'), 'utf8')

describe('Today says who was asked onto the bench and has not answered', () => {
  it('one person asked and not answered reads "1 asked, not answered yet"', () => {
    expect(askedNotAnsweredSays(1)).toBe('1 asked, not answered yet')
  })

  it('three people asked read "3 asked, not answered yet"', () => {
    expect(askedNotAnsweredSays(3)).toBe('3 asked, not answered yet')
  })

  it('a firm that asked nobody, or a seat that does not read the bench, reads no line at all', () => {
    expect(askedNotAnsweredSays(0)).toBeNull()
    expect(askedNotAnsweredSays(null)).toBeNull()
  })

  it('the asked count is read only for the seat that reads the bench, and is null for any other seat, never a zero', () => {
    expect(route).toContain('reads.bench ? askedAt(company.id) : Promise.resolve(null)')
    expect(route).toContain('benchAsked: null')
  })

  it('the asked count is the one Candidates gives: invited listings at this firm, not taken back', () => {
    expect(reads).toContain("prisma.benchListing.count({ where: { companyId, revokedAt: null, state: 'INVITED' } })")
  })

  it('both places Today draws the bench say the asked line, the figure and Our bench under Who is where', () => {
    expect(page.match(/<AskedLine /g)?.length).toBe(2)
  })

  it('the asked line opens Bench only where this seat may open Bench, and is plain words otherwise', () => {
    expect(page).toContain("mayOpen('/dashboard/bench', permissions)")
    expect(page).toMatch(/open \? \(\s*<Link href="\/dashboard\/bench"/)
  })
})

describe('who is on the bench is placed anywhere, never only here', () => {
  it('the bench reader asks other firms only whose person a line live today is, and nothing else of it', () => {
    const at = reads.indexOf('export async function placedElsewhereToday')
    const body = reads.slice(at, reads.indexOf('\n}\n', at))
    expect(body).toContain('companyId: { not: companyId }')
    expect(body).toContain('select: { personId: true }')
    expect(body).not.toMatch(/billRate|clientCompany|endClientCompany|company: \{/)
  })
})
