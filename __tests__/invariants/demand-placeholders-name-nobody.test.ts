import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Fix list 2026-11-14, A7: an example in a box names nobody.
 *
 * A placeholder is read by somebody at a real firm as a hint of what to
 * type. One that shows a real-looking person, a real firm or a domain
 * anybody could buy reads as somebody's data. On the job, submission,
 * people, leads and agreement screens, every example is a plain
 * description or a made-up name on a reserved domain.
 */

const PAGES = [
  'src/app/dashboard/submissions/page.tsx',
  'src/app/dashboard/program/agreements/page.tsx',
  'src/app/dashboard/requisitions/chain.tsx',
  'src/app/dashboard/requisitions/page.tsx',
  'src/app/dashboard/requirements/page.tsx',
  'src/app/dashboard/people/page.tsx',
  'src/app/dashboard/leads/page.tsx',
  'src/app/dashboard/suppliers/page.tsx',
  'src/app/dashboard/invitations/page.tsx',
  'src/app/welcome/[token]/page.tsx',
]
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Every literal a placeholder shows: placeholder="…", placeholder={'…'} and template strings. */
function placeholders(text: string): string[] {
  const out: string[] = []
  const re = /placeholder=(?:"([^"]*)"|\{\s*[`'"]([\s\S]*?)[`'"]\s*\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? '')
  return out
}

const RESERVED = /\.(example|invalid|local|test)$/i
/** Anything shaped like a domain: an email's or a bare name.tld. */
const domainsIn = (s: string) =>
  (s.replace(/[^\s@<]+@/g, '').match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi) ?? []).filter((d) => !/^\d/.test(d) && !/\.(pdf|docx?)$/i.test(d))

describe('an example in a box on the hiring screens names nobody', () => {
  it('every domain an example in a box shows is a reserved one that nobody can register', () => {
    const bad: string[] = []
    for (const p of PAGES) for (const ph of placeholders(src(p))) for (const d of domainsIn(ph)) {
      if (!RESERVED.test(d)) bad.push(`${p}: ${d}`)
    }
    expect(bad).toEqual([])
  })

  it('the hiring manager’s email on the send-a-submission form shows an address at a reserved domain', () => {
    expect(placeholders(src('src/app/dashboard/submissions/page.tsx'))).toContain('hiring.manager@company.example')
  })

  it('who signed an agreement, who is interviewing and who is invited back are asked for by "First and last name", not by a person’s name', () => {
    expect(placeholders(src('src/app/dashboard/program/agreements/page.tsx'))).toContain('First and last name')
    expect(placeholders(src('src/app/dashboard/requisitions/chain.tsx'))).toContain('First and last name, and their team')
    const people = placeholders(src('src/app/dashboard/people/page.tsx'))
    expect(people).toContain('First and last name')
    expect(people).toContain('name@company.example')
  })

  it('no example in a box names a person or a firm the old examples named', () => {
    const all = PAGES.flatMap((p) => placeholders(src(p))).join('\n')
    for (const was of ['Dana Whitfield', 'Marcus Oyelaran', 'Lucía Fernández', 'Vertex', 'SAP Program']) {
      expect(all).not.toContain(was)
    }
  })
})
