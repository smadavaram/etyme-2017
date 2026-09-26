/**
 * The contractor census importer — a client's own spreadsheet, read once.
 *
 * `docs/census-brief.md`: a client sends us what they already have about
 * their contractors and gets back one page. This is the half that turns
 * their file into rows the product's own arithmetic can read, in a
 * sandbox company of their own.
 *
 * ── Two rules this file exists to keep ───────────────────────────────
 *
 * **Gaps are the product.** The brief: "What we could not see ... is
 * never empty and never hidden. It is what makes the other four numbers
 * believable." So nothing here defaults a missing value. A blank rate is
 * not zero, a blank hours is not forty, and a row we could not read is
 * not silently dropped — every one of them comes back as a sentence
 * against the line number it came from.
 *
 * **Nothing is converted.** A rate typed with a rupee sign is refused
 * rather than added to dollars. The template has no currency column, so
 * every rate is read as the sandbox's currency and anything that says
 * otherwise is a question for the staff person, not a multiplication.
 *
 * ── Why the CSV is hand-rolled ───────────────────────────────────────
 *
 * There is no spreadsheet library in this product and the brief's
 * correction says none is added for this: "The template downloads as CSV
 * with a header row and one example row; the page says 'open in Excel,
 * fill it, save as CSV.'" The splitter below is the same one
 * `app/dashboard/data` already uses on pasted reference data, kept
 * separate rather than imported because that one lives inside a client
 * component.
 */

import { fromDecimal } from '@/lib/money'

// ── The template ─────────────────────────────────────────────────────

/**
 * The columns, in the order the template writes them.
 *
 * Read by name rather than by position, so a client who reorders their
 * columns — or keeps three of their own on the end — still imports.
 * Matching is case- and space-insensitive, because "Start Date",
 * "start_date" and "START DATE" are all the same question.
 */
export const TEMPLATE_COLUMNS = [
  'supplier',
  'role',
  'site',
  'start date',
  'end date',
  'bill rate',
  'hours per week',
  'reference number',
] as const

/**
 * The file a client downloads: a header row and one example row.
 *
 * **No names.** The example is a reference number, which is the whole
 * point of Option A — "Option A has almost no personal data in it." A
 * template with "Jane Doe" in it teaches the client to send us names.
 *
 * The static copy lives at `public/census-template.csv` so the public
 * `/census` page can link it without a login; a unit test fails if the
 * two ever differ.
 */
export const TEMPLATE_CSV =
  'supplier,role,site,start date,end date,bill rate,hours per week,reference number\n' +
  'Veritan Talent,Validation Engineer,Tualatin OR,2024-03-04,2025-03-03,92.50,40,C-1041\n'

// ── What comes out ───────────────────────────────────────────────────

/** One thing we could not see, against the line it was on. */
export interface CensusGap {
  /** The line in the client's file, counting the header as line 1. */
  line: number
  /** Their own reference number, where the row had a readable one. */
  reference: string | null
  /** A machine name for the shape of the gap. For counting, never for a screen. */
  kind: CensusGapKind
  /** Whether this gap stopped the row importing at all. */
  stopsTheRow: boolean
  /** What a person reads. A sentence, never a code. */
  says: string
}

export type CensusGapKind =
  | 'NO_SUPPLIER'
  | 'NO_ROLE'
  | 'NO_SITE'
  | 'NO_REFERENCE'
  | 'NO_START_DATE'
  | 'UNREADABLE_DATE'
  | 'END_BEFORE_START'
  | 'NO_END_DATE'
  | 'NO_RATE'
  | 'ANOTHER_CURRENCY'
  | 'NO_HOURS'
  | 'DUPLICATE_REFERENCE'
  | 'ALREADY_IMPORTED'
  | 'NOT_A_SPREADSHEET'
  | 'MISSING_COLUMN'

/** One contractor, as far as their file could say. */
export interface CensusRow {
  line: number
  supplier: string
  role: string | null
  site: string | null
  reference: string
  startDate: Date
  /** Null means nobody said when it ends, which is a gap and not "forever". */
  endDate: Date | null
  /** Minor units — cents. Null means no rate was given, which is not zero. */
  rateMinor: number | null
  currency: string
  /** Null means nobody said, which is not forty. */
  hoursPerWeek: number | null
}

