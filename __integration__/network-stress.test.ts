/**
 * Fifty days of a six-company supply chain, ten thousand transactions.
 *
 * The pure suite proves each rule in isolation and the first-transaction
 * suite proves one story end to end. Neither can answer the question
 * this one exists for: does the product still behave on day fifty, with
 * fifty days of rows underneath it, when five kinds of company are all
 * working at once and nobody is taking turns.
 *
 * That is a different class of failure and it does not show up in a unit
 * test. Queries that never had a LIMIT. An invariant enforced in a route
 * that a second route reaches around. A join that was fine at ten rows.
 * These break slowly and quietly, which is the worst way for money code
 * to break, and the only way to find them is volume.
 *
 * ── What a "transaction" means here ──────────────────────────────────
 *
 * A thing a person would actually do, through the real route handler,
 * against real Postgres. Not a synthetic INSERT. If a route rejects a
 * request the simulation counts it as a refusal and carries on, because
 * a well-behaved refusal is a pass — the failures worth finding are
 * crashes, leaks, and invariants that stop holding.
 *
 * ── Reading the output ───────────────────────────────────────────────
 *
 * Latency is reported per action in day-deciles. A route whose p95 grows
 * across the deciles is a route with an unbounded query in it, and that
 * is the finding, not the total runtime.
 *
 * Scale is settable so this is runnable both ways:
 *   STRESS_DAYS=2 STRESS_PER_DAY=20   a fast shake-out
 *   STRESS_DAYS=50 STRESS_PER_DAY=200 the full ten thousand
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { NETWORK, firm, benchVendors, SKILLS, CITIES, type Firm } from './fixtures/network'

import { POST as registerCompany } from '@/app/api/companies/route'
import { POST as addCounterparty } from '@/app/api/counterparties/route'
import { POST as createRequirement, GET as listRequirements } from '@/app/api/requirements/route'
import { POST as createSubmission } from '@/app/api/submissions/route'
import { POST as createListing } from '@/app/api/bench/listings/route'
import { GET as listBench } from '@/app/api/bench/route'
import { POST as createContract } from '@/app/api/contracts/route'
import { POST as activateContract } from '@/app/api/contracts/[id]/activate/route'
import { POST as createTimesheet } from '@/app/api/timesheets/route'
import { GET as listTimesheets } from '@/app/api/timesheets/route'
import { GET as listPeople } from '@/app/api/people/route'

const DAYS = Number(process.env.STRESS_DAYS ?? 50)
const PER_DAY = Number(process.env.STRESS_PER_DAY ?? 200)
const TOTAL = DAYS * PER_DAY

/** Deterministic, so a failure at transaction 7,412 can be reproduced. */
let seed = 20260907
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))

interface World {
  companyId: Record<string, string>
  ownerEmail: Record<string, string>
  managers: string[]
  consultants: { profileId: string; personId: string; vendor: string; skills: string[] }[]
  requirements: { id: string; companyId: string; skills: string[] }[]
  submissions: { id: string; requirementId: string; personId: string }[]
  contracts: { id: string; personId: string; vendorId: string; clientId: string }[]
  timesheets: { id: string; contractId: string; personId: string }[]
}

const w: World = {
  companyId: {}, ownerEmail: {}, managers: [],
  consultants: [], requirements: [], submissions: [], contracts: [], timesheets: [],
}

// ── measurement ───────────────────────────────────────────────────────

interface Stat { ok: number; refused: number; crashed: number; ms: number[] }
const stats = new Map<string, Stat>()
const crashes: { action: string; day: number; error: string }[] = []

function record(action: string, outcome: 'ok' | 'refused' | 'crashed', ms: number) {
  let s = stats.get(action)
  if (!s) { s = { ok: 0, refused: 0, crashed: 0, ms: [] }; stats.set(action, s) }
  s[outcome]++
  s.ms.push(ms)
}

