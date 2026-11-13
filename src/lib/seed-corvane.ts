/**
 * Corvane Packaging: the fourth client program, a packaging company with
 * plants in eight countries, buying specialists from 25 suppliers.
 *
 * ── Why it exists ────────────────────────────────────────────────────
 *
 * The founder, 2026-10-27, "go ahead and build this", on the region map
 * (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo): the only picture
 * of the whole product at once is a company's every contractor and
 * supplier across every country, read by three seats at three altitudes
 * (CFO, regional manager, hiring manager). The three programs seeded so
 * far are one site each. So this one is the drawing, as data: 31 plants
 * in the US, Mexico, Brazil, Colombia, Vietnam, India, Belgium and
 * Northern Ireland, grouped in six regions, with the drawing's own names
 * and counts (`CORVANE_PLANTS` is its HM array, row for row).
 *
 * ── What is seeded, and what is not ──────────────────────────────────
 *
 * Seeded: the plants as sites with country, time zone and region; a
 * REGION org unit per region with a SITE unit per plant under it; the
 * owner, head of operations, CFO, AP clerk, compliance officer, six
 * regional managers (each seated on their region's unit, so each reads
 * only that region: lib/region-scope) and 31 hiring managers (one per
 * plant); 25 suppliers with an agreement and an order header each; every
 * plant's contractors on site at the drawing's count, at the site's own
 * rate in the site's own currency; the drawing's open jobs and weeks to
 * sign; the nearest time limit at each plant, against an 18-month limit;
 * seven invoice receipts, one held over the hours at Dayton; one start
 * on hold for papers at Dayton.
 *
 * Not seeded, on purpose: matches, interviews and hires (the drawing
 * derives them; nothing here would stand behind them), due-date cycles,
 * and any paper or rule outside the US. A country's rule is regulatory's
 * and shown only once confirmed (lib/document-stages/countries); India's
 * is unconfirmed, so nothing here claims an Indian paper or rule. US
 * workers have an I-9 backed by a passport and a background check,
 * because nobody starts without one.
 *
 * ── Currency ─────────────────────────────────────────────────────────
 *
 * Every rate and receipt is in the site's own currency, in its minor
 * units by ISO 4217 (`fromDecimal` in lib/money: a dong has none). Nothing
 * is converted: one currency for the rollup is money's to compute.
 *
 * ── Fitting the steps ────────────────────────────────────────────────
 *
 * Three hundred and seventy people, written one row at a time, would be
 * thousands of queries; a step may make 350. So every row here has an id
 * of its own made from what it is (`cv_buy_dayton_3`), is written by
 * `createMany` with duplicates skipped, and a second seeding writes
 * nothing. People are read back by address, because a person is the one
 * row another seed could have made first.
 *
 * Corvane's slugs are on the world's roster for the rebuild and the
 * sweep (`WORLD_SLUGS`) and off the roster the base steps walk, so a
 * re-seed of those steps never sweeps these rows into their stories.
 */

