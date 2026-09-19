import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { chaseCredentials, lookAtCredentials } from '@/lib/credential-chase'

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
const HER = 'colleen.byrne@seed.etyme.invalid'

describe('the nightly chase asking a nurse for her renewal', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 600_000)

  const herPacket = async () =>
    prisma.documentPacket.findFirst({
      where: {
        packetKey: 'CREDENTIAL_RENEWAL',
        subjectPerson: { primaryEmail: HER },
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
})
