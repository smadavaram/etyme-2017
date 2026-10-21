/**
 * The generated world's frame: every firm, every seated person, where
 * each firm works, each client's program, and who trades with whom.
 *
 * `buildFrame` decides all of it without the database, from stable keys,
 * so the same call always returns the same world and every id is known
 * before anything is written. `seedFrame` writes it in steps (the steps
 * are `frameSteps()`, run by lib/seed-scale/index): each reads what exists
 * once per table and writes only what is missing, so a second seeding
 * writes nothing.
 *
 * Every firm is made through `createCompany`, the function sign-up and
 * "Add company" use, so a generated firm looks exactly like a signed-up
 * one: the full default roles for its kind, a pack, a pay rhythm, a head
 * office, holidays, `claimedAt`. The base world writes its firms by hand;
 * this is the first seed that matches sign-up (docs/seed-scale-brief.md,
 * section 1.3). Prime, sub-vendor and bench are positions, not a kind:
 * `supplierPosture` is written on every supplier, which no seed did
 * before, and prime against sub-vendor is the PRIME tie on the register.
 */

import type { Prisma } from '@prisma/client'
import { prisma as db } from '@/lib/db'
import { createCompany } from '@/lib/company-create'
import { costCenterCode } from '@/lib/seed-coding'
import { seedCalendar } from '@/lib/seed-calendar'
import { day, seedPlanYear, seedToday } from '@/lib/seed-days'
import { holidaysFor } from '@/lib/holidays'
import { DESKS, DESK_ROLES } from '@/lib/demo-desks'
import { namedCompanies } from '@/lib/positioning'
import { INDUSTRIES, SUPPLIER_STEMS, industry } from './industries'
import { agreementTermsFor } from './rates/pure'
import {
  NameBook, STAFF_NUMBER_FROM, between, emailFor, fold, idFor, keyed, minutesAfter, pick, slugFor, weighted, writeMissing, batch,
} from './kit'
import {
  INDUSTRY_KEYS, SCALE, SCALE_SLUG_PREFIX, type CompanyKind, type IndustryKey, type Position, type ScaleFirm, type ScaleFrame,
  type ScaleSeat, type ScaleSite, type Share, type Trade,
} from './types'

/** A row whose id the generator chose. */
type WithId<T> = T & { id: string }

// ── Who sits where ────────────────────────────────────────────────────

/** The roles seated at each position, the Owner first. A name twice is two people in one role. */
const SEATS: Record<Position, readonly string[]> = {
  CLIENT: ['Owner', 'Program Manager', 'Hiring Manager', 'Hiring Manager', 'Approver', 'HR Partner', 'Procurement Lead', 'AP Clerk', 'Compliance Officer'],
  MSP: ['Owner', 'Program Manager', 'Supplier Manager', 'Coordinator', 'AP Clerk', 'Compliance Officer'],
  GSI: ['Owner', 'Delivery Manager', 'Delivery Manager', 'AP & Payroll', 'Recruiter', 'Resource Manager', 'HR', 'Account Manager', 'Finance'],
  PRIME: ['Owner', 'Recruiter', 'Resource Manager', 'Account Manager', 'AP & Payroll', 'Finance', 'Contract Manager', 'Accounts Receivable', 'Compliance Officer'],
  SUB_VENDOR: ['Owner', 'Recruiter', 'Account Manager', 'AP & Payroll'],
  BENCH: ['Owner', 'Recruiter', 'Resource Manager', 'AP & Payroll', 'Finance'],
  SOLO: ['Owner'],
}

const KIND_OF: Record<Position, CompanyKind> = {
  CLIENT: 'CLIENT', MSP: 'MSP', GSI: 'GSI', PRIME: 'VENDOR', SUB_VENDOR: 'VENDOR', BENCH: 'VENDOR', SOLO: 'CONSULTANT_CORP',
}

/** "sells to clients directly" or "sells through other suppliers" (lib/parties `postureWord`). */
const POSTURE_OF: Record<Position, 'PRIME' | 'BENCH' | null> = {
  CLIENT: null, MSP: null, GSI: 'PRIME', PRIME: 'PRIME', SUB_VENDOR: 'BENCH', BENCH: 'BENCH', SOLO: null,
}

/** The demo role key a role opens as: the first door whose roles name it. */
export function roleKeyOf(role: string): string | null {
  if (role === 'Owner') return 'owner'
  return DESKS.find((d) => DESK_ROLES[d].includes(role)) ?? null
}

const COUNT: [Position, number][] = [
  ['CLIENT', SCALE.clients], ['GSI', SCALE.gsis], ['MSP', SCALE.msps],
  ['PRIME', SCALE.primes], ['SUB_VENDOR', SCALE.subVendors], ['BENCH', SCALE.benchFirms],
]

// ── Names of firms ────────────────────────────────────────────────────

