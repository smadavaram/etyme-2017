import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { desklessDoor, desklessAllowlist, SHELL_READS } from '@/lib/deskless-door'
import { getNavForKind, routesOf, routeMatches, OPEN_TO_EVERY_SEAT, openBecause, isDeskless, holdsADesk } from '@/lib/nav-table'
import { consoleHome } from '@/lib/console-home'
import { namesAPermission } from '@/lib/refusal-words'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Sign-up walk, round four, problems 1 and 2. A colleague seated as
 * Member with no desk saw only their own pages in the menu, and read the
 * firm's money and people by typing addresses. One door now stands where
 * every dashboard route passes (`getCallerContext`), and its allowlist is
 * the menu's: what a desk-less seat is shown, the frame around every
 * page, and the routes the menu marks as answering such a seat itself.
 */

const API = join(process.cwd(), 'src/app/api')
const MEMBER = { contextType: 'EMPLOYEE', permissions: [] as string[], companyName: 'Northbend Athletic', companyKind: 'CLIENT' }
const at = (path: string, over: Partial<typeof MEMBER> & { isService?: boolean } = {}) => desklessDoor({ ...MEMBER, ...over, path })

/** Every route directory under src/app/api, as a path of segments, `[id]` read as `*`. */
function routes(dir = API, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) routes(full, out)
    else if (name === 'route.ts') out.push(relative(API, dir).replace(/\[[^\]]+\]/g, '*'))
  }
  return out
}

describe('a seat with no desk opens only what its menu shows it', () => {
  it('the firm’s dashboard, submissions, job requests, contractors and past contractors are refused by URL (round four, problems 1 and 2)', () => {
    const says: Record<string, string> = {
      '/api/program': 'Dashboard',
      '/api/submissions': 'Submissions',
      '/api/requisitions': 'Job requests',
      '/api/people': 'Contractors',
      '/api/alumni': 'Past contractors',
    }
    for (const [path, page] of Object.entries(says)) {
      const v = at(path)
      expect(v.open, path).toBe(false)
      if (!v.open) expect(v.says).toBe(`${page} is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.`)
    }
  })

  it('a refusal names the page in the reader’s own words and never a permission key', () => {
    for (const path of ['/api/requirements', '/api/invoices', '/api/purchase-orders', '/api/ap', '/api/vendors', '/api/rolloff', '/api/payroll', '/api/bench/ours', '/api/me/scorecard']) {
      const v = at(path)
      expect(v.open, path).toBe(false)
      if (!v.open) {
        expect(namesAPermission(v.says), v.says).toBe(false)
        expect(v.says.endsWith('Ask your company’s owner if you need it.')).toBe(true)
      }
    }
  })

  it('a route that has no link anywhere is refused as "What you opened", not as an empty name', () => {
    const v = at('/api/me/scorecard')
    expect(v.open).toBe(false)
    if (!v.open) expect(v.says.startsWith('What you opened is not part of your seat')).toBe(true)
  })

  it('a refusal at a route that answers about people is logged as a refused read; a refusal at a setting reads nobody', () => {
    const people = at('/api/people')
    const setting = at('/api/settings/week')
    expect(!people.open && people.readsPeople).toBe(true)
    expect(!setting.open && setting.readsPeople).toBe(false)
  })

  it('a seat with no desk opens every route behind every link its menu shows it, at every kind of company', () => {
    const shut: string[] = []
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const s of getNavForKind(kind, false, { permissions: [] })) {
        for (const i of s.items) {
          for (const r of routesOf(i)) {
            const path = '/api/' + r.replace(/\/\*\*$/, '').replace(/\*/g, 'x1')
            if (!at(path, { companyKind: kind }).open) shut.push(`${kind} ${i.label}: ${path}`)
          }
        }
      }
    }
    expect(shut).toEqual([])
  })

  it('a desk-less worker still files and reads their own week, their own lines and their own paperwork', () => {
    for (const path of ['/api/me', '/api/me/work', '/api/timesheets', '/api/timesheets/x1/submit', '/api/contracts', '/api/me/papers', '/api/documents/x1/sign', '/api/data-requests/x1/withdraw', '/api/submissions/x1/terms']) {
      expect(at(path).open, path).toBe(true)
    }
  })

  it('the routes the menu marks as answering a seat with no desk themselves are let through to answer it in their own words', () => {
    const marked = Object.keys(OPEN_TO_EVERY_SEAT).filter((h) => openBecause(h)?.includes('a seat holding no desk'))
    expect(marked.length).toBeGreaterThanOrEqual(5)
    for (const href of marked) {
      const path = '/api/' + href.split('?')[0].replace('/dashboard/', '')
      expect(at(path), path).toMatchObject({ open: true, why: 'SCOPES_ITSELF' })
    }
    // …and only the route itself, never what sits under it.
    expect(at('/api/contracts/x1/exempt').open).toBe(false)
    expect(at('/api/program/budget').open).toBe(true)
    expect(at('/api/program/team').open).toBe(false)
  })

  it('the frame around every page — the seat, the bell, the setup reminder, the demo banner — still answers a seat with no desk', () => {
    for (const r of SHELL_READS) expect(at('/api/' + r).open, r).toBe(true)
  })
})

