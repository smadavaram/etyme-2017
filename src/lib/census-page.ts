/**
 * The one page a client gets back from a contractor census.
 *
 * `docs/census-brief.md`: "The output is a document, not a dashboard.
 * One PDF page addressed to the CFO. Enterprise buyers forward
 * documents. They do not forward logins." There is no PDF pipeline on
 * Vercel, so this is a print-styled HTML page on one sheet; the named
 * staff person opens it, reads it, prints it to PDF and sends it, which
 * is the flow anyway.
 *
 * ── What this file may and may not compute ───────────────────────────
 *
 * It owns nothing it did not write. Three of the numbers already exist:
 *
 *   - **who is on site** is `chainTop` plus a head count, and the
 *     reduction is the part that was ever hard — a person bought through
 *     a chain is one contractor, not one per rung. Imported, never
 *     restated.
 *   - **days on site** is `daysOnSite` from `lib/tenure-days`, which is
 *     the union of the periods and not their sum. Imported.
 *   - **the client dashboard's monthly spend** is inline in
 *     `app/api/program/route.ts` and values every seat at 160 hours a
 *     month. It is not imported and it is not copied: this page prices
 *     the quarter from the hours per week the client actually sent, says
 *     so on its face, and does not claim to equal the dashboard's
 *     monthly figure. Making the two one function is a request written
 *     up with this work, for whoever owns that route.
 *
 * Only the **supplier rate spread** is new here, because rate variance
 * exists in this product by hiring manager and not by supplier.
 *
 * ── The rule the whole page is built on ──────────────────────────────
 *
 * Refuse rather than fabricate. One placement with no rate behind it
 * blanks the spend for the whole book rather than being averaged in at
 * nothing, and the page says how many rows and why. A CFO's desk is the
 * worst place in the world for a plausible wrong number, because nobody
 * audits good news.
 */

import { prisma } from '@/lib/db'
import { chainTop } from '@/lib/chain-top'
import { endClientFilter } from '@/lib/resolve-end-client'
import { daysOnSite, monthsOf } from '@/lib/tenure-days'
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'
import { format, fromMinor } from '@/lib/money'
import { parseCensusCsv, looksLikeCsv, type CensusGap } from '@/lib/census-import'

// ── The shapes ───────────────────────────────────────────────────────

export interface SupplierHead {
  companyId: string
  name: string
  contractors: number
}

export interface ContractorsToday {
  total: number
  bySupplier: SupplierHead[]
}

export interface SupplierSpend {
  companyId: string
  name: string
  /** Minor units. Null where a placement of theirs could not be priced. */
  minor: number | null
  /** Basis points of the total. Null whenever either figure is null. */
  shareBps: number | null
  /** Why their figure is blank, in a sentence. */
  why: string | null
}

export interface QuarterSpend {
  /** "the third quarter of 2026, to 20 September". */
  says: string
  from: string
  to: string
  currency: string
  /** Minor units, or null when the book cannot be priced whole. */
  totalMinor: number | null
  /** Why the total is blank. */
  why: string | null
  /** Placements in the quarter we could price, and how many there were. */
  priced: number
  of: number
  bySupplier: SupplierSpend[]
}

export interface RoleSpread {
  role: string
  currency: string
  lowMinor: number
  highMinor: number
  gapMinor: number
  lowSupplier: string
  highSupplier: string
  suppliers: number
  /** A caveat, where somebody in this role could not be priced. */
  caveat: string | null
}

export interface RateSpread {
  roles: RoleSpread[]
  /** Roles one supplier fills on their own. */
  oneSupplierOnly: string[]
  /** Roles we refused to compare, and why. */
  refused: { role: string; why: string }[]
}

export interface LongServer {
  reference: string
  days: number
  months: number
  suppliers: string[]
}

export interface LongestOnSite {
  top: LongServer[]
  past12: number
  past18: number
  /** The cap this client set, in months. Null where none is set. */
  capMonths: number | null
  /** How many are past it. Null where there is no cap to be past. */
  pastCap: number | null
}

export interface CensusNumbers {
  contractorsToday: ContractorsToday
  spendThisQuarter: QuarterSpend
  rateSpread: RateSpread
  longestOnSite: LongestOnSite
}

const DAY = 86_400_000

// ── The contracts the whole page is read from ────────────────────────

