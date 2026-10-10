import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { signersOf, topDown, turnOf, type LadderRung } from '@/app/api/timesheets/chain-turn'
import { acceptedByPayer } from '@/lib/money/payers-acceptance-read'

/**
 * A signed week in a seeded program, or in the world under the programs,
 * carries every signature the product
 * would have asked for, in the order it asks for them.
 *
 * Helena Marsh works at Northbend Athletic, sold by Computer Systems,
 * employed by Techpeple. Since 2026-09-28 a week travels down the chain:
 * Northbend signs, Computer Systems accepts what it pays Techpeple, and
 * Techpeple accepts last (`api/timesheets/chain-turn`). The seed wrote
 * two of the three — Northbend's and Techpeple's — so every seeded bill
 * from Techpeple to Computer Systems had no acceptance of Computer
 * Systems' own behind it, and the invoice-receipt match rightly found
 * nothing to match it against.
 */

let helenaWeeks: { id: string }[] = []
const ids: Record<string, string> = {}

beforeAll(async () => {
  await freshWorld()
  const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
  helenaWeeks = await prisma.timesheet.findMany({
    where: { personId: helena.id, status: 'APPROVED' },
    select: { id: true },
  })
  for (const slug of ['nike', 'computer-systems', 'techpeple']) {
    ids[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug: `world-${slug}` } })).id
  }
}, 600_000)

/**
 * The ladder, read the way the route reads it: the worker's rung and
 * every rung above it that buys from the one below.
 */
const ladderUp = async (sellContractId: string): Promise<LadderRung[]> => {
  const rungs: LadderRung[] = []
  let at: string | null = sellContractId
  while (at) {
    const c: { id: string; companyId: string; clientCompanyId: string; endClientCompanyId: string | null } =
      await prisma.sellContract.findUniqueOrThrow({
        where: { id: at },
        select: { id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true },
      })
    const below = rungs[rungs.length - 1]
    rungs.push({
      sellContractId: c.id, companyId: c.companyId, clientCompanyId: c.clientCompanyId,
      endClientCompanyId: c.endClientCompanyId, supplierSellContractId: below?.sellContractId ?? null,
    })
    const above = await prisma.buyContract.findFirst({
      where: { supplierSellContractId: c.id },
      select: { sellLinks: { select: { sellContractId: true } } },
    })
    at = above?.sellLinks[0]?.sellContractId ?? null
  }
  return rungs
}

const signaturesOn = (timesheetId: string) =>
  prisma.workAssertion.findMany({
    where: { timesheetId, state: 'LIVE' },
    orderBy: { at: 'asc' },
    select: { companyId: true, role: true, rateCents: true, at: true },
  })

