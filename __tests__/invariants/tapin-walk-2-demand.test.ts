import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { reasonAsked, answersFor, unanswered, ANSWERED_IN } from '@/lib/award/reason-asked'
import { opensOn } from '@/app/dashboard/submissions/award-dialog'
import { ASK_ETYME_HREF } from '@/lib/nav-table'

/**
 * The second Tapin walk, 2026-10-30: what demand's screens still did
 * wrong once the chain reached the bill.
 *
 *   1. A warning that takes a reason was shown with no box to type it in.
 *   2. The start card's Open landed on a page that does not exist.
 *   3. A job sent to a supplier was told apart by six characters of its key.
 *   4. The award's cover sentence must always name the firm.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

// ── 1. A warning is a question, and it gets a box ──────────────────────

describe('a warning that takes a reason is a question with a box, never a refusal with nowhere to answer', () => {
  it('a time-limit warning at the award is a question answered in limitReason, in the route’s own words', () => {
    const q = reasonAsked({
      code: 'TIME_LIMIT_REASON',
      message: 'Ravi Kalathil reaches the time limit at Northbend Athletic on Mar 4, 2027. Give a reason to go ahead.',
      field: 'limitReason',
    })
    expect(q).toEqual({
      says: 'Ravi Kalathil reaches the time limit at Northbend Athletic on Mar 4, 2027. Give a reason to go ahead.',
      field: 'limitReason',
    })
  })

  it('a paperwork warning at activation is a question answered in overrideReason, and so is a client rule’s warning', () => {
    expect(reasonAsked({ code: 'DOCUMENTS_WARN', message: 'Ravi has no background check on file.', overridable: true }))
      .toEqual({ says: 'Ravi has no background check on file.', field: 'overrideReason' })
    expect(reasonAsked({ code: 'GOVERNANCE_WARN', message: 'The rate is above the band.', overridable: true })?.field).toBe('overrideReason')
  })

  it('an extension’s paper warning is answered in reason, the field the extend route names', () => {
    expect(reasonAsked({ code: 'PAPERS_NEED_A_REASON', message: 'The I-9 ends first. Give a reason to go ahead.', field: 'reason' })?.field).toBe('reason')
  })

  it('a warning the list does not know yet still gets its box where the route names a reason field or says it can be overridden', () => {
    expect(reasonAsked({ code: 'SOMETHING_NEW', message: 'Say why.', field: 'bandReason' })?.field).toBe('bandReason')
    expect(reasonAsked({ code: 'SOMETHING_NEWER', message: 'Say why.', overridable: true })?.field).toBe('overrideReason')
  })

  it('a refusal that blocks draws no box: lapsed cover, the time limit’s block and a blocked award are a no, said in a sentence', () => {
    expect(reasonAsked({ code: 'DOCUMENTS_BLOCK', message: 'Tapin has no workers’ compensation certificate on file.' })).toBeNull()
    expect(reasonAsked({ code: 'TIME_LIMIT', message: 'Ravi Kalathil is past the time limit at Northbend Athletic.' })).toBeNull()
    expect(reasonAsked({ code: 'AWARD_BLOCKED', message: '1 reason this cannot proceed', checks: [] })).toBeNull()
    expect(reasonAsked({ code: 'GOVERNANCE_BLOCK', message: 'Work authorization is not on file.' })).toBeNull()
  })

  it('a refusal with no sentence is never a question, because a box under nothing asks the person to justify what they were not told', () => {
    expect(reasonAsked({ code: 'TIME_LIMIT_REASON', field: 'limitReason' })).toBeNull()
    expect(reasonAsked({ code: 'DOCUMENTS_WARN', message: '   ', overridable: true })).toBeNull()
    expect(reasonAsked(null)).toBeNull()
    expect(reasonAsked('Give a reason')).toBeNull()
  })

  it('every warning-and-proceed code the product sends today is on the list, each with the field its route reads', () => {
    const award = code('src/app/api/submissions/[id]/award/route.ts')
    expect(award).toContain("code: 'TIME_LIMIT_REASON'")
    expect(award).toContain("field: 'limitReason'")
    expect(award).toContain('const limitReason = typeof body.limitReason')
    const activate = code('src/app/api/contracts/[id]/activate/route.ts')
    expect(activate).toContain("code: 'DOCUMENTS_WARN'")
    expect(activate).toContain("code: 'GOVERNANCE_WARN'")
    expect(activate).toContain('body.overrideReason')
    expect(ANSWERED_IN.TIME_LIMIT_REASON.field).toBe('limitReason')
    expect(ANSWERED_IN.DOCUMENTS_WARN.field).toBe('overrideReason')
    expect(ANSWERED_IN.GOVERNANCE_WARN.field).toBe('overrideReason')
    expect(ANSWERED_IN.NO_REASON).toEqual({ field: 'underWayReason', with: { workUnderWay: true } })
  })

  it('a reason is sent only for a question the person was shown, and a blank answer is not sent at all', () => {
    const asked = {
      limitReason: { says: 'Past the time limit. Give a reason to go ahead.', field: 'limitReason' },
    }
    expect(answersFor(asked, { limitReason: '  Covering a release.  ' })).toEqual({ limitReason: 'Covering a release.' })
    expect(answersFor(asked, { limitReason: '   ' })).toEqual({})
    // A reason typed for a question nobody asked is never sent.
    expect(answersFor({}, { limitReason: 'Covering a release.' })).toEqual({})
  })

  it('the under-way start’s reason is sent with the tick the route needs beside it', () => {
    const asked = { underWayReason: { says: 'Say why the work started before the award.', field: 'underWayReason', with: { workUnderWay: true } } }
    expect(answersFor(asked, { underWayReason: 'Started on a handshake.' })).toEqual({ workUnderWay: true, underWayReason: 'Started on a handshake.' })
  })

  it('the Place button waits while a question on the screen has no answer', () => {
    const asked = { limitReason: { says: 'Give a reason to go ahead.', field: 'limitReason' } }
    expect(unanswered(asked, {})).toBe(true)
    expect(unanswered(asked, { limitReason: ' ' })).toBe(true)
    expect(unanswered(asked, { limitReason: 'Covering a release.' })).toBe(false)
    expect(unanswered({}, {})).toBe(false)
  })

  it('the Submissions row and the job request’s page place somebody through the one dialog, and neither opens a browser prompt or alert', () => {
    const submissions = code('src/app/dashboard/submissions/page.tsx')
    const job = code('src/app/dashboard/requisitions/[id]/page.tsx')
    for (const [name, page] of [['submissions', submissions], ['job', job]] as const) {
      expect(page, name).toContain('<AwardDialog')
      expect(page, name).not.toContain('/award`')
    }
    expect(job).not.toContain('window.prompt')
    expect(job).not.toMatch(/\balert\(/)
    // One copy of the dialog: the Submissions page no longer keeps its own.
    expect(submissions).not.toContain('function AwardModal')
  })

  it('the dialog draws the route’s question with a box under it and keeps a refusal on the screen, never in a toast that goes', () => {
    const dialog = code('src/app/dashboard/submissions/award-dialog.tsx')
    expect(dialog).toContain('/api/submissions/${submissionId}/award')
    expect(dialog).toContain('const question = reasonAsked(err)')
    expect(dialog).toContain('<Field label={q.says}>')
    expect(dialog).toContain('<Textarea')
    expect(dialog).toContain('...answersFor(asked, typed)')
    expect(dialog).toContain('setRefusal(refusalSays(err.message')
    expect(dialog).not.toMatch(/setToast|window\.prompt|\balert\(/)
    // A new day is a new question: what the route said about the old one goes.
    expect(dialog).toMatch(/function pickDay\(next: string\) \{\s*setStartDate\(next\)\s*setAsked\(\{\}\)/)
  })

  it('the dialog reads the rate through the one reader, never dollars times a hundred by hand', () => {
    const dialog = read('src/app/dashboard/submissions/award-dialog.tsx')
    expect(dialog).toContain('centsTyped(rate)')
    expect(dialog).not.toMatch(/\*\s*100\b/)
  })

  it('the dialog opens on the job’s needed-by day while it is ahead, and on today once that day has gone', () => {
    expect(opensOn('2026-11-16T00:00:00.000Z', '2026-11-01')).toBe('2026-11-16')
    expect(opensOn('2026-11-01', '2026-11-01')).toBe('2026-11-01')
    expect(opensOn('2026-10-20', '2026-11-01')).toBe('2026-11-01')
    expect(opensOn(null, '2026-11-01')).toBe('2026-11-01')
    expect(opensOn('not a day', '2026-11-01')).toBe('2026-11-01')
  })
})

// ── 2. Every link on a decision card opens a page ──────────────────────

/** The page file an address opens, or null: literal folders first, then a dynamic one; route groups are walked through. */
function pageFor(address: string): string | null {
  const path = address.split(/[?#]/)[0]
  const segments = path.split('/').filter(Boolean)
  const dynamic = (s: string) => s.includes('${')

  function walk(dir: string, rest: string[]): string | null {
    const here = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())
    const groups = here.filter((n) => /^\(.*\)$/.test(n))
    if (rest.length === 0) {
      for (const f of ['page.tsx', 'page.ts', 'page.jsx', 'page.js']) {
        if (existsSync(join(dir, f))) return join(dir, f)
      }
      for (const g of groups) { const found = walk(join(dir, g), rest); if (found) return found }
      return null
    }
    const [seg, ...tail] = rest
    const params = here.filter((n) => /^\[[^.\]][^\]]*\]$/.test(n))
    const candidates = dynamic(seg) ? params : [...here.filter((n) => n === seg), ...params]
    for (const c of candidates) { const found = walk(join(dir, c), tail); if (found) return found }
    for (const g of groups) { const found = walk(join(dir, g), rest); if (found) return found }
    return null
  }
  return walk(join(ROOT, 'src/app'), segments)
}