import { Prisma } from '@prisma/client'
import { prisma as db } from '@/lib/db'
import { day, seedWeek, signingDays } from '@/lib/seed-days'
import { minorPerUnit } from '@/lib/money'
import { rolesFor } from '@/lib/company-defaults'
import { ownSeatGrantReason } from '@/lib/own-seat'
import { orderNumbers, orderNumberAttempt, headerWindow, ORDER_RHYTHM } from '@/lib/award'
import { REGION_UNIT_KIND, SITE_UNIT_KIND } from '@/lib/region-scope'
import { periodFor } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { dueOn } from '@/lib/billing-cascade'
import { postAssertion } from '@/lib/order-postings'
import { bookPostings } from '@/lib/seed-order-to-cash'
import { planCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { policyFrom } from '@/lib/cycle-shift'

// ── The drawing and the plan: pure, in ./seed-corvane/plan ──────────
//
// Everything worked out without a database lives there, so a page the
// browser loads may read Corvane's names and figures; re-exported here so
// every reader that imported it from this file still does.

export * from '@/lib/seed-corvane/plan'
import {
  CORVANE_SLUG, CORVANE_NAME, CORVANE_TIME_LIMIT_MONTHS, CORVANE_REGIONS, CORVANE_COUNTRIES, CORVANE_PLANTS,
  CORVANE_SUPPLIERS, COUNTRY_NAMES, CORVANE_JOBS, CORVANE_JOB_SKILLS, CORVANE_PEOPLE, CORVANE_OPERATIONS_UNIT,
  CORVANE_DEPARTMENTS, CORVANE_RECEIPTS, FILLED_JOB_MONTHS,
  addressSafe, supplierSlug, corvaneSeatEmail, plantPlace, plantSuppliers, corvaneContractors, corvanePlaces,
  corvaneSellId, corvaneEarlierSellIds, workerEmail, billRateMinor, payRateMinor, jobBand, plantOpenJobs,
  type RegionKey, type CountryKey, type CorvanePlant, type PlannedContractor,
} from '@/lib/seed-corvane/plan'

const regionOf = (key: RegionKey) => CORVANE_REGIONS.find((r) => r.key === key)!

// ── The steps ────────────────────────────────────────────────────────

/** The world steps this file runs, in order. Each fits one call. */
export function corvaneSteps(): string[] {
  return ['corvane:frame', 'corvane:suppliers', ...CORVANE_REGIONS.map((r) => `corvane:plants:${r.key}`)]
}

interface Ctx { domain: string; prefix: string }

const uniq = <T,>(xs: readonly T[]) => [...new Set(xs)]

export async function seedCorvane(ctx: Ctx, step: string): Promise<void> {
  if (step === 'corvane:frame') return frame(ctx)
  if (step === 'corvane:suppliers') return suppliers(ctx)
  const region = step.replace('corvane:plants:', '') as RegionKey
  if (!CORVANE_REGIONS.some((r) => r.key === region)) throw new Error(`No Corvane step called ${step}.`)
  return plants(ctx, region)
}

/** Corvane's company, or a sentence saying the frame has not run. */
async function corvane(ctx: Ctx) {
  const c = await db.company.findUnique({ where: { slug: ctx.prefix + CORVANE_SLUG }, select: { id: true } })
  if (!c) throw new Error('Corvane Packaging is not seeded yet: corvane:frame runs first.')
  return c
}

/** People by address, written where missing, read back by address. */
async function people(rows: { email: string; name: string }[]): Promise<Map<string, string>> {
  await db.person.createMany({ data: rows.map((r) => ({ name: r.name, primaryEmail: r.email })), skipDuplicates: true })
  const found = await db.person.findMany({ where: { primaryEmail: { in: rows.map((r) => r.email) } }, select: { id: true, primaryEmail: true } })
  return new Map(found.map((p) => [p.primaryEmail, p.id]))
}

// ── 1. The company, its rules, its regions, plants and seats ─────────

async function frame(ctx: Ctx): Promise<void> {
  const slug = ctx.prefix + CORVANE_SLUG
  const co = await db.company.upsert({
    where: { slug },
    update: { name: CORVANE_NAME, kind: 'CLIENT' },
    create: {
      slug, name: CORVANE_NAME, kind: 'CLIENT', currency: 'USD', country: 'US', defaultPaymentTerms: 45,
      // The world's day, like every other seeded firm; and held by somebody
      // from the start, so the sweep at the end has nothing to claim.
      createdAt: day(0), claimedAt: day(0), isDemo: false,
    },
    select: { id: true },
  })

  // The roles a client starts with, and three of Corvane's own.
  const base = rolesFor('CLIENT')
  const perms = (name: string) => base.find((r) => r.name === name)?.permissions ?? []
  const own: { name: string; permissions: string[] }[] = [
    // Reads the program, its rates and its receipts; every read narrowed to
    // the region the seat sits on (lib/region-scope).
    { name: 'Regional Manager', permissions: uniq([...perms('Viewer'), 'rates.read', 'invoices.read']) },
    { name: 'Head of Operations', permissions: [...perms('Program Manager')] },
    // Reads the whole program and its money; pays nothing.
    { name: 'Chief Financial Officer', permissions: uniq([...perms('Viewer'), ...perms('AP Clerk')]).filter((p) => p !== 'payments.record') },
  ]
  const roles = [...base.map((r) => ({ name: r.name, permissions: r.permissions as string[], isDefault: Boolean(r.isOwner) })), ...own.map((r) => ({ ...r, isDefault: false }))]
  const have = await db.role.findMany({ where: { companyId: co.id }, select: { id: true, name: true } })
  await db.role.createMany({
    data: roles.filter((r) => !have.some((h) => h.name === r.name)).map((r) => ({ companyId: co.id, name: r.name, permissions: r.permissions, isDefault: r.isDefault })),
  })
  const roleId = new Map((await db.role.findMany({ where: { companyId: co.id }, select: { id: true, name: true } })).map((r) => [r.name, r.id]))

  // A site per plant: its country, time zone and region. Written before
  // the units, so each plant's unit names the site it stands for.
  await db.companyLocation.createMany({
    data: CORVANE_PLANTS.map((p, i) => ({
      id: `cv_site_${p.key}`, companyId: co.id, name: p.plant, city: p.city, state: p.state,
      country: CORVANE_COUNTRIES[p.cc].iso, timeZone: p.timeZone, region: regionOf(p.region).label, isPrimary: i === 0,
      // Found in the contractor list, as the Sites screen says (2026-10-28).
      source: 'IMPORT' as const, recordedAt: day(-1),
    })),
    skipDuplicates: true,
  })

  // The team structure (founder, 2026-11-09, the drawing of Corvane): three
  // departments under the company, the six regions under Operations, a
  // unit per plant under its region standing for its site.
  await db.orgUnit.createMany({
    data: CORVANE_DEPARTMENTS.map((d, i) => ({ id: d.unit, companyId: co.id, name: d.name, kind: 'DEPARTMENT', position: i + 1 })),
    skipDuplicates: true,
  })
  await db.orgUnit.createMany({
    // A region's place in Corvane's own order (OrgUnit.position, 2026-11-08), the order CORVANE_REGIONS lists them.
    data: CORVANE_REGIONS.map((r, i) => ({ id: `cv_unit_region_${r.key}`, companyId: co.id, name: r.label, kind: REGION_UNIT_KIND, position: i + 1, parentId: CORVANE_OPERATIONS_UNIT })),
    skipDuplicates: true,
  })
  await db.orgUnit.createMany({
    // Each plant in its region's own order, the order CORVANE_PLANTS lists them (Dayton first).
    data: CORVANE_PLANTS.map((p) => ({
      id: `cv_unit_site_${p.key}`, companyId: co.id, name: p.plant, kind: SITE_UNIT_KIND, parentId: `cv_unit_region_${p.region}`, locationId: `cv_site_${p.key}`,
      position: plantPlace(p),
    })),
    skipDuplicates: true,
  })
  // A world seeded before the team structure: its regions sat under the
  // company and its plant units named their sites by name only. Written
  // once; a box the Owner has changed since is never put back.
  await db.orgUnit.updateMany({
    where: { companyId: co.id, id: { in: CORVANE_REGIONS.map((r) => `cv_unit_region_${r.key}`) }, parentId: null, changes: { none: {} } },
    data: { parentId: CORVANE_OPERATIONS_UNIT },
  })
  // A world seeded before the plants carried their place: written once, where none is set.
  await db.$executeRaw`UPDATE "OrgUnit" AS u SET "position" = v.p FROM (VALUES ${Prisma.join(CORVANE_PLANTS.map((p) => Prisma.sql`(${`cv_unit_site_${p.key}`}, ${plantPlace(p)}::int)`))}) AS v(id, p)
    WHERE u.id = v.id AND u."companyId" = ${co.id} AND u."position" IS NULL`
  await db.$executeRaw`UPDATE "OrgUnit" SET "locationId" = 'cv_site_' || substring(id from 14)
    WHERE "companyId" = ${co.id} AND id LIKE 'cv\_unit\_site\_%' AND "locationId" IS NULL
      AND EXISTS (SELECT 1 FROM "CompanyLocation" l WHERE l.id = 'cv_site_' || substring("OrgUnit".id from 14))`

  // A world seeded before sites said where they came from.
  await db.companyLocation.updateMany({
    where: { companyId: co.id, id: { in: CORVANE_PLANTS.map((p) => `cv_site_${p.key}`) }, source: 'PERSON', recordedById: null },
    data: { source: 'IMPORT', recordedAt: day(-1) },
  })

  // The seats: five over the whole program, six over a region, one per plant.
  const seats: { email: string; name: string; role: string; unit: string | null; key: string }[] = [
    ...CORVANE_PEOPLE.map((s) => ({ email: corvaneSeatEmail(s.desk, ctx.domain), name: s.name, role: s.role, unit: CORVANE_DEPARTMENTS.find((d) => d.members.includes(s.desk))?.unit ?? null, key: s.desk })),
    ...CORVANE_REGIONS.map((r) => ({ email: corvaneSeatEmail(`region-${r.key}`, ctx.domain), name: r.lead, role: 'Regional Manager', unit: `cv_unit_region_${r.key}`, key: `region_${r.key}` })),
    ...CORVANE_PLANTS.map((p) => ({ email: corvaneSeatEmail(`hiring-${p.key}`, ctx.domain), name: p.manager, role: 'Hiring Manager', unit: `cv_unit_site_${p.key}`, key: `hiring_${p.key}` })),
  ]
  const ids = await people(seats)
  await db.context.createMany({
    data: seats.map((s) => ({
      id: `cv_ctx_${s.key}`, personId: ids.get(s.email)!, companyId: co.id, roleId: roleId.get(s.role)!,
      type: 'EMPLOYEE' as const, side: 'BUY', orgUnitId: s.unit, grantReason: `Seeded program, Corvane Packaging — ${s.role}`,
      // The owner first: the demo door with no desk asked opens the earliest seat.
      grantedAt: s.key === 'owner' ? day(-500) : day(-400),
    })),
    skipDuplicates: true,
  })
  // A world seeded before the team structure: its AP clerk sat on no box.
  for (const d of CORVANE_DEPARTMENTS) {
    if (d.members.length) {
      await db.context.updateMany({ where: { id: { in: d.members.map((m) => `cv_ctx_${m}`) }, orgUnitId: null, orgChanges: { none: {} } }, data: { orgUnitId: d.unit } })
    }
  }
  // Each box led by the seat that already leads it: a department by its
  // head, a region by its regional manager, a plant by its hiring manager.
  // Named by the seed, so nobody is recorded as naming them; a lead the
  // Owner has named since is never overwritten.
  await db.$executeRaw`UPDATE "OrgUnit" SET "leadSetAt" = ${day(-1)}, "leadContextId" = CASE
      WHEN id LIKE 'cv\_unit\_region\_%' THEN 'cv_ctx_region_' || substring(id from 16)
      WHEN id LIKE 'cv\_unit\_site\_%' THEN 'cv_ctx_hiring_' || substring(id from 14)
      WHEN id = ${CORVANE_OPERATIONS_UNIT} THEN 'cv_ctx_operations'
      WHEN id = 'cv_unit_dept_finance' THEN 'cv_ctx_cfo'
      WHEN id = 'cv_unit_dept_compliance' THEN 'cv_ctx_compliance' END
    WHERE "companyId" = ${co.id} AND "leadContextId" IS NULL AND "leadSetById" IS NULL AND id LIKE 'cv\_unit\_%'
      AND NOT EXISTS (SELECT 1 FROM "OrgChange" c WHERE c."orgUnitId" = "OrgUnit".id)`

  // The time limit, across every supplier, and the break before coming back.
  const policy =
    (await db.governancePolicy.findFirst({ where: { companyId: co.id, isActive: true } })) ??
    (await db.governancePolicy.create({
      data: { companyId: co.id, name: 'Contingent workforce policy', description: 'How long a contractor may work at a Corvane plant, across every supplier.' },
    }))
  const rules = [
    { ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: CORVANE_TIME_LIMIT_MONTHS },
      description: `Nobody works at a Corvane plant more than ${CORVANE_TIME_LIMIT_MONTHS} months, across every supplier.`, ownerTeam: 'HR' },
    { ruleType: 'BREAK_IN_SERVICE', enforcementMode: 'BLOCK', parameters: { breakDays: 90 },
      description: '90 days out before coming back on contract.', ownerTeam: 'HR' },
  ]
  for (const r of rules) {
    if (await db.governanceRule.findFirst({ where: { policyId: policy.id, ruleType: r.ruleType as never } })) continue
    await db.governanceRule.create({ data: { policyId: policy.id, ...r } as never })
  }
}

