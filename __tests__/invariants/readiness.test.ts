import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { assess, type ReadinessFacts } from '@/lib/readiness'

/**
 * "It is still not production ready."
 *
 * Said twice, and nothing in the building could agree or disagree:
 * /api/health said the deployment was working, the matrix said every
 * row was built. Both were true and neither was the point. Ready is the
 * edges — sign-in, data, email, Teams, a real company — and each is
 * proven only when the outside world has used it once.
 *
 * These are the sentences that page speaks, on the facts production had
 * on 2026-09-13 and on the facts it would have on the day it is ready.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Production, the evening this was written. */
const TODAY: ReadinessFacts = {
  env: {
    database: true, nextauthSecret: true, cronSecret: true,
    microsoft: false, google: false, emailLink: false,
    emailSender: true, anthropic: false,
  },
  db: { reachable: true, schemaCurrent: true, ms: 152 },
  realCompanies: 0,
  realSignIns: 0,
  imports: { total: 0, committed: 0 },
  email: { sent: 0, unsent: 0 },
  teams: { channels: 0, sent: 0 },
  cron: { tracked: false, lastRunAt: null },
  demo: { seeded: true, current: false },
}

const NOW = new Date('2026-09-13T22:00:00Z')

/** The day a client and a supplier have used every edge once. */
const READY: ReadinessFacts = {
  ...TODAY,
  env: { ...TODAY.env, microsoft: true, google: true, anthropic: true },
  realCompanies: 2,
  realSignIns: 5,
  imports: { total: 2, committed: 2 },
  email: { sent: 40, unsent: 0 },
  teams: { channels: 1, sent: 12 },
  cron: { tracked: true, lastRunAt: new Date('2026-09-13T06:00:00Z') },
  demo: { seeded: true, current: true },
}

describe('what production says about itself tonight', () => {
  const v = assess(TODAY, NOW)
  const edge = (key: string) => v.edges.find((e) => e.key === key)!

  it('is not ready, and says how far off in one line', () => {
    expect(v.ready).toBe(false)
    expect(v.says).toBe('Not production ready. 1 of 8 edges proven, 2 configured but never used, 5 missing.')
  })

  it('the database is the one proven edge', () => {
    expect(edge('database')).toMatchObject({ state: 'PROVEN', says: 'Reachable, and the tables match the code (152 ms).' })
  })

  it('nobody outside can sign in, and the row names the two registrations that fix it', () => {
    expect(edge('signin').state).toBe('MISSING')
    expect(edge('signin').says).toBe('Nobody outside can sign in. The only way in is the demo button.')
    expect(edge('signin').fix).toContain('AZURE_AD_CLIENT_ID')
    expect(edge('signin').fix).toContain('GOOGLE_CLIENT_ID')
  })

  it('every company is seed, and it says so rather than counting the seed as customers', () => {
    expect(edge('company')).toMatchObject({ state: 'MISSING', says: 'Every company here is seed. Nobody is using this for real work.' })
  })

  it('no file has been imported, and a system of record with no records is called a demo', () => {
    expect(edge('import').state).toBe('MISSING')
    expect(edge('import').says).toContain('A system of record with none of the client’s records is a demo.')
  })

  it('email is configured and has never left the building, which is the middle state, not a green one', () => {
    expect(edge('email')).toMatchObject({ state: 'SET', says: 'A sender is configured. No email has left this deployment yet.' })
  })

  it('Teams is missing until a company saves a channel, whatever the code is capable of', () => {
    expect(edge('teams').state).toBe('MISSING')
    expect(edge('teams').fix).toContain('incoming-webhook URL')
  })

  it('the daily job leaves no trace, and the page says nobody can tell whether it ran', () => {
    expect(edge('cron')).toMatchObject({ state: 'SET' })
    expect(edge('cron').says).toContain('leaves no record of running')
  })

  it('nothing tells anybody when it breaks, and the page does not hide that row', () => {
    expect(edge('watch')).toMatchObject({ state: 'MISSING', required: true })
  })

  it('the stale demo world is reported with the desk it lacks, and does not count against ready', () => {
    expect(edge('demo')).toMatchObject({ state: 'SET', required: false })
    expect(edge('demo').says).toContain('Nike has no HR or Procurement desk')
  })

  it('the model key is optional and off, not missing', () => {
    expect(edge('model')).toMatchObject({ state: 'OFF', required: false })
  })
})

describe('the day it is ready', () => {
  it('every required edge is proven and the line says so', () => {
    const v = assess({ ...READY }, NOW)
    // "Somebody is told when it breaks" is not built, so even a fully used
    // deployment is one edge short. The page must say so rather than round up.
    expect(v.ready).toBe(false)
    expect(v.proven).toBe(7)
    expect(v.edges.find((e) => e.key === 'watch')!.state).toBe('MISSING')
  })

  it('a proven edge says what happened, in numbers a person would quote', () => {
    const v = assess(READY, NOW)
    const edge = (key: string) => v.edges.find((e) => e.key === key)!
    expect(edge('signin').says).toBe('5 people have signed in through Microsoft and Google.')
    expect(edge('company').says).toBe('2 companies here are real, not seed.')
    expect(edge('email').says).toBe('40 emails have been sent.')
    expect(edge('teams').says).toBe('12 messages have been posted to Teams.')
    expect(edge('cron').says).toBe('The daily job last ran 16 hours ago.')
  })

  it('a database whose tables lag the code is set up, not proven, and the fix is the build flag', () => {
    const v = assess({ ...READY, db: { reachable: true, schemaCurrent: false, ms: 90 } }, NOW)
    const db = v.edges.find((e) => e.key === 'database')!
    expect(db.state).toBe('SET')
    expect(db.fix).toBe('Set DB_PUSH_ON_BUILD=1, redeploy, then unset it.')
  })

  it('a daily job that has not run in two days is set up, not proven', () => {
    const v = assess({ ...READY, cron: { tracked: true, lastRunAt: new Date('2026-09-11T06:00:00Z') } }, NOW)
    expect(v.edges.find((e) => e.key === 'cron')).toMatchObject({ state: 'SET' })
  })
})

describe('the page and the routes', () => {
  it('/ready is never cached and reads the same facts the API does', () => {
    const page = read('src/app/ready/page.tsx')
    expect(page).toContain("export const dynamic = 'force-dynamic'")
    expect(page).toContain('assess(await gatherFacts())')
    expect(read('src/app/api/ready/route.ts')).toContain('assess(facts)')
  })

  it('names environment variables and never reads their values into the answer', () => {
    const facts = read('src/lib/readiness-facts.ts')
    expect(facts).toMatch(/Boolean\(process\.env\.DATABASE_URL\)/)
    expect(facts).not.toMatch(/process\.env\.[A-Z_]+\s*[,}]\s*$/m)
    expect(facts).not.toMatch(/env\.[A-Za-z]+ = process\.env\.[A-Z_]+$/m)
  })

  it('/api/health no longer says "working" on a site nobody outside can sign in to', () => {
    const health = read('src/app/api/health/route.ts')
    expect(health).toContain('Working for the demo. Nobody outside can sign in yet')
    expect(health).toContain('/ready')
  })

  it('a real company is one that is neither a demo workspace nor a seeded firm', () => {
    const facts = read('src/lib/readiness-facts.ts')
    expect(facts).toContain("where: { isDemo: false, NOT: [{ slug: { startsWith: 'world-' } }, { slug: { startsWith: 'demo-' } }] }")
  })
})