const CLIENT_WORD: Record<IndustryKey, string> = {
  IT: 'Software', HEALTHCARE: 'Health', MANUFACTURING: 'Industries', FINANCE: 'Financial',
}
const SUFFIXES: Record<Exclude<Position, 'CLIENT' | 'SOLO'>, readonly string[]> = {
  GSI: ['Consulting', 'Technologies', 'Systems'],
  MSP: ['Program Services', 'Workforce Programs'],
  PRIME: ['Staffing', 'Talent', 'Partners'],
  SUB_VENDOR: ['Resourcing', 'Associates', 'Workforce'],
  BENCH: ['Academy', 'Talent Labs', 'Skills'],
}

/** The base world's firm names a generated firm may not take, lower case. Kept short and checked by the test. */
const BASE_NAMES = new Set([
  'northbend athletic', 'cavanaugh glassworks', 'talvern medical', 'auralis software', 'maren msp', 'veritan talent',
  'brightmoor staffing', 'computer systems', 'techpeple', 'teleworld solutions', 'aptiva workforce', 'kestrel msp',
  'harlow health', 'halcyon talent', 'sundara systems', 'pinnacle resourcing',
])

// ── Client programs ───────────────────────────────────────────────────

const PROGRAM_TREE: Record<IndustryKey, { unit: string; departments: { code: string; name: string }[] }> = {
  IT: { unit: 'Technology', departments: [{ code: 'APPS', name: 'Apps' }, { code: 'DATA', name: 'Data' }, { code: 'SEC', name: 'Security' }] },
  HEALTHCARE: { unit: 'Clinical services', departments: [{ code: 'NURS', name: 'Nursing' }, { code: 'CSYS', name: 'Clinical systems' }, { code: 'RSCH', name: 'Research' }] },
  MANUFACTURING: { unit: 'Operations', departments: [{ code: 'PLNT', name: 'Plants' }, { code: 'ENGR', name: 'Engineering' }, { code: 'QUAL', name: 'Quality' }] },
  FINANCE: { unit: 'Finance and risk', departments: [{ code: 'TRAD', name: 'Trading' }, { code: 'RISK', name: 'Risk' }, { code: 'FSYS', name: 'Finance systems' }] },
}

/**
 * A client's time limit, in months: the TENURE_CAP rule its policy
 * carries. Every other client 18, the rest 24. One writer (the policy
 * below) and one reader for everybody else (supply's careers keep a
 * minority near it).
 */
export function timeLimitMonths(client: Pick<ScaleFirm, 'index'>): number {
  return client.index % 2 === 0 ? 18 : 24
}

/** The earliest day, counted from the base world's birthday, any generated history starts on. */
export const EARLIEST_DAY = -700

/** The band a client's rate rule warns outside, cents an hour. Money's bands for its roles sit inside it. */
const RATE_RULE_BAND: Record<IndustryKey, [number, number]> = {
  IT: [8000, 16000], HEALTHCARE: [6000, 13000], MANUFACTURING: [7000, 15000], FINANCE: [9000, 17000],
}

// ── Building it, without the database ─────────────────────────────────

const OFFSHORE_CITY: Record<'IN' | 'GB', string[]> = {
  IN: ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai'],
  GB: ['Manchester', 'Leeds', 'Bristol'],
}

function sitesFor(position: Position, index: number, firmKey: string, name: string, place: string): ScaleSite[] {
  const head: ScaleSite = { id: idFor(`${firmKey}/site/0`), name: `${name} — head office`, country: 'US', city: place, primary: true }
  const abroad: ('IN' | 'GB')[] = []
  if (position === 'CLIENT' && index % 5 !== 1 && index % 5 !== 4) abroad.push(index % 2 ? 'GB' : 'IN')
  if (position === 'GSI') abroad.push('IN', ...(index % 2 === 0 ? (['GB'] as const) : []))
  if (position === 'PRIME' && index % 4 === 0) abroad.push('IN')
  if (position === 'SUB_VENDOR' && index % 3 === 0) abroad.push('IN')
  if (position === 'BENCH' && index % 5 === 0) abroad.push('GB')
  const r = keyed(`${firmKey}/sites`)
  return [
    head,
    ...abroad.map((country, i): ScaleSite => {
      const city = pick(r, OFFSHORE_CITY[country])
      return { id: idFor(`${firmKey}/site/${i + 1}`), name: `${name} — ${city}`, country, city, primary: false }
    }),
  ]
}

/** The industries a firm at this position covers. Clients one; suppliers one or two, every industry covered. */
function industriesFor(position: Position, index: number, r: () => number): IndustryKey[] {
  if (position === 'CLIENT') return [(['IT', 'IT', 'IT', 'IT', 'HEALTHCARE', 'HEALTHCARE', 'MANUFACTURING', 'MANUFACTURING', 'FINANCE', 'FINANCE'] as const)[index % 10]]
  if (position === 'MSP') return [...INDUSTRY_KEYS]
  const first = INDUSTRY_KEYS[index % INDUSTRY_KEYS.length]
  if (r() < 0.35) {
    const second = INDUSTRY_KEYS[(index + 1 + Math.floor(r() * 3)) % INDUSTRY_KEYS.length]
    return second === first ? [first] : [first, second]
  }
  return [first]
}

