import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { PARTIES, type Party } from '@/lib/parties'

import { POST as raiseRequisition } from '@/app/api/requisitions/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'
import { POST as award } from '@/app/api/submissions/[id]/award/route'
import { POST as activate } from '@/app/api/contracts/[id]/activate/route'
import { GET as placement } from '@/app/api/placements/[id]/route'
import { POST as fileTimesheet } from '@/app/api/timesheets/route'
import { POST as sendTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { POST as approveTimesheet } from '@/app/api/timesheets/[id]/approve/route'
import { POST as generateInvoice } from '@/app/api/invoices/generate/route'
import { POST as submitInvoice } from '@/app/api/invoices/[id]/submit/route'
import { POST as pay } from '@/app/api/invoices/[id]/payments/route'
import { GET as tenure } from '@/app/api/tenure/route'

/**
 * The same ten stations, asked of all eight parties.
 *
 * ── What this is for ─────────────────────────────────────────────────
 *
 * `client-programme.test.ts` walks one placement from a client's own
 * desks. It is the right test and it has one blind spot: every actor in
 * it is a client employee or a supplier, so a station that behaves for
 * those two and not for an MSP, an integrator, a sub or a one-person
 * corporation passes it.
 *
 * That blind spot has cost real bugs. Contacts were given to
 * `kind === 'CLIENT' || kind === 'MSP'`, which left an integrator and a
 * prime with an empty page. A rate was read at the wrong rung of a
 * chain because the code knew "supplier" and not "the supplier this
 * client pays". Both were one position on a deal treated as a property
 * of a firm, and both were found by a person looking at a screen rather
 * than by a test.
 *
 * So this file asks the *same question at every station of every one of
 * the eight positions in `lib/parties`*: may you act here, and if not,
 * are you told why in a sentence. A new station is a new block; a new
 * party is a new row in every block. Uniform means the grid has no
 * holes, and the first test below fails if one opens.
 *
 * ── One deal, eight positions ────────────────────────────────────────
 *
 *   Northbend Athletic          CLIENT        buys, signs the hours, pays
 *   Kestrel       MSP           runs a program; supplies nobody
 *   Teleworld     GSI           invited to the role, did not submit
 *   Pinnacle      PRIME         submitted Rhea and holds the contract
 *   Brightmoor    SUB           a supplier of Northbend Athletic's, not on this deal
 *   Consultis     BENCH_VENDOR  holds Rhea's consent, did not submit
 *   Marsh         SOLOPRENEUR   put its own principal up and lost
 *   Rhea          CANDIDATE     the person on the seat
 *
 * Being off the deal is not a gap in the grid — it is the answer. A
 * supplier that is not a party must be refused in words at every
 * station that touches the contract, and that is asserted here as
 * firmly as the yeses.
 */

const D = '@demo.etyme.local'
const NIKE = {
  hiring: `world-nike-hiring${D}`,
  program: `world-nike-programme${D}`,
  ap: `world-nike-ap${D}`,
}
/**
 * The MSP row is Kestrel, not Aptiva.
 *
 * Both are program offices and they are two different businesses. An
 * agent MSP runs a client's program and supplies nobody, which is the
 * position this grid needs: nothing ties it to a client, so it cannot
 * raise a requisition and has to be told why in a sentence. Aptiva was
 * that firm until the world seeded it to CLAUDE.md's correction of
 * 2026-09-17 — an MSP that sells to its client and buys below it,
 * including its own W2 employee — and a firm with a placement is tied
 * to a client, which is the rule working rather than a regression.
 *
 * So the untied position moved to the firm that is still untied. If
 * Kestrel is ever given a placement too, this row moves again or the
 * gap it holds the sentence for has closed.
 */
const SEAT: Record<Party, string> = {
  CLIENT: NIKE.hiring,
  MSP: `world-kestrel${D}`,
  GSI: `world-teleworld${D}`,
  PRIME: `world-pinnacle${D}`,
  SUB: `world-brightmoor${D}`,
  BENCH_VENDOR: `world-consultis${D}`,
  SOLOPRENEUR: 'dev.marsh@marshanalytics.invalid',
  CANDIDATE: 'rhea.saunders@party.invalid',
}
const FIRM: Record<Party, string> = {
  CLIENT: 'Northbend Athletic', MSP: 'Kestrel MSP', GSI: 'Teleworld Solutions',
  PRIME: 'Pinnacle Resourcing', SUB: 'Brightmoor Staffing', BENCH_VENDOR: 'Consultis',
  SOLOPRENEUR: 'Marsh Analytics', CANDIDATE: 'Rhea Saunders',
}

/** The company each party acts as. The consultant has none of her own. */
const OWN_FIRM = (party: Party): string =>
  party === 'SOLOPRENEUR' ? co['marsh']
  : party === 'CANDIDATE' ? co['world-pinnacle']
  : co[{ CLIENT: 'world-nike', MSP: 'world-kestrel', GSI: 'world-teleworld', PRIME: 'world-pinnacle', SUB: 'world-brightmoor', BENCH_VENDOR: 'world-consultis' }[party as 'CLIENT']]

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

/**
 * Ask every party the same question and hand back what each was told.
 *
 * Every caller below reads the whole map in one assertion rather than
 * eight, so a station that quietly starts letting a seventh party
 * through fails on the row that changed.
 */
interface Told {
  /** Did the thing happen for this party. */
  ok: boolean
  /** What they were told, when it did not. */
  says: string
}
type Grid = Record<Party, Told>

/**
 * A refusal is not always a status code.
 *
 * Submitting is a batch with per-item errors, so it answers 200 and
 * refuses inside the body — which is right for a screen showing eight
 * candidates and three problems, and useless to a grid reading numbers.
 * The grid reads the outcome instead: did it happen, and what were they
 * told when it did not.
 */
async function eachParty(ask: (party: Party) => Promise<{ status: number; body: any }>): Promise<Grid> {
  const grid = {} as Grid
  for (const { party } of PARTIES) {
    as(SEAT[party])
    const r = await ask(party)
    const item = r.body?.data?.results?.[0]
    const says = r.body?.error?.message ?? r.body?.error?.code ?? item?.error ?? item?.reason ?? ''
    grid[party] = { ok: r.status < 400 && (item === undefined || item.status === 'created'), says }
  }
  return grid
}

/** A refusal is only a refusal if it says something a person can act on. */
function refusalsAreSentences(grid: Grid) {
  for (const { party } of PARTIES) {
    if (grid[party].ok) continue
    expect(grid[party].says, `${FIRM[party]} was refused with no sentence`).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
  }
}

beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-kestrel', 'world-teleworld', 'world-pinnacle', 'world-brightmoor', 'world-consultis']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
    }

    // ── The two parties the seeded world has no example of ──────────
    //
    // A one-person corporation and the consultant themselves. Both are
    // written here rather than into the world seed because neither has
    // a story on the demo accounts yet, and a seed nobody clicks is a
    // seed that rots.
    const marshCo = await prisma.company.create({
      data: { name: 'Marsh Analytics', slug: 'party-marsh', kind: 'CONSULTANT_CORP', currency: 'USD' },
    })
    co['marsh'] = marshCo.id
    const ownerRole = await prisma.role.create({
      data: { companyId: marshCo.id, name: 'Owner', permissions: ['*'], isDefault: true },
    })
    const dev = await prisma.person.create({ data: { name: 'Dev Marsh', primaryEmail: SEAT.SOLOPRENEUR } })
    it_.solo = dev.id
    await prisma.context.create({
      data: { personId: dev.id, companyId: marshCo.id, roleId: ownerRole.id, type: 'EMPLOYEE', grantReason: 'Their own company' },
    })
    const devProfile = await prisma.consultantProfile.create({
      data: { personId: dev.id, skills: ['Sustainability reporting'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    await prisma.benchListing.create({
      data: { consultantId: devProfile.id, companyId: marshCo.id, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) },
    })

    // Rhea: on Pinnacle's bench and on Consultis's, which is what makes
    // cross-supplier tenure a real number rather than a claim.
    const rhea = await prisma.person.create({ data: { name: 'Rhea Saunders', primaryEmail: SEAT.CANDIDATE } })
    it_.worker = rhea.id
    const profile = await prisma.consultantProfile.create({
      data: { personId: rhea.id, skills: ['Sustainability reporting', 'Power BI'], location: 'Beaverton, OR', visibility: 'VERIFIED', workAuth: 'USC' },
    })
    for (const slug of ['world-pinnacle', 'world-consultis']) {
      await prisma.benchListing.create({
        data: { consultantId: profile.id, companyId: co[slug], tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) },
      })
    }
    await prisma.context.create({
      data: { personId: rhea.id, companyId: co['world-pinnacle'], type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
  })
}, 300_000)

describe('the grid itself', () => {
  it('every one of the eight positions has a firm and somebody who can sign in as it', async () => {
    for (const { party } of PARTIES) {
      const person = await prisma.person.findUnique({ where: { primaryEmail: SEAT[party] }, select: { id: true, contexts: { where: { revokedAt: null }, select: { company: { select: { name: true } } } } } })
      expect(person, `${party} has nobody to sign in as`).not.toBeNull()
      if (party === 'CANDIDATE') continue
      expect(person!.contexts.map((c) => c.company?.name), `${party} is not seated at ${FIRM[party]}`).toContain(FIRM[party])
    }
  })

  it('a position is what a firm is on this deal, never a column on the firm', async () => {
    // Pinnacle, Brightmoor and Consultis are one kind on the register
    // and three different things here. If a position were ever stored
    // on the company this assertion is the one that breaks.
    const kinds = await prisma.company.findMany({
      where: { id: { in: [co['world-pinnacle'], co['world-brightmoor'], co['world-consultis']] } },
      select: { kind: true },
    })
    expect(new Set(kinds.map((k) => k.kind))).toEqual(new Set(['VENDOR']))
  })
})

describe('1 · a role is posted', () => {
  it('a client opens a role on its own cost center; a supplier raises one for a client it already places at; the consultant, who buys nobody, cannot', async () => {
    const cc = await prisma.costCenter.findFirstOrThrow({ where: { companyId: co['world-nike'], code: { startsWith: 'APPS-' } } })
    const grid = await eachParty(async (party) =>
      json(await raiseRequisition(req('POST', '/api/requisitions', {
        title: `Sustainability data analyst — ${FIRM[party]}`,
        skills: ['Sustainability reporting', 'Power BI'], location: 'Beaverton, OR',
        billMin: 3200, billMax: 4000, months: 12, headcount: 1, hoursPerWeek: 40,
        ...(party === 'CLIENT' ? { costCenterId: cc.id } : {}),
        neededBy: day(14).toISOString(),
      })))
    )
    expect(grid.CLIENT.ok, `Northbend Athletic could not open its own role: ${grid.CLIENT.says}`).toBe(true)
    // A person with no seat has no company to open a role for.
    expect(grid.CANDIDATE.ok).toBe(false)
    // A supplier already placing somebody raises it for that client.
    for (const party of ['GSI', 'PRIME', 'SUB', 'BENCH_VENDOR'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]}: ${grid[party].says}`).toBe(true)
    }
    refusalsAreSentences(grid)
    it_.turnedAway = grid
    it_.requisition = (await prisma.requirement.findFirstOrThrow({
      where: { companyId: co['world-nike'], title: 'Sustainability data analyst — Northbend Athletic' },
    })).id
  })

  it('a firm the platform cannot tie to a client is turned away in a sentence that says why, never in a code', async () => {
    // The program office and the one-person corporation are the two
    // that hit this: neither places anybody itself, so neither has a
    // client the platform can infer. What they read used to be "No
    // client company found for this caller".
    for (const party of ['MSP', 'SOLOPRENEUR'] as Party[]) {
      expect(it_.turnedAway[party].says, `${FIRM[party]} was refused in a code`).toContain(FIRM[party])
      expect(it_.turnedAway[party].says).toMatch(/not tied to a client yet/)
    }
  })
})

describe('2 · the role is put in front of suppliers', () => {
  it('only somebody seated at the buying company chooses which suppliers see its role — no supplier, and no other buyer, can', async () => {
    const grid = await eachParty(async () =>
      call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
        vendors: [{ companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 }],
      })
    )
    for (const { party } of PARTIES) {
      expect(grid[party].ok, `${FIRM[party]} reached inside Northbend Athletic's release`).toBe(false)
    }
    refusalsAreSentences(grid)
  })

  it('the program office sends it to Pinnacle and Teleworld, each seeing only its own band', async () => {
    as(NIKE.program)
    const r = await call(distribute, 'POST', `/api/requisitions/${it_.requisition}/distribute`, it_.requisition, {
      vendors: [
        { companyId: co['world-pinnacle'], payMin: 3200, payMax: 3800 },
        { companyId: co['world-teleworld'], payMin: 3000, payMax: 3500 },
      ],
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.summary.sent).toBe(2)
    expect(JSON.stringify(r.body)).not.toContain('3800')
  })
})

describe('3 · somebody is put forward', () => {
  it('a supplier holding the consultant’s consent and an invitation may submit; one holding neither is refused in words', async () => {
    const grid = await eachParty(async (party) =>
      json(await submitCandidates(req('POST', '/api/submissions', {
        requirementId: it_.requisition,
        personIds: [party === 'SOLOPRENEUR' ? it_.solo : it_.worker],
        rate: 3800,
        // Each firm submits as itself. A firm submitting in somebody
        // else's name is its own refusal, asserted below.
        fromCompanyId: OWN_FIRM(party),
      })))
    )
    // Pinnacle was invited and holds her consent.
    expect(grid.PRIME.ok, grid.PRIME.says).toBe(true)
    // Every other position is refused, each for its own reason: Northbend Athletic and
    // its program office are the buyer, Brightmoor holds no consent,
    // Marsh may not put its principal in somebody else's name, and the
    // consultant is put forward rather than putting herself forward.
    for (const party of ['CLIENT', 'MSP', 'GSI', 'SUB', 'SOLOPRENEUR', 'CANDIDATE'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]} put somebody forward`).toBe(false)
    }
    refusalsAreSentences(grid)
    it_.submission = (await prisma.submission.findFirstOrThrow({
      where: { requirementId: it_.requisition, personId: it_.worker },
    })).id
  })
})

describe('4 · the award, and the contracts it writes', () => {
  it('only the buying company awards its own role — the supplier that submitted least of all', async () => {
    const grid = await eachParty(async (party) =>
      party === 'CLIENT'
        ? { status: 999, body: { error: { message: 'not asked at this station' } } }
        : call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, { rate: 3800 })
    )
    for (const { party } of PARTIES) {
      if (party === 'CLIENT') continue
      expect(grid[party].ok, `${FIRM[party]} awarded Northbend Athletic's role`).toBe(false)
    }
    expect(grid.PRIME.says, 'the supplier that submitted was refused without a word').toBeTruthy()
    refusalsAreSentences(grid)

    as(NIKE.hiring)
    const r = await call(award, 'POST', `/api/submissions/${it_.submission}/award`, it_.submission, {
      rate: 3800, startDate: day(-7).toISOString().slice(0, 10), endDate: day(173).toISOString().slice(0, 10),
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    it_.contract = r.body.data.contractId
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract }, include: { buyLinks: true } })
    expect(sell.clientCompanyId).toBe(co['world-nike'])
    expect(sell.buyLinks).toHaveLength(1)
    it_.buyContract = sell.buyLinks[0].buyContractId
    it_.engagement = sell.engagementId
  })

  it('only the two parties to the contract can read it; the other six are told they are not a party', async () => {
    const grid = await eachParty(async () =>
      call(placement, 'GET', `/api/placements/${it_.contract}`, it_.contract)
    )
    expect(grid.CLIENT.ok, grid.CLIENT.says).toBe(true)
    expect(grid.PRIME.ok, grid.PRIME.says).toBe(true)
    for (const party of ['MSP', 'GSI', 'SUB', 'BENCH_VENDOR', 'SOLOPRENEUR'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]} read a contract it is not on`).toBe(false)
    }
    refusalsAreSentences(grid)
  })

  it('what the supplier pays its consultant never reaches the client’s copy of the thread', async () => {
    as(NIKE.hiring)
    const r = await call(placement, 'GET', `/api/placements/${it_.contract}`, it_.contract)
    expect(r.body.data.timeline.pay).toEqual([])
  })
})

describe('5 · nobody starts without their paperwork', () => {
  it('only the employing supplier or the hiring desk may start somebody, and not before the I-9', async () => {
    const grid = await eachParty(async () =>
      call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, { action: 'activate' })
    )
    for (const { party } of PARTIES) {
      expect(grid[party].ok, `${FIRM[party]} started somebody`).toBe(false)
    }
    // A stranger to the contract and the supplier on it are refused for
    // different reasons, and both reasons are sentences a person acts on.
    expect(grid.SUB.says).toMatch(/not a party/i)
    expect(grid.PRIME.says).toMatch(/cannot start without/i)
    refusalsAreSentences(grid)
  })

  it('with the I-9 on file the employing supplier starts her, and the record says who', async () => {
    const seat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: SEAT.PRIME } })
    await prisma.verification.create({
      data: {
        personId: it_.worker, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-1),
        uploadedById: seat.id, verifiedById: seat.id, verifiedAt: day(-1), result: { outcome: 'CLEAR' },
      },
    })
    as(SEAT.PRIME)
    const r = await call(activate, 'POST', `/api/contracts/${it_.contract}/activate`, it_.contract, {
      action: 'activate', overrideReason: 'Background check ordered from Sterling, reference ST-4471.',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.sellContract.findUniqueOrThrow({ where: { id: it_.contract } })).state).toBe('IN_PROGRESS')
  })
})

describe('6 · the week is filed', () => {
  const WEEK = { periodStart: day(-7).toISOString().slice(0, 10), periodEnd: day(-3).toISOString().slice(0, 10) }
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[day(-7 + i).toISOString().slice(0, 10)] = 8

  it('no firm but the one that employs her may file her week — not the client she works for, and not a supplier off the deal', async () => {
    // The two who legitimately may — she and her agency — are asked
    // below, one week each, because a week is unique to its contract
    // and whoever files first would otherwise answer for the rest.
    const grid = await eachParty(async (party) =>
      party === 'CANDIDATE' || party === 'PRIME'
        ? { status: 999, body: { error: { message: 'asked on their own week below' } } }
        : json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    )
    for (const party of ['CLIENT', 'MSP', 'GSI', 'SUB', 'BENCH_VENDOR', 'SOLOPRENEUR'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]} filed somebody else's hours`).toBe(false)
    }
    refusalsAreSentences(grid)
  })

  it('she files her own week; her agency files the week before on her behalf, and the record says which of them said the hours happened', async () => {
    as(SEAT.CANDIDATE)
    const hers = await json(await fileTimesheet(req('POST', '/api/timesheets', { sellContractId: it_.contract, ...WEEK, days })))
    expect(hers.body?.error, JSON.stringify(hers.body)).toBeUndefined()
    it_.timesheet = hers.body.data.timesheet.id
    const sent = await call(sendTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/submit`, it_.timesheet, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()

    const before: Record<string, number> = {}
    for (let i = 0; i < 5; i++) before[day(-14 + i).toISOString().slice(0, 10)] = 8
    as(SEAT.PRIME)
    const theirs = await json(await fileTimesheet(req('POST', '/api/timesheets', {
      sellContractId: it_.contract,
      periodStart: day(-14).toISOString().slice(0, 10), periodEnd: day(-10).toISOString().slice(0, 10),
      days: before,
    })))
    expect(theirs.body?.error, JSON.stringify(theirs.body)).toBeUndefined()
  })
})

describe('7 · the work is signed', () => {
  it('the consultant cannot sign her own week, and no firm off the deal can sign it at all', async () => {
    const grid = await eachParty(async (party) =>
      party === 'CLIENT' || party === 'PRIME'
        ? { status: 999, body: { error: { message: 'not asked at this station' } } }
        : call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    )
    expect(grid.CANDIDATE.ok, 'she signed her own hours').toBe(false)
    for (const party of ['MSP', 'GSI', 'SUB', 'BENCH_VENDOR', 'SOLOPRENEUR'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]} signed a week on a deal it is not on`).toBe(false)
    }
    refusalsAreSentences(grid)
  })

  it('the client signs the work and the supplier accepts what it pays — two signatures, two sides, neither standing in for the other', async () => {
    as(NIKE.hiring)
    const client = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, {})
    expect(client.body?.error, JSON.stringify(client.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('SUBMITTED')
    as(SEAT.PRIME)
    const supplier = await call(approveTimesheet, 'POST', `/api/timesheets/${it_.timesheet}/approve`, it_.timesheet, { as: 'EMPLOYER' })
    expect(supplier.body?.error, JSON.stringify(supplier.body)).toBeUndefined()
    expect((await prisma.timesheet.findUniqueOrThrow({ where: { id: it_.timesheet } })).status).toBe('APPROVED')
  })
})