export interface ParsedCensus {
  /** The rows good enough to import. */
  rows: CensusRow[]
  /** Every gap on every line, whether or not the row imported. */
  gaps: CensusGap[]
  /** How many data lines the file had, gaps and all. */
  lines: number
}

const USD = 'USD'

// ── The splitter ─────────────────────────────────────────────────────

function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** "Start Date", "start_date" and "START  DATE" are one question. */
function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Reading one value ────────────────────────────────────────────────

/**
 * A date, in one of the two forms a US client's spreadsheet produces.
 *
 * ISO (`2024-03-04`) and US (`3/4/2024`). Anything else is refused by
 * name rather than guessed, because `04/03/2024` is the fourth of March
 * in half the world and the third of April in the other half, and a
 * tenure figure built on the wrong one is a number nobody can stand
 * behind.
 *
 * Built in UTC so the same file read in Mumbai and in Portland produces
 * the same day.
 */
export function readDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (us) return utc(Number(us[3]), Number(us[1]), Number(us[2]))

  return null
}

function utc(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  // Rejects the 31st of February rather than rolling it into March.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d
}

/** Anything that says this figure is not in the sandbox's currency. */
const FOREIGN = /[₹£€¥₩]|\b(inr|gbp|eur|jpy|cad|aud|sgd|aed|chf|mxn|zar|rs)\b/i

export type RateReading =
  | { ok: true; minor: number }
  | { ok: false; why: 'blank' | 'unreadable' | 'another currency' }

/**
 * A bill rate, in minor units of the sandbox's currency.
 *
 * A zero or a negative is `blank`, not a rate: a placement priced at
 * nothing is a missing link, never good news, and averaging it into a
 * quarter's spend would understate the client's exposure by exactly the
 * amount they most want to know about.
 */
export function readRate(raw: string, currency: string = USD): RateReading {
  const s = raw.trim()
  if (!s) return { ok: false, why: 'blank' }
  if (FOREIGN.test(s)) return { ok: false, why: 'another currency' }

  const cleaned = s.replace(/\/\s*(hr|hour|h)\b/i, '').replace(/per\s+hour/i, '').replace(/[$,\s]/g, '')
  if (!/^\d*\.?\d+$/.test(cleaned)) return { ok: false, why: 'unreadable' }

  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return { ok: false, why: 'blank' }
  return { ok: true, minor: fromDecimal(value, currency).minor }
}

/** Hours in a week. Nothing over 168 is hours, and nothing at or below zero is either. */
export function readHours(raw: string): number | null {
  const s = raw.trim().replace(/\s*(hrs?|hours?)\b/i, '')
  if (!s) return null
  const value = Number(s)
  if (!Number.isFinite(value) || value <= 0 || value > 168) return null
  return Math.round(value * 100) / 100
}

// ── The parse ────────────────────────────────────────────────────────

export interface ParseOptions {
  /** The sandbox's currency. Every rate is read as this one, or refused. */
  currency?: string
  /** Reference numbers already in the sandbox from an earlier file. */
  alreadyImported?: Iterable<string>
}

/**
 * Read a filled template.
 *
 * Every row either lands in `rows` or is accounted for in `gaps` by line
 * number. Nothing is dropped quietly: the brief's "what we could not
 * see" is assembled from exactly this.
 */