/**
 * The whole frame, decided without the database. Pure: the same output
 * on every call, given the same birthday (`anchorSeed` first).
 */
export function buildFrame(): ScaleFrame {
  const birthday = seedToday()
  const names = new NameBook()
  const firmNames = new Set<string>(BASE_NAMES)
  const firms: ScaleFirm[] = []
  let staffNumber = STAFF_NUMBER_FROM
  let supplierStem = 0

  for (const [position, count] of COUNT) {
    for (let n = 1; n <= count; n++) {
      const index = firms.length
      const firmKey = `firm/${position.toLowerCase()}/${String(n).padStart(2, '0')}`
      const r = keyed(firmKey)
      const industries = industriesFor(position, n - 1, r)
      const home = industry(industries[0])

      // A name nobody else has, built from the industry's invented stems.
      // A client takes a stem from its industry; every other firm the next
      // unused one of the supplier stems, so no two firms share a word.
      let name = ''
      if (position === 'CLIENT') {
        const stems = home.firmStems
        for (let i = 0; i < stems.length && !name; i++) {
          const candidate = `${stems[(n + i) % stems.length]} ${CLIENT_WORD[industries[0]]}`
          if (!firmNames.has(candidate.toLowerCase())) name = candidate
        }
      } else {
        const stem = SUPPLIER_STEMS[supplierStem++]
        const suffixes = SUFFIXES[position as Exclude<Position, 'CLIENT' | 'SOLO'>]
        if (stem) name = `${stem} ${suffixes[n % suffixes.length]}`
      }
      if (!name || firmNames.has(name.toLowerCase())) throw new Error(`No firm name left for ${firmKey}.`)
      firmNames.add(name.toLowerCase())

      const id = idFor(firmKey)
      const createdAt = minutesAfter(day(-730), index)
      const seats: ScaleSeat[] = SEATS[position].map((roleName, s) => {
        const personName = names.take(`${firmKey}/seat/${s}`, firmKey)
        return {
          personId: idFor(`${firmKey}/person/${s}`),
          email: emailFor(personName, staffNumber++),
          name: personName,
          role: roleName,
          roleKey: roleKeyOf(roleName),
          companyId: id,
          // Strictly increasing per firm, the Owner first: the door opens
          // `<slug>/owner` as the first grant.
          grantedAt: minutesAfter(createdAt, s),
        }
      })
      const place = pick(r, home.places.filter((p) => p !== 'Remote'))
      const firm: ScaleFirm = {
        index,
        id,
        slug: slugFor(position, n, name),
        name,
        kind: KIND_OF[position],
        position,
        posture: POSTURE_OF[position],
        industries,
        niche: position === 'BENCH' ? pick(r, home.niches).key : null,
        country: 'US',
        sites: sitesFor(position, n - 1, firmKey, name, place),
        seats,
        seat(roleKey: string) { return this.seats.find((x) => x.roleKey === roleKey) ?? null },
      }
      if (position === 'CLIENT') {
        const tree = PROGRAM_TREE[industries[0]]
        const orgUnitIds: Record<string, string> = { [tree.unit]: idFor(`${firmKey}/unit/top`) }
        for (const d of tree.departments) orgUnitIds[d.name] = idFor(`${firmKey}/unit/${d.code}`)
        firm.program = {
          orgUnitIds,
          costCenterIds: tree.departments.map((d) => idFor(`${firmKey}/cc/${d.code}`)),
          approverId: seats.find((x) => x.role === 'Approver')!.personId,
          hiringManagerId: seats.find((x) => x.role === 'Hiring Manager')!.personId,
        }
      }
      firms.push(firm)
    }
  }

  const trades = tradesFor(firms)
  return frameOf(firms, trades, birthday)
}

