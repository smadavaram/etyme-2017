import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NextRequest } from 'next/server'
import { PLUGIN_REGISTRY, pluginHref, sessionMicroSites } from '@/lib/plugin-registry'
import { mayShowMargin, pluginLine, recordHref } from '@/lib/party-ledger/lines'
import { middleware } from '@/middleware'

/**
 * Record 134: one ledger per party, every plugin its own website, one sign-on.
 * The ledger is a reader (src/lib/party-ledger), never a table; the core
 * reaches a plugin by a link the registry declares, and never draws it.
 */

const ROOT = process.cwd()
const walk = (dir: string): string[] =>
  !existsSync(dir) ? [] : readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
const read = (p: string) => readFileSync(p, 'utf8')

describe('the core reaches a plugin only by a link the registry declares', () => {
  const core = [...walk(join(ROOT, 'src/app/dashboard')), ...walk(join(ROOT, 'src/components'))]
  const microSiteDirs = PLUGIN_REGISTRY.filter((p) => p.microSite && p.key !== 'WEBSITE').map((p) => `src/app${p.microSite}`)

  it('no file in the dashboard or the shared components imports from a plugin micro-site', () => {
    expect(microSiteDirs).toContain('src/app/learn')
    const offenders = core.filter((f) => microSiteDirs.some((d) => {
      const alias = d.replace('src/', '@/')
      return new RegExp(`from ['"](${alias}|[./]+/app${d.slice('src/app'.length)})[/'"]`).test(read(f))
    }))
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })

  it('the ledger tab imports no plugin component and draws a plugin line as a plain link out', () => {
    const tab = read(join(ROOT, 'src/components/party-ledger-tab.tsx'))
    expect(tab).not.toMatch(/from ['"]@\/(app|components)\/(learn|pods|proposals|training)/)
    expect(tab).toMatch(/l\.plugin\s*\n?\s*\? <a href=\{l\.href\}/)
  })

  it('a plugin line is a link to its micro-site or its declared door, and carries no workflow', () => {
    const base = { section: 'activity' as const, kind: 'training', says: 'x', when: null, source: { type: 'Enrollment', id: 'e1' } }
    const learn = pluginLine('TRAIN_TO_BENCH', base, '/tenant/home')
    expect(learn.href).toBe('/learn/tenant/home')
    expect(learn.plugin).toBe('TRAIN_TO_BENCH')
    expect(pluginLine('PODS', base).href).toBe('/dashboard/pods')
    expect(pluginLine('PUBLIC_SECTOR', base).href).toBe('/dashboard/proposals')
    expect(Object.keys(learn).sort()).toEqual(['href', 'kind', 'plugin', 'says', 'section', 'source', 'when'])
  })

  it('the ledger reader names a plugin line only through pluginLine, so a link always comes from the registry', () => {
    const src = read(join(ROOT, 'src/lib/party-ledger/read.ts'))
    expect(src).not.toMatch(/plugin: '[A-Z_]+'/)
    expect(src).not.toMatch(/'\/learn|'\/dashboard\/(pods|proposals|training)/)
  })

  it('the plugins whose screens still live inside the dashboard are listed, and the list may only shrink', () => {
    const stillInCore = PLUGIN_REGISTRY.filter((p) => p.microSite === null && p.doors.some((d) => existsSync(join(ROOT, 'src/app', d)))).map((p) => p.key).sort()
    expect(stillInCore).toEqual(['PODS', 'PUBLIC_SECTOR'])
  })
})

describe('what a reader may see on a ledger line', () => {
  it('margin shows only to the firm that sells the line and holds the margin permission', () => {
    expect(mayShowMargin({ readerCompanyId: 'a', lineSellerId: 'a', readsMargin: true })).toBe(true)
    expect(mayShowMargin({ readerCompanyId: 'a', lineSellerId: 'a', readsMargin: false })).toBe(false)
    expect(mayShowMargin({ readerCompanyId: 'client', lineSellerId: 'supplier', readsMargin: true })).toBe(false)
  })

  it('a record with a view links to the view and one without links to the list that owns it', () => {
    expect(recordHref('SellContract', 'c1', '/dashboard/contracts')).toBe('/dashboard/records/SellContract/c1')
    expect(recordHref('Timesheet', 't1', '/dashboard/timesheets')).toBe('/dashboard/timesheets')
  })
})

describe('one sign-on covers the core and every plugin site', () => {
  it('a plugin site has no sign-up, sign-in or password of its own', () => {
    const files = [...walk(join(ROOT, 'src/app/learn'))]
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((f) => /\b(signIn|signUp|bcrypt|argon2|passwordHash|type=["']password["']|\/signup|\/login)\b/.test(read(f)))
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })

  it('the session cookie is never widened to a parent domain', () => {
    const auth = read(join(ROOT, 'src/lib/auth.ts')).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(auth).not.toMatch(/\bcookies\s*:/)
    expect(auth).not.toMatch(/^\s*domain\s*:/m)
    expect(auth).not.toMatch(/useSecureCookies\s*:\s*false/)
  })

  it('the registry names the signed-in micro-sites, and a firm’s public storefront is not one of them', () => {
    expect(sessionMicroSites()).toContain('/learn')
    expect(sessionMicroSites()).not.toContain('/site')
    expect(pluginHref('TRAIN_TO_BENCH')).toBe('/learn')
  })

  const at = (host: string, path: string) => middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }))

  it('the learning site opened on a firm’s own address is sent to the platform host, where the one session cookie lives', async () => {
    const res = await at('tapin.etyme.com', '/learn/tapin/home')
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/learn/tapin/home')
    expect(new URL(res.headers.get('location')!).host).not.toBe('tapin.etyme.com')
  })

  it('the same on a firm’s custom domain, which can never share a cookie', async () => {
    const res = await at('careers.some-firm.example', '/learn/tapin/home')
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(new URL(res.headers.get('location')!).host).not.toBe('careers.some-firm.example')
  })

  it('a firm’s public page on its own address is still served there', async () => {
    const res = await at('tapin.etyme.com', '/site/tapin')
    expect(res.headers.get('location')).toBeNull()
  })
})
