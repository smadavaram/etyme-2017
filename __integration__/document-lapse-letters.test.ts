import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { documentsToChase } from '@/lib/document-request'
import {
  tellDocumentLapses,
  tellAbout,
  documentsNeverFiled,
  sendDocumentLapses,
  type LapseLetter,
} from '@/lib/notify/documents'

/**
 * The last crack in the loop, closed on the seeded world.
 *
 * "Ensure the loop of documents never cracks between parties." The watch
 * already knew what was running out and who owed it. Nothing wrote to
 * anybody — so a certificate could lapse under a person standing on a
 * client's site and the only party who found out was whoever happened to
 * open a screen.
 *
 * These are the letters, on the world as it is seeded: Cavanaugh
 * Glassworks, which sent Wrenfield Technical a purchase order and never
 * papered an agreement, and the three-rung chains where a client buys
 * from a prime that buys from a sub-vendor it may not name.
 */

const D = '@demo.etyme.local'

async function firm(slug: string) {
  return prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true, name: true } })
}

async function person(email: string) {
  return prisma.person.findFirstOrThrow({ where: { primaryEmail: email }, select: { id: true, name: true } })
}

function to(letters: LapseLetter[], personId: string): LapseLetter[] {
  return letters.filter((l) => l.personId === personId)
}

