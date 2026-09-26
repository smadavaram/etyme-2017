import { describe, it, expect, beforeAll } from 'vitest'
import { req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as watch } from '@/app/api/cron/watch/route'

/**
 * The nightly watch says a thing once, at each rung.
 *
 * It wrote the same rows every run, forever. A certificate that expired
 * in March told the same compliance officer the same sentence every
 * night since — which is the failure CLAUDE.md names in so many words:
 * a warning that always fires is a click, not a warning. The lapse
 * letters beside it were keyed the same day; these are the findings.
 */
describe('what the nightly watch says, and how often', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    process.env.CRON_SECRET = 'integration-cron-secret'
  }, 600_000)

  const run = async () =>
    json(
      await watch(
        req('GET', '/api/cron/watch', undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` }) as never
      )
    )

  it('tells the desks that can act what it found, the first night it finds it', async () => {
    const { status, body } = await run()
    expect(status).toBe(200)
    expect(body.data.told, 'a watch that tells nobody proves nothing about telling them twice').toBeGreaterThan(0)
  })

  it('says nothing at all on a second run the same night', async () => {
    const before = await prisma.notification.count()
    const { body } = await run()
    const after = await prisma.notification.count()
    expect(body.data.told, 'the same findings, said again').toBe(0)
    expect(after - before, 'rows written by a run that found nothing new').toBe(0)
  })

  it('and a third run writes no rows either, so a month of nights is a month of silence', async () => {
    const before = await prisma.notification.count()
    await run()
    expect(await prisma.notification.count()).toBe(before)
  })
})