describe('a seeded week on a chain is signed down the chain', () => {
  it('has signed weeks to read, so the sentences below mean something', () => {
    expect(helenaWeeks.length).toBeGreaterThan(0)
  })

  it('carries the client’s signature, then the firm in the middle accepting what it pays, then the employer’s, in that order', async () => {
    for (const w of helenaWeeks) {
      const signed = await signaturesOn(w.id)
      expect(signed.map((s) => [s.companyId, s.role])).toEqual([
        [ids.nike, 'CLIENT_APPROVAL'],
        [ids['computer-systems'], 'PASS_THROUGH'],
        [ids.techpeple, 'EMPLOYER_ACCEPTANCE'],
      ])
      // Strictly in order: no rung accepted before the rung above it signed.
      expect(signed[0].at.getTime()).toBeLessThan(signed[1].at.getTime())
      expect(signed[1].at.getTime()).toBeLessThan(signed[2].at.getTime())
    }
  })

  it('records the firm in the middle at the rate it pays the firm below, never the client’s rate', async () => {
    for (const w of helenaWeeks) {
      const pass = (await signaturesOn(w.id)).find((s) => s.role === 'PASS_THROUGH')!
      expect(pass.rateCents).toBe(11800)
    }
  })

  it('leaves nobody on the chain a turn still to take, as the approve route itself would read it', async () => {
    const week = await prisma.timesheet.findUniqueOrThrow({
      where: { id: helenaWeeks[0].id },
      select: { sellContractId: true },
    })
    const signers = signersOf(topDown(await ladderUp(week.sellContractId)))
    expect(signers.map((s) => s.role)).toEqual(['CLIENT_APPROVAL', 'PASS_THROUGH', 'EMPLOYER_ACCEPTANCE'])

    const signed = await signaturesOn(helenaWeeks[0].id)
    const has = (s: { companyId: string; role: string }) =>
      signed.some((x) => x.companyId === s.companyId && x.role === s.role)
    for (const firm of [ids.nike, ids['computer-systems'], ids.techpeple]) {
      const turn = turnOf(signers, firm, has, () => 'somebody')
      expect(turn.ok ? 'still to sign' : turn.code, firm).toBe('ALREADY_SIGNED')
    }
  })

  it('signs every seeded chain week in the world down its chain in turn, not only the programs’ weeks', async () => {
    // The world seed's own placements — Harlow Health through Computer
    // Systems, Meridian Bank through Vertex Global, Nordway through
    // Pinnacle to a firm nobody has joined, and the rest — each walked
    // against the signers the approve route would ask for.
    const worldPeople = await prisma.person.findMany({
      where: { primaryEmail: { endsWith: '@seed.etyme.invalid' } },
      select: { id: true, name: true },
    })
    let chained = 0
    for (const p of worldPeople) {
      const weeks = await prisma.timesheet.findMany({
        where: { personId: p.id, status: 'APPROVED' },
        select: { id: true, sellContractId: true },
      })
      for (const w of weeks) {
        const signers = signersOf(topDown(await ladderUp(w.sellContractId)))
        if (signers.length < 3) continue
        chained++
        const signed = await signaturesOn(w.id)
        expect(signed.map((s) => [s.companyId, s.role]), p.name).toEqual(signers.map((s) => [s.companyId, s.role]))
        for (let i = 1; i < signed.length; i++) {
          expect(signed[i - 1].at.getTime(), `${p.name}: signature ${i} before the one above it`)
            .toBeLessThan(signed[i].at.getTime())
        }
      }
    }
    // Six world placements run through a firm in the middle, four weeks each.
    expect(chained).toBeGreaterThanOrEqual(24)
  })

  it('every seeded signature is made by somebody seated at the firm that signs', async () => {
    const all = await prisma.workAssertion.findMany({
      select: {
        id: true, companyId: true, byId: true, auto: true, role: true, company: { select: { slug: true } },
        weekApproval: { select: { approverName: true, approverEmail: true } },
      },
    })
    expect(all.length).toBeGreaterThan(0)
    const seats = await prisma.context.findMany({
      where: { type: 'EMPLOYEE' },
      select: { personId: true, companyId: true },
    })
    const seated = new Set(seats.map((c) => `${c.personId}:${c.companyId}`))
    const invented = all.filter((a) =>
      // A signature with nobody behind it is the system approving on its
      // own, and says so; or a client's approval given outside Etyme (by
      // email, CLAUDE.md 2026-09-30), whose WeekApproval names the person
      // and their address. One with a person names somebody at that firm.
      a.byId == null
        ? !a.auto && !(a.role === 'CLIENT_APPROVAL' && a.weekApproval?.approverName && a.weekApproval.approverEmail)
        : !seated.has(`${a.byId}:${a.companyId}`)
    )
    expect(
      invented.map((a) => `${a.company.slug} ${a.role}`),
      'these signatures were made by somebody not seated at the firm that signs'
    ).toEqual([])
  })

  it('a firm nobody has joined signs nothing, and the firm above it carries the hours and the paper it was handed', async () => {
    const bluecrest = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-bluecrest' } })
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' } })
    expect(await prisma.workAssertion.count({ where: { companyId: bluecrest.id } })).toBe(0)
    expect(await prisma.sellContract.count({ where: { companyId: bluecrest.id } })).toBe(0)

    // Pinnacle buys from the shell with nothing below it, so the hours
    // are on Pinnacle's own contract and Pinnacle accepts what it pays.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { companyId: pinnacle.id, vendorCompanyId: bluecrest.id },
      select: { supplierSellContractId: true, sellLinks: { select: { sellContractId: true } } },
    })
    expect(buy.supplierSellContractId).toBeNull()
    const weeks = await prisma.timesheet.findMany({
      where: { sellContractId: buy.sellLinks[0].sellContractId, status: 'APPROVED' },
      select: { id: true },
    })
    expect(weeks.length).toBeGreaterThan(0)
    for (const w of weeks) {
      const signed = await signaturesOn(w.id)
      expect(signed.map((s) => s.role)).toEqual(['CLIENT_APPROVAL', 'EMPLOYER_ACCEPTANCE'])
      expect(signed[1].companyId).toBe(pinnacle.id)
    }

    // And money's existing reader finds them there: an invoice receipt
    // from the shell is matched against Pinnacle's own acceptance, with
    // nothing changed on money's side.
    const buyId = (await prisma.buyContract.findFirstOrThrow({
      where: { companyId: pinnacle.id, vendorCompanyId: bluecrest.id }, select: { id: true },
    })).id
    const accepted = await acceptedByPayer({ buyContractId: buyId, periodStart: new Date(Date.now() - 60 * 86_400_000), periodEnd: new Date() })
    expect(accepted, 'Pinnacle’s acceptance is what its invoice receipt from Bluecrest is matched against').not.toBeNull()
    expect(accepted!.count).toBe(weeks.length)
    expect(accepted!.waiting).toBe(0)

    // The shell's paper is on file, put there by somebody at Pinnacle —
    // the firm actually holding it — and the shell's name stays on what
    // the shell did.
    const pinnacleSeats = new Set(
      (await prisma.context.findMany({ where: { companyId: pinnacle.id, type: 'EMPLOYEE' }, select: { personId: true } }))
        .map((c) => c.personId)
    )
    const cover = await prisma.verification.findMany({
      where: { companyId: bluecrest.id }, select: { uploadedById: true },
    })
    expect(cover.length).toBeGreaterThan(0)
    for (const v of cover) expect(pinnacleSeats.has(v.uploadedById!)).toBe(true)
  })

  it('signs nothing twice when the world is seeded again', async () => {
    const before = await prisma.workAssertion.count()
    await seedWorld()
    expect(await prisma.workAssertion.count()).toBe(before)
  }, 600_000)
})