/** The register: panels of six to twelve, subs under primes, bench firms under both, five MSPs each running a client. */
function tradesFor(firms: ScaleFirm[]): Trade[] {
  const at = (p: Position) => firms.filter((f) => f.position === p)
  const clients = at('CLIENT'), gsis = at('GSI'), msps = at('MSP'), primes = at('PRIME'), subs = at('SUB_VENDOR'), bench = at('BENCH')
  const shares = (a: ScaleFirm, b: ScaleFirm) => a.industries.some((i) => b.industries.includes(i))
  const trades: Trade[] = []
  const key = new Set<string>()
  const add = (t: Omit<Trade, 'agreementId' | 'disclosesSubVendors' | 'tier'> & Partial<Pick<Trade, 'tier' | 'disclosesSubVendors'>>) => {
    const k = `${t.seller}|${t.buyer}|${t.relationship}`
    if (key.has(k)) return
    key.add(k)
    const paper = t.relationship === 'CLIENT' || t.relationship === 'PRIME'
    trades.push({
      tier: null, disclosesSubVendors: false, ...t,
      agreementId: paper ? idFor(`agreement/${t.seller}/${t.buyer}`) : null,
    })
  }
  const tierFor = (k: string): Trade['tier'] =>
    weighted(keyed(`tier/${k}`), [['PREFERRED', 20], ['APPROVED', 65], ['PROBATION', 15]]) as Trade['tier']

  // ── Each client's panel: one or two integrators, one or two bench firms, the rest primes ──
  const panel = new Map<string, ScaleFirm[]>()
  for (const c of clients) {
    const r = keyed(`panel/${c.id}`)
    const size = between(r, SCALE.panelSize.min, SCALE.panelSize.max)
    const pickSome = (from: ScaleFirm[], n: number) => {
      const pool = from.filter((f) => shares(f, c))
      const out: ScaleFirm[] = []
      for (let i = 0; i < pool.length && out.length < n; i++) out.push(pool[(Math.floor(r() * pool.length) + i) % pool.length])
      return [...new Set(out)]
    }
    const chosen = [...pickSome(gsis, between(r, 1, 2)), ...pickSome(bench, between(r, 1, 2))]
    for (const p of pickSome(primes, size)) if (chosen.length < size && !chosen.includes(p)) chosen.push(p)
    panel.set(c.id, chosen)
  }
  // Every prime and integrator sits on at least one panel, at the client of its industry with the most room.
  for (const s of [...primes, ...gsis]) {
    if ([...panel.values()].some((list) => list.includes(s))) continue
    const room = clients
      .filter((c) => shares(s, c) && panel.get(c.id)!.length < SCALE.panelSize.max)
      .sort((a, b) => panel.get(a.id)!.length - panel.get(b.id)!.length)[0]
      ?? clients.filter((c) => panel.get(c.id)!.length < SCALE.panelSize.max).sort((a, b) => panel.get(a.id)!.length - panel.get(b.id)!.length)[0]
    if (room) panel.get(room.id)!.push(s)
  }
  for (const c of clients) {
    for (const s of panel.get(c.id)!) add({ seller: s.id, buyer: c.id, relationship: 'CLIENT', tier: tierFor(`${s.id}/${c.id}`) })
  }
  // Two client-and-prime agreements disclose the names below the prime, so the disclosure rule is exercised.
  let disclosing = 0
  for (const t of trades) {
    if (disclosing >= 2) break
    if (t.relationship === 'CLIENT' && primes.some((p) => p.id === t.seller)) { t.disclosesSubVendors = true; disclosing++ }
  }

  // ── Sub-vendors sell to one or two primes of their industry; a few to an integrator ──
  for (const s of subs) {
    const r = keyed(`above/${s.id}`)
    const pool = primes.filter((p) => shares(p, s))
    const n = between(r, 1, 2)
    for (let i = 0; i < n && pool.length; i++) add({ seller: s.id, buyer: pool[(Math.floor(r() * pool.length) + i) % pool.length].id, relationship: 'PRIME' })
    if (r() < 0.25) {
      const g = gsis.filter((x) => shares(x, s))
      if (g.length) add({ seller: s.id, buyer: pick(r, g).id, relationship: 'PRIME' })
    }
  }
  // ── Bench firms sell to a prime or a sub-vendor, and sometimes an integrator ──
  for (const b of bench) {
    const r = keyed(`above/${b.id}`)
    const pool = [...primes, ...subs].filter((p) => shares(p, b))
    const n = between(r, 1, 3)
    for (let i = 0; i < n && pool.length; i++) add({ seller: b.id, buyer: pool[(Math.floor(r() * pool.length) + i) % pool.length].id, relationship: 'PRIME' })
    if (r() < 0.3) {
      const g = gsis.filter((x) => shares(x, b))
      if (g.length) add({ seller: b.id, buyer: pick(r, g).id, relationship: 'PRIME' })
    }
  }

  // ── Five MSPs, each running one client's program, and tied to that client's panel ──
  const run = clients.slice(0, SCALE.mspRuns)
  msps.forEach((m, i) => {
    const c = run[i % run.length]
    add({ seller: m.id, buyer: c.id, relationship: 'RUNS' })
    for (const s of panel.get(c.id)!) add({ seller: s.id, buyer: m.id, relationship: 'MSP' })
  })
  return trades
}

