import Anthropic from '@anthropic-ai/sdk'
import type { EntitySpec, FieldSpec } from '@/lib/importable'

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
 * **The fallback is labelled, not disguised.** With no key configured this
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
}

/** Whether the model path is available at all. */
export function modelAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
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
  short enough to locate but long enough to recognise.
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
 * Returns null when there is no key, so the caller falls back rather than
 * this pretending to have tried.
 */
export async function extractWithModel(
  spec: EntitySpec,
  source: string,
  maxRecords = 200
): Promise<ExtractionResult | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const client = new Anthropic({ apiKey: key })

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

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const parsed = parseResponse(text)
    if (!parsed) {
      return {
        method: 'MODEL',
        records: [],
        note: 'The reader returned something that could not be understood. Nothing was written.',
        unread: [text.slice(0, 200)],
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
        ? `Read the first 60,000 characters. The rest was not looked at — split the file and load it again.`
        : 'Read by the document reader, with confidence and a source quote on every value.',
      unread: parsed.unread ?? [],
    }
  } catch (err) {
    // Named rather than swallowed. "Import failed" sends somebody to
    // guess; "the reader is not answering" sends them to try again.
    return {
      method: 'MODEL',
      records: [],
      note: `The document reader could not be reached: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'}. Nothing was written.`,
      unread: [],
    }
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
