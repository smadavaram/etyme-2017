import { callModel, type ModelDeps } from '@/lib/model-gateway/call'
import { candidatesFor } from '@/lib/model-gateway/register'
import type { EntitySpec, FieldSpec } from '@/lib/importable'
import { splitDelimited, tableShape } from '@/lib/model-boundary'
import type { RecordType, Usage } from '@/lib/agent-run'

/**
 * Reading what somebody sent, rather than matching column headings.
 *
 * The alias table was the 2017 shape. It holds forty spellings of "email"
 * and understands none of them: a column called "Primary Contact E-mail
 * Address (work)" scores below the threshold and is silently ignored, and
 * a file whose first row is a title rather than headers fails completely.
 * It cannot read a PDF, a certificate, or an email with the details in
 * prose — which is how most of this arrives.
 *
 * CLAUDE.md picked the stack for this: "Claude API for parsing and
 * matching." This is that.
 *
 * Two things make it safe to rely on.
 *
 * **Confidence and provenance travel with every field.** A value with no
 * indication of how sure we are, or of where in the document it came from,
 * cannot be reviewed — it can only be trusted or not, and people choose
 * trust. Every extracted field says what it read and where.
 *
 * **The fallback is labeled, not disguised.** With no key configured this
 * falls back to header matching and says so. A degraded result presented as
 * a good one is the failure this whole file exists to avoid.
 */

export type Method = 'MODEL' | 'HEADERS'

export interface ExtractedField {
  field: string
  value: unknown
  /** 0–1. Below 0.8 is shown as a guess and confirmed before writing. */
  confidence: number
  /**
   * Where it came from, quoted from the source. A reviewer checking one
   * row should not have to hunt for it.
   */
  foundIn: string | null
  /** Set when the model read something it could not turn into the field. */
  concern: string | null
}

export interface ExtractedRecord {
  /** 1-based, as somebody's spreadsheet numbers it. */
  rowNumber: number
  fields: ExtractedField[]
  problems: string[]
}

export interface ExtractionResult {
  method: Method
  records: ExtractedRecord[]
  /** Said on the screen, so a degraded run is never mistaken for a good one. */
  note: string
  /** What it could not make sense of at all. */
  unread: string[]
  /** The model that answered, and what it used. Absent where nothing was called. */
  model?: string
  usage?: Usage | null
  /** The kinds of data cut out by rule before anything left (record 96, Lane C). */
  removed?: LaneCKind[]
}

// ── Lane C: data that reaches no model, ever (record 96) ──────────────

export type LaneCKind = 'SOCIAL_SECURITY' | 'DATE_OF_BIRTH' | 'BANK_DETAILS'

export const LANE_C_WORDS: Record<LaneCKind, string> = {
  SOCIAL_SECURITY: 'social security numbers',
  DATE_OF_BIRTH: 'dates of birth',
  BANK_DETAILS: 'bank details',
}

const CUT: Record<LaneCKind, string> = {
  SOCIAL_SECURITY: '[removed: social security number]',
  DATE_OF_BIRTH: '[removed: date of birth]',
  BANK_DETAILS: '[removed: bank details]',
}