function frameOf(firms: ScaleFirm[], trades: Trade[], birthday: Date): ScaleFrame {
  const byId = new Map(firms.map((f) => [f.id, f]))
  const bySlug = new Map(firms.map((f) => [f.slug, f]))
  const list = (ids: string[]) => ids.map((id) => byId.get(id)).filter((f): f is ScaleFirm => !!f)
  return {
    firms,
    byId,
    bySlug,
    byPosition: (p) => firms.filter((f) => f.position === p),
    trades,
    panelOf: (clientId) => list(trades.filter((t) => t.buyer === clientId && t.relationship === 'CLIENT').map((t) => t.seller)),
    primesOf: (subId) => list(trades.filter((t) => t.seller === subId && t.relationship === 'PRIME').map((t) => t.buyer)),
    subsOf: (primeId) => list(trades.filter((t) => t.buyer === primeId && t.relationship === 'PRIME').map((t) => t.seller)),
    mspOf: (clientId) => {
      const t = trades.find((x) => x.buyer === clientId && x.relationship === 'RUNS')
      return t ? byId.get(t.seller) ?? null : null
    },
    industries: [...INDUSTRIES],
    clock: { birthday },
  }
}

/** A frame's firm names that read as a real company. Empty is the rule. */
export function namedFirms(frame: ScaleFrame): string[] {
  return namedCompanies(frame.firms.map((f) => f.name).join('. '))
}

// ── Writing it ────────────────────────────────────────────────────────

/** How many firms one step makes through `createCompany`: about twenty queries a firm, under the 350 a step may ask. */
export const FIRMS_PER_STEP = 10
/** How many firms one calendar step covers: 66 days a firm, one insert. */
export const CALENDAR_FIRMS_PER_STEP = 25

export interface FrameStep {
  name: string
  run(frame: ScaleFrame): Promise<void>
}

/** The frame's steps, in the order they must run. */
export function frameSteps(): FrameStep[] {
  const total = SCALE.clients + SCALE.gsis + SCALE.msps + SCALE.suppliers
  const firmShares = Math.ceil(total / FIRMS_PER_STEP)
  const calendarShares = Math.ceil(total / CALENDAR_FIRMS_PER_STEP)
  return [
    { name: 'scale:staff', run: seedStaff },
    ...Array.from({ length: firmShares }, (_, index): FrameStep => ({
      name: `scale:firms:${index + 1}-of-${firmShares}`, run: (f) => seedFirms(f, { index, of: firmShares }),
    })),
    { name: 'scale:sites', run: seedSites },
    ...Array.from({ length: calendarShares }, (_, index): FrameStep => ({
      name: `scale:calendar:${index + 1}-of-${calendarShares}`, run: (f) => seedFirmCalendars(f, { index, of: calendarShares }),
    })),
    { name: 'scale:programs', run: seedPrograms },
    { name: 'scale:seats', run: seedSeats },
    { name: 'scale:trades', run: seedTrades },
    { name: 'scale:program-seats', run: seedProgramSeats },
  ]
}

/** Every step of the frame, one after another. Idempotent. */
export async function seedFrame(frame: ScaleFrame): Promise<void> {
  for (const s of frameSteps()) await s.run(frame)
}

/**
 * The frame for a step that runs in a later call: the same pure build,
 * after the clock is set from the base world's birthday.
 */
export async function loadFrame(): Promise<ScaleFrame> {
  const { worldAnchor } = await import('@/lib/seed-world')
  const { anchorSeed } = await import('@/lib/seed-days')
  anchorSeed((await worldAnchor())?.createdAt)
  return buildFrame()
}

const ofShare = <T>(rows: readonly T[], share?: Share): T[] => {
  if (!share) return [...rows]
  const from = Math.floor((rows.length * share.index) / share.of)
  const to = Math.floor((rows.length * (share.index + 1)) / share.of)
  return rows.slice(from, to)
}

/** Every seated person, in two inserts. */
async function seedStaff(frame: ScaleFrame): Promise<void> {
  const rows = frame.firms.flatMap((f) => f.seats.map((s) => ({ id: s.personId, name: s.name, primaryEmail: s.email, createdAt: s.grantedAt })))
  await writeMissing(db.person, rows)
}

/** One share of the firms, each through `createCompany`, the Owner seated as it is made. */
async function seedFirms(frame: ScaleFrame, share: Share): Promise<void> {
  const mine = ofShare(frame.firms, share)
  const have = new Set((await db.company.findMany({ where: { id: { in: mine.map((f) => f.id) } }, select: { id: true } })).map((c) => c.id))
  for (const f of mine) {
    if (have.has(f.id)) continue
    const owner = f.seats[0]
    await createCompany({
      id: f.id,
      locationId: f.sites[0].id,
      createdAt: owner.grantedAt,
      name: f.name,
      kind: f.kind,
      slug: f.slug,
      domain: null,
      country: f.country,
      posture: f.posture,
      byPersonId: owner.personId,
      seatAsOwner: true,
      isDemo: false,
      claimDomain: false,
      startsSetup: false,
    })
  }
  // A client is paid on 45 days and everybody else on 30, as the base world's firms are.
  const made = mine.filter((f) => !have.has(f.id))
  const clients = made.filter((f) => f.kind === 'CLIENT').map((f) => f.id)
  const others = made.filter((f) => f.kind !== 'CLIENT').map((f) => f.id)
  if (clients.length) await db.company.updateMany({ where: { id: { in: clients } }, data: { defaultPaymentTerms: 45 } })
  if (others.length) await db.company.updateMany({ where: { id: { in: others } }, data: { defaultPaymentTerms: 30 } })
}