export function parseCensusCsv(text: string, opts: ParseOptions = {}): ParsedCensus {
  const currency = opts.currency ?? USD
  const gaps: CensusGap[] = []
  const rows: CensusRow[] = []

  const lines = text.split(/\r?\n/)
  const firstData = lines.findIndex((l) => l.trim() !== '')
  if (firstData === -1) {
    gaps.push({
      line: 1, reference: null, kind: 'NOT_A_SPREADSHEET', stopsTheRow: true,
      says: 'The file was empty, so there was nothing to read. Fill the template and send it again.',
    })
    return { rows, gaps, lines: 0 }
  }

  const headers = splitLine(lines[firstData]).map(normalizeHeader)
  const at = (name: string) => headers.indexOf(name)

  // A column that is not there is a question nobody was asked, and it is
  // said once against the header rather than once per row.
  const required = ['supplier', 'start date', 'reference number']
  for (const name of [...TEMPLATE_COLUMNS]) {
    if (at(name) !== -1) continue
    gaps.push({
      line: firstData + 1, reference: null, kind: 'MISSING_COLUMN',
      stopsTheRow: required.includes(name),
      says:
        `The file has no "${name}" column, so nothing on any row could answer it` +
        (required.includes(name)
          ? '. Without it no row can be imported — add the column and send the file again.'
          : '.'),
    })
  }
  if (required.some((name) => at(name) === -1)) return { rows, gaps, lines: 0 }

  const seen = new Map<string, number>()
  const before = new Set(Array.from(opts.alreadyImported ?? [], (r) => r.toLowerCase()))
  let dataLines = 0

  for (let i = firstData + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') continue
    const line = i + 1
    dataLines++

    const cells = splitLine(raw)
    const cell = (name: string) => {
      const idx = at(name)
      return idx === -1 ? '' : (cells[idx] ?? '').trim()
    }
    const referenceRaw = cell('reference number')
    const reference = referenceRaw || null
    const note = (kind: CensusGapKind, stopsTheRow: boolean, says: string) =>
      gaps.push({ line, reference, kind, stopsTheRow, says })

    let stopped = false

    // ── Who is paid ──────────────────────────────────────────────────
    const supplier = cell('supplier')
    if (!supplier) {
      note('NO_SUPPLIER', true,
        `Line ${line} names no supplier, so there is nobody to attribute this contractor or their spend to. ` +
        'It is not counted in any number on this page.')
      stopped = true
    }

    // ── Who it is about ──────────────────────────────────────────────
    if (!reference) {
      note('NO_REFERENCE', true,
        `Line ${line} has no reference number, so this contractor cannot be told apart from another on the same page. ` +
        'It is not counted.')
      stopped = true
    } else if (seen.has(reference.toLowerCase())) {
      note('DUPLICATE_REFERENCE', true,
        `Reference ${reference} is on line ${seen.get(reference.toLowerCase())} as well as line ${line}. ` +
        'The first was counted and the second was not, so nobody is counted twice.')
      stopped = true
    } else if (before.has(reference.toLowerCase())) {
      note('ALREADY_IMPORTED', true,
        `Reference ${reference} was already loaded from an earlier file, so line ${line} was left alone rather than ` +
        'counted a second time.')
      stopped = true
    }

    // ── When ─────────────────────────────────────────────────────────
    const startRaw = cell('start date')
    const startDate = readDate(startRaw)
    if (!startRaw) {
      note('NO_START_DATE', true,
        `Line ${line} has no start date, so no days on site can be counted for them and they cannot be ` +
        'placed in a quarter. The row is not counted.')
      stopped = true
    } else if (!startDate) {
      note('UNREADABLE_DATE', true,
        `The start date on line ${line} reads "${startRaw}", which could be two different days depending on ` +
        'where it was written. Use 2024-03-04 or 3/4/2024. The row is not counted.')
      stopped = true
    }

    const endRaw = cell('end date')
    const endDate = endRaw ? readDate(endRaw) : null
    if (!endRaw) {
      note('NO_END_DATE', false,
        `Line ${line} has no end date${reference ? ` (${reference})` : ''}. They are counted as on site today and ` +
        'their days are counted to today, which is the safe reading — but nobody at Etyme knows when this placement ends.')
    } else if (!endDate) {
      note('UNREADABLE_DATE', true,
        `The end date on line ${line} reads "${endRaw}", which could be two different days depending on where it ` +
        'was written. Use 2024-03-04 or 3/4/2024. The row is not counted.')
      stopped = true
    } else if (startDate && endDate.getTime() < startDate.getTime()) {
      note('END_BEFORE_START', true,
        `Line ${line} ends on ${endRaw}, before it starts on ${startRaw}. One of the two is wrong and we have not ` +
        'guessed which, so the row is not counted.')
      stopped = true
    }

    // ── What it costs ────────────────────────────────────────────────
    const rateRaw = cell('bill rate')
    const rate = readRate(rateRaw, currency)
    let rateMinor: number | null = null
    if (rate.ok) {
      rateMinor = rate.minor
    } else if (rate.why === 'another currency') {
      note('ANOTHER_CURRENCY', true,
        `The rate on line ${line} reads "${rateRaw}", which is not ${currency}. Nothing here converts one currency ` +
        `into another, so the row is not counted rather than added to ${currency} as though it were.`)
      stopped = true
    } else if (rate.why === 'unreadable') {
      note('NO_RATE', false,
        `The rate on line ${line} reads "${rateRaw}" and could not be read as an hourly figure. They are counted ` +
        'as a contractor on site and their spend is not counted at all.')
    } else {
      note('NO_RATE', false,
        `Line ${line} has no bill rate${reference ? ` (${reference})` : ''}. They are counted as a contractor on ` +
        'site and their spend is not counted at all.')
    }

    const hoursRaw = cell('hours per week')
    const hoursPerWeek = readHours(hoursRaw)
    if (hoursPerWeek === null) {
      note('NO_HOURS', false,
        `Line ${line} has no readable hours per week${hoursRaw ? ` — it reads "${hoursRaw}"` : ''}. Nothing is ` +
        'assumed, so this placement adds nothing to the quarter\'s spend.')
    }

    // ── What it is, and where ────────────────────────────────────────
    const role = cell('role') || null
    if (!role) {
      note('NO_ROLE', false,
        `Line ${line} names no role, so this contractor cannot be compared with anybody else's price for the ` +
        'same skill.')
    }
    const site = cell('site') || null
    if (!site) {
      note('NO_SITE', false, `Line ${line} names no site.`)
    }

    if (stopped || !startDate) continue

    if (reference) seen.set(reference.toLowerCase(), line)
    rows.push({
      line,
      supplier,
      role,
      site,
      reference: reference!,
      startDate,
      endDate,
      rateMinor,
      currency,
      hoursPerWeek,
    })
  }

  return { rows, gaps, lines: dataLines }
}