describe('the door stops nobody else', () => {
  it('a seat holding any desk is never stopped, whatever it opens', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP'] as const) {
      for (const r of rolesFor(kind)) {
        if ((r.permissions as readonly string[]).length === 0) continue
        expect(at('/api/program', { companyKind: kind, permissions: [...r.permissions] }).open, `${kind} ${r.name}`).toBe(true)
      }
    }
  })

  it('a worker with no desk reads where he was put forward: the Submissions list opens to a GET, which the route narrows to the rows naming him', () => {
    expect(desklessDoor({ ...MEMBER, path: '/api/submissions', method: 'GET' }).open).toBe(true)
  })

  it('putting anybody forward stays a desk’s: a write to the Submissions list is refused at the door in a sentence', () => {
    for (const method of ['POST', 'PATCH', 'DELETE', undefined]) {
      const v = desklessDoor({ ...MEMBER, path: '/api/submissions', method })
      expect(v.open, String(method)).toBe(false)
      if (!v.open) expect(v.says).toBe('Submissions is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.')
    }
  })

  it('a worker opens the rate conversation on his own submission, and one submission by id is still refused at the door', () => {
    expect(at('/api/me/submissions/s1/rate').open).toBe(true)
    expect(desklessDoor({ ...MEMBER, path: '/api/submissions/s1', method: 'GET' }).open).toBe(false)
  })

  it('a consultant’s own record and an integration key are not seats at a firm, and pass to the route’s own rules', () => {
    expect(at('/api/submissions', { contextType: 'CONSULTANT' }).open).toBe(true)
    expect(at('/api/submissions', { isService: true }).open).toBe(true)
  })
})

describe('the allowlist is the menu’s, never a second list', () => {
  it('every route the door lets a desk-less seat through to is a route that exists', () => {
    const have = routes()
    const all = desklessAllowlist()
    const missing = [...all.menu, ...all.scopesItself, ...all.shell, ...all.byId, ...all.ownRowsOnRead].filter(
      (r) => !have.some((h) => routeMatches('/api/' + h.replace(/\*/g, 'x1'), r) || ('/api/' + h).startsWith('/api/' + r.replace(/\/\*\*$/, '')))
    )
    expect(missing).toEqual([])
  })

  it('every route on the menu half of the allowlist is behind a link a desk-less seat is shown, or behind its own terms', () => {
    const shown = new Set<string>(['submissions/*/terms'])
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      for (const s of getNavForKind(kind, false, { permissions: [] })) for (const i of s.items) for (const r of routesOf(i)) shown.add(r)
    }
    for (const s of getNavForKind(null, true, { permissions: [] })) for (const i of s.items) for (const r of routesOf(i)) shown.add(r)
    expect(desklessAllowlist().menu.filter((r) => !shown.has(r))).toEqual([])
  })

  it('the frame’s own list is short, and names nothing that reads a firm’s book', () => {
    expect(SHELL_READS.length).toBeLessThanOrEqual(7)
    for (const r of SHELL_READS) expect(['me', 'notifications', 'onboarding', 'demo'].includes(r.split('/')[0]), r).toBe(true)
  })

  it('every dashboard route resolves its caller through the door: getCallerContext asks it before handing back a seat', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/api-context.ts'), 'utf8')
    const ask = src.indexOf('await desklessRefusal(caller, request)')
    expect(ask).toBeGreaterThan(0)
    expect(src.indexOf('return { caller, error: null }', ask)).toBeGreaterThan(ask)
  })

  it('the routes that take no caller — health, the demo, seeding, the nightly jobs and the no-sign-in links — never reach the door', () => {
    for (const dir of ['health', 'demo', 'seed-world', 'cron', 'approve-week', 'answer', 'supplier-apply', 'auth']) {
      const root = join(API, dir)
      if (!existsSync(root)) continue
      const files: string[] = []
      const walk = (d: string) => { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : n.endsWith('.ts') && files.push(f) } }
      walk(root)
      for (const f of files) expect(readFileSync(f, 'utf8'), relative(API, f)).not.toContain('getCallerContext')
    }
  })
})

/**
 * Sign-up walk, round five, problems 3–7. Karthik Menon, Teleworld's own
 * W2 engineer, holds two reads — `assignments.read` and
 * `timesheets.read` — and no desk. The door read "no desk" as "no
 * permission at all", so he read every submission his firm made with its
 * rate, the client's rate band, a colleague's placement, the firm's
 * counterparties and contacts, and a thread he was not on.
 */