export interface Placement {
  id: string
  personId: string
  personName: string
  companyId: string
  clientCompanyId: string
  supplier: string
  role: string | null
  /** Minor units, or null: a zero in the column means nobody sent a rate. */
  rateMinor: number | null
  currency: string
  hoursPerWeek: number | null
  startDate: Date
  endDate: Date | null
  state: string
}

async function placementsIn(sandboxCompanyId: string): Promise<Placement[]> {
  const rows = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(sandboxCompanyId),
      state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ENDED', 'PAUSED'] },
    },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true,
      billRate: true, billCurrency: true, startDate: true, endDate: true, state: true,
      person: { select: { name: true, consultant: { select: { headline: true } } } },
      company: { select: { name: true } },
      requirement: { select: { title: true, hoursPerWeek: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  // ── Whose name this page may print ─────────────────────────────────
  //
  // The client's own file rarely describes a chain, and the day one does
  // this page must not be the surface that gives a prime's sub-vendor
  // away. `chainTop` reduces the head count and the rate spread to the
  // rung the client pays, but the tenure section reads every rung — that
  // is what makes the number worth having — so the names on it go
  // through the same rule the dashboard and the tenure ledger use, and
  // nothing here decides for itself.
  const terms = await prisma.masterAgreement.findMany({
    where: { clientId: sandboxCompanyId },
    select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
  })
  const seenNames = namesForClient(
    rows.map((c) => ({
      id: c.id, personId: c.personId, companyId: c.companyId,
      companyName: c.company.name, clientCompanyId: c.clientCompanyId,
    })),
    sandboxCompanyId,
    (primeCompanyId: string) => mayNameSubVendors(terms, sandboxCompanyId, primeCompanyId)
  )
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId, name: trueName, masked: false, through: null, phrase: trueName, says: trueName,
    }

  return rows.map((c) => ({
    id: c.id,
    personId: c.personId,
    personName: c.person.name,
    companyId: c.companyId,
    clientCompanyId: c.clientCompanyId,
    supplier: shown(c.companyId, c.company.name).name,
    role: c.requirement?.title ?? c.person.consultant?.headline ?? null,
    // A stored zero is not a rate. The importer writes it because the
    // column is not nullable, and reading it back as a price would put a
    // free contractor on a CFO's page.
    rateMinor: c.billRate > 0 ? c.billRate : null,
    currency: c.billCurrency,
    hoursPerWeek: c.requirement?.hoursPerWeek ?? null,
    startDate: c.startDate,
    endDate: c.endDate,
    state: c.state,
  }))
}

// ── 1. Contractors on your sites today ───────────────────────────────

/**
 * How many people are on site, and through whom.
 *
 * `chainTop` first, always: a person a client buys through a prime who
 * buys through a bench vendor has a sell contract at every rung, and
 * counting the rungs made one contractor into three. A client's own
 * spreadsheet rarely describes a chain — but the day one does, this page
 * and the client dashboard have to agree, and they cannot if only one of
 * them reduces.
 */
export function contractorsToday(all: Placement[]): ContractorsToday {
  const onSite = chainTop(all).filter((c) => c.state === 'IN_PROGRESS')
  const bySupplier = new Map<string, SupplierHead>()
  for (const c of onSite) {
    const at = bySupplier.get(c.companyId)
    if (at) at.contractors++
    else bySupplier.set(c.companyId, { companyId: c.companyId, name: c.supplier, contractors: 1 })
  }
  return {
    total: new Set(onSite.map((c) => c.personId)).size,
    bySupplier: [...bySupplier.values()].sort(
      (a, b) => b.contractors - a.contractors || a.name.localeCompare(b.name)
    ),
  }
}

// ── 2. Spend this quarter ────────────────────────────────────────────

export function quarterBounds(now: Date): { from: Date; to: Date; label: string } {
  const q = Math.floor(now.getUTCMonth() / 3)
  const from = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 1) - DAY)
  const to = now.getTime() < end.getTime() ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : end
  const ordinal = ['first', 'second', 'third', 'fourth'][q]
  return {
    from, to,
    label: `the ${ordinal} quarter of ${from.getUTCFullYear()}, from ${day(from)} to ${day(to)}`,
  }
}