const SSN_HEADER = /\b(?:ssn|social security|national insurance|sin|national id|government id|passport)\b/i
const DOB_HEADER = /\b(?:dob|date of birth|birth ?date|birthday|born)\b/i
const BANK_HEADER = /\b(?:bank|routing|iban|swift|bic|aba|sort code|acct|account (?:number|no\.?|#))\b/i
/** A client's own ledger codes are not a person's bank account. */
const NOT_BANK = /\b(?:gl|ledger|cost|profit)\b/i

const DATE_BODY =
  String.raw`(?:\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})`

/** Shapes found anywhere in prose or in a cell. */
const SHAPES: { kind: LaneCKind; re: RegExp }[] = [
  { kind: 'SOCIAL_SECURITY', re: /(?<![\d-])\d{3}[-\s]\d{2}[-\s]\d{4}(?![\d-])/g },
  { kind: 'SOCIAL_SECURITY', re: /\b(?:ssn|social security(?:\s+(?:number|no\.?|#))?)\s*[:#=-]?\s*\d{9}\b/gi },
  { kind: 'DATE_OF_BIRTH', re: new RegExp(String.raw`\b(?:dob|d\.o\.b\.?|date of birth|birth ?date|born(?: on)?)\s*[:#=-]?\s*${DATE_BODY}`, 'gi') },
  { kind: 'BANK_DETAILS', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g },
  { kind: 'BANK_DETAILS', re: /\b(?:routing|aba|swift|bic|sort code|iban|bank account|account|acct)(?:\s+(?:number|no\.?|num|#))?\s*[:#=-]?\s*[A-Z0-9][A-Z0-9 -]{5,33}[A-Z0-9]\b/gi },
]

/**
 * Cut social security numbers, dates of birth and bank details out of a
 * text by rule, before any call. The model is never asked to ignore them:
 * they are not there. A table's cell under such a heading goes whatever it
 * holds; a shape found in prose goes wherever it stands. Pure.
 */
export function withoutLaneC(text: string): { text: string; removed: LaneCKind[] } {
  const found = new Set<LaneCKind>()
  const shapes = (s: string): string => {
    let out = s
    for (const { kind, re } of SHAPES) {
      out = out.replace(re, (m) => {
        // "account" alone must carry digits to be a number, or ordinary prose is cut.
        if (kind === 'BANK_DETAILS' && !/\d{4,}/.test(m.replace(/[\s-]/g, '')) && !/^[A-Z]{2}\d{2}/.test(m)) return m
        found.add(kind)
        return CUT[kind]
      })
    }
    return out
  }

  const table = tableShape(text)
  if (!table) return { text: shapes(text), removed: [...found] }

  const headers = splitDelimited(table.lines[0], table.delim)
  const kindOf = headers.map((h): LaneCKind | null => {
    if (SSN_HEADER.test(h)) return 'SOCIAL_SECURITY'
    if (DOB_HEADER.test(h)) return 'DATE_OF_BIRTH'
    if (BANK_HEADER.test(h) && !NOT_BANK.test(h)) return 'BANK_DETAILS'
    return null
  })
  const quote = (cell: string) => (cell.includes(table.delim) || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)
  const rows = table.lines.slice(1).map((line) =>
    splitDelimited(line, table.delim).map((cell, i) => {
      const kind = kindOf[i]
      if (kind && cell !== '') { found.add(kind); return CUT[kind] }
      return shapes(cell)
    }),
  )
  const out = [headers, ...rows].map((r) => r.map(quote).join(table.delim)).join('\n')
  return { text: out, removed: [...found] }
}

/**
 * Who is asking, so the gateway can check the company's switch and write the ledger and prompt log.
 * Without a company and a person nothing is sent: the caller falls back to the rules.
 */
export interface ExtractContext {
  companyId?: string
  personId?: string
  /** What the ledger row hangs on; the spec's key where not given. */
  recordId?: string
  /** For a paper: its type, so a paper of a kind that reaches no model is refused before its text is looked at. */
  documentType?: string | null
  /** For tests: the gateway's own dependencies (adapters, register, switch, ledger). */
  gateway?: ModelDeps
}

/** Whether a model is registered, admitted for tenant business data and keyed for reading a paper. */
export function modelAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return candidatesFor('LOW', 'TENANT_BUSINESS', env).length > 0
}

function describeFields(fields: FieldSpec[]): string {
  return fields
    .map((f) => {
      const bits = [`- ${f.key} (${f.kind}${f.required ? ', required' : ''})`, f.label]
      if (f.hint) bits.push(`— ${f.hint}`)
      return bits.join(': ')
    })
    .join('\n')
}

const SYSTEM = `You read business documents and return structured data.

You are given a target shape and some source content — a spreadsheet, a
pasted table, an email, or the text of a document. Return one record per
real-world thing in the source.

Rules that matter more than completeness:

- Never invent a value. If a field is not in the source, omit it. A blank is
  a fact somebody can act on; a plausible guess is a wrong record that looks
  right.
- Give every value a confidence between 0 and 1. Use below 0.8 whenever you
  inferred rather than read.
- For every value, quote the exact fragment you read it from in "foundIn",
  short enough to locate but long enough to recognize.
- Money arrives with symbols, thousands separators and sometimes words.
  Return a plain number. If the currency is ambiguous, say so in "concern".
- Dates arrive in every format there is. Return ISO (YYYY-MM-DD). If the
  order of day and month is genuinely ambiguous — 03/04/2026 — return your
  reading and say so in "concern".
- Skip header rows, subtotals, blank rows and notes. They are not records.

Return only JSON of this shape:
{"records":[{"fields":[{"field":"code","value":"MFG-100","confidence":1,"foundIn":"MFG-100","concern":null}],"problems":[]}],"unread":[]}`

/**
 * Read source content into the shape of an entity.
 *
 * Returns null when no model is set up, the company's switch is off, or
 * nobody is named to ask on behalf of, so the caller falls back rather than
 * this pretending to have tried. Every call goes through the gateway
 * (lib/model-gateway), as the document.read skill.
 */
export async function extractWithModel(
  spec: EntitySpec,
  rawSource: string,
  maxRecords = 200,
  ctx: ExtractContext = {},
): Promise<ExtractionResult | null> {
  if (!ctx.companyId || !ctx.personId) return null

  // Lane C goes first, before the length cut and before any call: this data
  // reaches no model (record 96). Every caller passes through here.
  const { text: source, removed } = withoutLaneC(rawSource)
  const cutNote = removed.length > 0
    ? ` ${removed.map((k) => LANE_C_WORDS[k]).join(', ')} ${removed.length > 1 ? 'were' : 'was'} removed before reading and never sent.`
    : ''

  // Trimmed rather than silently truncated. A file too big to read in one
  // pass should say so, not return the first half as if it were all of it.
  const trimmed = source.length > 60_000 ? source.slice(0, 60_000) : source
  const wasTrimmed = source.length > 60_000

  const prompt = `Target shape — ${spec.label} (${spec.owner} owns this data):

${describeFields(spec.fields)}

Rows are matched on "${spec.naturalKey}", so that field matters most.

Source content:
---
${trimmed}
---

Return at most ${maxRecords} records.`

  const got = await callModel({
    companyId: ctx.companyId,
    personId: ctx.personId,
    skillKey: 'document.read',
    purpose: 'DOCUMENT_READ',
    prompt,
    system: SYSTEM,
    documentType: ctx.documentType,
    // The ledger's list has no import kind yet; the column is a string.
    record: { recordType: 'IMPORT' as RecordType, recordId: ctx.recordId ?? spec.key },
    maxTokens: 8000,
    source: trimmed,
  }, { timeoutMs: 120_000, ...ctx.gateway })

  if (!got.ok) {
    // Not configured, or the company's switch is off: nothing was tried, so the caller's rules answer.
    if (got.status === 'NOT_CONFIGURED' || got.status === 'OFF') return null
    // Named rather than swallowed. "Import failed" sends somebody to
    // guess; "the reader is not answering" sends them to try again.
    return {
      method: 'MODEL',
      records: [],
      note: `The document reader did not read this: ${got.says} Nothing was written.${cutNote}`,
      unread: [],
      removed,
    }
  }

  const { text, model, usage } = got
  const parsed = parseResponse(text)
  if (!parsed) {
    return {
      method: 'MODEL',
      records: [],
      note: 'The reader returned something that could not be understood. Nothing was written.',
      unread: [text.slice(0, 200)],
      model, usage, removed,
    }
  }

  const known = new Set(spec.fields.map((f) => f.key))

  return {
    method: 'MODEL',
    records: parsed.records.slice(0, maxRecords).map((r, i) => ({
      rowNumber: i + 1,
      // A field nobody checks is a field that grants nothing, so unknown
      // names are dropped rather than stored.
      fields: (r.fields ?? []).filter((f) => known.has(f.field)),
      problems: r.problems ?? [],
    })),
    note: wasTrimmed
      ? `Read the first 60,000 characters. The rest was not looked at — split the file and load it again.${cutNote}`
      : `Read by the document reader, with confidence and a source quote on every value.${cutNote}`,
    unread: parsed.unread ?? [],
    model, usage, removed,
  }
}

interface RawResponse {
  records: { fields: ExtractedField[]; problems?: string[] }[]
  unread?: string[]
}

/**
 * Pull JSON out of the answer.
 *
 * Models sometimes wrap JSON in a fence or a sentence. Failing on that
 * would be failing on punctuation.
 */
export function parseResponse(text: string): RawResponse | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    if (!Array.isArray(parsed?.records)) return null
    return parsed as RawResponse
  } catch {
    return null
  }
}

/**
 * How a value should be treated on the review screen.
 *
 * The threshold is the point of the whole thing. Above it, a value is
 * shown as read; below it, as a guess to confirm. Writing an inferred
 * value without confirmation is how a spreadsheet import silently changes
 * somebody's rate.
 */
export const CONFIDENT_ENOUGH = 0.8

export function needsConfirming(f: ExtractedField): boolean {
  return f.confidence < CONFIDENT_ENOUGH || f.concern !== null
}

export interface ReviewSummary {
  total: number
  confident: number
  toConfirm: number
  /** Fields that arrived with a concern attached, most important first. */
  concerns: { field: string; concern: string; foundIn: string | null }[]
  summary: string
}

/**
 * What a person actually has to look at.
 *
 * Not "23 rows imported" — that is a number nobody can act on. The useful
 * fact is how many values need a human before anything is written.
 */
export function reviewOf(records: ExtractedRecord[]): ReviewSummary {
  const all = records.flatMap((r) => r.fields)
  const toConfirm = all.filter(needsConfirming)

  return {
    total: all.length,
    confident: all.length - toConfirm.length,
    toConfirm: toConfirm.length,
    concerns: toConfirm
      .filter((f) => f.concern !== null)
      .map((f) => ({ field: f.field, concern: f.concern!, foundIn: f.foundIn })),
    summary:
      all.length === 0
        ? 'Nothing was read out of that.'
        : toConfirm.length === 0
          ? `${records.length} record(s) read, nothing ambiguous.`
          : `${records.length} record(s) read. ${toConfirm.length} value(s) need a look before anything is written — they were inferred rather than found.`,
  }
}

/**
 * Turn extracted records into the row shape the import engine already
 * understands, so the preview, per-row errors and idempotent write all
 * keep working unchanged.
 *
 * Deliberately reusing that path rather than building a second one. The
 * preview-and-commit shape is right regardless of how the values were
 * read.
 */
export function toRows(records: ExtractedRecord[], spec: EntitySpec): Record<string, string>[] {
  return records.map((r) => {
    const row: Record<string, string> = {}
    for (const f of spec.fields) {
      const found = r.fields.find((x) => x.field === f.key)
      row[f.label] = found?.value === null || found?.value === undefined ? '' : String(found.value)
    }
    return row
  })
}