describe('a seat holding only the reads of its own work holds no desk (round five)', () => {
  const KARTHIK = { contextType: 'EMPLOYEE', permissions: ['assignments.read', 'timesheets.read'], companyName: 'Teleworld Solutions', companyKind: 'GSI' }

  it('the reads of a worker’s own work are not a desk; anything that acts on the firm’s book or reads across it is', () => {
    expect(isDeskless(['assignments.read', 'timesheets.read'])).toBe(true)
    expect(isDeskless(['timesheets.read'])).toBe(true)
    expect(isDeskless([])).toBe(true)
    for (const desk of ['consultants.read', 'invoices.read', 'requirements.read', 'submissions.create', 'timesheets.approve', '*']) {
      expect(isDeskless(['assignments.read', 'timesheets.read', desk]), desk).toBe(false)
      expect(holdsADesk([desk]), desk).toBe(true)
    }
    // Not known yet is never "no desk".
    expect(isDeskless(null)).toBe(false)
    expect(holdsADesk(null)).toBe(false)
  })

  it('every role a company is given holds a desk, except Member', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const) {
      for (const role of rolesFor(kind)) {
        expect(isDeskless(role.permissions), `${kind} ${role.name}`).toBe(role.name === 'Member')
      }
    }
  })

  it('a worker with no desk is refused his firm’s submissions, job requests, companies, contacts and missing paperwork by URL', () => {
    for (const path of ['/api/submissions', '/api/invitations', '/api/companies', '/api/contacts', '/api/loose-ends', '/api/requirements', '/api/consultants']) {
      const v = desklessDoor({ ...KARTHIK, path })
      expect(v.open, path).toBe(false)
      if (!v.open) expect(v.says).toMatch(/is not part of your seat at Teleworld Solutions\. Ask your company’s owner if you need it\.$/)
    }
  })

  it('a worker with no desk still opens his own pages, his own weeks and lines, and a placement by id, which answers him only about his own', () => {
    for (const path of ['/api/me', '/api/me/work', '/api/me/portfolio', '/api/me/benches', '/api/me/data', '/api/me/papers', '/api/timesheets', '/api/contracts', '/api/conversations', '/api/placements/abc123']) {
      expect(desklessDoor({ ...KARTHIK, path }).open, path).toBe(true)
    }
    // What the placement route does with it: somebody else's is not there.
    const route = readFileSync(join(API, 'placements/[id]/route.ts'), 'utf8')
    expect(route).toContain('const notTheirs = deskless && parties != null && parties.personId !== caller.person.id')
    expect(route).toContain('if (!parties || !isParty || notTheirs) {')
    expect(route).toContain('const header = readsOurMoney && !deskless ? placement.workOrder : null')
  })

  it('a worker with no desk lands on his own work', () => {
    expect(consoleHome({ kind: 'GSI', worker: true, permissions: KARTHIK.permissions }).href).toBe('/dashboard/my-work')
    expect(consoleHome({ kind: 'CLIENT', permissions: ['timesheets.read'] }).href).toBe('/dashboard/my-work')
  })

  it('a seat with no desk that types the bench’s address is refused in the Bench page’s name at every route that page calls, not as "What you opened"', () => {
    const calls = ['/api/bench/ours', '/api/bench/ours/holds', '/api/bench/ours/flag', '/api/bench/ours/p1/ask',
      '/api/bench/ours/holds/h1/place', '/api/bench/ours/releases/r1/confirm', '/api/bench/wants', '/api/bench/burn', '/api/bench/listings/l1']
    for (const path of calls) {
      const v = desklessDoor({ ...KARTHIK, path })
      expect(v.open, path).toBe(false)
      if (!v.open) expect(v.says, path).toBe('Bench is not part of your seat at Teleworld Solutions. Ask your company’s owner if you need it.')
    }
  })

  it('what a page calls beyond its gate names the page in a refusal and opens nothing: the bench is on no seat’s allowlist that holds no desk', () => {
    const all = desklessAllowlist()
    const open = [...all.menu, ...all.scopesItself, ...all.shell, ...all.byId, ...all.ownRowsOnRead]
    expect(open.filter((r) => r.split('/')[0] === 'bench')).toEqual([])
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      expect(desklessDoor({ ...MEMBER, companyKind: kind, path: '/api/bench/ours' }).open, kind).toBe(false)
    }
  })

  it('the chain of approvals on a week stays a desk’s at the door: the worker’s own page reads his chain from his own work and never calls it', () => {
    // Sign-up walk, round five: asked whether a desk-less worker needs
    // /api/timesheets/:id/assert for his own week. His page shows the
    // chain from /api/me/work and calls no assert route, so the door is
    // not widened for a call nothing makes.
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/my-work/page.tsx'), 'utf8')
    expect(page).not.toMatch(/\/assert/)
    expect(page).toContain('/api/me/work')
    expect(desklessDoor({ ...KARTHIK, path: '/api/timesheets/t1/assert', method: 'GET' }).open).toBe(false)
  })
})
