import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
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

/** Every .tsx and .ts file under a folder. */
const walk = (d: string): string[] =>
  readdirSync(join(process.cwd(), d)).flatMap((n) => {
    const p = `${d}/${n}`
    return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []
  })

/**
 * Every literal a placeholder can show, wherever it sits in the
 * expression: `placeholder={firm ? 'a' : 'b'}` gives both. Comments and
 * the `${…}` parts of a template are not text a person reads in the box.
 */
function everyPlaceholderLiteral(text: string): string[] {
  const out: string[] = []
  const re = /placeholder[=:]\s*(?:"([^"]*)"|'([^']*)'|\{)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[1] != null || m[2] != null) { out.push((m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')); continue }
    let depth = 1
    let i = re.lastIndex
    while (i < text.length && depth) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++ }
    const expr = text.slice(re.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const lit of expr.match(/`[^`]*`|'[^']*'|"[^"]*"/g) ?? []) out.push(lit.slice(1, -1).replace(/\$\{[^}]*\}/g, ' '))
  }
  return out
}

/** RFC 2606 keeps example.com, example.org and example.net too. */
const RESERVED_ANYWHERE = /\.(example|invalid|local|test)$|(^|\.)example\.(com|org|net)$/i

/**
 * The boxes outside this domain still waiting on their owner, named here
 * so a new one fails at once. This list may only shrink.
 *  - the Teams webhook box shows the shape of the address the customer's
 *    own Teams gives them: an integration target, named as a setting.
 */
const WAITING_OR_ALLOWED = new Set([
  'src/app/dashboard/settings/page.tsx: logic.azure.com',
])

describe('an example in a box anywhere in the app names nobody', () => {
  it('every domain an example in a box shows anywhere in the app is a reserved one, apart from the boxes named as waiting on their owner', () => {
    const bad: string[] = []
    for (const p of walk('src/app')) for (const ph of everyPlaceholderLiteral(src(p))) for (const d of domainsIn(ph)) {
      const key = `${p}: ${d}`
      if (!RESERVED_ANYWHERE.test(d) && !WAITING_OR_ALLOWED.has(key)) bad.push(key)
    }
    expect(bad).toEqual([])
  })

  it('the sign-up and sign-in boxes ask for an email at company.example', () => {
    expect(everyPlaceholderLiteral(src('src/app/(auth)/signup/form.tsx'))).toContain('you@company.example')
    expect(everyPlaceholderLiteral(src('src/app/(auth)/login/page.tsx'))).toContain('you@company.example')
  })

  it('no example in a box on the job, lead or invitation screens names a software maker or one of its products', () => {
    const all = PAGES.flatMap((p) => everyPlaceholderLiteral(src(p))).join('\n')
    for (const maker of [/\bSAP\b/, /S\/4\s?HANA/i, /\bOracle\b/, /\bSalesforce\b/, /\bWorkday\b/, /\bServiceNow\b/, /\bSnowflake\b/, /\bDatabricks\b/]) {
      expect(all).not.toMatch(maker)
    }
  })

  it('the job, requisition, lead and invitation boxes show a made-up job and plain skills', () => {
    expect(everyPlaceholderLiteral(src('src/app/dashboard/requirements/page.tsx'))).toContain('Senior Billing Systems Analyst — Remote')
    expect(everyPlaceholderLiteral(src('src/app/dashboard/requisitions/page.tsx'))).toContain('Purchasing, Inventory planning')
    expect(everyPlaceholderLiteral(src('src/app/dashboard/leads/page.tsx')).join('\n')).toContain('Skills: Cost accounting, General ledger')
    expect(everyPlaceholderLiteral(src('src/app/dashboard/invitations/page.tsx'))).toContain('No available purchasing analysts at this rate')
  })
})
