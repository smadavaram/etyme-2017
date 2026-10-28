import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { chaseCredentials, lookAtCredentials } from '@/lib/credential-chase'
import { formatDayLong } from '@/lib/format-date'

/**
 * The renewal Colleen Byrne is asked for, and who asks her.
 *
 * Her seat has said "the renewal has been asked for" since the day she
 * was seeded, and until today that sentence was true only because
 * `seed-doors` typed a document request in by hand. The arithmetic that
 * decides it is time to ask existed and nothing called it: the watcher
 * returned early on anything belonging to a person.
 *
 * So the ask on her door is now one the product raised — the same call
 * `api/cron/watch` makes every night, over the same rows — and these are
 * the sentences that keep it that way. A prop and a product look
 * identical on a screenshot, which is why this is a test and not a walk.
 */
const SEEDED = 'colleen.byrne@seed.etyme.invalid'
/**
 * The seeded world gives her a reserved demo address, and nothing is ever
 * mailed to one, so the ask the seed raised told her in the app only. To
 * read the email she is owed, the suite moves her to the .test name it
 * uses for a real address, withdraws the seeded ask, and lets the same
 * nightly call raise it again.
 */
const HER = 'colleen.byrne@halcyon.test'
const it_: Record<string, string> = {}

describe('the nightly chase asking a nurse for her renewal', () => {
  beforeAll(async () => {
    await freshWorld()
    const her = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SEEDED }, select: { id: true } })
    it_.her = her.id
    const seeded = await prisma.documentPacket.findFirstOrThrow({
      where: { packetKey: 'CREDENTIAL_RENEWAL', subjectPersonId: her.id, cancelledAt: null },
      select: { id: true },
    })
    it_.seededPacket = seeded.id
    await prisma.documentPacket.update({ where: { id: seeded.id }, data: { cancelledAt: new Date() } })
    await prisma.person.update({ where: { id: her.id }, data: { primaryEmail: HER } })
    await chaseCredentials(new Date())
    // The notice is written in the background; wait for its row.
    for (let i = 0; i < 50; i++) {
      const packet = await herPacket()
      if (packet && (await prisma.notification.count({ where: { personId: her.id, entityId: packet.id } })) > 0) break
      await new Promise((r) => setTimeout(r, 100))
    }
  }, 600_000)

  const herPacket = async () =>
    prisma.documentPacket.findFirst({
      where: {
        packetKey: 'CREDENTIAL_RENEWAL',
        subjectPerson: { primaryEmail: HER },
        cancelledAt: null,
      },
      include: { items: true, company: { select: { name: true, slug: true } } },
    })

  it('asks her for the renewal without anybody typing it into the seed', async () => {
    const packet = await herPacket()
    expect(packet, 'the seeded world holds no renewal ask, so her door shows a promise nothing kept').toBeTruthy()
    expect(packet!.items).toHaveLength(1)
    expect(packet!.items[0].key).toBe('PROFESSIONAL_LICENSE')
    expect(packet!.items[0].required).toBe(true)
  })

  it('asks the firm that places her to do the asking, and never the client she works at', async () => {
    const packet = await herPacket()
    expect(packet!.company.slug).toContain('halcyon')
  })

  it('tells her why she is being asked, in a sentence that names her board and the days she has left', async () => {
    const packet = await herPacket()
    expect(packet!.reopenedReason).toContain('Wisconsin Board of Nursing')
    expect(packet!.reopenedReason).toMatch(/runs out in \d+ days/)
  })

  it('the renewal request stored for her names the firm asking, never “us”', async () => {
    const packet = await herPacket()
    expect(packet!.reopenedReason).toContain(packet!.company.name)
    expect(packet!.reopenedReason).not.toMatch(/\bus\b/)
    expect(packet!.reopenedReason).not.toContain('the firm placing you')
  })

  it('sends the ask to her own address, so the link is hers rather than her agency’s', async () => {
    const packet = await herPacket()
    expect(packet!.recipientEmail).toBe(HER)
    expect(packet!.token.length).toBeGreaterThan(20)
    expect(packet!.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('writes down that it did this by itself, why, and that cancelling the request undoes it', async () => {
    const packet = await herPacket()
    const log = await prisma.automationLog.findFirst({
      where: { action: 'PACKET_REOPENED', payload: { path: ['packetId'], equals: packet!.id } },
    })
    expect(log, 'anything done unprompted writes an automation log — CLAUDE.md').toBeTruthy()
    expect(log!.reason).toContain('license')
    expect(log!.reversible).toBe(true)
    expect(log!.summary).toContain('Colleen Byrne')
  })

  it('tells her by email as well, because a license running out is worth leaving the app for', async () => {
    const packet = await herPacket()
    const her = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HER }, select: { id: true } })
    const told = await prisma.notification.findFirst({
      where: { personId: her.id, entityId: packet!.id },
    })
    expect(told, 'the person who can renew it is the person who hears about it').toBeTruthy()
    expect(told!.channel).toBe('EMAIL')
    expect(told!.body).toContain(`/packet/${packet!.token}`)
  })

  it('at a seeded demo address she is told in the app and never mailed, because nobody can own that address', async () => {
    const told = await prisma.notification.findFirst({
      where: { personId: it_.her, entityId: it_.seededPacket },
    })
    expect(told, 'the ask the seed raised still reached her').toBeTruthy()
    expect(told!.channel).toBe('IN_APP')
  })

  it('reads her license as the one thing worth chasing tonight, and says so in the third person to the desk', async () => {
    const findings = await lookAtCredentials(new Date())
    const hers = findings.find((f) => f.headline.includes('Colleen Byrne'))
    expect(hers, JSON.stringify(findings.map((f) => f.headline))).toBeTruthy()
    expect(hers!.detail).toContain("Colleen Byrne's")
    expect(hers!.detail).toContain('WI')
    expect(hers!.action).toBe('REOPEN_PACKET')
  })

  it('does not ask her twice when it runs again the next night', async () => {
    const before = await prisma.documentPacket.count({
      where: { packetKey: 'CREDENTIAL_RENEWAL', subjectPerson: { primaryEmail: HER } },
    })
    const again = await chaseCredentials(new Date())
    const after = await prisma.documentPacket.count({
      where: { packetKey: 'CREDENTIAL_RENEWAL', subjectPerson: { primaryEmail: HER } },
    })
    expect(after).toBe(before)
    expect(again.asked).toEqual([])
  }, 60_000)

  it('says nothing about a consultant who holds no license, which is an answer rather than a gap', async () => {
    const findings = await lookAtCredentials(new Date())
    const named = findings.map((f) => f.headline)
    expect(named.some((h) => h.includes('Karthik Menon'))).toBe(false)
    expect(named.some((h) => h.includes('Helena Marsh'))).toBe(false)
  })
  it('says the day her answer is due, fourteen days before her license lapses, while the link stays open longer', async () => {
    const packet = await herPacket()
    const license = await prisma.verification.findFirstOrThrow({
      where: { personId: it_.her, type: 'PROFESSIONAL_LICENSE' },
      orderBy: { expiresAt: 'desc' },
      select: { expiresAt: true },
    })
    const due = new Date(license.expiresAt!.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
    expect(packet!.reopenedReason).toContain(`Please send it by ${formatDayLong(due)}.`)
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'PACKET_REOPENED', payload: { path: ['packetId'], equals: packet!.id } },
    })
    expect((log.payload as any).dueOn).toBe(due)
    // The link outlives the due day, so a late answer can still be sent.
    expect(packet!.expiresAt.getTime()).toBeGreaterThan(new Date(`${due}T23:59:59Z`).getTime())
  })

  it('a paper already lapsed is asked for once, due today, and not again the next night', async () => {
    const open = await herPacket()
    await prisma.documentPacket.update({ where: { id: open!.id }, data: { cancelledAt: new Date() } })
    const license = await prisma.verification.findFirstOrThrow({
      where: { personId: it_.her, type: 'PROFESSIONAL_LICENSE' },
      orderBy: { expiresAt: 'desc' },
      select: { id: true, expiresAt: true },
    })
    const lapsed = new Date(Date.now() - 3 * 86_400_000)
    await prisma.verification.update({ where: { id: license.id }, data: { expiresAt: lapsed } })
    try {
      const now = new Date()
      await chaseCredentials(now)
      const asked = await herPacket()
      expect(asked, 'a lapsed license is asked for').toBeTruthy()
      expect(asked!.id).not.toBe(open!.id)
      expect(asked!.reopenedReason).toContain(`Please send it by ${formatDayLong(now.toISOString().slice(0, 10))}.`)

      const count = () => prisma.documentPacket.count({
        where: { packetKey: 'CREDENTIAL_RENEWAL', subjectPerson: { primaryEmail: HER }, cancelledAt: null },
      })
      const before = await count()
      const tomorrow = new Date(now.getTime() + 86_400_000)
      const again = await chaseCredentials(tomorrow)
      expect(await count(), 'the request fell due yesterday and its link is still alive, so nobody is asked twice').toBe(before)
      expect(again.asked).toEqual([])
    } finally {
      await prisma.verification.update({ where: { id: license.id }, data: { expiresAt: license.expiresAt } })
    }
  }, 60_000)

  it('a renewal is not asked for a party whose set was never confirmed, and the night says why', async () => {
    const open = await herPacket()
    await prisma.documentPacket.update({ where: { id: open!.id }, data: { cancelledAt: new Date() } })
    const { workerPartyAt } = await import('@/lib/document-stages/chase-gate')
    const party = await workerPartyAt(it_.her, open!.companyId)
    const held = await prisma.documentRequirement.findMany({ where: { companyId: open!.companyId, party } })
    expect(held.length, 'the seed confirmed the placing firm\u2019s set for her party').toBeGreaterThan(0)
    await prisma.documentRequirement.deleteMany({ where: { companyId: open!.companyId, party } })
    try {
      const night = await chaseCredentials(new Date())
      expect(await herPacket(), 'nothing is asked of her while the set is not confirmed').toBeNull()
      const why = night.couldNotAct.find((l) => l.includes('Colleen Byrne'))
      expect(why, JSON.stringify(night.couldNotAct)).toMatch(/until you confirm what you require of them, under Setup → Papers you require\.$/)
    } finally {
      await prisma.documentRequirement.createMany({ data: held.map(({ id: _id, createdAt: _c, updatedAt: _u, ...r }) => r) })
    }
    // Confirmed again, the next night asks her.
    await chaseCredentials(new Date())
    expect(await herPacket()).toBeTruthy()
  }, 60_000)
})