// ── 2. The suppliers, each with an agreement and an order ────────────

/**
 * The most an order's ceiling may say, in whole units of its currency.
 * `WorkOrder.amount` is Decimal(12, 2), so it holds under ten billion of
 * anything. At a specialist's ₫950,000 an hour, a Vietnamese supplier's
 * lines over their whole span come to ₫48 to ₫70 billion (about $2 to $3
 * million), which the column cannot hold. So a dong order is written as a
 * ₫9,000,000,000 release under its agreement (about $360,000 at the sample
 * rate), the way a buyer releases an order for a period and raises the next
 * when it runs low; everything the seed bills against it is far inside it.
 * Every other currency's ceiling is under the line and written whole.
 * A wider column is a schema request (2026-11-13), not a seed change.
 */
const ORDER_CEILING_MAX_UNITS = 9_000_000_000

async function suppliers(ctx: Ctx): Promise<void> {
  const co = await corvane(ctx)
  const all = (Object.entries(CORVANE_SUPPLIERS) as [CountryKey, readonly { name: string; owner: string }[]][])
    .flatMap(([cc, list]) => list.map((s) => ({ ...s, cc, slug: supplierSlug(s.name) })))

  for (const s of all) {
    const c = CORVANE_COUNTRIES[s.cc]
    await db.company.upsert({
      where: { slug: ctx.prefix + s.slug },
      // Its books are kept in its own country's currency (JournalLine is in the home currency).
      update: { name: s.name, kind: 'VENDOR', homeCurrency: c.currency },
      create: {
        slug: ctx.prefix + s.slug, name: s.name, kind: 'VENDOR', currency: c.currency, homeCurrency: c.currency, country: c.iso,
        defaultPaymentTerms: 30, createdAt: day(0), claimedAt: day(0), isDemo: false,
      },
    })
  }
  const firm = new Map(
    (await db.company.findMany({ where: { slug: { in: all.map((s) => ctx.prefix + s.slug) } }, select: { id: true, slug: true } }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )

  // An Owner at each, seated.
  await db.role.createMany({
    data: all.map((s) => ({ id: `cv_role_owner_${s.slug}`, companyId: firm.get(s.slug)!, name: 'Owner', permissions: ['*'], isDefault: true })),
    skipDuplicates: true,
  })
  const owners = await people(all.map((s) => ({ email: `${ctx.prefix}${s.slug}@${ctx.domain}`, name: s.owner })))
  const ownerOf = (slug: string) => owners.get(`${ctx.prefix}${slug}@${ctx.domain}`)!
  await db.context.createMany({
    data: all.map((s) => ({
      id: `cv_ctx_owner_${s.slug}`, personId: ownerOf(s.slug), companyId: firm.get(s.slug)!, roleId: `cv_role_owner_${s.slug}`,
      type: 'EMPLOYEE' as const, grantReason: 'Seeded world',
    })),
    skipDuplicates: true,
  })

  // Who trades with whom, both registers.
  await db.counterparty.createMany({
    data: all.flatMap((s) => [
      { companyId: co.id, otherCompanyId: firm.get(s.slug)!, relationship: 'SUPPLIER' },
      { companyId: firm.get(s.slug)!, otherCompanyId: co.id, relationship: 'CLIENT' },
    ]),
    skipDuplicates: true,
  })

  // The agreement, the engagement under it, and the order header the lines hang on.
  await db.masterAgreement.createMany({
    data: all.map((s) => ({ id: `cv_msa_${s.slug}`, vendorId: firm.get(s.slug)!, clientId: co.id, paymentTerms: 45, currency: CORVANE_COUNTRIES[s.cc].currency, signedAt: day(-600) })),
    skipDuplicates: true,
  })
  await db.engagement.createMany({
    data: all.map((s) => ({ id: `cv_eng_${s.slug}`, msaId: `cv_msa_${s.slug}`, title: `${CORVANE_NAME} — ${COUNTRY_NAMES[s.cc]} plants`, invoiceCycle: 'MONTHLY' })),
    skipDuplicates: true,
  })

  // One header per supplier, its ceiling forty hours a week over every
  // line it carries, in the supplier's currency. Numbered by the award's
  // own rule, so a number reads like any other order's.
  const { onSite, onHold } = corvaneContractors()
  const taken = new Set((await db.workOrder.findMany({ where: { issuedById: co.id }, select: { number: true } })).map((w) => w.number))
  const headers = all.flatMap((s) => {
    // Each line this supplier carries, as days from the world's day: a
    // current line from the day it began (after a handover, the day after
    // the earlier line ended), and an earlier line another supplier took over.
    const lines = [...onSite, onHold].flatMap((c) => [
      ...(supplierSlug(c.supplier) === s.slug
        ? [{ cc: c.plant.cc, from: c.earlier ? c.earlier.endedDaysAgo - 1 : c.startedDaysAgo, to: c.endsInDays }] : []),
      ...(c.earlier && supplierSlug(c.earlier.supplier) === s.slug
        ? [{ cc: c.plant.cc, from: c.startedDaysAgo, to: -c.earlier.endedDaysAgo }] : []),
    ])
    if (lines.length === 0) return []
    const starts = lines.map((c) => day(-c.from).getTime())
    const ends = lines.map((c) => day(c.to).getTime())
    const start = new Date(Math.min(...starts)), end = new Date(Math.max(...ends))
    const minor = lines.reduce((n, c) => n + billRateMinor(c.cc) * 40 * Math.ceil((c.to + c.from + 1) / 7), 0)
    const currency = CORVANE_COUNTRIES[s.cc].currency
    const base = orderNumbers({ buyerId: co.id, sellerId: firm.get(s.slug)!, on: start })
    let n = 1
    while (taken.has(orderNumberAttempt(base.number, n)) && n < 50) n++
    const number = orderNumberAttempt(base.number, n)
    taken.add(number)
    const window = headerWindow({ start, end })
    return [{
      id: `cv_wo_${s.slug}`, number, sellerNumber: base.sellerNumber, title: `Contingent staffing — ${s.name}`,
      issuedById: co.id, issuedToId: firm.get(s.slug)!, recordedById: co.id, billToId: co.id, payerId: co.id,
      amount: Math.min(minor / minorPerUnit(currency), ORDER_CEILING_MAX_UNITS), currency, billingBasis: 'TIME',
      billFrequency: ORDER_RHYTHM.billFrequency, billAnchor: ORDER_RHYTHM.billAnchor, billStraddle: ORDER_RHYTHM.billStraddle,
      paymentTerms: 45, msaId: `cv_msa_${s.slug}`, engagementId: `cv_eng_${s.slug}`, status: 'OPEN',
      startDate: window.startDate, endDate: window.endDate,
    }]
  })
  // A header already written keeps its number; only new ones are added.
  const written = new Set((await db.workOrder.findMany({ where: { id: { in: headers.map((h) => h.id) } }, select: { id: true } })).map((w) => w.id))
  await db.workOrder.createMany({ data: headers.filter((h) => !written.has(h.id)) as never, skipDuplicates: true })

  // What each order asks its supplier for (lib/document-requirements reads
  // these as the order's set). A US order asks what every client program
  // asks; an order abroad asks only the supplier's own papers, because an
  // I-9 is a US form and no country's rule abroad is seeded until
  // regulatory confirms it (lib/document-stages/countries).
  const SUPPLIER_PAPERS: { key: string; owedBy: string }[] = [
    { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' }, { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
    { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' }, { key: 'MSA', owedBy: 'SUPPLIER' },
  ]
  const US_PAPERS = [{ key: 'I9_EVERIFY', owedBy: 'WORKER' }, { key: 'BACKGROUND_CHECK', owedBy: 'US' }, ...SUPPLIER_PAPERS]
  await db.documentRequirement.createMany({
    data: all.flatMap((s) => headers.some((h) => h.id === `cv_wo_${s.slug}`)
      ? (s.cc === 'US' ? US_PAPERS : SUPPLIER_PAPERS).map((a) => ({
          id: `cv_docreq_${s.slug}_${a.key.toLowerCase()}`, workOrderId: `cv_wo_${s.slug}`,
          documentTypeKey: a.key, required: true, owedBy: a.owedBy as never, createdAt: day(-600),
        }))
      : []),
    skipDuplicates: true,
  })
}

// ── 3. A region's plants: their people, jobs, weeks and receipts ─────

async function plants(ctx: Ctx, region: RegionKey): Promise<void> {
  const co = await corvane(ctx)
  const here = CORVANE_PLANTS.filter((p) => p.region === region)
  const places = corvanePlaces()
  const workers = places.filter((c) => c.plant.region === region)
  // A line's id: the one it already has where a world was seeded with the
  // first form, else the one whose tail is unique (corvaneSellId).
  const oldId = (w: PlannedContractor) => `cv_sell_${w.key}`
  const had = new Set((await db.sellContract.findMany({ where: { id: { in: workers.map(oldId) } }, select: { id: true } })).map((r) => r.id))
  const sid = (w: PlannedContractor) => (had.has(oldId(w)) ? oldId(w) : corvaneSellId(w, places.indexOf(w)))

  const supplierIds = new Map(
    (await db.company.findMany({
      where: { slug: { in: uniq(workers.flatMap((w) => [w.supplier, ...(w.earlier ? [w.earlier.supplier] : [])]).map((n) => ctx.prefix + supplierSlug(n))) } },
      select: { id: true, slug: true },
    }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )
  const seatIds = await db.person.findMany({
    where: { primaryEmail: { in: [
      ...here.map((p) => corvaneSeatEmail(`hiring-${p.key}`, ctx.domain)),
      corvaneSeatEmail('compliance', ctx.domain),
      ...uniq(workers.map((w) => `${ctx.prefix}${supplierSlug(w.supplier)}@${ctx.domain}`)),
    ] } },
    select: { id: true, primaryEmail: true },
  })
  const seat = new Map(seatIds.map((p) => [p.primaryEmail, p.id]))
  const manager = (p: CorvanePlant) => seat.get(corvaneSeatEmail(`hiring-${p.key}`, ctx.domain))!
  const ownerOf = (supplier: string) => seat.get(`${ctx.prefix}${supplierSlug(supplier)}@${ctx.domain}`)!
  const compliance = seat.get(corvaneSeatEmail('compliance', ctx.domain))!

  // The workers, each their own seat (lib/own-seat), as the sign-in door would give them.
  const ids = await people(workers.map((w) => ({ email: workerEmail(w, ctx.domain), name: w.name })))
  const who = (w: PlannedContractor) => ids.get(workerEmail(w, ctx.domain))!
  await db.context.createMany({
    data: workers.map((w) => ({ id: `cv_ctx_w_${w.key}`, personId: who(w), type: 'CONSULTANT' as const, grantReason: ownSeatGrantReason('on a placement') })),
    skipDuplicates: true,
  })

  // The job requests: one filled per job a plant has people on, and its open ones.
  const filled = uniq(workers.map((w) => `${w.plant.key}|${w.job}`))
  const band = (p: CorvanePlant) => jobBand(p.cc) ?? {}
  await db.requirement.createMany({
    data: [
      ...filled.map((k) => {
        const [key, job] = k.split('|')
        const p = here.find((x) => x.key === key)!
        return {
          id: `cv_req_${key}_${CORVANE_JOBS.indexOf(job as never)}`, companyId: co.id, title: job, skills: [...CORVANE_JOB_SKILLS[job as (typeof CORVANE_JOBS)[number]]],
          location: p.plant, locationId: `cv_site_${key}`,
          status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL', hoursPerWeek: 40, months: FILLED_JOB_MONTHS,
          headcount: workers.filter((w) => w.plant.key === key && w.job === job).length,
          raisedById: manager(p), ownerId: manager(p), orgUnitId: `cv_unit_site_${key}`, ...band(p),
        }
      }),
      ...here.flatMap((p) => plantOpenJobs(p).map((job) => ({
        id: job.id, companyId: co.id, title: job.title, skills: [...CORVANE_JOB_SKILLS[job.title]], location: p.plant, locationId: `cv_site_${p.key}`,
        status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', hoursPerWeek: 40, months: job.months, headcount: 1,
        neededBy: day(21), startDate: day(21), raisedById: manager(p), ownerId: manager(p), reportsToId: manager(p),
        workMode: 'ONSITE', orgUnitId: `cv_unit_site_${p.key}`, ...band(p),
        description: `${job.title} at the ${p.plant} plant, on site, for ${job.months} months.`,
      }))),
    ] as never,
    skipDuplicates: true,
  })
  // A world seeded before jobs named their site (2026-10-28) gets the site
  // on its jobs here; one write per plant, and none once they carry it.
  for (const p of here) {
    await db.requirement.updateMany({
      where: { companyId: co.id, orgUnitId: `cv_unit_site_${p.key}`, locationId: null },
      data: { locationId: `cv_site_${p.key}` },
    })
  }

  // The suppliers each plant names (Settings → Sites), from the contractor
  // list like the plants themselves: the drawing's `plantSuppliers`, so
  // Dayton names Ridgeline, Harbor and Keystone and not Lakemont. Every
  // one has an agreement with Corvane, which is what approves it. The
  // plant's hiring manager is not written: the jobs they posted at the
  // site say who hires there (lib/site-rules).
  const named = uniq(here.flatMap((p) => plantSuppliers(p)))
  const firmIds = new Map(
    (await db.company.findMany({ where: { slug: { in: named.map((n) => ctx.prefix + supplierSlug(n)) } }, select: { id: true, slug: true } }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )
  await db.siteSupplier.createMany({
    data: here.flatMap((p) => plantSuppliers(p).map((n) => ({
      id: `cv_sitesup_${p.key}_${supplierSlug(n)}`, locationId: `cv_site_${p.key}`, supplierCompanyId: firmIds.get(supplierSlug(n))!,
      source: 'IMPORT' as const, namedAt: day(-1),
    }))),
    skipDuplicates: true,
  })

  // One line each way: the supplier bills Corvane, and employs the worker.
  // Where another supplier had the person first (Aoife Kelly at Belfast),
  // that earlier pair is written too, ENDED the day before the current one
  // starts, so the time limit counts one unbroken stretch across both.
  const earlierIds = corvaneEarlierSellIds()
  const lines = workers.flatMap((w) => {
    const c = CORVANE_COUNTRIES[w.plant.cc]
    const line = (supplier: string, sellId: string, buyKey: string, start: Date, end: Date, state: PlannedContractor['state'] | 'ENDED') => {
      const sup = supplierSlug(supplier)
      return { w, sup, supplierId: supplierIds.get(sup)!, currency: c.currency, sellId, buyKey, start, end, state }
    }
    const now = line(w.supplier, sid(w), w.key, day(-(w.earlier ? w.earlier.endedDaysAgo - 1 : w.startedDaysAgo)), day(w.endsInDays), w.state)
    if (!w.earlier) return [now]
    return [line(w.earlier.supplier, earlierIds.get(w.key)!, `${w.key}_before`, day(-w.startedDaysAgo), day(-w.earlier.endedDaysAgo), 'ENDED'), now]
  })
  await db.sellContract.createMany({
    data: lines.map(({ w, sup, supplierId, currency, start, end, sellId, state }) => ({
      id: sellId, companyId: supplierId, clientCompanyId: co.id, endClientCompanyId: co.id, personId: who(w),
      requirementId: `cv_req_${w.plant.key}_${CORVANE_JOBS.indexOf(w.job)}`, engagementId: `cv_eng_${sup}`, msaId: `cv_msa_${sup}`,
      workOrderId: `cv_wo_${sup}`, hiringManagerId: manager(w.plant), orgUnitId: `cv_unit_site_${w.plant.key}`,
      workLocationId: `cv_site_${w.plant.key}`, billRate: billRateMinor(w.plant.cc), billCurrency: currency,
      paymentTerms: 45, state, startDate: start, endDate: end,
    })),
    skipDuplicates: true,
  })
  await db.buyContract.createMany({
    data: lines.map(({ w, supplierId, currency, start, end, buyKey, state }) => ({
      id: `cv_buy_${buyKey}`, companyId: supplierId, vendorCompanyId: null, payCurrency: currency,
      // A W2 is a US employer's form. Elsewhere the worker is on a fixed-term
      // contract with the supplier; which kind each country's law names is
      // regulatory's, and this is the general one.
      contractType: w.plant.cc === 'US' ? 'W2' as const : 'FIXED_TERM' as const,
      state, startDate: start, endDate: end,
    })),
    skipDuplicates: true,
  })
  await db.buyContractCandidate.createMany({
    data: lines.map(({ w, currency, start, end, buyKey }) => ({ id: `cv_cand_${buyKey}`, buyContractId: `cv_buy_${buyKey}`, personId: who(w), payRate: payRateMinor(w.plant.cc), payCurrency: currency, startDate: start, endDate: end })),
    skipDuplicates: true,
  })
  await db.contractLink.createMany({
    data: lines.map(({ start, end, sellId, buyKey }) => ({ id: `cv_link_${buyKey}`, sellContractId: sellId, buyContractId: `cv_buy_${buyKey}`, effectiveFrom: start, effectiveTo: end })),
    skipDuplicates: true,
  })

  // Due dates on both sides, through money's own planner (lib/contract-cycles),
  // as the other programs write them: the seeds' pack and the demo's monthly
  // pay, the shipped weekend rule, no company payroll. A line that already
  // has its dates is left as it is, so a second seeding writes nothing.
  //
  // Pay dates only from the world's day on. No payroll was ever run for
  // Corvane's suppliers' workers on the record, so a pay date before the
  // world was born is neither paid (nothing says it was) nor owed today
  // (seeded-worker-pay): it is not written. The base world runs real
  // payroll over its own workers' past periods (lib/seed-payroll-runs);
  // doing that for 359 lines in seven currencies is money's to price.
  // A world seeded before this rule loses its undone past pay dates here,
  // once. The bill side keeps its whole series.
  const PAY_KINDS = ['SALARY_CALCULATE', 'SALARY_PAY'] // as lib/contract-cycles names them
  const born = day(0)
  await db.cycle.deleteMany({
    where: { buyContractId: { in: lines.map((l) => `cv_buy_${l.buyKey}`) }, kind: { in: PAY_KINDS as never }, dueOn: { lt: born }, completedAt: null },
  })
  const dated = new Set((await db.cycle.findMany({
    where: { sellContractId: { in: lines.map((l) => l.sellId) } }, select: { sellContractId: true }, distinct: ['sellContractId'],
  })).map((c) => c.sellContractId))
  const cycles: Awaited<ReturnType<typeof planCyclesFor>>['rows'] = []
  for (const { w, start, end, sellId, buyKey } of lines) {
    if (dated.has(sellId)) continue
    const planned = await planCyclesFor(db, {
      sell: { id: sellId, startDate: start, endDate: end, workOrder: null },
      buy: { id: `cv_buy_${buyKey}`, contractType: w.plant.cc === 'US' ? 'W2' : 'FIXED_TERM', vendorCompanyId: null },
      packId: 'US_IT', pay: DEMO_MONTHLY_PAY, policy: policyFrom(null), payroll: null,
    })
    cycles.push(...planned.rows.filter((c) => !('buyContractId' in c && PAY_KINDS.includes(c.kind) && c.dueOn < born)))
  }
  if (cycles.length) await db.cycle.createMany({ data: cycles })

  // ── Weeks: last week filed and not signed, at the drawing's count ──
  const live = workers.filter((w) => w.state === 'IN_PROGRESS')
  const toSign = here.flatMap((p) => live.filter((w) => w.plant.key === p.key).slice(0, p.weeksToSign))
  const last = seedWeek(1, 40)
  const totalOf = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0)
  // ── And signed weeks behind each receipt ──
  const receipts = CORVANE_RECEIPTS.filter((r) => here.some((p) => p.key === r.plant))
    .map((r) => ({ r, w: live.find((w) => w.plant.key === r.plant && w.index === 0)! }))
  await db.timesheet.createMany({
    data: [
      ...toSign.map((w) => ({
        id: `cv_ts_${w.key}_w1`, sellContractId: sid(w), personId: who(w),
        periodStart: last.start, periodEnd: last.end, days: last.days, totalHours: totalOf(last.days),
        status: 'SUBMITTED', submittedAt: last.end,
      })),
      ...receipts.map(({ r, w }) => {
        const wk = seedWeek(r.week, r.accepted)
        const signed = signingDays(wk.start)
        return {
          id: `cv_ts_${w.key}_w${r.week}`, sellContractId: sid(w), personId: who(w),
          periodStart: wk.start, periodEnd: wk.end, days: wk.days, totalHours: r.accepted,
          status: 'APPROVED', submittedAt: wk.end,
          approvedAt: signed.signedAt(0), approvedById: manager(w.plant),
          clientApprovedAt: signed.signedAt(0), clientApprovedById: manager(w.plant),
          employerAcceptedAt: signed.signedAt(1), employerAcceptedById: ownerOf(w.supplier),
        }
      }),
    ],
    skipDuplicates: true,
  })
  await db.workAssertion.createMany({
    data: receipts.flatMap(({ r, w }) => {
      const signed = signingDays(seedWeek(r.week, r.accepted).start)
      const ts = `cv_ts_${w.key}_w${r.week}`
      return [
        { id: `${ts}_client`, timesheetId: ts, companyId: co.id, role: 'CLIENT_APPROVAL', hours: r.accepted, rateCents: billRateMinor(w.plant.cc), state: 'LIVE', byId: manager(w.plant), at: signed.signedAt(0) },
        { id: `${ts}_employer`, timesheetId: ts, companyId: supplierIds.get(supplierSlug(w.supplier))!, role: 'EMPLOYER_ACCEPTANCE', hours: r.accepted, rateCents: payRateMinor(w.plant.cc), state: 'LIVE', byId: ownerOf(w.supplier), at: signed.signedAt(1) },
      ]
    }),
    skipDuplicates: true,
  })

  // Each signature posted to the books, through the function the route that
  // signs a week calls, so a rebuild of the postings finds nothing to change
  // (hop-ledger-books). A signature already posted is left as it is.
  for (const { r, w } of receipts) {
    const ts = `cv_ts_${w.key}_w${r.week}`
    await postAssertion(`${ts}_client`, manager(w.plant))
    await postAssertion(`${ts}_employer`, ownerOf(w.supplier))
  }
  // And booked, a balanced entry per posting in its own currency: the base
  // world's books part does not walk Corvane's firms (seed-stays-in-its-world).
  await bookPostings([co.id, ...new Set(receipts.map(({ w }) => supplierIds.get(supplierSlug(w.supplier))!))])

  // ── The receipts: what each supplier sent for those weeks ──
  // One whole billing period under the terms of the document the line is
  // on, and the due date those terms compute, the way a bill is raised
  // (POST /api/invoices/generate; the twin's own demo receipts the same).
  const initials = (name: string) => addressSafe(name).split('-').filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 3)
  const terms = new Map(
    (await db.sellContract.findMany({
      where: { id: { in: receipts.map(({ w }) => sid(w)) } },
      select: {
        id: true, startDate: true, endDate: true, billFrequency: true, billAnchor: true, billStraddle: true,
        paymentTerms: true, paymentTermsFrom: true, workOrder: { select: ORDER_HEADER_SELECT },
      },
    })).map((c) => [c.id, c])
  )
  await db.invoice.createMany({
    data: receipts.map(({ r, w }, k) => {
      const wk = seedWeek(r.week, r.accepted)
      const line = terms.get(sid(w))!
      const firstWorked = new Date(`${Object.keys(wk.days).sort()[0]}T00:00:00Z`)
      const period = periodFor(firstWorked, periodTermsFor('SELL', line))
      const billed = termsFor('SELL', line)
      const currency = CORVANE_COUNTRIES[w.plant.cc].currency
      const amount = Math.round(r.billed * billRateMinor(w.plant.cc))
      const issuedAt = new Date(wk.end.getTime() + 2 * 86_400_000)
      const due = dueOn({
        anchor: billed.paymentTermsFrom ?? 'PERIOD_END', days: billed.paymentTermsDays ?? 30,
        periodEnd: period.end, issuedAt, receivedAt: null, approvedAt: null,
      })
      const sup = supplierSlug(w.supplier)
      return {
        id: `cv_inv_${w.key}_w${r.week}`, engagementId: `cv_eng_${sup}`, workOrderId: `cv_wo_${sup}`,
        number: `${initials(w.supplier)}-${w.plant.cc}-${day(0).getUTCFullYear()}-${String(410 + k + (r.held ? 50 : 0)).padStart(4, '0')}`,
        periodStart: period.start, periodEnd: period.end, currency, total: amount / minorPerUnit(currency), paid: 0,
        issuedAt, submittedAt: issuedAt, dueAt: due.dueAt, status: 'SUBMITTED',
        soldToId: co.id, billToId: co.id, payerId: co.id, shipToId: `cv_site_${w.plant.key}`,
      }
    }) as never,
    skipDuplicates: true,
  })
  await db.invoiceLine.createMany({
    data: receipts.map(({ r, w }) => {
      const wk = seedWeek(r.week, r.accepted)
      return {
        id: `cv_line_${w.key}_w${r.week}`, invoiceId: `cv_inv_${w.key}_w${r.week}`, timesheetId: `cv_ts_${w.key}_w${r.week}`,
        sellContractId: sid(w), personId: who(w), hours: r.billed, rateCents: billRateMinor(w.plant.cc),
        amountCents: Math.round(r.billed * billRateMinor(w.plant.cc)),
        description: `${w.name} — ${wk.start.toISOString().slice(0, 10)} to ${wk.end.toISOString().slice(0, 10)}`,
      }
    }),
    skipDuplicates: true,
  })

  // ── Papers, US only: an I-9 from a named passport, and a provider's check ──
  // The start on hold has the check and no I-9, so it cannot start.
  if (region !== 'us') return
  const us = workers
  await db.verification.createMany({
    data: us.flatMap((w) => {
      const onFile = Math.max(w.startedDaysAgo, 0) + 8
      const by = { uploadedById: ownerOf(w.supplier), verifiedById: compliance, verifiedAt: day(-onFile + 1), result: { outcome: 'CLEAR' } }
      const check = {
        id: `cv_bgc_${w.key}`, personId: who(w), type: 'BACKGROUND_CHECK' as const, status: 'CLEAR', provider: 'Sterling',
        issuedAt: day(-onFile), expiresAt: day(300), orderedByCompanyId: supplierIds.get(supplierSlug(w.supplier))!, orderedAt: day(-onFile - 4), ...by,
      }
      if (w.state !== 'IN_PROGRESS') return [check]
      return [
        check,
        { id: `cv_i9_${w.key}`, personId: who(w), type: 'I9_EVERIFY' as const, status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-onFile), expiresAt: null, formEdition: '08/01/2023', ...by },
        { id: `cv_pass_${w.key}`, personId: who(w), type: 'PASSPORT' as const, status: 'CLEAR', provider: 'US Department of State', issuedAt: day(-800), expiresAt: day(900), ...by },
      ]
    }) as never,
    skipDuplicates: true,
  })
  await db.documentBacking.createMany({
    data: us.filter((w) => w.state === 'IN_PROGRESS').map((w) => ({
      id: `cv_back_${w.key}`, formId: `cv_i9_${w.key}`, evidenceId: `cv_pass_${w.key}`, satisfiedKey: 'PASSPORT',
      recordedById: compliance, recordedAt: day(-(w.startedDaysAgo + 7)),
    })),
    skipDuplicates: true,
  })
}
