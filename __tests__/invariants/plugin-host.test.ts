import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import {
  pluginLabels, pluginSiteOfHost, pluginSitePath, pluginSiteUrl,
  sessionCookieDomain, subdomainsShareSession, courseEntryHref,
} from '@/lib/plugin-host'
import { sessionMicroSites } from '@/lib/plugin-registry'
import { RESERVED_SUBDOMAINS } from '@/lib/domains-owned'
import { learnOpen } from '@/lib/training/learn-gate'
import { middleware } from '@/middleware'

/** Record 137: plugin sites live on subdomains, with one session across the seam. */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const HOST = 'etyme.com'
const saved = process.env.NEXTAUTH_URL
afterEach(() => { if (saved === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = saved })

function at(host: string, path: string) {
  return new NextRequest(new URL(`https://${host}${path}`), { headers: { host } })
}

describe('a plugin subdomain names a plugin site and a tenant, and back', () => {
  it('the labels are the registry’s own micro-site roots: learn, pods and proposals', () => {
    expect(pluginLabels().map((p) => p.root).sort()).toEqual([...sessionMicroSites()].sort())
    expect(pluginLabels().map((p) => p.label).sort()).toEqual(['learn', 'pods', 'proposals'])
  })

  it('learn.tapin.etyme.com is Tapin’s training site, served from /learn/tapin', () => {
    const site = pluginSiteOfHost('learn.tapin.etyme.com', HOST)!
    expect(site.key).toBe('TRAIN_TO_BENCH')
    expect(site.tenant).toEqual({ kind: 'SUBDOMAIN', slug: 'tapin' })
    expect(pluginSitePath(site, '/')).toBe('/learn/tapin')
    expect(pluginSitePath(site, '/home')).toBe('/learn/tapin/home')
  })

  it('a link that already names the site is kept as it is, never doubled', () => {
    const site = pluginSiteOfHost('learn.tapin.etyme.com', HOST)!
    expect(pluginSitePath(site, '/learn/tapin/home')).toBe('/learn/tapin/home')
  })

  it('learn.etyme.com is Etyme’s own training subdomain, served from /learn', () => {
    const site = pluginSiteOfHost('learn.etyme.com', HOST)!
    expect(site.tenant).toEqual({ kind: 'PLATFORM' })
    expect(pluginSitePath(site, '/tapin/home')).toBe('/learn/tapin/home')
  })

  it('pods and proposals subdomains name their own micro-sites', () => {
    expect(pluginSitePath(pluginSiteOfHost('pods.tapin.etyme.com', HOST)!, '/x')).toBe('/pods/tapin/x')
    expect(pluginSitePath(pluginSiteOfHost('proposals.tapin.etyme.com', HOST)!, '/')).toBe('/proposals/tapin')
  })

  it('the same label under a tenant’s own domain names that domain, and the edge does not guess its slug', () => {
    const site = pluginSiteOfHost('learn.talent.firm.example', HOST)!
    expect(site.tenant).toEqual({ kind: 'CUSTOM', domain: 'talent.firm.example' })
    expect(pluginSitePath(site, '/')).toBeNull()
  })

  it('a firm’s own address, the platform and a hosting address are no plugin site', () => {
    expect(pluginSiteOfHost('tapin.etyme.com', HOST)).toBeNull()
    expect(pluginSiteOfHost('etyme.com', HOST)).toBeNull()
    expect(pluginSiteOfHost('learn.etyme2040.vercel.app', HOST)).toBeNull()
    expect(pluginSiteOfHost('learn.a.b.etyme.com', HOST)).toBeNull()
  })

  it('a tenant’s plugin site address is built under its own domain where it has one, else under the platform', () => {
    expect(pluginSiteUrl('TRAIN_TO_BENCH', { slug: 'tapin' }, HOST)).toBe('https://learn.tapin.etyme.com')
    expect(pluginSiteUrl('PODS', { slug: 'tapin', customDomain: 'talent.firm.example' }, HOST)).toBe('https://pods.talent.firm.example')
    expect(pluginSiteUrl('TRAIN_TO_BENCH', null, HOST)).toBe('https://learn.etyme.com')
    expect(pluginSiteUrl('OUTREACH', { slug: 'tapin' }, HOST)).toBeNull()
  })
})

describe('plugin labels are never a tenant’s address', () => {
  it('every plugin label is kept back from the address form', () => {
    for (const p of pluginLabels()) expect(RESERVED_SUBDOMAINS.has(p.label), p.label).toBe(true)
  })

  it('every plugin label is in the middleware’s list of names that are ours', () => {
    const block = read('src/middleware.ts').match(/PLATFORM_SUBDOMAINS = new Set\(\[([\s\S]*?)\]\)/)![1]
    for (const p of pluginLabels()) expect(block, p.label).toContain(`'${p.label}'`)
  })
})

describe('one session across the seam', () => {
  it('the cookie is widened to .etyme.com when the app lives on etyme.com', () => {
    expect(sessionCookieDomain('https://etyme.com', HOST)).toBe('.etyme.com')
    expect(sessionCookieDomain('https://www.etyme.com', HOST)).toBe('.etyme.com')
  })

  it('the cookie stays host-only on the hosting address and on localhost, as production runs today', () => {
    expect(sessionCookieDomain('https://etyme2040.vercel.app', HOST)).toBeUndefined()
    expect(sessionCookieDomain('http://localhost:3000', HOST)).toBeUndefined()
    expect(sessionCookieDomain('', HOST)).toBeUndefined()
    expect(sessionCookieDomain('https://notetyme.com', HOST)).toBeUndefined()
  })

  it('sign-in sets the cookie domain from the one reader and builds no token door', () => {
    const src = read('src/lib/auth.ts')
    expect(src).toContain('sessionCookieDomain(')
    expect(read('src/lib/plugin-host.ts')).not.toMatch(/token=|callbackUrl/)
  })
})

describe('the middleware serves a plugin subdomain from its existing path', () => {
  it('on etyme.com, learn.tapin.etyme.com/home is rewritten to /learn/tapin/home and the address bar is kept', async () => {
    process.env.NEXTAUTH_URL = 'https://etyme.com'
    const res = await middleware(at('learn.tapin.etyme.com', '/home'))
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://learn.tapin.etyme.com/learn/tapin/home')
    expect(res.headers.get('location')).toBeNull()
  })

  it('where the session cannot reach the subdomain, the visitor is sent to the same path on the app’s own address', async () => {
    process.env.NEXTAUTH_URL = 'https://etyme2040.vercel.app'
    const res = await middleware(at('learn.tapin.etyme.com', '/home'))
    expect(res.headers.get('location')).toBe('https://etyme2040.vercel.app/learn/tapin/home')
  })

  it('the API and signing in on a plugin subdomain are never rewritten into the micro-site', async () => {
    process.env.NEXTAUTH_URL = 'https://etyme.com'
    const api = await middleware(at('learn.tapin.etyme.com', '/api/learn/tapin'))
    expect(api.headers.get('x-middleware-rewrite')).toBeNull()
    const login = await middleware(at('learn.tapin.etyme.com', '/login'))
    expect(login.headers.get('location')).toBe('https://etyme.com/login')
  })

  it('with the training plugin off, /learn reached by subdomain still answers not found, because the same layout gate decides', () => {
    // The rewrite lands on /learn/<slug>, whose layout calls notFound() when learnTenant reads no firm,
    // and learnTenant reads no firm while the plugin is off.
    expect(read('src/app/learn/[tenant]/layout.tsx')).toMatch(/if \(!t\) notFound\(\)/)
    expect(learnOpen({ pluginsOn: [] })).toBe(false)
    expect(learnOpen({ pluginsOn: null })).toBe(false)
    expect(read('src/middleware.ts')).not.toMatch(/learnOpen|pluginsOn/)
  })
})

describe('the /learnai door’s link into the course', () => {
  it('points at learn.etyme.com once the app lives on etyme.com', () => {
    expect(courseEntryHref('https://etyme.com', HOST)).toBe('https://learn.etyme.com')
  })

  it('keeps today’s path on etyme2040.vercel.app, so nothing changes on production', () => {
    expect(subdomainsShareSession('https://etyme2040.vercel.app', HOST)).toBe(false)
    expect(courseEntryHref('https://etyme2040.vercel.app', HOST)).toBe('/learn')
  })
})
