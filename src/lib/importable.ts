import type { Permission } from '@/lib/permissions'

/**
 * What can be loaded, and who owns it.
 *
 * There was one importer and it loaded candidates. Which meant operations
 * had a way in and finance did not — no cost centres, no GL accounts, no
 * bank details, no payment terms — and a cost-centre owner could not load
 * their own budget at all. Three different people own three different
 * kinds of data and only one of them could get any in.
 *
 * The fix is not three importers. It is one, with a table of what may be
 * loaded and the permission that unlocks each. Finance cannot import
 * consultants; operations cannot import GL accounts. The permission
 * decides which sheets you are even offered, so the wrong one is not a
 * validation error at the end of a long upload — it is a thing you never
 * saw.
 *
 * Two properties matter as much as the mapping.
 *
 * **A natural key.** Loading the same file twice must update rather than
 * duplicate, because somebody will load it twice. Cost centre code,
 * employee email, purchase order number.
 *
 * **Per-row errors, collected.** A finance team gets one report of eleven
 * bad rows, not eleven attempts. This is the 2017 `temp_candidates`
 * pattern, which CLAUDE.md names as the model.
 */

export interface FieldSpec {
  /** The canonical field name. */
  key: string
  label: string
  /** Column headings people actually use, lowercased. */
  aliases: string[]
  required: boolean
  kind: 'string' | 'number' | 'money' | 'date' | 'email' | 'boolean' | 'list'
  /** What it means, for the mapping screen. */
  hint?: string
}

export interface EntitySpec {
  key: string
  label: string
  /** Who owns this data, in words. */
  owner: string
  /** Without this, the sheet is not offered at all. */
  permission: Permission
  /** The field whose value identifies a row across loads. */
  naturalKey: string
  /** Said on the import screen before anybody uploads. */
  blurb: string
  fields: FieldSpec[]
}

// ── The sheets ────────────────────────────────────────────────────────

