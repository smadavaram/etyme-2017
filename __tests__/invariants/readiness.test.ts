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
  teams: { workflowsChannels: 0, retiredChannels: 0, postedByWorkflows: 0 },
  cron: { tracked: true, lastRunAt: null, lastBroke: 0 },
  watch: { staffConfigured: false, alertsSent: 0, incidentsToday: 0 },
  demo: { seeded: true, current: false },
  privacyContact: false,
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
  teams: { workflowsChannels: 1, retiredChannels: 0, postedByWorkflows: 12 },
  cron: { tracked: true, lastRunAt: new Date('2026-09-13T06:00:00Z'), lastBroke: 0 },
  watch: { staffConfigured: true, alertsSent: 3, incidentsToday: 0 },
  demo: { seeded: true, current: true },
  privacyContact: true,
}

describe('what production says about itself tonight', () => {
  const v = assess(TODAY, NOW)
  const edge = (key: string) => v.edges.find((e) => e.key === key)!

  it('is not ready, and says how far off in one line', () => {
    expect(v.ready).toBe(false)
    // The email sender makes the password door a way in (2026-10-08), so
    // sign-in is configured and unused rather than missing.
    expect(v.says).toBe('Not production ready. 1 of 8 edges proven, 3 configured but never used, 4 missing.')
  })

  it('the database is the one proven edge', () => {
    expect(edge('database')).toMatchObject({ state: 'PROVEN', says: 'Reachable, and the tables match the code (152 ms).' })
  })

  it('with an email sender and no identity provider, the password door is the way in and nobody has used it yet', () => {
    expect(edge('signin').state).toBe('SET')
    expect(edge('signin').says).toBe('Sign-in with password is configured. Nobody has used it yet.')
  })

  it('with no sender as well, nobody outside can sign in, and the row names the two registrations and the sender that fix it', () => {
    const shut = assess({ ...TODAY, env: { ...TODAY.env, emailSender: false } }, NOW).edges.find((e) => e.key === 'signin')!
    expect(shut.state).toBe('MISSING')
    expect(shut.says).toBe(
      'Nobody outside can sign in. The only way in is the demo button. ' +
        'The password door cannot confirm emails without an email sender, so it is off.'
    )
    expect(shut.fix).toContain('AZURE_AD_CLIENT_ID')
    expect(shut.fix).toContain('GOOGLE_CLIENT_ID')
    expect(shut.fix).toContain('RESEND_API_KEY')
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

  it('Teams is missing until a company saves a Workflows link, whatever the code is capable of', () => {
    expect(edge('teams').state).toBe('MISSING')
    expect(edge('teams').required).toBe(true)
    expect(edge('teams').fix).toContain('paste a Workflows link')
  })

  it('a company holding only the kind of Teams link Microsoft switched off leaves the Teams edge missing, and is named', () => {
    const v = assess({ ...TODAY, teams: { workflowsChannels: 0, retiredChannels: 1, postedByWorkflows: 0 } }, NOW)
    const t = v.edges.find((e) => e.key === 'teams')!
    expect(t.state).toBe('MISSING')
    expect(t.says).toContain('1 company still has the kind of link Microsoft switched off in May 2026')
  })

  it('a Workflows link saved and never posted through is set up, not proven', () => {
    const v = assess({ ...TODAY, teams: { workflowsChannels: 2, retiredChannels: 0, postedByWorkflows: 0 } }, NOW)
    const t = v.edges.find((e) => e.key === 'teams')!
    expect(t.state).toBe('SET')
    expect(t.says).toBe('2 companies have a Workflows link saved. Nothing has been posted through one yet.')
  })

  it('the daily job has never run here, and the row says when it is due and how to run it now', () => {
    expect(edge('cron')).toMatchObject({ state: 'SET' })
    expect(edge('cron').says).toBe('The daily job has never run here. It is scheduled for 06:00 UTC.')
    expect(edge('cron').fix).toContain('GET /api/cron/daily')
  })

  it('failures are written down and nobody is told, until staff addresses are set', () => {
    expect(edge('watch')).toMatchObject({ state: 'MISSING', required: true })
    expect(edge('watch').says).toBe('Failures are written down and nobody is told. No failure recorded in the last day.')
    expect(edge('watch').fix).toContain('ETYME_STAFF_EMAILS')
  })

  it('the stale demo world is reported with the desk it lacks, and does not count against ready', () => {
    expect(edge('demo')).toMatchObject({ state: 'SET', required: false })
    expect(edge('demo').says).toContain('Northbend Athletic has no HR or Procurement desk')
  })

  it('the model key is optional and off, not missing', () => {
    expect(edge('model')).toMatchObject({ state: 'OFF', required: false })
  })
})

describe('the day it is ready', () => {
  it('every required edge is proven and the line says so', () => {
    const v = assess({ ...READY }, NOW)
    expect(v.ready).toBe(true)
    expect(v.proven).toBe(8)
    expect(v.says).toBe('Ready. Every edge has been used by the outside world at least once.')
  })

  it('staff named and reachable but never yet mailed is the middle state, and the heartbeat is the fix', () => {
    const v = assess({ ...READY, watch: { staffConfigured: true, alertsSent: 0, incidentsToday: 2 } }, NOW)
    const w = v.edges.find((e) => e.key === 'watch')!
    expect(w.state).toBe('SET')
    expect(w.says).toBe('Staff are named and reachable. No heartbeat or alert has gone out yet. 2 failures recorded in the last day.')
  })

  it('staff named with no email sender is missing, not set — a name with no way to reach it is nobody', () => {
    const v = assess({ ...READY, env: { ...READY.env, emailSender: false } }, NOW)
    expect(v.edges.find((e) => e.key === 'watch')).toMatchObject({ state: 'MISSING' })
  })

  it('a daily run with a failed job is set, not proven, and says how many', () => {
    const v = assess({ ...READY, cron: { ...READY.cron, lastBroke: 2 } }, NOW)
    const c = v.edges.find((e) => e.key === 'cron')!
    expect(c.state).toBe('SET')
    expect(c.says).toBe('The daily job ran 16 hours ago and 2 jobs failed.')
  })

  it('a proven edge says what happened, in numbers a person would quote', () => {
    const v = assess(READY, NOW)
    const edge = (key: string) => v.edges.find((e) => e.key === key)!
    expect(edge('signin').says).toBe('5 people have signed in through Microsoft, Google and password.')
    expect(edge('company').says).toBe('2 companies here are real, not seed.')
    expect(edge('email').says).toBe('40 emails have been sent.')
    expect(edge('teams').says).toBe('12 messages have been posted to Teams through a Workflows link.')
    expect(edge('cron').says).toBe('The daily job last ran 16 hours ago, every job clean.')
    expect(edge('watch').says).toBe('3 messages have reached staff. No failure recorded in the last day.')
  })

  it('a database whose tables lag the code is set up, not proven, and the fix is the build flag', () => {
    const v = assess({ ...READY, db: { reachable: true, schemaCurrent: false, ms: 90 } }, NOW)
    const db = v.edges.find((e) => e.key === 'database')!
    expect(db.state).toBe('SET')
    expect(db.fix).toBe('Set DB_PUSH_ON_BUILD=1, redeploy, then unset it.')
  })

  it('a daily job that has not run in two days is set up, not proven', () => {
    const v = assess({ ...READY, cron: { tracked: true, lastRunAt: new Date('2026-09-11T06:00:00Z'), lastBroke: 0 } }, NOW)
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

describe('who a person asks about their data', () => {
  it('the privacy contact reads as missing while no address is named, and says how to name one', () => {
    const e = assess({ ...READY, privacyContact: false }, NOW).edges.find((x) => x.key === 'privacy')!
    expect(e.state).toBe('MISSING')
    expect(e.fix).toContain('ETYME_PRIVACY_EMAIL')
  })

  it('the privacy contact is set once an address somebody owns is named, and never blocks ready on its own', () => {
    const v = assess(READY, NOW)
    expect(v.edges.find((x) => x.key === 'privacy')!.state).toBe('SET')
    expect(assess({ ...READY, privacyContact: false }, NOW).ready).toBe(v.ready)
  })

  it('the readiness fact is read from the same door Your data reads', () => {
    expect(readFileSync(join(process.cwd(), 'src/lib/readiness-facts.ts'), 'utf8')).toContain('privacyContact: contactEmail() !== null')
  })
})

describe('replies by email', () => {
  const inboundOf = (inbound: ReadinessFacts['inbound']) =>
    assess({ ...TODAY, inbound }, NOW).edges.find((e) => e.key === 'inbound')!

  it('replies by email read as missing until the signing secret is set, and the row names RESEND_INBOUND_SECRET and says the buttons still work', () => {
    const e = inboundOf({ secretSet: false, signedDeliveries: 0 })
    expect(e.state).toBe('MISSING')
    expect(e.says).toContain('The answer buttons still work.')
    expect(e.fix).toContain('RESEND_INBOUND_SECRET')
    expect(inboundOf(undefined).state).toBe('MISSING')
  })

  it('with the secret set and no signed reply yet, replies by email are set up and never used', () => {
    const e = inboundOf({ secretSet: true, signedDeliveries: 0 })
    expect(e.state).toBe('SET')
    expect(e.says).toBe('The signing secret is set. No signed reply has arrived yet.')
  })

  it('a signed reply that cannot be told apart from a button answer leaves the edge set up, never proven', () => {
    const e = inboundOf({ secretSet: true, signedDeliveries: null })
    expect(e.state).toBe('SET')
    expect(e.says).toContain('cannot read as proven')
  })

  it('replies by email are proven by the first signed delivery, and say how many', () => {
    const e = inboundOf({ secretSet: true, signedDeliveries: 1 })
    expect(e.state).toBe('PROVEN')
    expect(e.says).toBe('1 signed reply has arrived from the email provider.')
  })

  it('replies by email never block ready on their own, because the answer buttons carry the loop', () => {
    expect(assess({ ...READY, inbound: { secretSet: false, signedDeliveries: 0 } }, NOW).ready).toBe(true)
  })

  it('the fact names the secret and never reads its value into the answer', () => {
    const src = read('src/lib/readiness-facts.ts')
    expect(src).toContain('Boolean(process.env[INBOUND_SECRET_ENV])')
    expect(src).toContain('signedDeliveries: null')
  })
})
