import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { day } from '@/lib/seed-days'
import { documentsToChase } from '@/lib/document-request'
import {
  tellDocumentLapses,
  tellAbout,
  documentsNeverFiled,
  sendDocumentLapses,
  everyDocumentLetter,
  supplierCoverLapses,
  gateTonight,
  withheldFindings,
  CHASE_DESK,
  EXPOSED_DESK,
  type LapseLetter,
} from '@/lib/notify/documents'
import { hasPermission } from '@/lib/permissions'
import { lineExtras, lineExtrasForSellLines } from '@/lib/contract-clearance'

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
    await freshWorld()

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

  it('a background check running out inside the window reaches the firm that ordered it and the firms above, and never asks the contractor for a report she never holds', async () => {
    // Two hundred days on, the background checks seeded at two hundred
    // and fifty days are fifty days from running out — inside the watch's
    // own sixty-day window.
    const now = day(200)
    const watch = await documentsToChase(now)
    expect(watch.lapsing.length + watch.lapsed.length, 'the watch has something to say').toBeGreaterThan(0)

    const told = await tellDocumentLapses(watch, now)
    expect(told.letters.length).toBeGreaterThan(0)

    const checks = told.letters.filter((l) => l.data.documentKey === 'BACKGROUND_CHECK')
    const orderers = checks.filter((l) => l.side === 'OWES')
    const notices = told.letters.filter((l) => l.side === 'EXPOSED')
    expect(orderers.length, 'the firm that orders the check is told').toBeGreaterThan(0)
    expect(notices.length, 'somebody is told').toBeGreaterThan(0)

    // "Who renders the verdict": the provider posts the report to the
    // firm that ordered it, so the worker is never asked to upload it.
    for (const o of orderers) {
      expect(o.audience, 'the firm, never the contractor').toBe('business')
      expect(o.data.owedBy).toBe('US')
      expect(o.body).toContain('Order a new one from your screening provider')
      expect(o.body).toContain('is asked for consent first')
      expect(o.body).not.toMatch(/upload/i)
    }
    for (const n of notices) {
      expect(n.audience).toBe('business')
      expect(n.body).toContain('A document one of your')
      expect(n.body).toMatch(/Ask .+ (for it|to order a new one)\./)
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
    // Computer Systems Inc, which buys from Techpeple, which employs the
    // person standing on Harlow's site.
    const client = await firm('world-harlow-health')
    const prime = await firm('world-computer-systems')
    const sub = await firm('world-techpeple')

    const bottom = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: sub.id, clientCompanyId: prime.id, state: 'IN_PROGRESS' },
      select: { personId: true },
      orderBy: { id: 'asc' },
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
      expect(l.body).toMatch(/Ask Computer Systems Inc (for it|to order a new one)\./)
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
      expect(payload.told).toMatch(/^the (firm that owes it|program manager and compliance officer|employer)$/)
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

  it('a supplier\u2019s lapsed cover is told to the client whose site its people stand on, by its compliance officer and program manager', async () => {
    const now = new Date()
    const pinnacle = await firm('world-pinnacle')
    const northbend = await firm('world-nike')
    // The walk's finding, on this copy of the world: Pinnacle's liability
    // cover ran out two days ago while its people stood on Northbend's site.
    await prisma.verification.updateMany({
      where: { companyId: pinnacle.id, type: 'INSURANCE_GL' },
      data: { expiresAt: new Date(now.getTime() - 2 * 86_400_000) },
    })
    const cover = (await supplierCoverLapses(now)).filter((d) => d.companyId === pinnacle.id)
    expect(cover.length, 'Pinnacle Resourcing has a certificate running out or gone').toBeGreaterThan(0)

    const told = await tellAbout(cover, now)
    const officer = await person(`world-nike-compliance${D}`)
    const manager = await person(`world-nike-programme${D}`)
    const owner = await person(`world-nike${D}`)
    const ap = await person(`world-nike-ap${D}`)

    for (const p of [officer, manager]) {
      const theirs = to(told.letters, p.id)
      expect(theirs.length, `${p.name} is told`).toBeGreaterThan(0)
      for (const l of theirs) {
        expect(l.companyId).toBe(northbend.id)
        expect(l.side).toBe('EXPOSED')
        expect(l.data.lapsed).toBe(true)
        expect(l.body).toContain('Nobody can start through that firm until it is on file.')
        expect(l.body).toContain('owed by Pinnacle Resourcing')
        expect(l.body).toContain('On your site through it:')
        expect(l.body).toContain('Ask Pinnacle Resourcing for it.')
      }
    }
    // The owner holds every desk by wildcard and is not the desk here;
    // the AP clerk cannot renew anybody's cover.
    expect(to(told.letters, owner.id)).toEqual([])
    expect(to(told.letters, ap.id)).toEqual([])
    // Pinnacle hears about its own cover from the nightly finding, not twice.
    expect(told.letters.filter((l) => l.companyId === pinnacle.id)).toEqual([])
    expect(told.unaddressed).toEqual([])
  })

  it('a night with twenty lapses writes one letter to each person who can act and none to anyone else', async () => {
    const now = new Date()
    const before = new Date(Date.now() - 1000)
    const night = await everyDocumentLetter(now)
    expect(night.letters.length, 'the seeded world has at least twenty papers to tell tonight').toBeGreaterThanOrEqual(20)

    const sent = await sendDocumentLapses(night.letters, now)
    // Tonight's letters, read back by the keys they carry, so nothing else
    // the night wrote is counted as one of them.
    const keys = new Set(sent.letters.map((l) => l.saidKey))
    const rows = (
      await prisma.notification.findMany({
        where: { type: 'SYSTEM', createdAt: { gte: before } },
        select: { personId: true, companyId: true, title: true, body: true, data: true },
      })
    ).filter((r) => keys.has((r.data as { saidKey?: string } | null)?.saidKey ?? ''))
    expect(rows.length).toBe(sent.people)
    const refused = await prisma.notification.findMany({
      where: { type: 'SYSTEM', createdAt: { gte: before }, deliveryState: 'FAILED' },
      select: { title: true, deliveryNote: true },
    })
    expect(refused, 'no letter was refused by the database').toEqual([])

    const perPerson = new Map<string, number>()
    for (const r of rows) perPerson.set(r.personId, (perPerson.get(r.personId) ?? 0) + 1)
    for (const [, n] of perPerson) expect(n, 'nobody reads two letters in one night').toBe(1)

    // Everybody written to either owes a paper themselves or holds a desk
    // that can act on one at the firm the letter is written in.
    const workers = new Set(sent.letters.filter((l) => l.audience === 'candidate').map((l) => l.personId))
    for (const r of rows) {
      if (workers.has(r.personId)) continue
      const seat = await prisma.context.findFirst({
        where: { personId: r.personId, companyId: r.companyId, revokedAt: null },
        select: { role: { select: { permissions: true } } },
      })
      const held = (seat?.role?.permissions ?? []) as string[]
      expect([...CHASE_DESK, ...EXPOSED_DESK].some((p) => hasPermission(held, p)), `${r.title} went to somebody with no desk`).toBe(true)
    }

    // The client's owner, its AP clerk and its hiring manager are not the
    // desk for papers, and the first night wrote to the owner twenty-one times.
    for (const email of [`world-nike${D}`, `world-nike-ap${D}`, `world-nike-hiring${D}`]) {
      const p = await person(email)
      expect(perPerson.get(p.id) ?? 0, `${email} is not written to`).toBe(0)
    }

    // A person's paper is said about the person in every letter.
    for (const r of rows) {
      expect(r.body).not.toMatch(/proof of right to work[^\n]*\. Nobody can start through/)
      expect(r.body).not.toMatch(/background check[^\n]*Upload/i)
    }

    // And the next night, with nothing new, writes to nobody.
    const again = await everyDocumentLetter(now)
    expect(again.letters, 'every fact folded into tonight\u2019s letters is remembered').toEqual([])
  })

  it('the firm\u2019s own findings ride in the same one letter as a person\u2019s papers, and a person with only findings reads them as worded', async () => {
    const now = day(200)
    const before = new Date(Date.now() - 1000)
    const night = await tellDocumentLapses(await documentsToChase(now), now)
    const withPapers = night.letters[0]
    expect(withPapers, 'somebody is owed a paper on this day').toBeTruthy()
    const ap = await person(`world-nike-ap${D}`)
    const finding = (personId: string, key: string) => ({
      personId, companyId: withPapers.companyId ?? undefined, type: 'SYSTEM' as const,
      title: 'Order PO-1001 is nearly spent', body: '92% of the ceiling is billed.', entityId: `po-${key}`,
      channel: 'IN_APP' as const, data: { kinds: ['PO_NEARLY_SPENT'], saidKey: key },
      blocking: false, keys: [key],
    })
    const sent = await sendDocumentLapses(night.letters, now, prisma, {
      findings: [finding(withPapers.personId, 'PO_NEARLY_SPENT:a'), finding(ap.id, 'PO_NEARLY_SPENT:b')],
    })
    expect(sent.findingsTold).toBe(2)

    const rows = await prisma.notification.findMany({
      where: { type: 'SYSTEM', createdAt: { gte: before }, personId: { in: [withPapers.personId, ap.id] } },
      select: { personId: true, title: true, body: true, data: true },
    })
    const mine = rows.filter((r) => r.personId === withPapers.personId)
    expect(mine.length, 'one message, not two').toBe(1)
    expect(mine[0].body).toContain('Order PO-1001 is nearly spent')
    const keys = (mine[0].data as { saidKey: string; alsoSaid: string[] })
    expect([keys.saidKey, ...keys.alsoSaid]).toContain('PO_NEARLY_SPENT:a')

    const apRows = rows.filter((r) => r.personId === ap.id)
    expect(apRows.map((r) => r.title)).toEqual(['Order PO-1001 is nearly spent'])

    // Every paper in the one letter left its own log row.
    for (const l of sent.letters.filter((x) => x.personId === withPapers.personId)) {
      const row = await prisma.automationLog.findFirst({
        where: { action: 'DOCUMENT_LAPSE_TOLD', payload: { path: ['documentId'], equals: l.data.documentId } },
        orderBy: { at: 'desc' },
        select: { payload: true },
      })
      expect(row).toBeTruthy()
    }
  })

  it('a flagged background check the ordering firm decided not to act on is not chased; one it has not decided on is told to that firm alone', async () => {
    const now = new Date()
    // Any running line that asks for a background check and has none.
    const missing = (await documentsNeverFiled(now, { limit: 500 })).find((d) => d.key === 'BACKGROUND_CHECK' && d.personId)
    expect(missing, 'a running line asks for a background check and none is on file').toBeTruthy()
    const line = { id: missing!.line!.id, personId: missing!.personId! }
    const orderer = await prisma.company.findUniqueOrThrow({ where: { id: missing!.tellCompanyId! }, select: { id: true } })
    const seat = await prisma.context.findFirstOrThrow({ where: { companyId: orderer.id, revokedAt: null }, select: { personId: true } })
    const owner = { id: seat.personId }
    const report = await prisma.verification.create({
      data: {
        personId: line.personId, type: 'BACKGROUND_CHECK', status: 'FLAGGED', provider: 'HireRight',
        referenceId: 'HR-5531', issuedAt: now, verifiedAt: now, expiresAt: new Date(now.getTime() + 365 * 86_400_000),
        orderedByCompanyId: orderer.id, uploadedById: owner.id,
      },
      select: { id: true },
    })

    const undecided = (await documentsNeverFiled(now, { sellContractIds: [line.id] })).find((d) => d.key === 'BACKGROUND_CHECK')
    expect(undecided?.flagged?.provider).toBe('HireRight')
    const told = await tellAbout([undecided!], now)
    expect(told.letters.length, 'somebody at the ordering firm is told').toBeGreaterThan(0)
    for (const l of told.letters) {
      expect(l.companyId, 'only the firm that ordered it hears').toBe(orderer.id)
      expect(l.side).toBe('OWES')
      expect(l.title).toContain('HireRight flagged')
      expect(l.body).not.toContain('not on file')
    }

    await prisma.adverseAction.create({
      data: {
        verificationId: report.id, companyId: orderer.id, sellContractId: line.id, step: 'NOT_TAKEN',
        sentAt: now, byId: owner.id, reason: 'A ten-year-old record unrelated to the work.',
      },
    })
    const decided = await documentsNeverFiled(now, { sellContractIds: [line.id] })
    expect(decided.find((d) => d.key === 'BACKGROUND_CHECK'), 'a decided report is not chased').toBeUndefined()
  })
  it('reading every running line\u2019s papers at once gives each line the same answer as reading it alone', async () => {
    const now = new Date()
    // The nightly check reads every running line; one at a time it asked
    // eight questions per line and a client of three hundred and sixty
    // people took it past half a minute. The bulk read must not change a
    // single answer, so it is compared line by line, in order.
    const lines = await prisma.sellContract.findMany({
      where: { state: { in: ['IN_PROGRESS', 'PAUSED'] } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 80,
    })
    const ids = [...lines.map((l) => l.id), cavanaughLine]
    const many = await lineExtrasForSellLines(ids, prisma, now)
    let withSets = 0
    for (const id of ids) {
      const alone = await lineExtras({ sellContractId: id }, prisma, now)
      const together = many.get(id) ?? {}
      expect(JSON.stringify(together), `line ${id} reads the same either way`).toBe(JSON.stringify(alone))
      if (alone.requirements?.length) withSets++
    }
    expect(withSets, 'the lines compared actually require papers').toBeGreaterThan(20)
    expect(many.get(cavanaughLine)?.requirements?.some((r) => r.key === 'MSA'), 'Cavanaugh\u2019s order still asks for its agreement').toBe(true)
  }, 120_000)

  it('a never-filed or cover letter is not sent for a party whose set was never confirmed, and the night says so', async () => {
    const now = new Date()
    const wrenfield = await firm('world-wrenfield')
    const pinnacle = await firm('world-pinnacle')
    const msa = (await documentsNeverFiled(now, { sellContractIds: [cavanaughLine] })).find((m) => m.key === 'MSA')!
    expect(msa, 'the agreement nobody papered').toBeTruthy()
    const cover = (await supplierCoverLapses(now)).filter((d) => d.companyId === pinnacle.id)
    expect(cover.length, 'Pinnacle\u2019s cover, lapsed above').toBeGreaterThan(0)
    const buyers = [...new Set((await prisma.sellContract.findMany({
      where: { companyId: pinnacle.id, state: { in: ['IN_PROGRESS', 'PAUSED'] } },
      select: { clientCompanyId: true },
    })).map((l) => l.clientCompanyId))]
    expect(buyers.length, 'Pinnacle sells to somebody tonight').toBeGreaterThan(0)

    // Every seeded firm confirmed its sets, so as seeded both are asked for.
    const asSeeded = await gateTonight([msa], cover, prisma)
    expect(asSeeded.chase).toHaveLength(1 + cover.length)
    expect(asSeeded.withheld).toEqual([])

    // Take Wrenfield's set for its customers away, and every buyer's set for its sub-vendors.
    const taken = await prisma.documentRequirement.findMany({
      where: { OR: [{ companyId: wrenfield.id, party: 'CUSTOMERS' }, { companyId: { in: buyers }, party: 'SUB_VENDORS' }] },
    })
    expect(taken.length).toBeGreaterThan(0)
    await prisma.documentRequirement.deleteMany({ where: { id: { in: taken.map((r) => r.id) } } })
    try {
      const held = await gateTonight([msa], cover, prisma)
      expect(held.chase, 'neither letter is asked for').toEqual([])
      const wren = held.withheld.find((w) => w.companyId === wrenfield.id && w.party === 'CUSTOMERS')
      expect(wren, 'what was held back is returned, never dropped').toBeTruthy()
      expect(wren!.documents).toContain(msa.document)
      expect(wren!.says).toMatch(/under Setup → Papers you require\.$/)
      for (const b of buyers) {
        const row = held.withheld.find((w) => w.companyId === b && w.party === 'SUB_VENDORS')
        expect(row, `the buyer ${b} is told what it was not asked`).toBeTruthy()
        expect(row!.documents).toEqual(expect.arrayContaining(cover.map((c) => c.document)))
      }
      // One row per company and party.
      const keys = held.withheld.map((w) => `${w.companyId}:${w.party}`)
      expect(new Set(keys).size).toBe(keys.length)

      // The night carries it, and no letter tonight is about either paper.
      const night = await everyDocumentLetter(now)
      expect(night.letters.filter((l) => l.data.documentId === msa.id || cover.some((c) => c.id === l.data.documentId))).toEqual([])
      const said = withheldFindings(night.withheld).filter((f) => f.companyId === wrenfield.id)
      expect(said.map((f) => f.headline)).toContain(wren!.says)
      expect(said[0].kind).toBe('PAPER_CHASE_WITHHELD')
      expect(said[0].detail).toMatch(/^Not asked for tonight: /)
    } finally {
      await prisma.documentRequirement.createMany({ data: taken })
    }
  }, 120_000)
})
