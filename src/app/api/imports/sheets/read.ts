/**
 * How an import reads pasted content — a table, an email, the text of a
 * document — under the model boundary (CLAUDE.md, "The model boundary,
 * and the four weeks", 2026-10-13).
 *
 *   - The model reads it only where the company turned the model on
 *     (`modelOnFor`) and the deployment has a reader set up. Otherwise the
 *     rules reader — the column headings — reads it, and the note says
 *     why in a sentence, naming where the switch is.
 *   - What leaves is masked first (`maskForModel`): names, rates, pay,
 *     emails and phone numbers become tokens, and the answer is put back
 *     on the way in.
 *   - Every prompt and answer is logged, masked, through
 *     `recordModelPrompt`, which refuses a text that still holds a real
 *     value.
 *
 * Split from the route so it can be held by unit tests with the switch,
 * the reader and the log handed in.
 */
import { prisma } from '@/lib/db'
import type { EntitySpec } from '@/lib/importable'
import {
  extractWithModel,
  modelAvailable,
  reviewOf,
  toRows,
  type ExtractedRecord,
  type ExtractionResult,
} from '@/lib/extract'
import {
  maskForModel,
  modelOnFor,
  recordModelPrompt,
  splitDelimited,
  tableShape,
  type MaskVocab,
  type PromptToRecord,
} from '@/lib/model-boundary'

/** What lib/extract sends to. Logged beside each prompt; kept in step with lib/extract by hand. */
export const IMPORT_MODEL = 'claude-sonnet-5'
/** The prompt log's purpose for an import. */
export const IMPORT_PURPOSE = 'IMPORT'

export const SAY = {
  modelOff:
    'Read by the column headings. Your company has not turned the model on, so nothing was sent to it. An Owner or Admin can turn it on in Settings, under Ask Etyme.',
  readerNotSetUp:
    'Read by the column headings. The document reader is not set up on this deployment yet, so nothing was sent to it.',
  proseModelOff:
    'Your company has not turned the model on, so Etyme reads only a table with a heading row here. Paste the table with its headings, or ask an Owner or Admin to turn the model on in Settings, under Ask Etyme.',
  proseReaderNotSetUp:
    'The document reader is not set up on this deployment yet, so Etyme reads only a table with a heading row here. Paste the table with its headings.',
  nothingRead: 'Nothing could be read out of that.',
} as const

export type ReadOutcome =
  | {
      ok: true
      readBy: 'MODEL' | 'HEADERS'
      rows: Record<string, string>[]
      note: string | null
      review: ReturnType<typeof reviewOf> | null
    }
  | { ok: false; status: number; code: 'NO_READER' | 'NOTHING_READ'; message: string; unread: string[] }

export interface ReadDeps {
  modelOn(companyId: string): Promise<boolean>
  readerSetUp(): boolean
  extract(spec: EntitySpec, maskedContent: string): Promise<ExtractionResult | null>
  record(p: PromptToRecord): Promise<unknown>
  vocab(companyId: string): Promise<MaskVocab>
}

/** Names the record already holds for this company, so a one-word firm in prose is masked too. */
async function vocabFor(companyId: string): Promise<MaskVocab> {
  const [own, orders, seats] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.workOrder.findMany({
      where: { OR: [{ issuedById: companyId }, { issuedToId: companyId }] },
      select: { issuedBy: { select: { name: true } }, issuedTo: { select: { name: true } } },
      take: 500,
    }),
    prisma.context.findMany({ where: { companyId }, select: { person: { select: { name: true } } }, take: 2000 }),
  ])
  const firms = new Set<string>()
  if (own?.name) firms.add(own.name)
  for (const o of orders) {
    if (o.issuedBy?.name) firms.add(o.issuedBy.name)
    if (o.issuedTo?.name) firms.add(o.issuedTo.name)
  }
  const people = new Set<string>()
  for (const s of seats) if (s.person?.name) people.add(s.person.name)
  return { firms: [...firms], people: [...people] }
}

export const liveDeps: ReadDeps = {
  modelOn: modelOnFor,
  readerSetUp: modelAvailable,
  extract: (spec, masked) => extractWithModel(spec, masked),
  record: recordModelPrompt,
  vocab: vocabFor,
}

/** The rules reader: a delimited table with a heading row, as rows keyed by heading. */
export function rowsFromTable(content: string): Record<string, string>[] | null {
  const table = tableShape(content)
  if (!table) return null
  const headers = splitDelimited(table.lines[0], table.delim)
  return table.lines.slice(1).map((line) => {
    const cells = splitDelimited(line, table.delim)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}

export async function readImportContent(
  input: { companyId: string; personId: string; spec: EntitySpec; content: string },
  deps: ReadDeps = liveDeps,
): Promise<ReadOutcome> {
  const { companyId, personId, spec, content } = input
  const on = await deps.modelOn(companyId)
  const setUp = on && deps.readerSetUp()

  if (!on || !setUp) {
    const rows = rowsFromTable(content)
    if (!rows || rows.length === 0) {
      return { ok: false, status: 422, code: 'NO_READER', message: on ? SAY.proseReaderNotSetUp : SAY.proseModelOff, unread: [] }
    }
    return { ok: true, readBy: 'HEADERS', rows, note: on ? SAY.readerNotSetUp : SAY.modelOff, review: null }
  }

  const vocab = await deps.vocab(companyId).catch(() => ({}))
  const mask = maskForModel(content, vocab)
  const extracted = await deps.extract(spec, mask.masked)

  // Logged before anything is put back, so the log holds the masked text
  // and nothing else. The prompt's frame (the field list) is lib/extract's
  // and names no person; what is logged is the content that left.
  await deps.record({
    companyId,
    personId,
    provider: 'anthropic',
    model: IMPORT_MODEL,
    maskedPrompt: `Import: ${spec.label}\n---\n${mask.masked}`,
    maskedAnswer: extracted
      ? JSON.stringify({ records: extracted.records, unread: extracted.unread, note: extracted.note })
      : '[no answer]',
    purpose: IMPORT_PURPOSE,
    realValues: mask.realValues(),
  })

  if (!extracted || extracted.records.length === 0) {
    return {
      ok: false,
      status: 422,
      code: 'NOTHING_READ',
      message: extracted?.note ? mask.unmask(extracted.note) : SAY.nothingRead,
      unread: (extracted?.unread ?? []).map((u) => mask.unmask(u)),
    }
  }

  const kindOf = new Map(spec.fields.map((f) => [f.key, f.kind]))
  const records: ExtractedRecord[] = extracted.records.map((r) => ({
    ...r,
    fields: r.fields.map((f) => {
      const kind = kindOf.get(f.field)
      return {
        ...f,
        value: mask.unmaskValue(f.value, { asNumber: kind === 'money' || kind === 'number' }),
        foundIn: f.foundIn === null ? null : mask.unmask(f.foundIn),
        concern: f.concern === null ? null : mask.unmask(f.concern),
      }
    }),
    problems: r.problems.map((p) => mask.unmask(p)),
  }))

  return {
    ok: true,
    readBy: 'MODEL',
    rows: toRows(records, spec),
    note: extracted.note,
    review: reviewOf(records),
  }
}
