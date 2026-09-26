import { describe, it, expect, beforeAll } from 'vitest'
import { req, resetDatabase } from './harness'
import { seedWorld } from '@/lib/seed-world'

/**
 * Every job the nightly run calls, run once against a seeded world.
 *
 * `/ready` said "the daily job ran 10 hours ago and 1 job failed", and
 * there was no way to find out which without signing in to production.
 * The run records it and staff are emailed, but nothing here would have
 * caught a job that breaks before it ships.
 *
 * The daily route fans out to every sub-job over HTTP and reports how
 * many failed. This calls each handler directly, against the same seeded
 * world the founder clicks through, and fails by name. It is deliberately
 * shallow: it proves each job runs to completion and answers, not that it
 * did the right thing — every job has its own test for that. What it
 * catches is the class that has actually bitten here twice: a job nobody
 * ran after a schema or a vocabulary change.
 *
 * The list is read off the daily route itself, so a job added there and
 * not here cannot hide.
 */

const JOBS = [
  'auto-approve', 'due-cycles', 'end-contracts', 'retention', 'rolloff-scan',
  'visa-watch', 'agreement-terms', 'loose-ends', 'expire-invitations',
  'cold-openings', 'proactive-match', 'freshness-ping', 'deliver-webhooks',
  'watch', 'reap-demos',
] as const

const outcome: Record<string, { status: number; body: unknown; threw?: string }> = {}

describe('every job the nightly run calls', () => {
  beforeAll(async () => {
    process.env.CRON_SECRET = 'integration-cron-secret'
    await resetDatabase()
    await seedWorld()
    for (const job of JOBS) {
      try {
        const mod = await import(`@/app/api/cron/${job}/route`)
        const handler = mod.GET ?? mod.POST
        const res = await handler(
          req('GET', `/api/cron/${job}`, undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` })
        )
        outcome[job] = { status: res.status, body: await res.json().catch(() => null) }
      } catch (e) {
        outcome[job] = { status: 0, body: null, threw: String((e as Error)?.message ?? e) }
      }
    }
  }, 900_000)

  it('is the same list of jobs the daily run actually fans out to', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/cron/daily/route.ts', 'utf8')
    )
    const listed = [...source.matchAll(/\{ path: '([a-z-]+)'/g)].map((m) => m[1])
    expect(listed.sort()).toEqual([...JOBS].sort())
  })

  it('every nightly job answers rather than throwing', () => {
    const threw = Object.entries(outcome).filter(([, o]) => o.threw)
    expect(
      threw.map(([j, o]) => `${j}: ${o.threw}`),
      'a job that throws takes the whole nightly run down with it'
    ).toEqual([])
  })

  it('every nightly job runs clean on a world that has just been seeded', () => {
    const failed = Object.entries(outcome)
      .filter(([, o]) => o.status !== 200)
      .map(([j, o]) => `${j} answered ${o.status}: ${JSON.stringify(o.body).slice(0, 200)}`)
    expect(failed, 'these jobs would be the "1 job failed" line on /ready').toEqual([])
  })

  it('refuses the scheduler’s own door to anybody without the secret', async () => {
    const mod = await import('@/app/api/cron/due-cycles/route')
    const res = await mod.GET(req('GET', '/api/cron/due-cycles'))
    expect(res.status).toBe(401)
    const wrong = await mod.GET(req('GET', '/api/cron/due-cycles', undefined, { authorization: 'Bearer undefined' }))
    expect(wrong.status, 'the literal string "Bearer undefined" was once a way in').toBe(401)
  })
})