export const IMPORTABLE: EntitySpec[] = [
  {
    key: 'COST_CENTERS',
    label: 'Cost centres',
    owner: 'Finance',
    permission: 'settings.manage',
    naturalKey: 'code',
    blurb:
      'The codes your ERP posts to. These must match it exactly — a near miss is a rejected file, not a warning.',
    fields: [
      { key: 'code', label: 'Code', aliases: ['code', 'cost center', 'cost centre', 'cost center code', 'costcenter', 'cc'], required: true, kind: 'string', hint: 'Exactly as your ERP has it' },
      { key: 'name', label: 'Name', aliases: ['name', 'description', 'cost center name', 'department'], required: true, kind: 'string' },
      { key: 'glAccount', label: 'GL account', aliases: ['gl', 'gl account', 'account', 'gl code', 'general ledger'], required: false, kind: 'string' },
      { key: 'isActive', label: 'Active', aliases: ['active', 'is active', 'status'], required: false, kind: 'boolean' },
    ],
  },
  {
    key: 'LOCATIONS',
    label: 'Work sites',
    owner: 'Operations',
    permission: 'settings.manage',
    naturalKey: 'name',
    blurb:
      'Where people work. Tenure is counted at a place and tax follows a place, so a contract with no location cannot answer either question.',
    fields: [
      { key: 'name', label: 'Name', aliases: ['name', 'site', 'location', 'office', 'site name'], required: true, kind: 'string' },
      { key: 'city', label: 'City', aliases: ['city', 'town'], required: false, kind: 'string' },
      { key: 'state', label: 'State', aliases: ['state', 'province', 'region'], required: false, kind: 'string' },
      { key: 'country', label: 'Country', aliases: ['country', 'country code'], required: false, kind: 'string' },
      { key: 'address', label: 'Address', aliases: ['address', 'street', 'address line 1'], required: false, kind: 'string' },
    ],
  },
  {
    key: 'CONSULTANTS',
    label: 'People',
    owner: 'Recruiting',
    permission: 'consultants.write',
    naturalKey: 'email',
    blurb:
      'Candidates and consultants. Matched on email, so loading the same sheet twice updates rather than duplicates.',
    fields: [
      { key: 'name', label: 'Name', aliases: ['name', 'full name', 'candidate name', 'consultant name', 'employee name'], required: true, kind: 'string' },
      { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail', 'primary email'], required: true, kind: 'email' },
      { key: 'headline', label: 'Title', aliases: ['title', 'job title', 'designation', 'position', 'headline'], required: false, kind: 'string' },
      { key: 'skills', label: 'Skills', aliases: ['skills', 'skill', 'technologies', 'tech'], required: false, kind: 'list' },
      { key: 'location', label: 'Location', aliases: ['location', 'city', 'based in'], required: false, kind: 'string' },
      { key: 'workAuth', label: 'Work authorisation', aliases: ['work auth', 'visa', 'work authorization', 'status'], required: false, kind: 'string' },
      { key: 'rateFloor', label: 'Rate floor', aliases: ['rate', 'rate floor', 'min rate', 'hourly'], required: false, kind: 'money', hint: 'Per hour. The consultant sets this; no listing may go below it.' },
    ],
  },
  {
    key: 'PURCHASE_ORDERS',
    label: 'Purchase orders',
    owner: 'Accounts payable',
    permission: 'invoices.issue',
    naturalKey: 'number',
    blurb:
      'What you have authorised each supplier to bill, in total. An invoice quoting a PO that is not here will not match.',
    fields: [
      { key: 'number', label: 'PO number', aliases: ['number', 'po', 'po number', 'purchase order', 'po #'], required: true, kind: 'string' },
      { key: 'supplierName', label: 'Supplier', aliases: ['supplier', 'vendor', 'supplier name', 'vendor name', 'issued to'], required: true, kind: 'string', hint: 'Matched by name against companies you already work with' },
      { key: 'amount', label: 'Authorised amount', aliases: ['amount', 'value', 'total', 'ceiling', 'authorized', 'authorised'], required: true, kind: 'money' },
      { key: 'startDate', label: 'Start date', aliases: ['start', 'start date', 'from', 'valid from'], required: false, kind: 'date' },
      { key: 'endDate', label: 'End date', aliases: ['end', 'end date', 'to', 'expiry', 'valid to'], required: false, kind: 'date' },
    ],
  },
  {
    key: 'HOLIDAYS',
    label: 'Holiday calendar',
    owner: 'Operations',
    permission: 'settings.manage',
    naturalKey: 'date',
    blurb:
      'Days your cycle dates shift off. An empty calendar means an invoice run can fire on Christmas Day.',
    fields: [
      { key: 'date', label: 'Date', aliases: ['date', 'day', 'holiday date'], required: true, kind: 'date' },
      { key: 'name', label: 'Name', aliases: ['name', 'holiday', 'description', 'occasion'], required: true, kind: 'string' },
    ],
  },
]

export function entityByKey(key: string): EntitySpec | null {
  return IMPORTABLE.find((e) => e.key === key) ?? null
}

/**
 * What this caller may load.
 *
 * The permission decides which sheets are offered, not which uploads are
 * rejected. Being told at the end of a long file that you were never
 * allowed is the version that wastes somebody's afternoon.
 */
export function importableFor(permissions: readonly string[]): EntitySpec[] {
  const has = (p: string) => permissions.includes('*') || permissions.includes(p)
  return IMPORTABLE.filter((e) => has(e.permission))
}

// ── Mapping a spreadsheet onto a sheet ────────────────────────────────

export interface ColumnMap {
  column: string
  field: string | null
  confidence: number
  /** Why it is uncertain, when it is. */
  note: string | null
}

export interface MappingReport {
  columns: ColumnMap[]
  /** Required fields nothing mapped to. The file cannot be loaded. */
  missingRequired: string[]
  /** Columns in the file that go nowhere. Not an error; worth saying. */
  ignored: string[]
  ready: boolean
}

function normalise(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')
}

export function mapColumnsFor(spec: EntitySpec, headers: string[]): MappingReport {
  const columns: ColumnMap[] = []
  const taken = new Set<string>()

  for (const header of headers) {
    const n = normalise(header)

    const exact = spec.fields.find((f) => !taken.has(f.key) && f.aliases.includes(n))
    if (exact) {
      taken.add(exact.key)
      columns.push({ column: header, field: exact.key, confidence: 1, note: null })
      continue
    }

    // A near miss, held at 0.85 so the screen shows it as a guess rather
    // than a fact. Somebody confirms it before anything is written.
    let best: { field: string; score: number } | null = null
    for (const f of spec.fields) {
      if (taken.has(f.key)) continue
      for (const alias of f.aliases) {
        if (!n.includes(alias) && !alias.includes(n)) continue
        const score = Math.min(n.length, alias.length) / Math.max(n.length, alias.length)
        if (!best || score > best.score) best = { field: f.key, score }
      }
    }

    if (best && best.score >= 0.5) {
      taken.add(best.field)
      columns.push({
        column: header,
        field: best.field,
        confidence: Math.min(0.85, Math.round(best.score * 100) / 100),
        note: `Guessed — check this is your ${spec.fields.find((f) => f.key === best!.field)?.label.toLowerCase()}`,
      })
    } else {
      columns.push({ column: header, field: null, confidence: 0, note: 'Not used' })
    }
  }

  const mapped = new Set(columns.filter((c) => c.field).map((c) => c.field as string))
  const missingRequired = spec.fields.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.label)

  return {
    columns,
    missingRequired,
    ignored: columns.filter((c) => !c.field).map((c) => c.column),
    ready: missingRequired.length === 0,
  }
}

