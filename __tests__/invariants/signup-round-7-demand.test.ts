import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listHead } from '@/app/dashboard/submissions/list-head'
import { articleForNumber, onSiteAgainstCapSays } from '@/app/api/people/[id]/cap-words'
import { ownSubmissionsSays } from '@/app/api/submissions/own-only'

/**
 * Round seven of the sign-up walk, 2026-10-08, on the buying side
 * (docs/results/2026-10-08-signup-round-7.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')
const FIRM = 'Candidates you submitted to client job requests. Track each from submission to placement.'

describe('5: a worker never reads the firm’s words or its Submit button, before the read or after it', () => {
  it('until the list’s own read has answered, nothing framed is drawn', () => {
    expect(listHead({ readOnce: false, ownSays: null, firmSays: FIRM })).toEqual({ state: 'LOADING' })
  })

  it('once the route says the seat reads only its own rows, the heading sentence is the route’s own', () => {
    const own = ownSubmissionsSays('Teleworld Solutions')
    const head = listHead({ readOnce: true, ownSays: own, firmSays: FIRM })
    expect(head).toEqual({ state: 'OWN', says: own })
    expect(JSON.stringify(head)).not.toContain('Candidates you submitted')
  })

  it('a desk that reads the firm’s list is headed by the firm’s sentence', () => {
    expect(listHead({ readOnce: true, ownSays: null, firmSays: FIRM })).toEqual({ state: 'DESK', says: FIRM })
  })

  it('an empty own-only sentence from the route is not taken as own-only', () => {
    expect(listHead({ readOnce: true, ownSays: '  ', firmSays: FIRM }).state).toBe('DESK')
  })

  it('Submissions draws "Loading…" alone until its read answers, and no firm sentence of its own beside the route’s', () => {
    const page = src('app/dashboard/submissions/page.tsx')
    expect(page).toMatch(/const head = listHead\(\{/)
    expect(page).toMatch(/if \(head\.state === 'LOADING'\) \{\s*return <p[^>]*>Loading…<\/p>/)
    expect(page).toContain('<p>{head.says}</p>')
  })

  it('Submissions draws neither the Submit button nor the Sent and Received toggle for a seat that reads only its own rows', () => {
    const page = src('app/dashboard/submissions/page.tsx')
    const at = page.indexOf('{!own && (')
    expect(at).toBeGreaterThan(-1)
    expect(page.indexOf('+ {framing.create}')).toBeGreaterThan(at)
    expect(page.indexOf('Received\n')).toBeGreaterThan(at)
    expect(page).toContain('showSubmitModal && companyId && !own')
    expect(page).toContain('selectable={!own}')
  })

  it('Timesheets draws "Loading…" alone until its read answers, then the route’s own sentence or the desk’s', () => {
    const page = src('app/dashboard/timesheets/page.tsx')
    expect(page).toMatch(/const head = listHead\(\{ readOnce, ownSays, firmSays: framing\.subtitle \}\)/)
    expect(page).toContain('<p>{head.says}</p>')
    expect(page).not.toContain('{ownSays ?? framing.subtitle}')
  })
})

describe('6: Duplicate check refused is the sentence alone', () => {
  const page = src('app/dashboard/identity/page.tsx')

  it('a refusal from the route is read as a refusal, in the page’s own name', () => {
    expect(page).toContain("refusedBy(res, 'Duplicate check')")
  })

  it('the refusal and the first load are drawn before the heading and the page’s prose', () => {
    const refusal = page.indexOf('if (refused) return')
    const loading = page.indexOf('if (!readOnce) return')
    const heading = page.indexOf('>Duplicate check</h1>')
    expect(refusal).toBeGreaterThan(-1)
    expect(loading).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(heading)
    expect(loading).toBeLessThan(heading)
  })
})

describe('12: a job request another company raised is refused in a full sentence, with no link to a list the reader lacks', () => {
  it('the route’s refusal ends on a full stop', () => {
    expect(src('app/api/requisitions/[id]/route.ts')).toContain("'This job request belongs to another company.'")
  })

  it('the client’s job request page draws its back link only where the reader’s menu has the list', () => {
    expect(src('app/dashboard/requisitions/[id]/page.tsx')).toMatch(/\{section && <a href="\/dashboard\/requisitions"/)
  })

  it('the job request page draws a refusal alone, with no back link above it', () => {
    const page = src('app/dashboard/requirements/[id]/page.tsx')
    expect(page).toMatch(/if \(reqRes\.status === 403\)/)
    expect(page).toMatch(/if \(refused\) \{\s*return <p[^>]*>\{refused\}<\/p>/)
  })

  it('the job request page draws its back link only where the reader’s menu has the list', () => {
    const page = src('app/dashboard/requirements/[id]/page.tsx')
    const links = page.split('← {listWord}').length - 1
    const gated = page.split(/\{section && \(\s*<div className="mb-\d">\s*<Link href=\{listHref as any\}/).length - 1
    expect(links).toBe(2)
    expect(gated).toBe(2)
  })
})

describe('15: the client’s person page says "an 18-month cap"', () => {
  it('eighteen, eleven, eight and eighty take "an"', () => {
    for (const n of [8, 11, 18, 80, 84, 800, 11000, 18000]) expect(articleForNumber(n)).toBe('an')
  })

  it('every other number takes "a"', () => {
    for (const n of [1, 6, 12, 24, 36, 110, 180, 1800]) expect(articleForNumber(n)).toBe('a')
  })

  it('Lucía Fernández is on site now, 14 months into an 18-month cap', () => {
    expect(onSiteAgainstCapSays('Lucía Fernández', '14 months', 18)).toBe(
      'Lucía Fernández is on site now, 14 months into an 18-month cap across every supplier.'
    )
  })

  it('a twelve-month cap still reads "a 12-month cap"', () => {
    expect(onSiteAgainstCapSays('Helena Marsh', '3 months', 12)).toContain('into a 12-month cap')
  })

  it('the person route says it through the one sentence and no longer hard-codes "a"', () => {
    const route = src('app/api/people/[id]/route.ts')
    expect(route).toContain('onSiteAgainstCapSays(person.name, monthsWord, capMonths)')
    expect(route).not.toContain('into a ${capMonths}-month cap')
  })
})