/** The head office's city and every site abroad, with that country's public holidays on the firm's calendar. */
async function seedSites(frame: ScaleFrame): Promise<void> {
  const abroad = frame.firms.flatMap((f) => f.sites.filter((s) => !s.primary).map((s) => ({
    id: s.id, companyId: f.id, name: s.name, city: s.city, country: s.country, isPrimary: false,
  })))
  await writeMissing(db.companyLocation, abroad)
  // The head office was made by `createCompany` with the country only; the city is ours.
  const heads = frame.firms.map((f) => f.sites[0])
  const unset = await db.companyLocation.findMany({ where: { id: { in: heads.map((h) => h.id) }, city: null }, select: { id: true } })
  const byId = new Map(heads.map((h) => [h.id, h]))
  for (const u of unset) {
    const h = byId.get(u.id)!
    const [city, state] = h.city.split(', ')
    await db.companyLocation.update({ where: { id: u.id }, data: { city, state: state ?? null } })
  }
  // A site abroad keeps its own country's holidays, marked with that
  // country so they never move another site's dates (lib/holidays `appliesTo`).
  const years = calendarYears()
  const days = frame.firms.flatMap((f) => {
    const countries = [...new Set(f.sites.filter((s) => !s.primary).map((s) => s.country))]
    return countries.flatMap((country) => years.flatMap((y) => (holidaysFor(country, y) ?? []).map((h) => ({
      companyId: f.id, date: new Date(`${h.date}T00:00:00Z`), name: h.name, isRecurring: false, country,
    }))))
  })
  for (const b of batch(days)) await db.holiday.createMany({ data: b, skipDuplicates: true })
}

function calendarYears(): number[] {
  const born = seedToday().getUTCFullYear()
  return [born - 2, born - 1, born, born + 1, born + 2, born + 3]
}

/** One share of the firms' US calendars: the base world's own `seedCalendar`, one read and one insert. */
async function seedFirmCalendars(frame: ScaleFrame, share: Share): Promise<void> {
  await seedCalendar(new Map(ofShare(frame.firms, share).map((f) => [f.slug, { id: f.id }])))
}

/** Each client's program: units, cost centers, plans, the value rules, the standing rules, the policy. */
async function seedPrograms(frame: ScaleFrame): Promise<void> {
  const clients = frame.byPosition('CLIENT')
  const year = seedPlanYear()
  const units: WithId<Prisma.OrgUnitCreateManyInput>[] = []
  const centers: WithId<Prisma.CostCenterCreateManyInput>[] = []
  const plans: WithId<Prisma.HeadcountPlanCreateManyInput>[] = []
  const rules: WithId<Prisma.ApprovalRuleCreateManyInput>[] = []
  const policies: WithId<Prisma.GovernancePolicyCreateManyInput>[] = []
  const governance: WithId<Prisma.GovernanceRuleCreateManyInput>[] = []
  for (const c of clients) {
    const tree = PROGRAM_TREE[c.industries[0]]
    const p = c.program!
    const top = p.orgUnitIds[tree.unit]
    const owner = c.seats[0].personId
    const seatOf = (role: string) => c.seats.find((s) => s.role === role)!.personId
    units.push({ id: top, companyId: c.id, name: tree.unit, kind: 'BU' })
    tree.departments.forEach((d, i) => {
      units.push({ id: p.orgUnitIds[d.name], companyId: c.id, name: d.name, kind: 'DEPARTMENT', parentId: top })
      centers.push({
        id: p.costCenterIds[i], companyId: c.id, code: costCenterCode(d.code, c.name), name: `${d.name} — contingent`,
        orgUnitId: p.orgUnitIds[d.name], ownerId: owner,
      })
      // Room to hire within plan: the first department six heads, the others four.
      plans.push({
        id: idFor(`${c.id}/plan/${d.code}/${year}`), costCenterId: p.costCenterIds[i], period: year,
        approvedHeads: i === 0 ? 6 : 4, annualBudget: i === 0 ? 2_400_000 : 1_200_000, currency: 'USD',
      })
    })
    rules.push(
      { id: idFor(`${c.id}/rule/over-500k`), companyId: c.id, name: 'Over $500k', thresholdAmount: 500_000, approverId: p.approverId, rank: 1, authoredById: owner },
      { id: idFor(`${c.id}/rule/unit-400k`), companyId: c.id, name: `${tree.unit} — over $400k`, thresholdAmount: 400_000, approverId: p.approverId, rank: 1, authoredById: owner, orgUnitId: top },
      { id: idFor(`${c.id}/rule/lead`), companyId: c.id, name: 'Program lead', thresholdAmount: null, approverId: p.approverId, rank: 2, authoredById: owner },
      { id: idFor(`${c.id}/rule/hr`), companyId: c.id, name: `HR — ${tree.unit}`, kind: 'HR', thresholdAmount: null, approverId: seatOf('HR Partner'), rank: 1, orgUnitId: top, authoredById: seatOf('Program Manager') },
      { id: idFor(`${c.id}/rule/procurement`), companyId: c.id, name: `Procurement — ${tree.unit}`, kind: 'PROCUREMENT', thresholdAmount: null, approverId: seatOf('Procurement Lead'), rank: 1, orgUnitId: top, authoredById: seatOf('Program Manager') },
    )
    const policyId = idFor(`${c.id}/policy`)
    policies.push({ id: policyId, companyId: c.id, name: 'Contingent workforce policy', description: 'Co-employment, cover and rate controls for contract staff.' })
    const cap = timeLimitMonths(c)
    const band = RATE_RULE_BAND[c.industries[0]]
    governance.push(
      { id: idFor(`${c.id}/policy/tenure`), policyId, ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: cap }, description: `Nobody works here more than ${cap} months, across every supplier, without converting.`, ownerTeam: 'HR' },
      { id: idFor(`${c.id}/policy/break`), policyId, ruleType: 'BREAK_IN_SERVICE', enforcementMode: 'BLOCK', parameters: { breakDays: 90 }, description: '90 days out before coming back on contract.', ownerTeam: 'HR' },
      { id: idFor(`${c.id}/policy/band`), policyId, ruleType: 'RATE_BAND', enforcementMode: 'WARN', parameters: { minRate: band[0], maxRate: band[1] }, description: 'Outside the approved band needs a reason on the record.', ownerTeam: 'PROCUREMENT' },
      { id: idFor(`${c.id}/policy/insurance`), policyId, ruleType: 'INSURANCE_REQUIRED', enforcementMode: 'BLOCK', parameters: {}, description: 'A supplier whose general liability or workers’ comp has lapsed places nobody.', ownerTeam: 'PROCUREMENT' },
    )
  }
  // Parents before children: the top units, then the departments under them.
  await writeMissing(db.orgUnit, units.filter((u) => !u.parentId))
  await writeMissing(db.orgUnit, units.filter((u) => u.parentId))
  await writeMissing(db.costCenter, centers)
  await writeMissing(db.headcountPlan, plans)
  await writeMissing(db.approvalRule, rules)
  await writeMissing(db.governancePolicy, policies)
  await writeMissing(db.governanceRule, governance)
}