function day(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Days of a placement that fall inside the window, counting both ends. */
function overlapDays(c: Placement, from: Date, to: Date): number {
  const start = Math.max(c.startDate.getTime(), from.getTime())
  const finish = Math.min((c.endDate ?? to).getTime(), to.getTime())
  if (finish < start) return 0
  return Math.floor((finish - start) / DAY) + 1
}

/**
 * What the client spent in the quarter, at the hours they sent us.
 *
 * Deliberately **not** the dashboard's monthly figure, which values
 * every seat at 160 hours a month. A twenty-hour validation seat priced
 * at 160 hours is twice its cost, and the client sent us the real hours,
 * so this uses them.
 *
 * The blanking rule is the domain's, not a preference: one placement in
 * the quarter that cannot be priced blanks the total for the whole book,
 * and the count of what is missing is printed beside the blank. A total
 * that quietly omits three contractors is a number a CFO would act on
 * and nobody could audit.
 */
export function spendThisQuarter(all: Placement[], now: Date): QuarterSpend {
  const { from, to, label } = quarterBounds(now)
  const inQuarter = chainTop(all).filter((c) => overlapDays(c, from, to) > 0 && c.state !== 'DRAFT')

  const currency = inQuarter[0]?.currency ?? 'USD'
  const mixed = inQuarter.some((c) => c.currency !== currency)

  const bySupplier = new Map<string, { name: string; minor: number; blanks: string[] }>()
  let priced = 0

  for (const c of inQuarter) {
    const bucket = bySupplier.get(c.companyId) ?? { name: c.supplier, minor: 0, blanks: [] }
    bySupplier.set(c.companyId, bucket)

    if (c.rateMinor === null || c.hoursPerWeek === null) {
      bucket.blanks.push(
        c.rateMinor === null && c.hoursPerWeek === null
          ? `${c.personName} came with neither a rate nor hours`
          : c.rateMinor === null
            ? `${c.personName} came with no rate`
            : `${c.personName} came with no hours a week`
      )
      continue
    }
    const weeks = overlapDays(c, from, to) / 7
    bucket.minor += Math.round(c.rateMinor * c.hoursPerWeek * weeks)
    priced++
  }

  const anyBlank = [...bySupplier.values()].some((b) => b.blanks.length > 0)
  const suppliers: SupplierSpend[] = [...bySupplier.entries()].map(([companyId, b]) => ({
    companyId,
    name: b.name,
    minor: b.blanks.length > 0 ? null : b.minor,
    shareBps: null,
    why: b.blanks.length > 0
      ? `Not stated: ${b.blanks.join('; ')}. A supplier's quarter cannot be added up with one of their ` +
        'placements missing from it.'
      : null,
  }))

  const totalMinor = mixed || anyBlank
    ? null
    : suppliers.reduce((sum, s) => sum + (s.minor ?? 0), 0)

  if (totalMinor !== null && totalMinor > 0) {
    for (const s of suppliers) {
      if (s.minor !== null) s.shareBps = Math.round((s.minor / totalMinor) * 10_000)
    }
  }

  const missing = inQuarter.length - priced
  const why = mixed
    ? 'The placements in this quarter are priced in more than one currency, and nothing here converts one into ' +
      'another. The suppliers are listed without a total.'
    : anyBlank
      ? `${missing} of ${inQuarter.length} placements in this quarter came with no rate or no hours a week, so a ` +
        'total for the quarter would be the spend of the other placements presented as the spend of all of them. ' +
        'The rows are named below. Send those figures and the total can be stated.'
      : null

  return {
    says: label,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    currency,
    totalMinor,
    why,
    priced,
    of: inQuarter.length,
    bySupplier: suppliers.sort((a, b) => (b.minor ?? -1) - (a.minor ?? -1) || a.name.localeCompare(b.name)),
  }
}

// ── 3. Same skill, different price ───────────────────────────────────

/**
 * What two suppliers charge for one role, and the gap between them.
 *
 * The one piece of arithmetic on this page that exists nowhere else:
 * `lib/rate-variance` compares rates by hiring manager, which answers a
 * different question — whether one manager pays over the odds — and
 * cannot see that two suppliers are paid differently for the same skill.
 *
 * Refusals, in order: a role only one supplier fills has no spread and
 * says so rather than showing a gap of zero; a role priced in two
 * currencies is never compared; and a role where a supplier sent no rate
 * carries the caveat, because the true gap can only be wider than the
 * one we can see.
 */
export function rateSpread(all: Placement[], now: Date): RateSpread {
  const onSite = chainTop(all).filter((c) => c.state === 'IN_PROGRESS')

  const byRole = new Map<string, Placement[]>()
  for (const c of onSite) {
    if (!c.role) continue
    const key = c.role.trim().toLowerCase()
    byRole.set(key, [...(byRole.get(key) ?? []), c])
  }

  const roles: RoleSpread[] = []
  const oneSupplierOnly: string[] = []
  const refused: { role: string; why: string }[] = []

  for (const group of byRole.values()) {
    const role = group[0].role!
    const currencies = new Set(group.filter((c) => c.rateMinor !== null).map((c) => c.currency))
    if (currencies.size > 1) {
      refused.push({
        role,
        why:
          `${role} is filled at rates in ${[...currencies].join(' and ')}. Nothing here converts one currency into ` +
          'another, so no lowest, highest or gap is stated for it.',
      })
      continue
    }

    const priced = group.filter((c) => c.rateMinor !== null)
    const unpricedSuppliers = [...new Set(group.filter((c) => c.rateMinor === null).map((c) => c.supplier))]
    const pricedSuppliers = new Set(priced.map((c) => c.companyId))

    if (pricedSuppliers.size < 2) {
      const only = [...new Set(group.map((c) => c.supplier))]
      oneSupplierOnly.push(
        unpricedSuppliers.length > 0
          ? `${role} — ${only.length === 1 ? `only ${only[0]} fills it` : `${only.join(' and ')} fill it`}, and ` +
            `no rate came with ${unpricedSuppliers.join(' or ')}, so there is nothing to compare.`
          : `${role} — only ${only[0]} fills it, so there is no second price to compare.`
      )
      continue
    }

    const low = priced.reduce((a, b) => (b.rateMinor! < a.rateMinor! ? b : a))
    const high = priced.reduce((a, b) => (b.rateMinor! > a.rateMinor! ? b : a))
    roles.push({
      role,
      currency: low.currency,
      lowMinor: low.rateMinor!,
      highMinor: high.rateMinor!,
      gapMinor: high.rateMinor! - low.rateMinor!,
      lowSupplier: low.supplier,
      highSupplier: high.supplier,
      suppliers: pricedSuppliers.size,
      caveat: unpricedSuppliers.length > 0
        ? `${unpricedSuppliers.join(' and ')} also fill this role and sent no rate, so the real gap can only be ` +
          'wider than this one.'
        : null,
    })
  }

  return {
    roles: roles.sort((a, b) => b.gapMinor - a.gapMinor),
    oneSupplierOnly: oneSupplierOnly.sort(),
    refused,
  }
}

// ── 4. Longest on site ───────────────────────────────────────────────

/**
 * Who has been here longest, counting every supplier.
 *
 * `daysOnSite` is `lib/tenure-days` and is imported rather than
 * restated: the days are the **union** of the periods and not their sum,
 * so two contracts covering one week are one week on site, and it is
 * time served rather than time booked. That is the number nobody else
 * can produce, and it is the one on this page.
 */
export function longestOnSite(
  all: Placement[],
  now: Date,
  capMonths: number | null
): LongestOnSite {
  const counted = all.filter((c) => ['IN_PROGRESS', 'ENDED', 'PAUSED'].includes(c.state))
  const byPerson = new Map<string, Placement[]>()
  for (const c of counted) byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c])

  const people: LongServer[] = [...byPerson.values()].map((cs) => {
    const days = daysOnSite(cs, now)
    return {
      reference: cs[0].personName,
      days,
      months: monthsOf(days),
      suppliers: [...new Set(cs.map((c) => c.supplier))].sort(),
    }
  })

  return {
    top: people.sort((a, b) => b.days - a.days || a.reference.localeCompare(b.reference)).slice(0, 5),
    past12: people.filter((p) => p.months >= 12).length,
    past18: people.filter((p) => p.months >= 18).length,
    capMonths,
    pastCap: capMonths === null ? null : people.filter((p) => p.months >= capMonths).length,
  }
}

