/**
 * The model's half of reading a paper at setup: only what the rules did
 * not read, only where the company turned the model on, masked before it
 * leaves and logged (CLAUDE.md, "The model boundary", 2026-10-13; the
 * import's reader, c6f202d52, is the same door).
 *
 *  - Off for the company, or no reader on this deployment: nothing is
 *    sent, and the screen says why in a sentence.
 *  - On: the text is masked (`maskForModel`: names, firms, rates, emails,
 *    phones), and every tax number is cut out before that, because the
 *    rules read the EIN or the person types it; a tax number never leaves.
 *    The masked prompt and answer are logged through `recordModelPrompt`.
 *  - Every value the model returns carries the words it was read from,
 *    and is a suggestion a person confirms. It is never recorded here.
 */

import type { EntitySpec, FieldSpec } from '@/lib/importable'
import { extractWithModel, modelAvailable, type ExtractionResult } from '@/lib/extract'
import { maskForModel, modelOnFor, recordModelPrompt, type MaskVocab, type PromptToRecord } from '@/lib/model-boundary'
import { prisma } from '@/lib/db'
import { FILL_FIELD_WORDS, type FillField, type PaperKind, type ReadValue } from '@/lib/setup-fill'

export const SETUP_MODEL = 'claude-sonnet-5'
export const SETUP_PURPOSE = 'SETUP_PAPER'

export const MODEL_SAYS = {
  off: 'Read by rules only. Your company has not turned the model on, so nothing was sent to it. Type what is missing.',
  notSetUp: 'Read by rules only. The document reader is not set up on this deployment, so nothing was sent to it. Type what is missing.',
  read: 'The rules read what they could; the document reader read the rest from a masked copy. Check every value before you save.',
} as const

export interface FillDeps {
  modelOn(companyId: string): Promise<boolean>
  readerSetUp(): boolean
  extract(spec: EntitySpec, masked: string): Promise<ExtractionResult | null>
  record(p: PromptToRecord): Promise<unknown>
  vocab(companyId: string): Promise<MaskVocab>
}

async function vocabFor(companyId: string): Promise<MaskVocab> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, legalName: true } })
  return { firms: [c?.name, c?.legalName].filter((x): x is string => !!x) }
}

export const liveFillDeps: FillDeps = {
  modelOn: modelOnFor,
  readerSetUp: modelAvailable,
  extract: (spec, masked) => extractWithModel(spec, masked, 1),
  record: recordModelPrompt,
  vocab: vocabFor,
}

/** Every nine-digit tax number, cut out before anything is masked or sent. */
export function withoutTaxNumbers(text: string): string {
  return text.replace(/\b\d{2}\s*-\s*\d{7}\b|\b\d{3}\s*-\s*\d{2}\s*-\s*\d{4}\b/g, '[tax number]')
}

function specFor(kind: Exclude<PaperKind, 'UNKNOWN'>, fields: FillField[]): EntitySpec {
  return {
    key: `SETUP_${kind}`,
    label: kind === 'W9' ? 'A US W-9 form' : 'A certificate of insurance',
    owner: 'The company setting itself up',
    permission: 'settings.manage',
    naturalKey: fields[0],
    blurb: '',
    fields: fields.map((f): FieldSpec => ({
      key: f,
      label: FILL_FIELD_WORDS[f],
      aliases: [],
      required: false,
      kind: f === 'coverFrom' || f === 'coverUntil' ? 'date' : 'string',
    })),
  }
}

export type ModelFill = { values: ReadValue[]; says: string }

/**
 * Ask the model for the fields the rules missed, where the company allows
 * it. The EIN is never asked of it.
 */
export async function readMissingWithModel(
  input: { companyId: string; personId: string; kind: PaperKind; text: string; missing: FillField[] },
  deps: FillDeps = liveFillDeps,
): Promise<ModelFill> {
  const asked: FillField[] = input.missing.filter((f) => f !== 'taxId')
  if (input.kind === 'UNKNOWN' || asked.length === 0) return { values: [], says: '' }
  if (!(await deps.modelOn(input.companyId))) return { values: [], says: MODEL_SAYS.off }
  if (!deps.readerSetUp()) return { values: [], says: MODEL_SAYS.notSetUp }

  const vocab = await deps.vocab(input.companyId).catch(() => ({}))
  const mask = maskForModel(withoutTaxNumbers(input.text), vocab)
  const spec = specFor(input.kind, asked)
  const got = await deps.extract(spec, mask.masked)
  await deps.record({
    companyId: input.companyId,
    personId: input.personId,
    provider: 'anthropic',
    model: SETUP_MODEL,
    maskedPrompt: `Setup: ${spec.label}, fields ${asked.join(', ')}\n---\n${mask.masked}`,
    maskedAnswer: got ? JSON.stringify({ records: got.records, unread: got.unread }) : '[no answer]',
    purpose: SETUP_PURPOSE,
    realValues: mask.realValues(),
  })
  const fields = got?.records[0]?.fields ?? []
  const values: ReadValue[] = []
  for (const f of fields) {
    if (!asked.includes(f.field as FillField)) continue
    const value = String(mask.unmaskValue(f.value) ?? '').trim()
    // A value with nothing quoted behind it is a guess nobody can check.
    if (!value || !f.foundIn) continue
    values.push({ field: f.field as FillField, value, quote: mask.unmask(f.foundIn), readBy: 'MODEL' })
  }
  return { values, says: MODEL_SAYS.read }
}
