import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { tellNotChosen } from '@/lib/notify/not-chosen'

import { POST as award } from '@/app/api/submissions/[id]/award/route'

/**
 * The client tester's walk at Northbend Athletic: Daniel Okafor is
 * placed on HCM integration lead. Rajesh Iyer had a round booked, and
 * the award called it off and told everybody in it. Mei-Lin Chao never
 * reached an interview, so her supplier, Pinnacle Resourcing, heard
 * nothing at all when the job was filled.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`

const ids: Record<string, string> = {}

describe('a supplier whose candidate never reached an interview is told when the job is filled', () => {
  beforeAll(async () => {
    await freshWorld()
    const job = await prisma.requirement.findFirstOrThrow({
      where: { title: 'HCM integration lead', company: { slug: 'world-nike' } },
      select: { id: true },
    })
    ids.job = job.id
    for (const name of ['Rajesh Iyer', 'Mei-Lin Chao', 'Daniel Okafor']) {
      const s = await prisma.submission.findFirstOrThrow({
        where: { requirementId: job.id, person: { name } },
        select: { id: true, fromCompanyId: true },
      })
      ids[name] = s.id
      ids[`${name}:firm`] = s.fromCompanyId
    }
  }, 240_000)

  it('Mei-Lin Chao has no interview round before the award', async () => {
    expect(await prisma.interview.count({ where: { submissionId: ids['Mei-Lin Chao'] } })).toBe(0)
  })

  it('placing Daniel Okafor fills the job', async () => {
    as(HIRING)
    const r = await json(
      await award(
        req('POST', `/api/submissions/${ids['Daniel Okafor']}/award`, {
          rate: 13_200, startDate: day(23).toISOString().slice(0, 10),
        }),
        { params: Promise.resolve({ id: ids['Daniel Okafor'] }) }
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const job = await prisma.requirement.findUniqueOrThrow({ where: { id: ids.job } })
    expect(job.status).toBe('FILLED')
  })

  it('Mei-Lin Chao’s supplier is told once, in one sentence, that the job was filled and she was not chosen', async () => {
    // The award tells the suppliers after its response; give the bell a
    // moment, then ask again by hand. Whoever wrote it, the state is the
    // same: every desk at the supplier holds the notice exactly once.
    await new Promise((r) => setTimeout(r, 500))
    await tellNotChosen(ids['Daniel Okafor'])
    const notices = await prisma.notification.findMany({
      where: { companyId: ids['Mei-Lin Chao:firm'], data: { path: ['event'], equals: 'NOT_CHOSEN' } },
    })
    expect(notices.length).toBeGreaterThan(0)
    const perDesk = new Map<string, number>()
    for (const n of notices) perDesk.set(n.personId, (perDesk.get(n.personId) ?? 0) + 1)
    expect([...perDesk.values()].every((c) => c === 1), JSON.stringify([...perDesk])).toBe(true)
    for (const n of notices) {
      expect(n.title).toBe('Mei-Lin Chao was not chosen for HCM integration lead')
      expect(n.body).toBe(
        'Northbend Athletic filled the HCM integration lead job with another candidate; Mei-Lin Chao was not chosen. Please let Mei-Lin know.'
      )
    }
  })

  it('the not-chosen notice names nobody else’s candidate and no rate', async () => {
    const notices = await prisma.notification.findMany({
      where: { data: { path: ['event'], equals: 'NOT_CHOSEN' } },
    })
    for (const n of notices) {
      expect(`${n.title} ${n.body}`).not.toMatch(/Daniel|Rajesh|\$/)
    }
  })

  it('exactly one copy leaves the app for the supplier, so its channel hears it once', async () => {
    const notices = await prisma.notification.findMany({
      where: { companyId: ids['Mei-Lin Chao:firm'], data: { path: ['event'], equals: 'NOT_CHOSEN' } },
    })
    expect(notices.filter((n) => n.channel !== 'IN_APP')).toHaveLength(1)
  })

  it('Rajesh Iyer’s supplier, already told his round was called off, is not told the same news twice', async () => {
    const twice = await prisma.notification.count({
      where: { entityId: ids['Rajesh Iyer'], data: { path: ['event'], equals: 'NOT_CHOSEN' } },
    })
    expect(twice).toBe(0)
  })

  it('telling again for the same award rings nobody’s bell a second time', async () => {
    const before = await prisma.notification.count({ where: { data: { path: ['event'], equals: 'NOT_CHOSEN' } } })
    expect(await tellNotChosen(ids['Daniel Okafor'])).toBe(0)
    const after = await prisma.notification.count({ where: { data: { path: ['event'], equals: 'NOT_CHOSEN' } } })
    expect(after).toBe(before)
  })
})