// ── Everything, from the sandbox ─────────────────────────────────────

export async function censusNumbers(
  sandboxCompanyId: string,
  now: Date = new Date()
): Promise<CensusNumbers> {
  const all = await placementsIn(sandboxCompanyId)

  const cap = await prisma.governanceRule.findFirst({
    where: {
      policy: { companyId: sandboxCompanyId, isActive: true },
      ruleType: 'TENURE_CAP',
      isActive: true,
    },
    select: { parameters: true },
  })
  const capMonths = cap ? Number((cap.parameters as Record<string, unknown>).maxMonths) || null : null

  return {
    contractorsToday: contractorsToday(all),
    spendThisQuarter: spendThisQuarter(all, now),
    rateSpread: rateSpread(all, now),
    longestOnSite: longestOnSite(all, now, capMonths),
  }
}

// ─────────────────────────────────────────────────────────────────────
// The page
// ─────────────────────────────────────────────────────────────────────

export interface CensusPageResult {
  html: string
  /** Every gap, per row of every file, ready for `gapsNote`. */
  gaps: CensusGap[]
  numbers: CensusNumbers
}

export interface PageSubject {
  companyName: string
  contactName: string
  /** The day the data goes, from the one column all three places read. */
  deleteBy: Date | null
  /** The named person at Etyme who ran it. */
  staff: string | null
  sandboxSlug: string | null
}