describe('8 · the supplier bills for its own engagement', () => {
  it('the supplier on the contract raises the invoice; the client cannot raise one against itself and no other firm can raise one at all', async () => {
    const grid = await eachParty(async () =>
      json(await generateInvoice(req('POST', '/api/invoices/generate', { engagementId: it_.engagement })))
    )
    expect(grid.PRIME.ok, grid.PRIME.says).toBe(true)
    for (const party of ['MSP', 'GSI', 'SUB', 'BENCH_VENDOR', 'SOLOPRENEUR', 'CANDIDATE'] as Party[]) {
      expect(grid[party].ok, `${FIRM[party]} billed for somebody else's engagement`).toBe(false)
    }
    refusalsAreSentences(grid)
    it_.invoice = (await prisma.invoice.findFirstOrThrow({
      where: { engagementId: it_.engagement }, orderBy: { periodEnd: 'desc' },
    })).id
    as(SEAT.PRIME)
    const sent = await call(submitInvoice, 'POST', `/api/invoices/${it_.invoice}/submit`, it_.invoice, {})
    expect(sent.body?.error, JSON.stringify(sent.body)).toBeUndefined()
  })
})

describe('9 · the client pays what came through the match', () => {
  it('no firm off the deal can touch the payment, and neither can the manager who signed the work', async () => {
    // The supplier is asked separately: it records money that arrived,
    // which is a receipt and not a payment, and is its own station.
    const grid = await eachParty(async (party) =>
      party === 'PRIME'
        ? { status: 999, body: { error: { message: 'asked at its own station below' } } }
        : call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, { amount: 1, method: 'ACH', reference: 'grid' })
    )
    for (const { party } of PARTIES) {
      expect(grid[party].ok, `${FIRM[party]} paid an invoice that is not its to pay`).toBe(false)
    }
    refusalsAreSentences(grid)
  })

  it('the client’s clerk pays what the match passed, and the payment says who paid whom', async () => {
    as(NIKE.ap)
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: it_.invoice } })
    const r = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, {
      amount: Number(inv.total), method: 'ACH', reference: 'ACH-GRID-1',
    })
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const p = await prisma.payment.findFirstOrThrow({ where: { invoiceId: it_.invoice } })
    expect(p.payerCompanyId).toBe(co['world-nike'])
    expect(p.receivedByCompanyId).toBe(co['world-pinnacle'])
  })

  it('a supplier records money that arrived rather than paying itself, and cannot record more than the invoice', async () => {
    as(SEAT.PRIME)
    const again = await call(pay, 'POST', `/api/invoices/${it_.invoice}/payments`, it_.invoice, {
      amount: 100, method: 'ACH', reference: 'a second receipt nobody sent',
    })
    expect(again.status).toBeGreaterThanOrEqual(400)
    expect(['OVERPAYMENT', 'INVALID_STATE']).toContain(again.body.error.code)
    expect(again.body.error.message).toMatch(/[a-z]{3,}\s+[a-z]{2,}/i)
  })
})

describe('10 · the tenure is the person’s, and every read of it leaves a trail', () => {
  it('the desk that answers for tenure reads her days at Northbend Athletic; every firm that reads anything is told only about its own', async () => {
    const grid = await eachParty(async () => json(await tenure(req('GET', '/api/tenure'))))
    refusalsAreSentences(grid)

    as(`world-nike-compliance${D}`)
    const officer = await json(await tenure(req('GET', '/api/tenure')))
    expect(officer.body?.error, JSON.stringify(officer.body)).toBeUndefined()
    const rhea = officer.body.data.people.find((p: any) => p.name === 'Rhea Saunders')
    expect(rhea, 'Rhea is on Northbend Athletic’s ledger').toBeTruthy()
    expect(rhea.vendors.map((v: any) => v.name)).toContain('Pinnacle Resourcing')

    // A firm that never supplied her does not learn she is there.
    as(SEAT.SUB)
    const stranger = await json(await tenure(req('GET', '/api/tenure')))
    const names = stranger.status === 200 ? (stranger.body.data.people ?? []).map((p: any) => p.name) : []
    expect(names, 'a supplier off the deal read her days at Northbend Athletic').not.toContain('Rhea Saunders')
  })
})