// ── Reading a row ─────────────────────────────────────────────────────

export interface RowResult {
  /** 1-based, matching what somebody sees in their spreadsheet. */
  rowNumber: number
  values: Record<string, unknown>
  /** Everything wrong with this row, not just the first thing. */
  problems: string[]
  ok: boolean
}

export function parseCell(kind: FieldSpec['kind'], raw: string, label: string): { value: unknown; problem: string | null } {
  const v = raw.trim()
  if (v === '') return { value: null, problem: null }

  switch (kind) {
    case 'number':
    case 'money': {
      // Strips currency symbols and thousands separators, because that is
      // how a number arrives from a spreadsheet.
      const cleaned = v.replace(/[$£€,\s]/g, '')
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return { value: null, problem: `${label}: "${v}" is not a number` }
      return { value: n, problem: null }
    }
    case 'date': {
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) {
        return { value: null, problem: `${label}: "${v}" is not a date the system recognises. Use 2027-06-30.` }
      }
      return { value: d, problem: null }
    }
    case 'email': {
      const e = v.toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
        return { value: null, problem: `${label}: "${v}" is not an email address` }
      }
      return { value: e, problem: null }
    }
    case 'boolean': {
      const t = v.toLowerCase()
      if (['true', 'yes', 'y', '1', 'active'].includes(t)) return { value: true, problem: null }
      if (['false', 'no', 'n', '0', 'inactive'].includes(t)) return { value: false, problem: null }
      return { value: null, problem: `${label}: "${v}" should be yes or no` }
    }
    case 'list':
      return { value: v.split(/[,;|]/).map((x) => x.trim()).filter(Boolean), problem: null }
    default:
      return { value: v, problem: null }
  }
}

export function parseRows(
  spec: EntitySpec,
  mapping: MappingReport,
  rows: Record<string, string>[]
): RowResult[] {
  const byColumn = new Map(mapping.columns.filter((c) => c.field).map((c) => [c.column, c.field as string]))

  return rows.map((row, i) => {
    const values: Record<string, unknown> = {}
    const problems: string[] = []

    for (const [column, field] of byColumn) {
      const spec_ = spec.fields.find((f) => f.key === field)!
      const { value, problem } = parseCell(spec_.kind, String(row[column] ?? ''), spec_.label)
      if (problem) problems.push(problem)
      else if (value !== null) values[field] = value
    }

    // Every missing required field is reported, not just the first. One
    // report of eleven bad rows beats eleven attempts.
    for (const f of spec.fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === null || values[f.key] === '')) {
        problems.push(`${f.label} is missing`)
      }
    }

    return {
      // +2: one for the header row, one because spreadsheets start at 1.
      rowNumber: i + 2,
      values,
      problems,
      ok: problems.length === 0,
    }
  })
}

export interface Preview {
  entity: string
  total: number
  willCreate: number
  willUpdate: number
  willSkip: number
  rows: RowResult[]
  /** Said before anybody commits anything. */
  summary: string
}

/**
 * What this load would do, before it does it.
 *
 * Loading a rate card over a live one should never be a surprise, so the
 * counts of created and updated are shown first and the write is a second,
 * separate act.
 */
export function previewOf(
  spec: EntitySpec,
  parsed: RowResult[],
  existingKeys: Set<string>
): Preview {
  let willCreate = 0
  let willUpdate = 0
  const willSkip = parsed.filter((r) => !r.ok).length

  for (const r of parsed) {
    if (!r.ok) continue
    const key = String(r.values[spec.naturalKey] ?? '')
    if (existingKeys.has(key.toLowerCase())) willUpdate++
    else willCreate++
  }

  const parts: string[] = []
  if (willCreate) parts.push(`${willCreate} new`)
  if (willUpdate) parts.push(`${willUpdate} updated`)
  if (willSkip) parts.push(`${willSkip} skipped`)

  return {
    entity: spec.label,
    total: parsed.length,
    willCreate,
    willUpdate,
    willSkip,
    rows: parsed,
    summary:
      parsed.length === 0
        ? 'Nothing in the file.'
        : willSkip === parsed.length
          ? `Nothing can be loaded — all ${parsed.length} row(s) have something wrong.`
          : `${parts.join(', ')}. ${spec.label} are matched on ${spec.naturalKey}, so loading this twice changes nothing the second time.`,
  }
}