/** Every seat after the Owner, against the roles `createCompany` made: one read of the roles, two inserts. */
async function seedSeats(frame: ScaleFrame): Promise<void> {
  const roles = await db.role.findMany({ where: { companyId: { in: frame.firms.map((f) => f.id) } }, select: { id: true, companyId: true, name: true } })
  const roleOf = new Map(roles.map((r) => [`${r.companyId}|${r.name}`, r.id]))
  const rows: WithId<Prisma.ContextCreateManyInput>[] = []
  for (const f of frame.firms) {
    const tree = f.program ? PROGRAM_TREE[f.industries[0]] : null
    f.seats.forEach((s, i) => {
      if (i === 0) return // the Owner, seated by createCompany
      const roleId = roleOf.get(`${f.id}|${s.role}`)
      if (!roleId) throw new Error(`${f.name} has no ${s.role} role to seat ${s.name} in.`)
      // A client's hiring managers sit in a department each; the rest of its seats in the unit above.
      const hiring = f.seats.filter((x) => x.role === 'Hiring Manager').indexOf(s)
      const orgUnitId = tree && f.program
        ? hiring >= 0 ? f.program.orgUnitIds[tree.departments[hiring % tree.departments.length].name] : f.program.orgUnitIds[tree.unit]
        : null
      rows.push({
        id: idFor(`${f.id}/context/${i}`), personId: s.personId, companyId: f.id, roleId, type: 'EMPLOYEE',
        side: f.kind === 'CLIENT' ? 'BUY' : 'SELL', orgUnitId, grantedAt: s.grantedAt,
      })
    })
  }
  await writeMissing(db.context, rows)
}

