import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import { staffAddresses, tellStaff } from '@/lib/alerts'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * Somebody is told when it breaks.
 *
 * /ready said, in red: "Nothing tells anybody when this breaks. The
 * database and the dev server both died silently during the build of
 * this page." This is that row's fix — failures written down, staff
 * emailed, the daily job leaving a record and a heartbeat — and the
 * hole found on the way: eleven cron routes let anybody in who sent the
 * literal header "Bearer undefined" on a deployment with no secret.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const saved = { ...process.env }
afterEach(() => {
  for (const k of ['ETYME_STAFF_EMAILS', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL', 'CRON_SECRET', 'NODE_ENV']) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('who hears', () => {
  it('staff are the addresses in ETYME_STAFF_EMAILS, and a stray word without an @ is not one', () => {
    process.env.ETYME_STAFF_EMAILS = ' sam@etyme.com, ops@etyme.com ,notanaddress, '
    expect(staffAddresses()).toEqual(['sam@etyme.com', 'ops@etyme.com'])
  })

  it('with nobody named, telling staff says so instead of pretending', async () => {
    delete process.env.ETYME_STAFF_EMAILS
    expect(await tellStaff('x', 'y')).toEqual({ sent: false, reason: 'No ETYME_STAFF_EMAILS is set, so there is nobody to tell.' })
  })

  it('with staff named and no email sender, telling staff names the two variables that would fix it', async () => {
    process.env.ETYME_STAFF_EMAILS = 'sam@etyme.com'
    delete process.env.RESEND_API_KEY
    delete process.env.SENDGRID_API_KEY
    delete process.env.NOTIFY_FROM_EMAIL
    const told = await tellStaff('x', 'y')
    expect(told.sent).toBe(false)
    if (!told.sent) expect(told.reason).toContain('RESEND_API_KEY and NOTIFY_FROM_EMAIL')
  })
})

describe('the reporter', () => {
  const ALERTS = read('src/lib/alerts.ts')

  it('writes the failure down before it tries to tell anybody, and never throws', () => {
    expect(ALERTS.indexOf('prisma.incident.create')).toBeLessThan(ALERTS.indexOf('tellStaff(\n'))
    // Every database call is inside a try, and every catch swallows.
    expect(ALERTS).toContain('// The database is the thing that broke.')
    expect(ALERTS).toContain('// Telling is best-effort. The row exists.')
  })

  it('mails a place at most once an hour, so a route failing on every request is one email', () => {
    expect(ALERTS).toContain("where: { where, toldAt: { gte: new Date(Date.now() - HOUR) } }")
    expect(ALERTS).toContain('if (toldRecently) return')
  })

  it('no API route logs to the console and stops there any more', () => {
    const offenders = walk(join(ROOT, 'src/app/api')).filter((f) => read(f.replace(ROOT + '/', '')).includes('console.error('))
    expect(offenders.map((f) => f.replace(ROOT + '/', ''))).toEqual([])
  })

  it('a broken page tells us, from both error boundaries, without showing the person a stack trace', () => {
    for (const p of ['src/app/error.tsx', 'src/app/global-error.tsx']) {
      const src = read(p)
      expect(src).toContain("fetch('/api/incidents'")
      expect(src).toContain('keepalive: true')
      expect(src).not.toMatch(/\{error\.stack\}/)
    }
    expect(read('src/app/error.tsx')).toContain('This page stopped working.')
  })

  it('the incidents route bounds what a browser may send and marks it as the browser’s', () => {
    const route = read('src/app/api/incidents/route.ts')
    expect(route).toContain('body.message.slice(0, 500)')
    expect(route).toContain('body.stack.slice(0, 4000)')
    expect(route).toContain("side: 'BROWSER'")
  })
})

describe('the daily job leaves a record and a heartbeat', () => {
  const DAILY = read('src/app/api/cron/daily/route.ts')

  it('opens the record before the first job and closes it after the last, then tells staff either way', () => {
    expect(DAILY.indexOf("startRun('daily')")).toBeLessThan(DAILY.indexOf('for (const job of JOBS)'))
    expect(DAILY).toContain("finishRun(runId, 'daily', { ran, broke, says })")
    expect(read('src/lib/alerts.ts')).toContain('const told = await tellStaff(\n    ok ?')
  })

  it('the response says whether staff were told, or why not', () => {
    expect(DAILY).toContain("told: told.sent ? `Staff told at ${told.to.join(', ')}.` : told.reason")
  })
})

describe('the scheduler’s secret', () => {
  const asks = (auth?: string) =>
    new NextRequest('http://localhost/api/cron/daily', { headers: auth ? { authorization: auth } : {} })

  it('the right secret is let in', () => {
    process.env.CRON_SECRET = 's3cret'
    expect(cronAuthorized(asks('Bearer s3cret'))).toBe(true)
  })

  it('the wrong secret, or none, is refused', () => {
    process.env.CRON_SECRET = 's3cret'
    expect(cronAuthorized(asks('Bearer other'))).toBe(false)
    expect(cronAuthorized(asks())).toBe(false)
  })

  it('a deployment with no secret refuses everybody, including the literal "Bearer undefined"', () => {
    delete process.env.CRON_SECRET
    ;(process.env as any).NODE_ENV = 'production'
    expect(cronAuthorized(asks('Bearer undefined'))).toBe(false)
    expect(cronAuthorized(asks())).toBe(false)
  })

  it('every cron route uses the shared check, and none compares the header by hand', () => {
    const routes = walk(join(ROOT, 'src/app/api/cron')).map((f) => f.replace(ROOT + '/', ''))
    expect(routes.length).toBeGreaterThan(10)
    for (const r of routes) {
      const src = read(r)
      expect(src, r).toContain('cronAuthorized(request)')
      expect(src, r).not.toContain('Bearer ${process.env.CRON_SECRET}`)')
    }
  })
})