/**
 * Build the page for a census request.
 *
 * The gaps are re-read from the files rather than remembered, so the
 * "what we could not see" section is always what the file actually says.
 * A file that is not a CSV is not parsed at all and is declared as
 * received and read by a person — the brief's Option B, which no
 * importer can do and no page may pretend to have done.
 */
export async function censusPage(args: {
  requestId: string
  now?: Date
}): Promise<CensusPageResult> {
  const now = args.now ?? new Date()

  const request = await prisma.censusRequest.findUnique({
    where: { id: args.requestId },
    select: {
      id: true, companyName: true, contactName: true, deleteBy: true,
      assignedStaffEmail: true, sandboxCompanyId: true,
      files: { select: { id: true, fileName: true, contentType: true, bytes: true }, orderBy: { uploadedAt: 'asc' } },
      sandboxCompany: { select: { slug: true } },
    },
  })
  if (!request) throw new Error(`There is no census request ${args.requestId}.`)
  if (!request.sandboxCompanyId) {
    throw new Error(
      `${request.companyName}'s census has no sandbox yet, so there is nothing to compute. ` +
        'Import their file first.'
    )
  }

  const gaps: CensusGap[] = []
  for (const f of request.files) {
    if (!looksLikeCsv(f.fileName, f.contentType)) {
      gaps.push({
        line: 0,
        reference: null,
        kind: 'NOT_A_SPREADSHEET',
        stopsTheRow: true,
        says:
          `${f.fileName} was received and read by a person, and not imported — nothing here reads anything but a ` +
          'filled CSV template. Whatever it showed is in the notes below rather than in the numbers above.',
      })
      continue
    }
    const parsed = parseCensusCsv(Buffer.from(f.bytes).toString('utf8'))
    for (const g of parsed.gaps) {
      gaps.push(request.files.length > 1 ? { ...g, says: `${f.fileName}: ${g.says}` } : g)
    }
  }

  const numbers = await censusNumbers(request.sandboxCompanyId, now)

  const html = renderCensusPage({
    subject: {
      companyName: request.companyName,
      contactName: request.contactName,
      deleteBy: request.deleteBy,
      staff: request.assignedStaffEmail,
      sandboxSlug: request.sandboxCompany?.slug ?? null,
    },
    numbers,
    gaps,
    now,
  })

  return { html, gaps, numbers }
}

// ── The sheet ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function amount(minor: number, currency: string): string {
  return format(fromMinor(minor, currency))
}

function pct(bps: number | null): string {
  return bps === null ? '—' : `${(bps / 100).toFixed(1)}%`
}

/**
 * The page, as one sheet.
 *
 * Brand tokens from CLAUDE.md's design system, a serif headline, tabular
 * figures, and **no chart**: eight suppliers of one contractor each is
 * eight bars of length one, where the list is the honest form and no bar
 * is drawn.
 */