/** The register, both rows of every tie, and an agreement and an engagement behind every tie that carries paper. */
async function seedTrades(frame: ScaleFrame): Promise<void> {
  const rows: (Prisma.CounterpartyCreateManyInput & { id: string })[] = []
  const agreements: (Prisma.MasterAgreementCreateManyInput & { id: string })[] = []
  const engagements: (Prisma.EngagementCreateManyInput & { id: string })[] = []
  const since = day(-400)
  for (const t of frame.trades) {
    const [sellerSays, buyerSays] =
      t.relationship === 'RUNS' ? ['CLIENT', 'MSP'] : t.relationship === 'MSP' ? ['MSP', 'SUPPLIER'] : [t.relationship, 'SUPPLIER']
    rows.push(
      { id: idFor(`tie/${t.seller}/${t.buyer}/${sellerSays}`), companyId: t.seller, otherCompanyId: t.buyer, relationship: sellerSays, since },
      { id: idFor(`tie/${t.buyer}/${t.seller}/${buyerSays}`), companyId: t.buyer, otherCompanyId: t.seller, relationship: buyerSays, since, tier: t.tier },
    )
    if (t.agreementId) {
      const seller = frame.byId.get(t.seller)!, buyer = frame.byId.get(t.buyer)!
      // The terms are money's (rates/pure `agreementTermsFor`), written once, here, with the row.
      const terms = agreementTermsFor(t, buyer, { runByMsp: frame.mspOf(t.buyer) !== null, industries: frame.industries })
      agreements.push({
        id: t.agreementId, vendorId: t.seller, clientId: t.buyer,
        paymentTerms: terms.paymentTerms, paymentTermsFrom: terms.paymentTermsFrom, billFrequency: terms.billFrequency,
        billAnchor: terms.billAnchor, billStraddle: terms.billStraddle, billableExpenseKinds: terms.billableExpenseKinds,
        billableExpenseKindsSaid: terms.billableExpenseKindsSaid, currency: terms.currency, minMarginPct: terms.minMarginPct,
        rateCard: (terms.rateCard ?? undefined) as Prisma.InputJsonValue | undefined,
        signedAt: since, effectiveDate: since, disclosesSubVendors: t.disclosesSubVendors,
      })
      engagements.push({ id: idFor(`engagement/${t.seller}/${t.buyer}`), msaId: t.agreementId, title: `${seller.name} for ${buyer.name}`, invoiceCycle: 'MONTHLY' })
    }
  }
  await writeMissing(db.counterparty, rows)
  await writeMissing(db.masterAgreement, agreements)
  await writeMissing(db.engagement, engagements)
}

/** Each MSP's seat in the program it runs, in the client's own Program Manager role, granted by the client's owner. */
async function seedProgramSeats(frame: ScaleFrame): Promise<void> {
  const runs = frame.trades.filter((t) => t.relationship === 'RUNS')
  if (runs.length === 0) return
  const roles = await db.role.findMany({
    where: { companyId: { in: runs.map((t) => t.buyer) }, name: 'Program Manager' },
    select: { id: true, companyId: true },
  })
  const roleOf = new Map(roles.map((r) => [r.companyId, r.id]))
  const rows = runs.map((t) => {
    const client = frame.byId.get(t.buyer)!
    const msp = frame.byId.get(t.seller)!
    return {
      id: idFor(`program-seat/${t.seller}/${t.buyer}`),
      clientCompanyId: client.id, officeCompanyId: msp.id, roleId: roleOf.get(client.id)!,
      grantedById: client.seats[0].personId, grantedAt: day(-400), validFrom: day(-400),
      reason: `${msp.name} runs ${client.name}’s contractor program.`,
    }
  })
  await writeMissing(db.programSeat, rows)
}

/**
 * A one-person company for somebody who left a bench for their own
 * (supply's people, career OWN_COMPANY), made through `createCompany`
 * with them as Owner. Idempotent: the same person always gets the same
 * company.
 */
export async function ensureSolo(frame: ScaleFrame, personId: string, name: string, email?: string): Promise<ScaleFirm> {
  const firmKey = `firm/solo/${personId}`
  const id = idFor(firmKey)
  // From the full name, which is unique in the generated world, so no two
  // one-person companies share a name (160 of them over 120 last names did).
  const companyName = `${name} Consulting LLC`
  const site: ScaleSite = { id: idFor(`${firmKey}/site/0`), name: `${companyName} — head office`, country: 'US', city: 'Remote', primary: true }
  const address = email ?? (await db.person.findUnique({ where: { id: personId }, select: { primaryEmail: true } }))?.primaryEmail ?? ''
  const firm: ScaleFirm = {
    index: frame.firms.length,
    id,
    // The person's own id closes the slug, so it is unique whatever the name.
    slug: `${SCALE_SLUG_PREFIX}solo-${fold(name).replace(/\./g, '-')}-${personId.slice(-6)}`,
    name: companyName,
    kind: 'CONSULTANT_CORP',
    position: 'SOLO',
    posture: null,
    industries: [],
    niche: null,
    country: 'US',
    sites: [site],
    seats: [{ personId, email: address, name, role: 'Owner', roleKey: 'owner', companyId: id, grantedAt: day(-200) }],
    seat(roleKey: string) { return this.seats.find((x) => x.roleKey === roleKey) ?? null },
  }
  const have = await db.company.findUnique({ where: { id }, select: { id: true, slug: true } })
  if (have) firm.slug = have.slug
  else {
    await createCompany({
      id, locationId: site.id, createdAt: day(-200), name: companyName, kind: 'CONSULTANT_CORP', slug: firm.slug,
      domain: null, country: 'US', posture: null, byPersonId: personId, seatAsOwner: true, isDemo: false,
      claimDomain: false, startsSetup: false,
    })
  }
  return firm
}