/** Whether a file is one we can read at all, by name and type. */
export function looksLikeCsv(fileName: string, contentType: string): boolean {
  if (/\.csv$/i.test(fileName)) return true
  return /^text\/(csv|plain)$/i.test(contentType.split(';')[0].trim())
}

// ─────────────────────────────────────────────────────────────────────
// The sandbox
// ─────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'

/**
 * What one row became, so the staff person can read the file against the
 * page.
 */
export interface RowOutcome {
  line: number
  reference: string | null
  imported: boolean
  gaps: CensusGap[]
}

export interface CensusImportResult {
  requestId: string
  fileName: string
  /** The company row the client's contractors now sit in. */
  sandboxCompanyId: string
  sandboxSlug: string
  /** Contractors created by this run. */
  imported: number
  /** Data lines in the file, whether or not they imported. */
  lines: number
  suppliers: { id: string; name: string; contractors: number }[]
  rows: RowOutcome[]
  gaps: CensusGap[]
  /** One sentence for the staff person, and for the letter that follows. */
  says: string
}

/** A slug fragment safe in a domain, an address and a URL. */
function slugPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x'
}

/**
 * Load one filled template into a sandbox of this client's own.
 *
 * Creates, per the brief and no more: the sandbox company, one supplier
 * company per distinct supplier name, one person per contractor named by
 * their own reference number, and one sell contract per row carrying the
 * rate and the dates. Three rows beyond that earn their place —
 * a `ConsultantProfile` because the client dashboard reads the role from
 * its headline, a `Requirement` because it is the only column in the
 * schema that means "hours a week this seat actually works", and a
 * `CompanyLocation` per distinct site, because a column the template
 * asks for and lands nowhere is a question whose answer was thrown away.
 *
 * Idempotent on the reference number: running the same file twice loads
 * nothing the second time and says so per row. A head count that doubles
 * because somebody clicked twice is the one mistake this page cannot
 * survive.
 */
