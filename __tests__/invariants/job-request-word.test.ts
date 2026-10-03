import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jobListWord } from '@/app/dashboard/requirements/words'
import { pageFraming } from '@/lib/page-framing'

/**
 * Every party's menu says "Job requests" (CLAUDE.md, 2026-09-30: one
 * screen word for the one object, never "Requirements" on one menu).
 * The founder's plain-words decision of 2026-09-28, extended to the
 * product screens the same day. The heading over the list, the back link
 * from one row, the program desk's tab and the refusal when no job is
 * named all say the reader's word, and they read it from lib/page-framing
 * — where the menu's word lives — rather than writing it a second time.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const LIST = read('src/app/dashboard/requisitions/page.tsx')
const DETAIL = read('src/app/dashboard/requisitions/[id]/page.tsx')
const PROGRAM = read('src/app/dashboard/program/page.tsx')
const ASK = read('src/app/api/people/[id]/ask/route.ts')

describe('a job request is called what the reader’s menu calls it', () => {
  it('a client reads its jobs as job requests', () => {
    expect(jobListWord('CLIENT')).toEqual({ plural: 'Job requests', singular: 'job request' })
  })

  it('a supplier reads the same word as its menu, job requests', () => {
    expect(jobListWord('VENDOR')).toEqual({ plural: 'Job requests', singular: 'job request' })
    expect(jobListWord('GSI').plural).toBe('Job requests')
  })

  it('a program office in a client’s seat reads the client’s word', () => {
    expect(jobListWord('MSP', { seated: true, companyName: 'Northbend Athletic' }).plural).toBe('Job requests')
  })

  it('the word is the one the page framing gives the heading, not a second copy of it', () => {
    expect(jobListWord('CLIENT').plural).toBe(pageFraming('CLIENT', 'requirements').title)
    expect(jobListWord('VENDOR').plural).toBe(pageFraming('VENDOR', 'requirements').title)
  })

  it('the list of job requests is headed in the reader’s word, never a fixed "Requirements"', () => {
    expect(LIST).toContain('jobListWord(company?.kind')
    expect(LIST).not.toMatch(/>\s*Requirements\s*<\/h1>/)
  })

  it('the way back from one job request names the list in the reader’s word', () => {
    expect(DETAIL).toContain('← {jobListWord(company?.kind).plural}</a>')
    expect(DETAIL).not.toContain('← Requirements')
  })

  it('the program desk’s tab says job requests, because the program desk is always a client’s book', () => {
    expect(PROGRAM).toContain("label: jobListWord('CLIENT').plural")
    expect(PROGRAM).not.toContain("label: 'Requirements'")
  })

  it('asking for a person without naming a job says which word the reader uses', () => {
    expect(ASK).toContain('Which job? Pick a published ${word.singular}.')
    expect(ASK).not.toContain('Pick a published requirement')
  })
})
