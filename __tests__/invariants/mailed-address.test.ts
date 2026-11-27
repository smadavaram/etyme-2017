import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, mailedUrl, mailedBase } from '@/lib/app-url'
import { baseUrl } from '@/lib/signed-link'
import { applyUrl } from '@/lib/supplier-link'
import { assess, type ReadinessFacts } from '@/lib/readiness'

const KEYS = ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const env = (e: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) {
    if (e[k] === undefined) delete process.env[k]
    else process.env[k] = e[k]
  }
}
afterEach(() => env(saved as Record<string, string>))
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

const PROD = { VERCEL_URL: 'etyme-abc123-team.vercel.app', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'www.etyme.example' }

describe('a mailed link never carries the one-off deployment address', () => {
  it('a mailed link on production never carries the one-off deployment address', () => {
    env(PROD)
    expect(mailedUrl()).toBe('https://www.etyme.example')
    expect(baseUrl()).toBe('https://www.etyme.example')
    expect(applyUrl('t')).toBe('https://www.etyme.example/apply/t')
  })

  it('the sign-in address still wins over the production address', () => {
    env({ ...PROD, NEXTAUTH_URL: 'https://app.etyme.example/' })
    expect(mailedUrl()).toBe('https://app.etyme.example')
  })

  it('a preview with nothing set still mails its own address', () => {
    env({ VERCEL_URL: 'etyme-git-x.vercel.app', VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'www.etyme.example' })
    expect(mailedUrl()).toBe('https://etyme-git-x.vercel.app')
    expect(baseUrl()).toBe('https://etyme-git-x.vercel.app')
  })

  it('with nothing set at all a signed link has no base, so no broken link is sent', () => {
    env({})
    expect(mailedBase()).toBe('')
  })

  it('the middleware redirect still reads the request-side address, unchanged', () => {
    env(PROD)
    expect(appUrl()).toBe('https://etyme-abc123-team.vercel.app')
    expect(read('src/middleware.ts')).toContain('appUrl()')
    expect(read('src/middleware.ts')).not.toContain('mailedUrl')
  })

  it('no mailed or copied link is built from the middleware reader', () => {
    for (const f of ['src/lib/password-door.ts', 'src/lib/notify.ts', 'src/lib/contractor-link.ts', 'src/lib/notify/sign-in-door.ts', 'src/app/api/access/invite/one.ts', 'src/lib/data-request.ts', 'src/app/api/cron/daily/route.ts']) {
      expect(read(f), f).not.toMatch(/\bappUrl\(\)/)
    }
  })
})

describe('the readiness page says when no lasting address is set', () => {
  const facts = (lastingAddress: boolean): ReadinessFacts => ({
    env: { database: true, nextauthSecret: true, cronSecret: true, microsoft: true, google: true, emailLink: false, emailSender: true, lastingAddress },
    db: { reachable: true, schemaCurrent: true, ms: 10 },
    realCompanies: 0, realSignIns: 0,
    imports: { total: 0, committed: 0 }, email: { sent: 0, unsent: 0 },
    teams: { workflowsChannels: 0, retiredChannels: 0, postedByWorkflows: 0 },
    cron: { tracked: true, lastRunAt: null, lastBroke: 0 },
    watch: { staffConfigured: false, alertsSent: 0, incidentsToday: 0 },
    demo: { seeded: true, current: false }, privacyContact: false,
  })
  it('the readiness page says in a sentence that NEXTAUTH_URL is missing', () => {
    const e = assess(facts(false), new Date('2026-11-18T12:00:00Z')).edges.find((x) => x.key === 'address')
    expect(e?.fix).toContain('NEXTAUTH_URL')
    expect(e?.required).toBe(false)
  })
  it('the readiness page says nothing about the address when one is set', () => {
    expect(assess(facts(true), new Date('2026-11-18T12:00:00Z')).edges.find((x) => x.key === 'address')).toBeUndefined()
  })
})