/** Every address a file hands a card under `actionUrl:` or `href:`, as written. */
function addressesIn(file: string): { line: number; address: string }[] {
  const out: { line: number; address: string }[] = []
  read(file).split('\n').forEach((text, i) => {
    if (!/\b(actionUrl|href)\s*:/.test(text)) return
    for (const m of text.matchAll(/(['"`])(\/dashboard[^'"`]*)\1/g)) out.push({ line: i + 1, address: m[2] })
  })
  return out
}

const DECISION_FILES = [
  'src/app/api/decisions/route.ts',
  ...readdirSync(join(ROOT, 'src/app/api/decisions'))
    .filter((f) => f.endsWith('.ts') && f !== 'route.ts')
    .map((f) => `src/app/api/decisions/${f}`),
  // The program page's rows, which the queue draws as its own (`deskRows`).
  'src/app/dashboard/program/needs-you.ts',
]

describe('every link on a decision card opens a page that exists', () => {
  it('the address resolver finds pages that exist and refuses one that does not', () => {
    expect(pageFor('/dashboard/placements/${c.id}')).toMatch(/placements\/\[id\]\/page\.tsx$/)
    expect(pageFor('/dashboard/timesheets?id=${ts.id}')).toMatch(/timesheets\/page\.tsx$/)
    expect(pageFor('/dashboard/contracts/${c.id}')).toBeNull()
  })

  it('every link on a decision card opens a page that exists', () => {
    const links = DECISION_FILES.flatMap((f) => addressesIn(f).map((a) => ({ ...a, file: f })))
    expect(links.length).toBeGreaterThan(8)
    const dead = links.filter((l) => pageFor(l.address) === null).map((l) => `${l.file}:${l.line} ${l.address}`)
    expect(dead).toEqual([])
    // The card that opens Ask Etyme opens a page too.
    expect(pageFor(ASK_ETYME_HREF)).not.toBeNull()
  })

  it('every card’s link is an address the test can read, so a computed one cannot slip past it', () => {
    for (const f of DECISION_FILES) {
      read(f).split('\n').forEach((text, i) => {
        const m = text.match(/\bactionUrl\s*:\s*(.+?),?\s*$/)
        if (!m || /^\s*(string|\/\/)/.test(m[1]) || text.trim().startsWith('*') || text.trim().startsWith('//')) return
        const value = m[1]
        const readable = /(['"`])\/dashboard/.test(value) || value === 'ASK_ETYME_HREF' || value === 'item.href'
        expect(readable, `${f}:${i + 1} ${value}`).toBe(true)
      })
    }
  })

  it('the start card opens the placement’s own page, and never the contracts address that has no page', () => {
    const route = code('src/app/api/decisions/route.ts')
    expect(route).toContain('actionUrl: `/dashboard/placements/${c.id}`')
    expect(route).not.toContain('/dashboard/contracts/${')
  })
})

// ── 4. The award names the firm whose cover it read ────────────────────

describe('the award’s cover sentence names the firm, never “The supplier”', () => {
  it('every caller of the cover check names the firm whose cover it read', () => {
    const callers: string[] = []
    function walk(dir: string) {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(n)) {
          const text = readFileSync(p, 'utf8')
          for (const m of text.matchAll(/\bcheckCover\(/g)) {
            if (/function checkCover\($/.test(text.slice(Math.max(0, m.index! - 9), m.index! + 11))) continue
            callers.push(`${p.replace(ROOT + '/', '')}::${text.slice(m.index!, m.index! + 700)}`)
          }
        }
      }
    }
    walk(join(ROOT, 'src'))
    expect(callers.length).toBeGreaterThan(0)
    for (const c of callers) {
      const call = c.slice(0, c.indexOf('}, ') > 0 ? c.indexOf('}, ') : undefined)
      expect(call, c.split('::')[0]).toMatch(/vendorName:\s*\S/)
      expect(call, c.split('::')[0]).not.toMatch(/vendorName:\s*(null|undefined|''|"")\s*[,}]/)
    }
  })

  it('the award names the firm from the submission itself, which the schema never leaves empty', () => {
    const award = code('src/app/api/submissions/[id]/award/route.ts')
    expect(award).toContain('vendorName: vendorCompany?.name ?? submission.fromCompany?.name ?? null')
    expect(award).toContain('fromCompany: { select: { id: true, name: true, templatePack: true } }')
    const schema = read('prisma/schema.prisma')
    const submission = schema.slice(schema.indexOf('model Submission {'), schema.indexOf('\n}', schema.indexOf('model Submission {')))
    expect(submission).toMatch(/fromCompanyId\s+String\s/)
  })

  it('the start’s paperwork verdict names the supplier on every screen that shows its sentence', () => {
    expect(code('src/app/api/decisions/route.ts')).toContain('startPaperwork(c, { supplierPhrase: c.company.name, clientName, now })')
    expect(code('src/app/api/program/view.ts')).toContain('supplierPhrase: shown(c.company.id, c.company.name).phrase')
    const regions = code('src/app/api/program/regions/read.ts')
    expect(regions).toContain('{ supplierPhrase: c.company.name, clientName: client.name, now }')
    // The one call with no name is the count, which keeps the outcome and drops the sentence.
    expect(regions).toMatch(/startPaperwork\(\{ \.\.\.c, person: \{ name: '' \} \}, \{ supplierPhrase: '', clientName: client\.name, now \}\)\s*if \(papers\.outcome === 'BLOCK'\) \{ heldStarts = 1; break \}/)
  })
})