/** Latency by decile of the run, so growth is visible rather than averaged away. */
const timeline = new Map<string, number[][]>()
function timeSlice(action: string, day: number, ms: number) {
  const decile = Math.min(9, Math.floor((day / DAYS) * 10))
  let t = timeline.get(action)
  if (!t) { t = Array.from({ length: 10 }, () => [] as number[]); timeline.set(action, t) }
  t[decile].push(ms)
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

async function act(name: string, day: number, fn: () => Promise<{ status: number; body: any }>) {
  const t0 = Date.now()
  try {
    const r = await fn()
    const ms = Date.now() - t0
    // A refusal is a pass. The route said no for a stated reason, which
    // is the system working — the failures worth finding are the ones
    // where it says yes to something it should not, or falls over.
    record(name, r.status < 400 ? 'ok' : 'refused', ms)
    timeSlice(name, day, ms)
    return r
  } catch (e: any) {
    const ms = Date.now() - t0
    record(name, 'crashed', ms)
    timeSlice(name, day, ms)
    if (crashes.length < 40) crashes.push({ action: name, day, error: String(e?.message ?? e).slice(0, 300) })
    return { status: 500, body: null }
  }
}

const day0 = new Date('2026-01-05T00:00:00Z')
const dayOf = (d: number) => new Date(day0.getTime() + d * 86400000)
const iso = (d: Date) => d.toISOString().slice(0, 10)

beforeAll(async () => {
  await resetDatabase()
}, 180_000)

describe(`a six-company chain works ${TOTAL.toLocaleString()} transactions over ${DAYS} days`, () => {

  it('every party in the chain registers on its own corporate domain', async () => {
    for (const f of NETWORK) {
      const owner = f.people[0]
      as(owner.email)
      const r = await json(
        await registerCompany(req('POST', '/api/companies', { name: f.name, kind: f.kind }))
      )
      expect(r.body?.error, `${f.name}: ${JSON.stringify(r.body)}`).toBeUndefined()
      w.companyId[f.name] = r.body.data.company.id
      w.ownerEmail[f.name] = owner.email
    }
    expect(Object.keys(w.companyId)).toHaveLength(NETWORK.length)
  }, 120_000)

  it('a corporate domain is recorded as verified, unlike a consumer one', async () => {
    // The whole business-user path turns on this. If Oxford registers
    // like a gmail consultant, every governance rule downstream is
    // pointed at a company that does not know its own domain.
    const c = await prisma.company.findUniqueOrThrow({ where: { id: w.companyId['Oxford Corp'] } })
    expect(c.domain).toBe('oxfordcorp.com')
  })

  it('the chain is wired: client to MSP to GSI to sub to bench vendor', async () => {
    const link = async (fromName: string, toName: string, relationship: string) => {
      as(w.ownerEmail[fromName])
      const r = await json(await addCounterparty(req('POST', '/api/counterparties', {
        otherCompanyId: w.companyId[toName], relationship,
      })))
      expect([200, 201, 409], `${fromName}->${toName}: ${JSON.stringify(r.body)}`).toContain(r.status)
    }
    await link('Oxford Corp', 'Yoh Services', 'SUPPLIER')
    await link('Yoh Services', 'Oxford Corp', 'CLIENT')
    await link('Yoh Services', 'Teleworld Solutions', 'SUPPLIER')
    await link('Teleworld Solutions', 'Yoh Services', 'CLIENT')
    await link('Teleworld Solutions', 'Insight Global', 'SUPPLIER')
    await link('Insight Global', 'Teleworld Solutions', 'CLIENT')
    for (const bv of benchVendors()) {
      await link('Insight Global', bv.name, 'SUPPLIER')
      await link(bv.name, 'Insight Global', 'CLIENT')
    }
  }, 120_000)

  it('the bench vendors have people on the bench to sell', async () => {
    // Written directly rather than through the route: this is the
    // fixture, not the thing under test, and 120 sequential route calls
    // would dominate the run before day one.
    for (const bv of benchVendors()) {
      for (let i = 0; i < 60; i++) {
        const skills = pick(SKILLS)
        const person = await prisma.person.create({
          data: {
            name: `Consultant ${bv.domain.split('.')[0]}${i}`,
            primaryEmail: `c${i}@${bv.domain.replace('.', '-')}.example`,
          },
        })
        const profile = await prisma.consultantProfile.create({
          data: {
            personId: person.id,
            headline: skills[0],
            skills,
            location: pick(CITIES),
            workAuth: pick(['US_CITIZEN', 'GC', 'H1B']),
            rateFloor: int(55, 120) * 100,
            availableFrom: dayOf(int(0, 20)),
            visibility: 'VERIFIED',
            confirmedAt: dayOf(0),
            confirmedVia: 'EMAIL',
          },
        })
        await prisma.benchListing.create({
          data: { consultantId: profile.id, companyId: w.companyId[bv.name], tier: 'RETAINED' },
        })
        w.consultants.push({ profileId: profile.id, personId: person.id, vendor: bv.name, skills })
      }
    }
    expect(w.consultants.length).toBe(120)
  }, 180_000)

  it(`survives ${TOTAL.toLocaleString()} transactions with its invariants intact`, async () => {
    const invariantFailures: string[] = []

    for (let day = 0; day < DAYS; day++) {
      for (let n = 0; n < PER_DAY; n++) {
        await oneTransaction(day)
      }
      const bad = await checkInvariants(day)
      invariantFailures.push(...bad)
      if (invariantFailures.length > 6) break
    }

    report()
    expect(invariantFailures, invariantFailures.slice(0, 6).join('\n')).toEqual([])
  }, 3_600_000)
})

// ── what the parties actually do ──────────────────────────────────────

async function oneTransaction(day: number) {
  const roll = rnd()

  // Weighted the way a real week is: mostly timesheets and reading
  // lists, occasionally a new role, rarely a new contract. Weighting it
  // evenly would have tested a world nobody works in.
  if (roll < 0.10) return postRequirement(day)
  if (roll < 0.30) return submitCandidate(day)
  if (roll < 0.38) return listAnotherBench(day)
  if (roll < 0.44) return readBench(day)
  if (roll < 0.50) return readRequirements(day)
  if (roll < 0.58) return signContract(day)
  if (roll < 0.80) return enterTimesheet(day)
  if (roll < 0.92) return readTimesheets(day)
  return readPeople(day)
}

async function postRequirement(day: number) {
  // Any of the four Oxford managers, so the approval chain sees more
  // than one requester.
  const client = firm('CLIENT')
  const manager = pick(client.people)
  as(manager.email)
  const skills = pick(SKILLS)
  const r = await act('requirement.create', day, async () =>
    json(await createRequirement(req('POST', '/api/requirements', {
      companyId: w.companyId[client.name],
      title: `${skills[0]} — ${pick(CITIES).split(',')[0]}`,
      skills,
      location: pick(CITIES),
      billMin: int(60, 90) * 100,
      billMax: int(95, 140) * 100,
      months: int(3, 12),
      startDate: iso(dayOf(day + int(7, 30))),
    })))
  )
  const id = r.body?.data?.requirement?.id ?? r.body?.data?.id
  if (id) w.requirements.push({ id, companyId: w.companyId[client.name], skills })
}

async function submitCandidate(day: number) {
  if (!w.requirements.length || !w.consultants.length) return
  const rq = pick(w.requirements)
  const c = pick(w.consultants)
  as(w.ownerEmail[c.vendor])
  const r = await act('submission.create', day, async () =>
    json(await createSubmission(req('POST', '/api/submissions', {
      requirementId: rq.id,
      personIds: [c.personId],
      rate: int(60, 130) * 100,
      fromCompanyId: w.companyId[c.vendor],
    })))
  )
  const item = r.body?.data?.results?.[0]
  if (item?.submissionId) {
    w.submissions.push({ id: item.submissionId, requirementId: rq.id, personId: c.personId })
  }
}

async function listAnotherBench(day: number) {
  // The same consultant listed by a second vendor. This is the setup
  // for cross-vendor tenure, and it is also the duplicate-submission
  // case that burns a consultant with a client.
  if (!w.consultants.length) return
  const c = pick(w.consultants)
  const other = benchVendors().find((b) => b.name !== c.vendor)
  if (!other) return
  as(w.ownerEmail[other.name])
  await act('bench.list', day, async () =>
    json(await createListing(req('POST', '/api/bench/listings', {
      consultantId: c.profileId, tier: 'MARKETING',
    })))
  )
}

async function readRequirements(day: number) {
  const f = pick(NETWORK)
  as(w.ownerEmail[f.name])
  await act('requirements.read', day, async () => json(await listRequirements(req('GET', '/api/requirements'))))
}

async function readTimesheets(day: number) {
  const f = pick(NETWORK)
  as(w.ownerEmail[f.name])
  await act('timesheets.read', day, async () => json(await listTimesheets(req('GET', '/api/timesheets'))))
}

async function readPeople(day: number) {
  const f = pick(NETWORK)
  as(w.ownerEmail[f.name])
  await act('people.read', day, async () => json(await listPeople(req('GET', '/api/people'))))
}

async function readBench(day: number) {
  const f = pick(benchVendors())
  as(w.ownerEmail[f.name])
  await act('bench.read', day, async () => json(await listBench(req('GET', '/api/bench'))))
}

async function signContract(day: number) {
  if (!w.consultants.length) return
  const c = pick(w.consultants)
  const vendorId = w.companyId[c.vendor]
  as(w.ownerEmail[c.vendor])
  const bill = int(80, 140) * 100
  const r = await act('contract.create', day, async () =>
    json(await createContract(req('POST', '/api/contracts', {
      personId: c.personId,
      companyId: vendorId,
      clientCompanyId: w.companyId['Insight Global'],
      billRate: bill,
      billCurrency: 'USD',
      startDate: iso(dayOf(day)),
      payRate: Math.round(bill * 0.78),
      payCurrency: 'USD',
      contractType: pick(['W2', 'C2C']),
    })))
  )
  const id = r.body?.data?.sellContract?.id ?? r.body?.data?.contract?.id
  if (!id) return
  w.contracts.push({ id, personId: c.personId, vendorId, clientId: w.companyId['Insight Global'] })
  await act('contract.activate', day, async () =>
    json(await activateContract(
      req('POST', `/api/contracts/${id}/activate`, { action: 'activate' }),
      { params: Promise.resolve({ id }) }
    ))
  )
}

async function enterTimesheet(day: number) {
  if (!w.contracts.length) return
  const k = pick(w.contracts)
  // The person whose hours they are. Anyone else entering them is the
  // thing timesheet-authority exists to refuse, and it is tested
  // directly in the pure suite rather than guessed at here.
  const person = await prisma.person.findUnique({ where: { id: k.personId }, select: { primaryEmail: true } })
  if (!person?.primaryEmail) return
  as(person.primaryEmail)
  const start = dayOf(day - (day % 7))
  const days: Record<string, number> = {}
  for (let i = 0; i < 5; i++) days[iso(new Date(start.getTime() + i * 86400000))] = 8
  const r = await act('timesheet.create', day, async () =>
    json(await createTimesheet(req('POST', '/api/timesheets', {
      sellContractId: k.id,
      periodStart: iso(start),
      periodEnd: iso(new Date(start.getTime() + 4 * 86400000)),
      days,
    })))
  )
  const id = r.body?.data?.timesheet?.id ?? r.body?.data?.id
  if (id) w.timesheets.push({ id, contractId: k.id, personId: k.personId })
}

// ── the invariants, checked every simulated day ───────────────────────

async function checkInvariants(day: number): Promise<string[]> {
  const bad: string[] = []

  // CLAUDE.md: a Submission requires a live BenchListing granted by the
  // consultant. A route that reaches around this is the single most
  // damaging bug available here — it submits somebody who never agreed.
  const ungranted = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT COUNT(*)::bigint AS n FROM "Submission" s
    WHERE NOT EXISTS (
      SELECT 1 FROM "BenchListing" bl
      JOIN "ConsultantProfile" cp ON cp.id = bl."consultantId"
      WHERE cp."personId" = s."personId" AND bl."companyId" = s."fromCompanyId"
    )`)
  if (Number(ungranted[0].n) > 0) {
    bad.push(`day ${day}: ${ungranted[0].n} submissions with no bench listing from the submitting company`)
  }

  // Unique on (requirementId, personId) — first submission wins. Two
  // vendors putting the same person forward gets both rejected by the
  // client, and blames the consultant for it.
  const dupes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "requirementId", "personId" FROM "Submission"
      GROUP BY 1,2 HAVING COUNT(*) > 1
    ) d`)
  if (Number(dupes[0].n) > 0) {
    bad.push(`day ${day}: ${dupes[0].n} requirement/person pairs submitted more than once`)
  }

  // Money that cannot be true: a bill rate under the pay rate is a
  // placement sold at a loss, and nothing in the product should mint one.
  //
  // Joined through ContractLink, not through personId. The first version
  // of this check matched any buy candidate to any sell contract for the
  // same person and reported three false positives inside a thousand
  // transactions — a consultant on two contracts at different rates is
  // ordinary, and comparing one contract's cost to another's price is
  // meaningless. The link table is what says which buy pays for which
  // sell.
  const upside = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT COUNT(*)::bigint AS n
    FROM "SellContract" sc
    JOIN "ContractLink" cl ON cl."sellContractId" = sc.id
    JOIN "BuyContractCandidate" bcc
      ON bcc."buyContractId" = cl."buyContractId"
     AND bcc."personId" = sc."personId"
    WHERE bcc."payRate" > sc."billRate"`)
  if (Number(upside[0].n) > 0) {
    bad.push(`day ${day}: ${upside[0].n} placements where the pay rate exceeds the bill rate`)
  }

  return bad
}

function report() {
  const total = [...stats.values()].reduce((a, s) => a + s.ok + s.refused + s.crashed, 0)
  console.log(`\n${'='.repeat(78)}`)
  console.log(`${total.toLocaleString()} transactions over ${DAYS} simulated days`)
  console.log('='.repeat(78))
  console.log(`\n${'action'.padEnd(22)}${'ok'.padStart(7)}${'refused'.padStart(9)}${'crashed'.padStart(9)}${'p50'.padStart(7)}${'p95'.padStart(7)}`)
  for (const [name, s] of [...stats.entries()].sort()) {
    console.log(
      name.padEnd(22) + String(s.ok).padStart(7) + String(s.refused).padStart(9) +
      String(s.crashed).padStart(9) + `${pct(s.ms, 50)}ms`.padStart(7) + `${pct(s.ms, 95)}ms`.padStart(7)
    )
  }

  console.log('\np95 latency by decile of the run — growth here means an unbounded query:')
  console.log('action'.padEnd(22) + Array.from({ length: 10 }, (_, i) => `d${i}`.padStart(6)).join(''))
  for (const [name, buckets] of [...timeline.entries()].sort()) {
    const cells = buckets.map((b) => (b.length ? `${pct(b, 95)}` : '·').padStart(6)).join('')
    console.log(name.padEnd(22) + cells)
  }

  if (crashes.length) {
    console.log(`\n${crashes.length} crashes (first few):`)
    for (const c of crashes.slice(0, 8)) console.log(`  day ${c.day} ${c.action}: ${c.error}`)
  }
  console.log()
}