export async function importCensusCsv(args: {
  requestId: string
  fileName: string
  text: string
  now?: Date
}): Promise<CensusImportResult> {
  const now = args.now ?? new Date()

  const request = await prisma.censusRequest.findUnique({
    where: { id: args.requestId },
    select: { id: true, companyName: true, sandboxCompanyId: true },
  })
  if (!request) throw new Error(`There is no census request ${args.requestId} to import into.`)

  // ── The sandbox, created plainly ───────────────────────────────────
  //
  // Not through `POST /api/demo`: that seeds a synthetic fixture, cannot
  // ingest external data, and marks what it makes `isDemo` — the one
  // flag that means "safe to throw away and nobody is watching". This is
  // a real client's real rows under a date we promised them.
  const slug = `census-${request.id.toLowerCase()}`
  let sandboxId = request.sandboxCompanyId
  if (!sandboxId) {
    const sandbox = await prisma.company.create({
      data: {
        name: request.companyName,
        slug,
        // A reserved name nobody can register, so no real employee of
        // this client is ever seated inside the sandbox by signing in.
        domain: `${slug}.invalid`,
        domainVerified: false,
        kind: 'CLIENT',
        currency: 'USD',
        isCensusSandbox: true,
      },
    })
    sandboxId = sandbox.id
    await prisma.censusRequest.update({
      where: { id: request.id },
      data: { sandboxCompanyId: sandbox.id },
    })
  }

  const sandbox = await prisma.company.findUniqueOrThrow({
    where: { id: sandboxId },
    select: { id: true, slug: true, currency: true },
  })

  // What is already here from an earlier file, so a second run is a
  // no-op rather than a doubling.
  const already = await prisma.sellContract.findMany({
    where: { clientCompanyId: sandbox.id },
    select: { person: { select: { name: true } } },
  })
  const parsed = parseCensusCsv(args.text, {
    currency: sandbox.currency,
    alreadyImported: already.map((c) => c.person.name),
  })

  // ── One company per supplier name, as they typed it ────────────────
  const supplierIds = new Map<string, string>()
  const existingSuppliers = await prisma.company.findMany({
    where: { isCensusSandbox: true, slug: { startsWith: `${sandbox.slug}-s-` } },
    select: { id: true, name: true },
  })
  for (const s of existingSuppliers) supplierIds.set(s.name.toLowerCase(), s.id)

  for (const row of parsed.rows) {
    const key = row.supplier.toLowerCase()
    if (supplierIds.has(key)) continue
    const created = await prisma.company.create({
      data: {
        name: row.supplier,
        slug: `${sandbox.slug}-s-${slugPart(row.supplier)}`,
        kind: 'VENDOR',
        currency: sandbox.currency,
        isCensusSandbox: true,
      },
    })
    supplierIds.set(key, created.id)
  }

  // ── One location per site ──────────────────────────────────────────
  const locationIds = new Map<string, string>()
  const existingLocations = await prisma.companyLocation.findMany({
    where: { companyId: sandbox.id },
    select: { id: true, name: true },
  })
  for (const l of existingLocations) locationIds.set(l.name.toLowerCase(), l.id)
  for (const row of parsed.rows) {
    if (!row.site) continue
    const key = row.site.toLowerCase()
    if (locationIds.has(key)) continue
    const created = await prisma.companyLocation.create({
      data: { companyId: sandbox.id, name: row.site },
    })
    locationIds.set(key, created.id)
  }

  // ── One contractor, one placement ──────────────────────────────────
  const counts = new Map<string, number>()
  let imported = 0

  for (const row of parsed.rows) {
    const supplierId = supplierIds.get(row.supplier.toLowerCase())!

    const person = await prisma.person.create({
      data: {
        // Their own reference number is the name. The template asks for
        // no names and this is why: nothing here can print one.
        name: row.reference,
        primaryEmail: `${slugPart(row.reference)}@${sandbox.slug}.invalid`,
        consultant: { create: { headline: row.role ?? 'Contractor' } },
      },
    })

    // The only column in the schema that means "hours a week this seat
    // actually works". A sell contract has no such field, so without
    // this the hours the client sent would land nowhere.
    const seat = await prisma.requirement.create({
      data: {
        companyId: sandbox.id,
        title: row.role ?? 'Contractor',
        status: 'FILLED',
        hoursPerWeek: row.hoursPerWeek === null ? null : Math.round(row.hoursPerWeek),
        location: row.site,
      },
    })

    await prisma.sellContract.create({
      data: {
        companyId: supplierId,
        clientCompanyId: sandbox.id,
        personId: person.id,
        requirementId: seat.id,
        workLocationId: row.site ? locationIds.get(row.site.toLowerCase()) ?? null : null,
        // `billRate` is a non-null Int, so a rate the client did not send
        // has to be stored as something. Zero is the only value that is
        // not a plausible rate, and `lib/census-page` reads it as "no
        // rate" and blanks the spend rather than pricing anybody at
        // nothing. The clean fix is a nullable column; it is a schema
        // request, written up with this work.
        billRate: row.rateMinor ?? 0,
        billCurrency: row.currency,
        startDate: row.startDate,
        endDate: row.endDate,
        state: stateFor(row, now),
      },
    })

    counts.set(supplierId, (counts.get(supplierId) ?? 0) + 1)
    imported++
  }

  const byLine = new Map<number, CensusGap[]>()
  for (const g of parsed.gaps) byLine.set(g.line, [...(byLine.get(g.line) ?? []), g])
  const importedLines = new Set(parsed.rows.map((r) => r.line))
  const rows: RowOutcome[] = [...byLine.keys()]
    .concat(parsed.rows.map((r) => r.line))
    .filter((l, i, a) => a.indexOf(l) === i)
    .sort((a, b) => a - b)
    .map((line) => ({
      line,
      reference: (byLine.get(line)?.[0]?.reference) ?? parsed.rows.find((r) => r.line === line)?.reference ?? null,
      imported: importedLines.has(line),
      gaps: byLine.get(line) ?? [],
    }))

  const suppliers = [...counts.entries()].map(([id, contractors]) => ({
    id,
    name: [...supplierIds.entries()].find(([, v]) => v === id)?.[0] ?? id,
    contractors,
  }))
  // The name as typed, not the lower-cased key.
  const named = await prisma.company.findMany({
    where: { id: { in: suppliers.map((s) => s.id) } },
    select: { id: true, name: true },
  })
  for (const s of suppliers) s.name = named.find((n) => n.id === s.id)?.name ?? s.name

  const stopped = parsed.gaps.filter((g) => g.stopsTheRow).length
  const says =
    `${imported} of ${parsed.lines} rows in ${args.fileName} loaded into ${request.companyName}'s sandbox` +
    (stopped > 0 ? `; ${stopped} could not be read and every one of them is on the page.` : '.')

  return {
    requestId: request.id,
    fileName: args.fileName,
    sandboxCompanyId: sandbox.id,
    sandboxSlug: sandbox.slug,
    imported,
    lines: parsed.lines,
    suppliers: suppliers.sort((a, b) => b.contractors - a.contractors),
    rows,
    gaps: parsed.gaps,
    says,
  }
}

/**
 * What state a placement is in, from the two dates the client sent.
 *
 * The three the product's own reads ask for: the client dashboard counts
 * IN_PROGRESS as on site, and the tenure ledger counts IN_PROGRESS,
 * PAUSED and ENDED. A placement with no end date is running, which is
 * the safe reading and is said out loud as a gap.
 */
export function stateFor(
  row: { startDate: Date; endDate: Date | null },
  now: Date
): 'DRAFT' | 'IN_PROGRESS' | 'ENDED' {
  if (row.startDate.getTime() > now.getTime()) return 'DRAFT'
  if (row.endDate && row.endDate.getTime() < now.getTime()) return 'ENDED'
  return 'IN_PROGRESS'
}
