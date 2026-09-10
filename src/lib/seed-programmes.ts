/**
 * Three client programmes, seated for every desk that works one.
 *
 * The world seed is one placement read from each firm in its chain. That
 * shows the product's shape and not its buyer. The buyer is a company
 * with a dozen suppliers, a history it cannot see, and four or five
 * different jobs that touch a contractor between the requisition and the
 * payment — and none of those jobs is "programme office".
 *
 * So each of Nike, Corning and Terumo BCT gets:
 *
 *   A desk per job. The programme manager who sets the rules, the hiring
 *   manager who needs somebody and signs their hours, the VP who signs
 *   the money, the AP clerk who pays what matched, the compliance officer
 *   who answers for tenure and paperwork. Real roles from
 *   lib/company-defaults, so what each desk cannot do is as seeded as
 *   what it can.
 *
 *   Something waiting at every desk. A requisition routed to the VP, a
 *   week of hours the manager has not signed, an invoice the clerk has
 *   not paid, a draft contract the supplier cannot start because the I-9
 *   is not on file, a person eleven months into an eighteen-month cap.
 *
 *   A history, across suppliers. The same person placed by one firm,
 *   released, and placed again by another — which is the number no
 *   supplier can compute and the reason a client pays for this.
 *
 * Idempotent, like the world it sits in. Everything is found before it
 * is made.
 */

import { prisma as db } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { rolesFor } from '@/lib/company-defaults'
import { day, at } from '@/lib/seed-days'

export interface World {
  firmBySlug: Map<string, { id: string }>
  seatBySlug: Map<string, { personId: string; email: string }>
  domain: string
  prefix: string
}

// ── The desks ────────────────────────────────────────────────────────
//
// One seat per job, not one seat per company. The email says which desk
// it is, so `world-nike-ap@` can be read off a URL by somebody who has
// never seen the roster.
export interface Desk {
  key: 'programme' | 'hiring' | 'ap' | 'compliance'
  role: string
  /** Which team the desk sits in, where that narrows what it sees. */
  unit?: string
}
export const DESKS: Desk[] = [
  { key: 'programme',  role: 'Programme Manager' },
  { key: 'hiring',     role: 'Hiring Manager', unit: 'Apps' },
  { key: 'ap',         role: 'AP Clerk' },
  { key: 'compliance', role: 'Compliance Officer' },
]

/** What a person on a placement has on file, by name rather than by rows. */
type Papers = 'CLEAR' | 'NO_I9' | 'BGC_EXPIRED' | 'BGC_MISSING'

interface Placement {
  role: string
  skills: string[]
  loc: string
  /** Client first, then each supplier down to whoever employs the person. */
  via: string[]
  /** Cents an hour. The client pays the first; each hop keeps the gap. */
  rates: number[]
  person: string
  workAuth: 'USC' | 'GC' | 'H1B'
  startedDaysAgo: number
  /** Negative: it ended that many days ago. */
  endsInDays: number
  state: 'IN_PROGRESS' | 'ENDED' | 'DRAFT'
  papers: Papers
  /** Whole weeks of hours the client has signed, and weeks still waiting on them. */
  weeks?: { approved: number; awaiting: number }
  /** The most recent invoice for the signed weeks, and where it got to. */
  invoice?: 'PAID' | 'SUBMITTED' | null
}

interface Candidate {
  person: string
  from: string
  rate: number
  status: 'SUBMITTED' | 'SHORTLISTED'
  round?: { state: 'PROPOSED' | 'CONFIRMED'; inDays: number; interviewers: string[] }
}

interface Programme {
  client: string
  loc: string
  people: {
    programme: string; hiring: string; ap: string; compliance: string
  }
  governance: { tenureCapMonths: number; breakDays: number; band: [number, number] }
  placements: Placement[]
  /** An approved role suppliers are working, with candidates in. */
  open: { title: string; skills: string[]; band: [number, number]; to: string[]; candidates: Candidate[] }
  /** A role big enough to need the VP, still waiting on them. */
  routed: { title: string; skills: string[]; headcount: number; billMax: number }
  /** Supplier certificates, in days until they run out. */
  cover: Record<string, { gl: number; wc: number }>
}

// ── The three ────────────────────────────────────────────────────────
//
// Horizontal on purpose. A glass plant, a sportswear company and a
// medical device maker hire a validation engineer, a demand planner and
// an SAP consultant through the same product. Nothing here is IT
// staffing except where the role happens to be.