describe('when a document a line depends on runs out, every party it costs is told', () => {
  let cavanaughLine = ''

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const wrenfield = await firm('world-wrenfield')
    const order = await prisma.workOrder.findFirstOrThrow({
      where: { issuedToId: wrenfield.id },
      select: { id: true },
    })
    cavanaughLine = (
      await prisma.sellContract.findFirstOrThrow({ where: { workOrderId: order.id }, select: { id: true } })
    ).id
  }, 900_000)

  it('the agreement Cavanaugh’s order requires and nobody ever signed reaches Wrenfield’s owner and Cavanaugh’s compliance officer', async () => {
    const now = new Date()
    const missing = await documentsNeverFiled(now, { sellContractIds: [cavanaughLine] })
    const msa = missing.find((m) => m.key === 'MSA')
    expect(msa, 'the order asks for an agreement and there is none on file').toBeTruthy()
    expect(msa!.owedBy).toBe('SUPPLIER')
    expect(msa!.neverFiled).toBe(true)

    const told = await tellAbout([msa!], now)
    expect(told.leftToDemand, 'an agreement nobody papered has no row for demand to warn about').toBe(0)

    const wrenfieldOwner = await person(`world-wrenfield${D}`)
    const officer = await person(`world-corning-compliance${D}`)

    const chase = to(told.letters, wrenfieldOwner.id)
    expect(chase.length, 'the firm that owes it is asked for it').toBe(1)
    expect(chase[0].side).toBe('OWES')
    expect(chase[0].title).toBe('Master service agreement is not on file')
    expect(chase[0].body).toContain('Cavanaugh Glassworks requires a master service agreement from Wrenfield Technical')
    expect(chase[0].body).toContain('File it on your Compliance page.')
    // An agreement is not one of the five things that stop work, so the
    // letter says what the line says and no more: it is owed, and the
    // start proceeds with the reason on the record.
    expect(chase[0].data.stopsWork).toBe(false)
    expect(chase[0].body).toContain('It stops nothing on its own')
    expect(chase[0].body).not.toContain('Nobody can start')

    const notice = to(told.letters, officer.id)
    expect(notice.length, 'the client whose site it covers is told').toBe(1)
    expect(notice[0].side).toBe('EXPOSED')
    expect(notice[0].body).toContain('a master service agreement, owed by Wrenfield Technical')
    expect(notice[0].body).toContain('is not on file')
    // An agreement between two firms is the firms', never the
    // contractor's: nobody reads that Elsa Thornquist mislaid an MSA.
    expect(notice[0].body).not.toContain('held by')
    // Wrenfield is the firm Cavanaugh pays, so its name was never
    // anybody's to withhold.
    expect(notice[0].body).toContain('Wrenfield Technical')
    expect(notice[0].body).toContain('Ask Wrenfield Technical for it.')

    // The program manager runs the program and holds the rule, so they
    // hear too; the AP clerk and the hiring manager do not.
    const ap = await person(`world-corning-ap${D}`)
    const hiring = await person(`world-corning-hiring${D}`)
    expect(to(told.letters, ap.id)).toEqual([])
    expect(to(told.letters, hiring.id)).toEqual([])
  })

  it('a check running out inside the window reaches the contractor on email and the desks above them on their own channel', async () => {
    // Two hundred days on, the background checks seeded at two hundred
    // and fifty days are fifty days from running out — inside the watch's
    // own sixty-day window.
    const now = day(200)
    const watch = await documentsToChase(now)
    expect(watch.lapsing.length + watch.lapsed.length, 'the watch has something to say').toBeGreaterThan(0)

    const told = await tellDocumentLapses(watch, now)
    expect(told.letters.length).toBeGreaterThan(0)

    const chases = told.letters.filter((l) => l.side === 'OWES')
    const notices = told.letters.filter((l) => l.side === 'EXPOSED')
    expect(chases.length, 'somebody is asked').toBeGreaterThan(0)
    expect(notices.length, 'somebody is told').toBeGreaterThan(0)

    // A worker is a candidate: email only, because a consultant is in
    // nobody's Teams tenant.
    for (const c of chases.filter((l) => l.data.owedBy === 'WORKER')) {
      expect(c.audience).toBe('candidate')
      expect(c.channel).toBe('EMAIL')
      expect(c.body).toContain('your own paperwork page')
    }
    for (const n of notices) {
      expect(n.audience).toBe('business')
      expect(n.body).toContain('A document one of your')
      expect(n.body).toMatch(/Ask .+ for it\./)
    }

    // A background check warns and has never blocked, so no letter about
    // one says anybody has to stop.
    for (const l of told.letters.filter((x) => x.data.documentKey === 'BACKGROUND_CHECK')) {
      expect(l.data.stopsWork).toBe(false)
      expect(l.body).toContain('It stops nothing on its own')
      expect(l.body).not.toContain('cannot be on site')
    }
  })

  it('a client reads the standing of a firm two rungs down and never its name, while the prime that pays it reads the name', async () => {
    const now = day(200)
    const told = await tellDocumentLapses(await documentsToChase(now), now)

    // The seeded chain that is three rungs deep: Harlow Health buys from
    // Computer Systems Inc, which buys from CloudEPA, which employs the
    // person standing on Harlow's site.
    const client = await firm('world-harlow-health')
    const prime = await firm('world-computer-systems')
    const sub = await firm('world-cloudepa')

    const bottom = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: sub.id, clientCompanyId: prime.id, state: 'IN_PROGRESS' },
      select: { personId: true },
    })
    // Every letter about that person, whichever row it came off.
    const theirs = await prisma.verification.findMany({
      where: { personId: bottom.personId! },
      select: { id: true },
    })
    const ids = new Set(theirs.map((v) => v.id))
    const about = told.letters.filter((l) => ids.has(l.data.documentId))
    expect(about.length, 'the person two rungs down has something running out').toBeGreaterThan(0)

    const atClient = about.filter((l) => l.companyId === client.id)
    expect(atClient.length, 'the client whose site they stand on is told').toBeGreaterThan(0)
    for (const l of atClient) {
      expect(l.body, 'the sub-vendor below the prime is never named to the client').not.toContain(sub.name)
      expect(l.body).toContain('at the firm supplied through Computer Systems Inc')
      // The standing is never withheld, and neither is who to call.
      expect(l.body).toContain('Ask Computer Systems Inc for it.')
      expect(l.logSummary).not.toContain(sub.name)
      expect(l.logSummary).toContain('supplied through Computer Systems Inc')
    }

    const atPrime = about.filter((l) => l.companyId === prime.id)
    expect(atPrime.length, 'the prime that pays that firm is told too').toBeGreaterThan(0)
    for (const l of atPrime) {
      // Its own supplier, which it has a contract with. Nothing withheld.
      expect(l.body).toContain(sub.name)
      expect(l.body).not.toContain('supplied through')
    }
  })

  it('the letters are sent once, each leaves one log row naming the document and the day, and the next night says nothing', async () => {
    const now = day(200)
    const first = await tellDocumentLapses(await documentsToChase(now), now)
    const sent = await sendDocumentLapses(first.letters.slice(0, 6), now)
    expect(sent.letters.length).toBe(Math.min(6, first.letters.length))
    expect(sent.logged).toBe(sent.letters.length)

    for (const l of sent.letters) {
      const row = await prisma.automationLog.findFirstOrThrow({
        where: { action: 'DOCUMENT_LAPSE_TOLD', payload: { path: ['documentId'], equals: l.data.documentId } },
        orderBy: { at: 'desc' },
      })
      expect(row.reason).toMatch(/runs out on|ran out on|was never filed/)
      expect(row.summary.length).toBeGreaterThan(10)
      expect(row.reversible).toBe(false)
      // The row says who was told by role, never by name.
      const payload = row.payload as { told?: string }
      expect(payload.told).toMatch(/desk/)
    }

    // The same night again, and the same milestone: nothing new to say.
    const second = await tellDocumentLapses(await documentsToChase(now), now)
    const saidAgain = second.letters.filter((l) => sent.letters.some((s) => s.saidKey === l.saidKey))
    expect(saidAgain, 'nobody is told the same milestone twice').toEqual([])
  })

  it('an agreement with a term on it is left to the letters that already go for it', async () => {
    const wrenfield = await firm('world-wrenfield')
    const cavanaugh = await firm('world-corning')
    // Paper the agreement that was missing, with a date inside the
    // window, and the watch's own letters stop being this file's to
    // write — `cron/agreement-terms` tells both signers about it.
    const now = new Date()
    const dated = {
      id: 'x',
      key: 'MSA',
      document: 'Master service agreement',
      line: { side: 'SELL' as const, id: cavanaughLine },
      owedBy: 'SUPPLIER' as const,
      owedByName: wrenfield.name,
      personId: null,
      companyId: wrenfield.id,
      tellCompanyId: cavanaugh.id,
      expiresAt: day(30),
      daysLeft: 30,
      lapsed: false,
      neverFiled: false,
      stopsWork: true,
    }
    const told = await tellAbout([dated], now)
    expect(told.letters).toEqual([])
    expect(told.leftToDemand).toBe(1)
  })
})
