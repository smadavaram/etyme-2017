/**
 * The model boundary (founder, 2026-10-13, "The model boundary, and the
 * four weeks"): one door for whether Ask Etyme may send a free-text
 * question to a model for a company, and for the log of what left.
 *
 *   modelOnFor(companyId)            the switch; off until the settings desk turns it on
 *   setModelOn(companyId, personId, on, reason)
 *                                    turns it, recording who, when and why
 *   recordModelPrompt({ ... })       logs one prompt that left and its answer,
 *                                    masked; never throws
 *   modelPromptsFor(companyId, take) the company's own log, newest first
 *
 * The record holds several companies' people and money at once, so a
 * client turning a model on must never expose a supplier's rates or a
 * worker's pay. Names, rates and pay become tokens before anything is
 * sent (the masking is conversation's, at the edge, and is week 2's other
 * half); this file keeps the switch and the log, and refuses to keep an
 * unmasked text even when it is handed one.
 */
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'

export interface ModelSwitch {
  on: boolean
  setById: string | null
  setByName: string | null
  setAt: Date | null
}

/** Whether Ask Etyme may send a free-text question to a model for this company. Off unless set. */
export async function modelOnFor(companyId: string): Promise<boolean> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: { askEtymeModelOn: true } })
  return row?.askEtymeModelOn === true
}

/** The switch with who set it and when, for the settings screen. */
export async function modelSwitchFor(companyId: string): Promise<ModelSwitch> {
  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: { askEtymeModelOn: true, askEtymeModelSetById: true, askEtymeModelSetAt: true },
  })
  const by = row?.askEtymeModelSetById
    ? await prisma.person.findUnique({ where: { id: row.askEtymeModelSetById }, select: { name: true } }).catch(() => null)
    : null
  return {
    on: row?.askEtymeModelOn === true,
    setById: row?.askEtymeModelSetById ?? null,
    setByName: by?.name ?? null,
    setAt: row?.askEtymeModelSetAt ?? null,
  }
}

/**
 * The automation-log action every turn of the switch writes; the twin's
 * feed reads it. Written out whole where it is written, so the autonomy
 * ladder can see it (`ATTRIBUTED.ASK_ETYME_MODEL_SET` in lib/autonomy).
 */
export const MODEL_SWITCH_ACTION = 'ASK_ETYME_MODEL_SET'

/**
 * Turn the model on or off for a company, with the reason, recorded with
 * who and when. The permission is the route's to check (settings.manage);
 * this refuses only what no desk may do: a change with no reason.
 */
export async function setModelOn(
  companyId: string,
  personId: string,
  on: boolean,
  reason: string,
): Promise<{ ok: true; on: boolean; setAt: Date } | { ok: false; says: string }> {
  const why = (reason ?? '').trim()
  if (!why) {
    return { ok: false, says: on
      ? 'Say why the model is being turned on. Whoever reads the log later will ask.'
      : 'Say why the model is being turned off, so whoever turned it on knows.' }
  }
  const at = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: { askEtymeModelOn: on, askEtymeModelSetById: personId, askEtymeModelSetAt: at },
    })
    await tx.automationLog.create({
      data: {
        companyId,
        action: 'ASK_ETYME_MODEL_SET',
        summary: on
          ? 'Ask Etyme may now send free-text questions to the model, masked, for this company.'
          : 'Ask Etyme no longer sends anything to the model for this company.',
        reason: why,
        payload: { on, byPersonId: personId },
        // Turned back by the same switch, recorded the same way.
        reversible: true,
      },
    })
  })
  return { ok: true, on, setAt: at }
}

export interface PromptToRecord {
  companyId: string
  personId: string
  provider: string
  model: string
  maskedPrompt: string
  maskedAnswer: string
  tokensIn?: number | null
  tokensOut?: number | null
  /** ASK_ETYME for a question the rules did not answer. */
  purpose: string
  /**
   * The real values the masker replaced — names, rates, pay. Optional;
   * where given, a text that still contains any of them is not stored,
   * and staff are told, because this table never holds an unmasked text.
   */
  realValues?: readonly string[]
}

/** What is stored in place of a text that arrived unmasked. */
export const WITHHELD = '[withheld: this text reached the log unmasked, so it was not kept]'

function leaks(text: string, real: readonly string[]): boolean {
  const t = text.toLowerCase()
  return real.some((v) => v.trim().length >= 2 && t.includes(v.trim().toLowerCase()))
}

/**
 * Log one prompt that left and its answer. Never throws: a log that could
 * not be written is reported to staff, and the caller is told.
 */
export async function recordModelPrompt(p: PromptToRecord): Promise<{ ok: true; id: string; withheld: boolean } | { ok: false }> {
  const real = p.realValues ?? []
  const promptLeaks = leaks(p.maskedPrompt, real)
  const answerLeaks = leaks(p.maskedAnswer, real)
  try {
    if (promptLeaks || answerLeaks) {
      await reportError(
        'model-boundary',
        new Error(`A ${p.purpose} prompt reached the log with a real name, rate or pay still in it; the text was withheld.`),
        { companyId: p.companyId, personId: p.personId },
      ).catch(() => undefined)
    }
    const row = await prisma.modelPrompt.create({
      data: {
        companyId: p.companyId,
        personId: p.personId,
        provider: p.provider,
        model: p.model,
        maskedPrompt: promptLeaks ? WITHHELD : p.maskedPrompt,
        maskedAnswer: answerLeaks ? WITHHELD : p.maskedAnswer,
        tokensIn: p.tokensIn ?? null,
        tokensOut: p.tokensOut ?? null,
        purpose: p.purpose,
      },
      select: { id: true },
    })
    return { ok: true, id: row.id, withheld: promptLeaks || answerLeaks }
  } catch (err) {
    await reportError('model-boundary', err, { companyId: p.companyId, personId: p.personId }).catch(() => undefined)
    return { ok: false }
  }
}

export interface PromptRow {
  id: string
  ts: Date
  personName: string | null
  provider: string
  model: string
  maskedPrompt: string
  maskedAnswer: string
  tokensIn: number | null
  tokensOut: number | null
  purpose: string
}

/** What left for the model at this company, newest first. Masked, as stored. */
export async function modelPromptsFor(companyId: string, take = 20): Promise<PromptRow[]> {
  const rows = await prisma.modelPrompt.findMany({
    where: { companyId },
    orderBy: { ts: 'desc' },
    take: Math.min(Math.max(take, 1), 200),
    select: {
      id: true, ts: true, provider: true, model: true, maskedPrompt: true, maskedAnswer: true,
      tokensIn: true, tokensOut: true, purpose: true, person: { select: { name: true } },
    },
  })
  return rows.map(({ person, ...r }) => ({ ...r, personName: person?.name ?? null }))
}
