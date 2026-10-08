import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { desklessDoor, desklessAllowlist, SHELL_READS } from '@/lib/deskless-door'
import { getNavForKind, routesOf, routeMatches, OPEN_TO_EVERY_SEAT, openBecause } from '@/lib/nav-table'
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

  it('a consultant’s own record and an integration key are not seats at a firm, and pass to the route’s own rules', () => {
    expect(at('/api/submissions', { contextType: 'CONSULTANT' }).open).toBe(true)
    expect(at('/api/submissions', { isService: true }).open).toBe(true)
  })
})

describe('the allowlist is the menu’s, never a second list', () => {
  it('every route the door lets a desk-less seat through to is a route that exists', () => {
    const have = routes()
    const all = desklessAllowlist()
    const missing = [...all.menu, ...all.scopesItself, ...all.shell].filter(
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