const PROGRAMMES: Programme[] = [
  {
    client: 'nike', loc: 'Beaverton, OR',
    people: { programme: 'Dana Whitlock', hiring: 'Marcus Oyelaran', ap: 'Renata Kowal', compliance: 'Sophie Lindgren' },
    governance: { tenureCapMonths: 18, breakDays: 90, band: [7000, 15000] },
    placements: [
      { role: 'SAP S/4 finance lead', skills: ['SAP FICO', 'S/4HANA', 'Central Finance'], loc: 'Beaverton, OR',
        via: ['nike', 'computer-systems', 'cloudepa'], rates: [14500, 11800, 9000],
        person: 'Helena Marsh', workAuth: 'GC', startedDaysAgo: 200, endsInDays: 160, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 3, awaiting: 1 }, invoice: 'SUBMITTED' },
      { role: 'Commerce platform architect', skills: ['Salesforce Commerce', 'Node.js'], loc: 'Beaverton, OR',
        via: ['nike', 'brightmoor'], rates: [13200, 9600],
        person: 'Omar Haddad', workAuth: 'USC', startedDaysAgo: 45, endsInDays: 320, state: 'IN_PROGRESS',
        papers: 'BGC_EXPIRED', weeks: { approved: 2, awaiting: 0 }, invoice: 'PAID' },
      { role: 'Supply chain planning analyst', skills: ['Kinaxis', 'Demand planning'], loc: 'Beaverton, OR',
        via: ['nike', 'pinnacle'], rates: [9800, 7400],
        person: 'Lucía Fernández', workAuth: 'USC', startedDaysAgo: 30, endsInDays: 335, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 2, awaiting: 1 }, invoice: null },
      // The same person, a year earlier, through a different supplier.
      // Pinnacle sees one month; Brightmoor saw thirteen; only the client
      // can add them up, and only here.
      { role: 'Demand planner', skills: ['Demand planning', 'Excel'], loc: 'Beaverton, OR',
        via: ['nike', 'brightmoor'], rates: [8900, 6800],
        person: 'Lucía Fernández', workAuth: 'USC', startedDaysAgo: 470, endsInDays: -75, state: 'ENDED', papers: 'CLEAR' },
      // Past the cap and inside the break. The ask-back button is a date.
      { role: 'Data engineer', skills: ['Snowflake', 'dbt', 'Python'], loc: 'Beaverton, OR',
        via: ['nike', 'computer-systems'], rates: [12400, 9100],
        person: 'Kwame Mensah', workAuth: 'H1B', startedDaysAgo: 790, endsInDays: -50, state: 'ENDED', papers: 'CLEAR' },
      // Awarded, starting next week, and cannot: no I-9 on file.
      { role: 'Cybersecurity analyst', skills: ['SIEM', 'Splunk', 'Incident response'], loc: 'Beaverton, OR',
        via: ['nike', 'pinnacle'], rates: [11500, 8600],
        person: 'Ingrid Sørensen', workAuth: 'GC', startedDaysAgo: -7, endsInDays: 372, state: 'DRAFT', papers: 'NO_I9' },
    ],
    open: {
      title: 'Workday HCM integration lead', skills: ['Workday', 'Studio', 'Integrations'], band: [12000, 14000],
      to: ['computer-systems', 'brightmoor', 'pinnacle'],
      candidates: [
        { person: 'Rajesh Iyer', from: 'brightmoor', rate: 13400, status: 'SHORTLISTED',
          round: { state: 'CONFIRMED', inDays: 3, interviewers: ['Marcus Oyelaran, People Technology', 'Anita Shah, HRIS'] } },
        { person: 'Mei-Lin Chao', from: 'pinnacle', rate: 12800, status: 'SUBMITTED' },
      ],
    },
    routed: { title: 'Planning transformation — four Kinaxis consultants', skills: ['Kinaxis', 'S&OP'], headcount: 4, billMax: 13000 },
    cover: { 'computer-systems': { gl: 150, wc: 150 }, brightmoor: { gl: 20, wc: 200 }, pinnacle: { gl: 180, wc: 180 } },
  },
  {
    client: 'corning', loc: 'Corning, NY',
    people: { programme: 'Eleanor Vance', hiring: 'Derek Halvorsen', ap: 'Patrice Boyd', compliance: 'Miriam Osei' },
    governance: { tenureCapMonths: 24, breakDays: 90, band: [6500, 14000] },
    placements: [
      { role: 'Process validation engineer', skills: ['Process validation', 'Glass forming', 'Minitab'], loc: 'Corning, NY',
        via: ['corning', 'vertex-global', 'sahasra'], rates: [12800, 10300, 8000],
        person: 'Tomasz Nowak', workAuth: 'GC', startedDaysAgo: 120, endsInDays: 245, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 3, awaiting: 1 }, invoice: 'SUBMITTED' },
      { role: 'MES specialist', skills: ['Rockwell FactoryTalk', 'MES', 'OPC UA'], loc: 'Corning, NY',
        via: ['corning', 'halcyon'], rates: [11900, 8800],
        person: 'Aisha Bello', workAuth: 'USC', startedDaysAgo: 60, endsInDays: 305, state: 'IN_PROGRESS',
        papers: 'BGC_MISSING', weeks: { approved: 2, awaiting: 0 }, invoice: 'PAID' },
      { role: 'Quality systems auditor', skills: ['ISO 9001', 'IATF 16949', 'CAPA'], loc: 'Corning, NY',
        via: ['corning', 'arcadia'], rates: [10400, 7900],
        person: 'Felix Brandt', workAuth: 'USC', startedDaysAgo: 20, endsInDays: 345, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 1, awaiting: 1 }, invoice: null },
      { role: 'Supplier quality engineer', skills: ['PPAP', 'CAPA'], loc: 'Corning, NY',
        via: ['corning', 'halcyon'], rates: [9900, 7500],
        person: 'Felix Brandt', workAuth: 'USC', startedDaysAgo: 520, endsInDays: -90, state: 'ENDED', papers: 'CLEAR' },
      // Out long enough. Eligible to be asked back, and the button says so.
      { role: 'Optical test technician', skills: ['Optical metrology', 'LabVIEW'], loc: 'Corning, NY',
        via: ['corning', 'vertex-global'], rates: [7800, 5900],
        person: 'Nadia Petrova', workAuth: 'GC', startedDaysAgo: 900, endsInDays: -100, state: 'ENDED', papers: 'CLEAR' },
      { role: 'Controls engineer', skills: ['Allen-Bradley PLC', 'Studio 5000'], loc: 'Corning, NY',
        via: ['corning', 'halcyon'], rates: [10800, 8100],
        person: 'Samuel Adeyinka', workAuth: 'H1B', startedDaysAgo: -10, endsInDays: 355, state: 'DRAFT', papers: 'NO_I9' },
    ],
    open: {
      title: 'Environmental health and safety lead', skills: ['EHS', 'OSHA', 'ISO 14001'], band: [9000, 11000],
      to: ['vertex-global', 'halcyon', 'arcadia'],
      candidates: [
        { person: 'Yuki Tanaka', from: 'arcadia', rate: 10600, status: 'SHORTLISTED',
          round: { state: 'PROPOSED', inDays: 5, interviewers: ['Derek Halvorsen, Plant Operations'] } },
        { person: 'Priyanka Rao', from: 'vertex-global', rate: 9900, status: 'SUBMITTED' },
      ],
    },
    routed: { title: 'Fab expansion — six automation engineers', skills: ['Automation', 'PLC', 'Robotics'], headcount: 6, billMax: 11500 },
    cover: { 'vertex-global': { gl: 160, wc: 160 }, halcyon: { gl: 12, wc: 190 }, arcadia: { gl: 200, wc: 200 } },
  },
  {
    client: 'terumo-bct', loc: 'Lakewood, CO',
    people: { programme: 'Claire Ashworth', hiring: 'Rohan Desai', ap: 'Gloria Mendes', compliance: 'Hannah Baptiste' },
    governance: { tenureCapMonths: 18, breakDays: 90, band: [7000, 15500] },
    placements: [
      // Ten months through Computer Systems on top of thirteen through
      // Vertex. Twenty-three months at an eighteen-month cap, and neither
      // supplier knows the other's number. This is the wedge.
      { role: 'SAP BRIM consultant', skills: ['SAP BRIM', 'Convergent Invoicing', 'S/4HANA'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'computer-systems'], rates: [14800, 10900],
        person: 'Anders Lund', workAuth: 'GC', startedDaysAgo: 300, endsInDays: 60, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 3, awaiting: 1 }, invoice: 'SUBMITTED' },
      { role: 'SAP FI/CO analyst', skills: ['SAP FICO', 'ECC'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'vertex-global'], rates: [12600, 9400],
        person: 'Anders Lund', workAuth: 'GC', startedDaysAgo: 720, endsInDays: -330, state: 'ENDED', papers: 'CLEAR' },
      { role: 'Computer system validation engineer', skills: ['CSV', 'GAMP 5', '21 CFR Part 11'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'sundara', 'nimbus'], rates: [12200, 9900, 7700],
        person: 'Chidi Okafor', workAuth: 'H1B', startedDaysAgo: 90, endsInDays: 275, state: 'IN_PROGRESS',
        papers: 'CLEAR', weeks: { approved: 3, awaiting: 0 }, invoice: 'PAID' },
      { role: 'Data platform engineer', skills: ['Databricks', 'Azure', 'Python'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'vertex-global'], rates: [13000, 9800],
        person: 'Marta Kowalczyk', workAuth: 'USC', startedDaysAgo: 15, endsInDays: 350, state: 'IN_PROGRESS',
        papers: 'BGC_EXPIRED', weeks: { approved: 1, awaiting: 1 }, invoice: null },
      // Forty days out of a ninety-day break. Eligible in fifty.
      { role: 'Quality systems analyst', skills: ['QMS', 'TrackWise', 'CAPA'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'computer-systems'], rates: [9700, 7200],
        person: 'Hiro Sato', workAuth: 'USC', startedDaysAgo: 600, endsInDays: -40, state: 'ENDED', papers: 'CLEAR' },
      { role: 'Regulatory affairs specialist', skills: ['510(k)', 'EU MDR', 'Technical files'], loc: 'Lakewood, CO',
        via: ['terumo-bct', 'vertex-global'], rates: [11200, 8300],
        person: 'Beatriz Souza', workAuth: 'GC', startedDaysAgo: -5, endsInDays: 360, state: 'DRAFT', papers: 'NO_I9' },
    ],
    open: {
      title: 'Manufacturing finance analyst', skills: ['SAP CO', 'Product costing', 'Excel'], band: [9500, 11500],
      to: ['computer-systems', 'vertex-global', 'sundara'],
      candidates: [
        { person: 'Noor Rahman', from: 'computer-systems', rate: 11000, status: 'SHORTLISTED',
          round: { state: 'CONFIRMED', inDays: 2, interviewers: ['Rohan Desai, Manufacturing Finance', 'Kate Morrison, Controller'] } },
        { person: 'Elias Varga', from: 'vertex-global', rate: 10400, status: 'SUBMITTED' },
      ],
    },
    routed: { title: 'Lakewood plant — five QA technicians', skills: ['QA', 'GMP', 'Device assembly'], headcount: 5, billMax: 7500 },
    cover: { 'computer-systems': { gl: 150, wc: 150 }, 'vertex-global': { gl: 160, wc: 160 }, sundara: { gl: 140, wc: 140 } },
  },
]