export function renderCensusPage(args: {
  subject: PageSubject
  numbers: CensusNumbers
  gaps: CensusGap[]
  now?: Date
}): string {
  const { subject, numbers, gaps } = args
  const now = args.now ?? new Date()
  const { contractorsToday: heads, spendThisQuarter: spend, rateSpread: spread, longestOnSite: longest } = numbers

  const deleteDay = subject.deleteBy ? day(subject.deleteBy) : null

  const sections: string[] = []

  // 1 ── Contractors on your sites today
  sections.push(section(
    'Contractors on your sites today',
    `<div class="hero">${heads.total}</div>`,
    heads.bySupplier.length === 0
      ? `<p class="note">No placement in the file is running today, so there is nobody to count. Every row is
         accounted for under "What we could not see".</p>`
      : list(heads.bySupplier.map((s) =>
          `<span>${esc(s.name)}</span><span class="fig">${s.contractors}</span>`))
  ))

  // 2 ── Spend this quarter
  sections.push(section(
    'Spend this quarter',
    spend.totalMinor === null
      ? `<div class="hero blank">Not stated</div>`
      : `<div class="hero">${esc(amount(spend.totalMinor, spend.currency))}</div>`,
    `<p class="note">At the hours a week you sent, across ${spend.says}.</p>` +
    (spend.why ? `<p class="note attention">${esc(spend.why)}</p>` : '') +
    (spend.bySupplier.length === 0
      ? `<p class="note">No placement in the file falls inside this quarter.</p>`
      : list(spend.bySupplier.map((s) =>
          `<span>${esc(s.name)}</span><span class="fig">${
            s.minor === null ? '<em class="blank">not stated</em>' : esc(amount(s.minor, spend.currency))
          }</span><span class="fig share">${pct(s.shareBps)}</span>`)) +
        spend.bySupplier.filter((s) => s.why).map((s) =>
          `<p class="note attention">${esc(s.name)}: ${esc(s.why!)}</p>`).join(''))
  ))

  // 3 ── Same skill, different price
  sections.push(section(
    'Same skill, different price',
    '',
    (spread.roles.length === 0
      ? `<p class="note">No role on your sites is filled by two suppliers we could both price, so there is no
         price to compare. That is a finding rather than a blank: it means every skill here has one source.</p>`
      : list(spread.roles.map((r) =>
          `<span>${esc(r.role)}</span>` +
          `<span class="fig">${esc(amount(r.lowMinor, r.currency))} ${esc(r.lowSupplier)}</span>` +
          `<span class="fig">${esc(amount(r.highMinor, r.currency))} ${esc(r.highSupplier)}</span>` +
          `<span class="fig gap">${esc(amount(r.gapMinor, r.currency))}</span>`))) +
    spread.roles.filter((r) => r.caveat).map((r) =>
      `<p class="note attention">${esc(r.role)}: ${esc(r.caveat!)}</p>`).join('') +
    (spread.oneSupplierOnly.length > 0
      ? `<p class="note">${esc(spread.oneSupplierOnly.join(' '))}</p>`
      : '') +
    spread.refused.map((r) => `<p class="note attention">${esc(r.why)}</p>`).join('')
  ))

  // 4 ── Longest on site
  sections.push(section(
    'Longest on your sites',
    '',
    (longest.top.length === 0
      ? `<p class="note">No placement in the file has any days served behind it yet.</p>`
      : list(longest.top.map((p) =>
          `<span>${esc(p.reference)}</span>` +
          `<span class="fig">${p.days} days</span>` +
          `<span class="fig">${p.months} months</span>` +
          `<span>${esc(p.suppliers.join(', '))}</span>`))) +
    `<p class="note">${longest.past12} past twelve months, ${longest.past18} past eighteen, counting every
     supplier and counting a day on site once however many firms billed it.` +
    (longest.capMonths === null
      ? ' No tenure limit is recorded for this program, so nobody is counted past one.'
      : ` ${longest.pastCap} past your own ${longest.capMonths}-month limit.`) +
    '</p>'
  ))

  // 5 ── What we could not see
  const stopped = gaps.filter((g) => g.stopsTheRow).length
  sections.push(section(
    'What we could not see',
    '',
    gaps.length === 0
      ? `<p class="note verified">Every row was complete. Nothing was missing, nothing was assumed and nothing
         was left out of the four numbers above.</p>`
      : `<p class="note">${gaps.length} ${gaps.length === 1 ? 'thing' : 'things'} in your file could not be read,
         and ${stopped === 0 ? 'none of them' : `${stopped} of them`} kept a row out of the numbers above.</p>` +
        `<ul class="gaps">${gaps.map((g) => `<li>${esc(g.says)}</li>`).join('')}</ul>`
  ))

  // 6 ── How this was computed
  sections.push(section(
    'How this was computed',
    '',
    `<p class="note">Your rows were loaded into a private program on Etyme that only ${
      subject.staff ? esc(subject.staff) : 'the named person running your census'
    } can open, and no supplier and no contractor of yours was contacted.</p>` +
    `<p class="note">The same arithmetic the product runs for a live client produced the numbers: a person bought
     through more than one firm is one contractor and not one per firm, and days on site are the union of their
     periods and never the sum, so a week covered by two contracts is one week. Spend is your own rates times your
     own hours a week across ${esc(spend.says)}, not a 160-hour assumption.</p>` +
    `<p class="note">${
      deleteDay
        ? `Everything you sent, and this program, are deleted on ${esc(deleteDay)} unless you start a program with us.`
        : 'The deletion date for what you sent is on your agreement and on your confirmation.'
    }</p>`
  ))

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Contractor census — ${esc(subject.companyName)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  :root {
    --canvas: #F0EEE6; --surface: #FBFAF7; --raised: #FFFFFF;
    --ink: #1F1E1D; --muted: #6B6862; --faint: #9C9891; --rule: #E3DFD5;
    --action: #2B47E5; --attention: #C0622E; --verified: #4F6F52;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: var(--canvas); color: var(--ink);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 11px; line-height: 1.45;
  }
  .sheet {
    max-width: 200mm; margin: 0 auto; background: var(--surface);
    border: 1px solid var(--rule); padding: 18mm 16mm;
  }
  .eyebrow { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
  h1 {
    font-family: "Iowan Old Style", Palatino, Georgia, serif;
    font-size: 27px; letter-spacing: -0.02em; text-wrap: balance;
    margin: 6px 0 2px; font-weight: 600;
  }
  .to { color: var(--muted); margin: 0 0 14px; }
  section { border-top: 1px solid var(--rule); padding: 9px 0 4px; break-inside: avoid; }
  h2 {
    font-family: "Iowan Old Style", Palatino, Georgia, serif;
    font-size: 13px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em;
  }
  .hero {
    font-family: "Iowan Old Style", Palatino, Georgia, serif;
    font-size: 30px; line-height: 1.05; font-variant-numeric: tabular-nums; margin: 2px 0 4px;
  }
  .hero.blank { font-size: 19px; color: var(--attention); }
  .rows { display: block; margin: 3px 0 0; }
  .rows > div {
    display: flex; gap: 10px; justify-content: space-between; align-items: baseline;
    border-bottom: 1px solid var(--rule); padding: 2px 0;
  }
  .rows > div > span:first-child { flex: 1 1 auto; }
  .fig { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .fig.share { min-width: 46px; color: var(--muted); }
  .fig.gap { color: var(--attention); }
  .note { color: var(--muted); margin: 5px 0 0; }
  .note.attention { color: var(--attention); }
  .note.verified { color: var(--verified); }
  .blank { color: var(--attention); font-style: normal; }
  ul.gaps { margin: 5px 0 0; padding-left: 15px; color: var(--muted); }
  ul.gaps li { margin: 0 0 2px; }
  .foot { margin-top: 12px; color: var(--faint); font-size: 9px; }
  @media print {
    body { background: #fff; padding: 0; font-size: 9.2px; }
    .sheet { border: 0; padding: 0; max-width: none; background: #fff; }
    h1 { font-size: 23px; }
    .hero { font-size: 25px; }
    section { padding: 6px 0 2px; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <p class="eyebrow">Contractor census</p>
    <h1>${esc(subject.companyName)}</h1>
    <p class="to">Prepared for ${esc(subject.contactName)}${
      subject.staff ? ` by ${esc(subject.staff)}` : ''
    }, ${esc(day(now))}.</p>
    ${sections.join('\n')}
    <p class="foot">Etyme &middot; the system of record for contingent workers.${
      deleteDay ? ` Your data is deleted on ${esc(deleteDay)} unless you start a program.` : ''
    }</p>
  </div>
</body>
</html>`
}

function section(title: string, hero: string, body: string): string {
  return `<section><h2>${esc(title)}</h2>${hero}${body}</section>`
}

function list(rows: string[]): string {
  return `<div class="rows">${rows.map((r) => `<div>${r}</div>`).join('')}</div>`
}