// ── Helpers ──────────────────────────────────────────────────────────

/** "Lucía Fernández" → lucia.fernandez@… — accents folded, never dropped into a dot. */
const emailOf = (name: string) =>
  `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`

/** Five working days, eight hours each, ending `w` weeks ago. Same shape as the world seed. */
function week(w: number) {
  const start = day(-(w * 7 + 4)), end = day(-(w * 7))
  const days: Record<string, number> = {}
  for (let d = 0; d < 5; d++) days[day(-(w * 7 + 4) + d).toISOString().slice(0, 10)] = 8
  return { start, end, days }
}

export async function seedProgrammes(world: World): Promise<{ placements: number; people: number }> {
  const { firmBySlug, seatBySlug, domain, prefix } = world
  const people = new Set<string>()
  let placements = 0

  async function person(name: string) {
    const email = emailOf(name)
    people.add(email)
    return db.person.upsert({ where: { primaryEmail: email }, update: {}, create: { name, primaryEmail: email } })
  }

  async function trade(a: string, b: string, relationship: string) {
    const A = firmBySlug.get(a)!.id, B = firmBySlug.get(b)!.id
    if (!(await db.counterparty.findFirst({ where: { companyId: A, otherCompanyId: B, relationship } }))) {
      await db.counterparty.create({ data: { companyId: A, otherCompanyId: B, relationship } })
    }
  }

  async function agreement(vendorSlug: string, clientSlug: string, title: string) {
    const vendorId = firmBySlug.get(vendorSlug)!.id, clientId = firmBySlug.get(clientSlug)!.id
    const msa =
      (await db.masterAgreement.findFirst({ where: { vendorId, clientId } })) ??
      (await db.masterAgreement.create({
        data: { vendorId, clientId, paymentTerms: 45, currency: 'USD', signedAt: day(-400) },
      }))
    const eng =
      (await db.engagement.findFirst({ where: { msaId: msa.id, title } })) ??
      (await db.engagement.create({ data: { msaId: msa.id, title, invoiceCycle: 'MONTHLY' } }))
    return { msa, eng }
  }

  /** A bench listing, which is what makes a submission possible at all. */
  async function onBench(personId: string, skills: string[], loc: string, workAuth: string, vendorSlug: string) {
    const profile =
      (await db.consultantProfile.findFirst({ where: { personId } })) ??
      (await db.consultantProfile.create({
        data: { personId, skills, location: loc, visibility: 'VERIFIED', workAuth },
      }))
    const vendor = firmBySlug.get(vendorSlug)!
    if (!(await db.benchListing.findFirst({ where: { consultantId: profile.id, companyId: vendor.id } }))) {
      await db.benchListing.create({
        data: {
          consultantId: profile.id, companyId: vendor.id, tier: 'RETAINED', state: 'GRANTED',
          invitedAt: day(-130), respondedAt: day(-128), grantedAt: day(-128),
        },
      })
    }
    return profile
  }

  /** Supplier cover: only written where the world seed has not already. */
  async function cover(vendorSlug: string, gl: number, wc: number, uploadedById: string, verifiedById: string) {
    const co = firmBySlug.get(vendorSlug)!
    for (const [type, expires] of [['INSURANCE_GL', gl], ['INSURANCE_WC', wc]] as const) {
      if (await db.verification.findFirst({ where: { companyId: co.id, type } })) continue
      await db.verification.create({
        data: {
          companyId: co.id, type, status: 'CLEAR', provider: 'Hartford', issuedAt: day(expires - 365),
          expiresAt: day(expires), uploadedById, verifiedById, verifiedAt: day(-30),
          result: { outcome: 'CLEAR' },
        },
      })
    }
  }

  for (const p of PROGRAMMES) {
    const client = firmBySlug.get(p.client)!
    const slug = prefix + p.client
    const office = seatBySlug.get(p.client)!

    // ── The desks ──────────────────────────────────────────────────
    //
    // The roles a client starts with on sign-up, so a seeded desk holds
    // exactly what a real one would — and the AP clerk cannot raise a
    // requisition, which is the point of having an AP clerk.
    const roleByName = new Map<string, { id: string }>()
    for (const r of rolesFor('CLIENT')) {
      const role =
        (await db.role.findFirst({ where: { companyId: client.id, name: r.name } })) ??
        (await db.role.create({
          data: { companyId: client.id, name: r.name, permissions: r.permissions, isDefault: !!r.isOwner },
        }))
      roleByName.set(r.name, role)
    }
    const units = await db.orgUnit.findMany({ where: { companyId: client.id }, select: { id: true, name: true } })
    const unitByName = new Map(units.map((u) => [u.name, u]))

    const desk: Record<Desk['key'], { personId: string; email: string }> = {} as never
    for (const d of DESKS) {
      const email = `${slug}-${d.key}@${domain}`
      const name = p.people[d.key]
      const who = await db.person.upsert({ where: { primaryEmail: email }, update: { name }, create: { name, primaryEmail: email } })
      people.add(email)
      if (!(await db.context.findFirst({ where: { personId: who.id, companyId: client.id } }))) {
        await db.context.create({
          data: {
            personId: who.id, companyId: client.id, roleId: roleByName.get(d.role)!.id, type: 'EMPLOYEE',
            side: 'BUY', orgUnitId: d.unit ? unitByName.get(d.unit)?.id ?? null : null,
            grantReason: `Seeded programme — ${d.role}`,
          },
        })
      }
      desk[d.key] = { personId: who.id, email }
    }

    // ── The rules ──────────────────────────────────────────────────
    //
    // Without a policy the tenure page has no cap to measure against and
    // the compliance page is a list with no verdicts. Two BLOCKs where
    // the law grounds them, one WARN where it does not.
    const policy =
      (await db.governancePolicy.findFirst({ where: { companyId: client.id, isActive: true } })) ??
      (await db.governancePolicy.create({
        data: {
          companyId: client.id, name: 'Contingent workforce policy',
          description: 'Co-employment, cover and rate controls for contract staff.',
        },
      }))
    const rules: { ruleType: string; enforcementMode: string; parameters: object; description: string; ownerTeam: string }[] = [
      { ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: p.governance.tenureCapMonths },
        description: `Nobody works here more than ${p.governance.tenureCapMonths} months, across every supplier, without converting.`, ownerTeam: 'HR' },
      { ruleType: 'BREAK_IN_SERVICE', enforcementMode: 'BLOCK', parameters: { breakDays: p.governance.breakDays },
        description: `${p.governance.breakDays} days out before coming back on contract.`, ownerTeam: 'HR' },
      { ruleType: 'RATE_BAND', enforcementMode: 'WARN', parameters: { minRate: p.governance.band[0], maxRate: p.governance.band[1] },
        description: 'Outside the approved band needs a reason on the record.', ownerTeam: 'PROCUREMENT' },
      { ruleType: 'INSURANCE_REQUIRED', enforcementMode: 'BLOCK', parameters: {},
        description: 'A supplier whose general liability or workers\' comp has lapsed places nobody.', ownerTeam: 'PROCUREMENT' },
    ]
    for (const r of rules) {
      if (await db.governanceRule.findFirst({ where: { policyId: policy.id, ruleType: r.ruleType as never } })) continue
      await db.governanceRule.create({ data: { policyId: policy.id, ...r } as never })
    }

    // The budget line everything here is coded to.
    const costCentre = await db.costCenter.findFirst({ where: { companyId: client.id, code: { startsWith: 'APPS-' } } })

    // ── Who supplies them ──────────────────────────────────────────
    const suppliers = new Set<string>()
    for (const pl of p.placements) for (const s of pl.via.slice(1)) suppliers.add(s)
    for (const s of p.open.to) suppliers.add(s)
    for (const pl of [...p.placements.map((x) => x.via), ...p.open.to.map((s) => [p.client, s])]) {
      const [c, ...chain] = pl
      for (let i = 0; i < chain.length; i++) {
        const above = i === 0 ? c : chain[i - 1]
        await trade(chain[i], above, i === 0 ? 'CLIENT' : 'PRIME')
        await trade(above, chain[i], 'SUPPLIER')
      }
    }
    for (const [vendorSlug, c] of Object.entries(p.cover)) {
      await cover(vendorSlug, c.gl, c.wc, seatBySlug.get(vendorSlug)!.personId, desk.compliance.personId)
    }
    // Bench vendors below a prime carry their own cover, as the world
    // seed gives them; a prime with nobody below it is the employer and
    // needs its own. Anything not named above is filled in as current.
    for (const s of suppliers) {
      if (!p.cover[s]) await cover(s, 200, 200, seatBySlug.get(s)!.personId, desk.compliance.personId)
    }

    // ── The placements ─────────────────────────────────────────────
    for (const pl of p.placements) {
      const [, ...chain] = pl.via
      const employerSlug = chain[chain.length - 1]
      const employer = firmBySlug.get(employerSlug)!
      const who = await person(pl.person)
      await onBench(who.id, pl.skills, pl.loc, pl.workAuth, employerSlug)

      // A consultant who can sign in and enter their own hours. The
      // world seed's people cannot, which made "the worker files a week"
      // untestable against it.
      if (!(await db.context.findFirst({ where: { personId: who.id, companyId: employer.id, type: 'CONSULTANT' } }))) {
        await db.context.create({
          data: { personId: who.id, companyId: employer.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' },
        })
      }

      const start = day(-pl.startedDaysAgo), end = day(pl.endsInDays)
      const requirement =
        (await db.requirement.findFirst({ where: { companyId: client.id, title: pl.role } })) ??
        (await db.requirement.create({
          data: {
            companyId: client.id, title: pl.role, skills: pl.skills, location: pl.loc,
            billMin: pl.rates[0] - 1500, billMax: pl.rates[0] + 500, months: 12, headcount: 1,
            status: pl.state === 'ENDED' ? 'CLOSED' : 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
            neededBy: start, raisedById: desk.hiring.personId, hoursPerWeek: 40,
            costCenterId: costCentre?.id ?? null, orgUnitId: unitByName.get('Apps')?.id ?? null,
          },
        }))

      // One contract pair per hop, bottom up, each buying from the rung below.
      let supplierSellContractId: string | null = null
      const contracts: { id: string; billRate: number; engagementId: string | null; clientCompanyId: string; companyId: string }[] = []
      for (let i = chain.length - 1; i >= 0; i--) {
        const sellerSlug = chain[i]
        const buyerSlug = i === 0 ? p.client : chain[i - 1]
        const seller = firmBySlug.get(sellerSlug)!, buyer = firmBySlug.get(buyerSlug)!
        const existing = await db.sellContract.findFirst({
          where: { companyId: seller.id, personId: who.id, clientCompanyId: buyer.id, requirementId: requirement.id },
        })
        if (existing) { supplierSellContractId = existing.id; contracts.push(existing); continue }

        const { msa, eng } = await agreement(sellerSlug, buyerSlug, pl.role)
        const sell = await db.sellContract.create({
          data: {
            companyId: seller.id, clientCompanyId: buyer.id, endClientCompanyId: client.id,
            personId: who.id, requirementId: requirement.id, engagementId: eng.id, msaId: msa.id,
            hiringManagerId: desk.hiring.personId, orgUnitId: unitByName.get('Apps')?.id ?? null,
            billRate: pl.rates[i], billCurrency: 'USD', paymentTerms: 45, state: pl.state,
            startDate: start, endDate: end,
          },
        })
        const employs = i === chain.length - 1
        const buy = await db.buyContract.create({
          data: {
            companyId: seller.id,
            vendorCompanyId: employs ? null : firmBySlug.get(chain[i + 1])!.id,
            payCurrency: 'USD', contractType: employs ? 'W2' : 'C2C',
            state: pl.state, startDate: start, endDate: end,
            supplierSellContractId: employs ? null : supplierSellContractId,
          },
        })
        await db.buyContractCandidate.create({
          data: { buyContractId: buy.id, personId: who.id, payRate: pl.rates[i + 1], payCurrency: 'USD', startDate: start, endDate: end },
        })
        await db.contractLink.create({
          data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start, effectiveTo: end },
        })
        if (i === 0 && costCentre) {
          await db.contractCostAllocation.create({
            data: { sellContractId: sell.id, costCenterId: costCentre.id, shareBps: 10_000 },
          })
        }
        // Due dates for anything still running or about to. A contract
        // that ended has nothing due.
        if (pl.state !== 'ENDED') await writeCyclesFor(db, { sell, buy, packId: 'US_IT' })
        supplierSellContractId = sell.id
        contracts.push(sell)
      }
      placements++

      // How they got here.
      const top = firmBySlug.get(chain[0])!
      const sub =
        (await db.submission.findFirst({ where: { requirementId: requirement.id, personId: who.id } })) ??
        (await db.submission.create({
          data: {
            requirementId: requirement.id, personId: who.id,
            fromCompanyId: top.id, toCompanyId: client.id, kind: chain.length > 1 ? 'NETWORK' : 'BENCH',
            rate: pl.rates[0], status: 'PLACED', checkState: 'SENT',
            submittedAt: day(-pl.startedDaysAgo - 21), decidedAt: day(-pl.startedDaysAgo - 6),
          },
        }))
      if (!(await db.interview.findFirst({ where: { submissionId: sub.id } }))) {
        await db.interview.create({
          data: {
            submissionId: sub.id, companyId: client.id, vendorId: top.id,
            round: 1, stage: 'TECHNICAL', mode: 'VIDEO', state: 'DONE', proposedSlots: [], durationMins: 45,
            // On a working day, at an hour somebody interviews at.
            scheduledAt: at(-pl.startedDaysAgo - 12, 16), decidedAt: at(-pl.startedDaysAgo - 12, 17),
            requestedById: desk.hiring.personId, decidedById: desk.hiring.personId,
            outcome: 'ADVANCE', feedback: 'Offer.',
          },
        })
      }

      // ── What is on file ──────────────────────────────────────────
      const papers: { type: 'I9_EVERIFY' | 'BACKGROUND_CHECK'; expiresAt: Date | null }[] = []
      if (pl.papers !== 'NO_I9') papers.push({ type: 'I9_EVERIFY', expiresAt: null })
      if (pl.papers === 'CLEAR' || pl.papers === 'NO_I9') papers.push({ type: 'BACKGROUND_CHECK', expiresAt: day(250) })
      if (pl.papers === 'BGC_EXPIRED') papers.push({ type: 'BACKGROUND_CHECK', expiresAt: day(-15) })
      for (const v of papers) {
        if (await db.verification.findFirst({ where: { personId: who.id, type: v.type } })) continue
        await db.verification.create({
          data: {
            personId: who.id, type: v.type, status: 'CLEAR', provider: v.type === 'I9_EVERIFY' ? 'E-Verify' : 'Sterling',
            issuedAt: day(-pl.startedDaysAgo - 8), expiresAt: v.expiresAt,
            uploadedById: seatBySlug.get(employerSlug)!.personId, verifiedById: desk.compliance.personId, verifiedAt: day(-pl.startedDaysAgo - 7),
            result: { outcome: 'CLEAR' },
          },
        })
      }

      // ── Hours, and what became of them ───────────────────────────
      if (!pl.weeks) continue
      const bottom = contracts[0]
      const signed: { id: string; periodStart: Date; periodEnd: Date }[] = []
      const total = pl.weeks.approved + pl.weeks.awaiting
      for (let w = total; w >= 1; w--) {
        const { start: ws, end: we, days } = week(w)
        const awaiting = w <= pl.weeks.awaiting
        const already = await db.timesheet.findFirst({ where: { sellContractId: bottom.id, periodStart: ws } })
        if (already) { if (!awaiting) signed.push(already); continue }
        const ts = await db.timesheet.create({
          data: {
            sellContractId: bottom.id, personId: who.id, periodStart: ws, periodEnd: we, days, totalHours: 40,
            status: awaiting ? 'SUBMITTED' : 'APPROVED', submittedAt: we,
            ...(awaiting ? {} : {
              approvedAt: day(-(w * 7 - 2)), approvedById: desk.hiring.personId,
              clientApprovedAt: day(-(w * 7 - 2)), clientApprovedById: desk.hiring.personId,
              employerAcceptedAt: day(-(w * 7 - 1)), employerAcceptedById: seatBySlug.get(employerSlug)!.personId,
            }),
          },
        })
        if (!awaiting) {
          await db.workAssertion.createMany({
            data: [
              { timesheetId: ts.id, companyId: client.id, role: 'CLIENT_APPROVAL', hours: 40, rateCents: pl.rates[0],
                state: 'LIVE', byId: desk.hiring.personId },
              { timesheetId: ts.id, companyId: employer.id, role: 'EMPLOYER_ACCEPTANCE', hours: 40,
                rateCents: pl.rates[pl.rates.length - 1], state: 'LIVE', byId: seatBySlug.get(employerSlug)!.personId },
            ],
          })
          signed.push(ts)
        }
      }

      // The invoice for the signed weeks, from whoever bills the client,
      // at that firm's rate. Lower hops bill their own leg the same way
      // in the world seed; here the point is what reaches the client's
      // payables desk.
      if (!pl.invoice || signed.length === 0) continue
      const topContract = contracts[contracts.length - 1]
      const number = `IN-${topContract.id.slice(-6).toUpperCase()}-${signed[0].periodStart.toISOString().slice(0, 10).replace(/-/g, '')}`
      if (await db.invoice.findUnique({ where: { number } })) continue
      const cents = signed.length * 40 * topContract.billRate
      const inv = await db.invoice.create({
        data: {
          engagementId: topContract.engagementId!, number,
          periodStart: signed[0].periodStart, periodEnd: signed[signed.length - 1].periodEnd,
          currency: 'USD', total: cents / 100, paid: pl.invoice === 'PAID' ? cents / 100 : 0,
          issuedAt: day(-6), submittedAt: day(-5), dueAt: day(-6 + 45),
          status: pl.invoice,
          soldToId: client.id, billToId: client.id, payerId: client.id,
        },
      })
      for (const t of signed) {
        await db.invoiceLine.create({
          data: {
            invoiceId: inv.id, timesheetId: t.id, sellContractId: topContract.id, personId: who.id,
            hours: 40, rateCents: topContract.billRate, amountCents: 40 * topContract.billRate,
            description: `${pl.person} — ${t.periodStart.toISOString().slice(0, 10)} to ${t.periodEnd.toISOString().slice(0, 10)}`,
          },
        })
      }
      if (pl.invoice === 'PAID') {
        await db.payment.create({
          data: {
            invoiceId: inv.id, payerCompanyId: client.id, receivedByCompanyId: topContract.companyId,
            amount: cents / 100, currency: 'USD', method: 'ACH', reference: `ACH-${number.slice(-8)}`,
            receivedAt: day(-2), appliedAt: day(-2),
          },
        })
      }
    }

    // ── A role being worked ────────────────────────────────────────
    const open =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: p.open.title } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: p.open.title, skills: p.open.skills, location: p.loc,
          billMin: p.open.band[0], billMax: p.open.band[1], months: 12, headcount: 1, hoursPerWeek: 40,
          status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: day(21),
          raisedById: desk.hiring.personId, costCenterId: costCentre?.id ?? null, orgUnitId: unitByName.get('Apps')?.id ?? null,
        },
      }))
    if (!(await db.requirementApproval.findFirst({ where: { requirementId: open.id } }))) {
      await db.requirementApproval.create({
        data: { requirementId: open.id, approverId: null, rank: 0, outcome: 'AUTO_CLEARED', reason: 'Within plan and under every threshold.', decidedAt: day(-9) },
      })
    }
    for (const vendorSlug of p.open.to) {
      const v = firmBySlug.get(vendorSlug)!
      if (await db.requirementInvitation.findFirst({ where: { requirementId: open.id, toCompanyId: v.id } })) continue
      await db.requirementInvitation.create({
        data: {
          requirementId: open.id, fromCompanyId: client.id, toCompanyId: v.id,
          // Under the ceiling, and not the same for everybody.
          payMin: p.open.band[0] - 1000, payMax: p.open.band[1] - (vendorSlug === p.open.to[0] ? 0 : 500),
          expiresAt: day(12), status: 'SENT', createdAt: day(-9),
        },
      })
    }
    for (const c of p.open.candidates) {
      const who = await person(c.person)
      await onBench(who.id, p.open.skills, p.loc, 'USC', c.from)
      const from = firmBySlug.get(c.from)!
      const sub =
        (await db.submission.findFirst({ where: { requirementId: open.id, personId: who.id } })) ??
        (await db.submission.create({
          data: {
            requirementId: open.id, personId: who.id, fromCompanyId: from.id, toCompanyId: client.id, kind: 'BENCH',
            rate: c.rate, status: c.status, checkState: 'SENT', screenState: 'READY', submittedAt: day(-6),
          },
        }))
      if (!c.round || (await db.interview.findFirst({ where: { submissionId: sub.id } }))) continue
      // Working days only, three apart when two are offered — a nudge
      // off a weekend moves a date by at most two, so closer than that
      // can collapse to the same slot twice.
      const when = at(c.round.inDays, 16)
      const later = at(c.round.inDays + 3, 16)
      const proposed = c.round.state === 'PROPOSED'
      await db.interview.create({
        data: {
          submissionId: sub.id, companyId: client.id, vendorId: from.id,
          round: 1, stage: 'TECHNICAL', mode: 'VIDEO', state: c.round.state,
          proposedSlots: proposed
            ? [{ start: when.toISOString(), end: new Date(when.getTime() + 3_600_000).toISOString() },
               { start: later.toISOString(), end: new Date(later.getTime() + 3_600_000).toISOString() }]
            : [],
          scheduledAt: proposed ? null : when,
          durationMins: 60, location: 'https://meet.example.invalid/etyme-demo',
          requestedById: desk.hiring.personId, interviewers: c.round.interviewers,
          proposedAt: day(-3), clientConfirmedAt: proposed ? null : day(-2), vendorConfirmedAt: proposed ? null : day(-2),
        },
      })
    }

    // ── A role waiting on the VP ───────────────────────────────────
    //
    // Over the $250k line the office set for itself, so it routes. It
    // sits in the VP's queue, and in the hiring manager's as "waiting".
    const vp = await db.person.findUnique({ where: { primaryEmail: `${slug}-vp@${domain}` } })
    const routed =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: p.routed.title } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: p.routed.title, skills: p.routed.skills, location: p.loc,
          billMin: p.routed.billMax - 2000, billMax: p.routed.billMax, months: 12, headcount: p.routed.headcount, hoursPerWeek: 40,
          status: 'DRAFT', approvalState: 'PENDING_APPROVAL', source: 'MANUAL', neededBy: day(45),
          raisedById: desk.hiring.personId, costCenterId: costCentre?.id ?? null, orgUnitId: unitByName.get('Apps')?.id ?? null,
        },
      }))
    if (vp && !(await db.requirementApproval.findFirst({ where: { requirementId: routed.id } }))) {
      const annual = Math.round((p.routed.billMax * 160 * 12 * p.routed.headcount) / 100)
      await db.requirementApproval.create({
        data: {
          requirementId: routed.id, approverId: vp.id, rank: 1, outcome: 'PENDING',
          reason: `About $${annual.toLocaleString('en-US')} a year across ${p.routed.headcount} heads — over the $250,000 line, so it needs the VP.`,
        },
      })
    }

    void office
  }

  return { placements, people: people.size }
}

/** The programmes, for a page that lists them. */
export const PROGRAMME_SLUGS = PROGRAMMES.map((p) => p.client)
