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
 *   maskForModel(text, vocab)        the shared mask for anything sent that is not
 *                                    Ask Etyme's own turn (an import today)
 *
 * The record holds several companies' people and money at once, so a
 * client turning a model on must never expose a supplier's rates or a
 * worker's pay. Names, rates and pay become tokens before anything is
 * sent (Ask Etyme's masking is conversation's, at the edge; every other
 * caller uses `maskForModel` below); this file keeps the switch, the log
 * and the shared mask, and refuses to keep an unmasked text even when it
 * is handed one.
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

// ── The shared mask (2026-10-27) ──────────────────────────────────────
//
// The one masking door for anything that is not Ask Etyme's own turn.
// Ask Etyme masks with `newMasker` in app/api/conversations/twin/mask.ts,
// which knows names only from the reader's vocabulary and figures only by
// shape. An import is different: the names in it are, by definition, not
// on the record yet, and a sheet carries emails and phone numbers. So this
// masker adds four things to the same idea: emails, phone numbers, the
// cells under a name or money column of a table, and capitalized names in
// prose. Over-masking is safe here, because every token is put back on the
// way in; under-masking is the failure.
//
// Conversation may point its own masker at this one when it next touches
// it; until then the two agree on the token shape (PERSON_1, FIRM_2,
// RATE_3, AMOUNT_4) and this one adds EMAIL_n and PHONE_n.

export type MaskTokenKind = 'PERSON' | 'FIRM' | 'RATE' | 'AMOUNT' | 'EMAIL' | 'PHONE'

export interface MaskVocab {
  /** People named on the record that the text may mention. */
  people?: readonly string[]
  /** Firms named on the record that the text may mention. */
  firms?: readonly string[]
}

export interface ModelMask {
  /** The text with every name, email, phone, rate, pay and amount replaced by a token. */
  masked: string
  /** Put every token this mask issued back to its real value. */
  unmask(text: string): string
  /**
   * Put a structured value back. With `asNumber`, a value that is one
   * money token comes back as the plain number it stood for ("$98.00/hr"
   * becomes "98.00"), because the model was asked for a number and was
   * handed a token instead.
   */
  unmaskValue(value: unknown, opts?: { asNumber?: boolean }): unknown
  /** The real values replaced, for the log's leak check. Never stored. */
  realValues(): string[]
}

const TOKEN = /\b(?:PERSON|FIRM|RATE|AMOUNT|EMAIL|PHONE)_\d+\b/g

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** A phone number: ten digits in the usual groupings, with an optional country code. Never a date. */
const PHONE = /(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])|(?<![\w-])\+\d{1,3}[\s.-]?\d{4,5}[\s.-]?\d{5,6}(?![\w-])/g

/** "$98.00/hr", "£1,000", "USD 3,600.00", "₹ 45,000 per month", "$2k". */
const MONEY_SHAPE =
  /(?:[$£€₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?|\b(?:USD|GBP|EUR|INR|CAD|AUD)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|GBP|EUR|INR|CAD|AUD)\b)(?:\s?(?:\/|per\s)(?:hr|hour|h|day|week|wk|month|mo|year|yr)\b)?/g

/** A pay or rate figure said in words: "98 an hour", "45 per hour". */
const RATE_WORDS = /\b\d[\d,]*(?:\.\d+)?\s?(?:\/\s?(?:hr|hour|h)|an hour|per hour|hourly|a day|per day)\b/gi

/** A percentage that is about money. */
const MONEY_PCT =
  /\b(?:margin|mark-?up|fee|commission|discount|spread)s?\b[^.;\n]{0,30}?\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?%\s+(?:margin|mark-?up|fee|commission|discount|spread)s?\b/gi

const FIRM_HEADER = /\b(?:supplier|vendor|firm|company|client|customer|employer|agency)\b/i
const PERSON_HEADER = /\b(?:name|contact|consultant|candidate|worker|employee|person|manager|owner|recruiter|approver)\b/i
const MONEY_HEADER = /\b(?:rate|pay|salary|wage|wages|amount|bill|cost|price|budget|ceiling|value|total|fee|margin|markup|compensation|ctc)\b/i
const EMAIL_HEADER = /e-?mail/i
const PHONE_HEADER = /\b(?:phone|mobile|cell|tel|telephone)\b/i

/** Capitalized words that are never a name on their own, so a run of them is not masked. */
const NOT_A_NAME = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'from', 'with', 'please', 'dear', 'hi',
  'hello', 'thanks', 'thank', 'regards', 'best', 'kind', 'note', 'total', 'subtotal', 'name', 'email', 'phone',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'cost', 'center', 'centre', 'purchase', 'order', 'orders', 'rate', 'floor', 'start', 'end', 'date', 'skills',
  'location', 'locations', 'holiday', 'holidays', 'work', 'authorization', 'code', 'account', 'gl', 'active',
  'inc', 'llc', 'ltd', 'corp', 'usa', 'us', 'uk',
])

/** Two or three capitalized words in a row: the shape of a name in prose. */
const PROSE_NAME = /\b\p{Lu}[\p{Ll}'’-]+(?:\s+\p{Lu}[\p{Ll}'’-]+){1,2}\b/gu

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Split one line of a delimited table, honoring quotes. */
export function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"' && cur.trim() === '') { quoted = true; cur = '' }
    else if (c === delim) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

/**
 * Whether a text is a delimited table — a heading row and at least one row
 * under it, split by tabs or commas into the same number of cells — and
 * which delimiter. Null for prose.
 */
export function tableShape(text: string): { delim: string; lines: string[] } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return null
  for (const delim of ['\t', ',', ';', '|']) {
    const width = splitDelimited(lines[0], delim).length
    if (width < 2) continue
    const same = lines.slice(1).filter((l) => splitDelimited(l, delim).length === width).length
    if (same >= Math.max(1, Math.ceil((lines.length - 1) * 0.8))) return { delim, lines }
  }
  return null
}

const joinCell = (cell: string, delim: string) =>
  cell.includes(delim) || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell

/** The plain number a money text stood for: "$98.00/hr" → "98.00", "$2k" → "2000". Null when there is none. */
export function plainNumber(money: string): string | null {
  const m = money.match(/\d[\d,]*(?:\.\d+)?/)
  if (!m) return null
  const n = m[0].replace(/,/g, '')
  const after = money.slice((m.index ?? 0) + m[0].length).trimStart()
  if (/^[kK]\b/.test(after)) return String(Number(n) * 1_000)
  if (/^[mM]\b/.test(after)) return String(Number(n) * 1_000_000)
  return n
}

/**
 * Mask a text before it leaves for a model. Pure: the map lives in the
 * returned mask and dies with it; nothing here stores it.
 */
export function maskForModel(text: string, vocab: MaskVocab = {}): ModelMask {
  const realToToken = new Map<string, string>()
  const tokenToReal = new Map<string, string>()
  const tokenKind = new Map<string, MaskTokenKind>()
  let next = 1

  const tokenFor = (kind: MaskTokenKind, real: string): string => {
    const key = `${kind}:${real.trim().toLowerCase()}`
    const had = realToToken.get(key)
    if (had) return had
    const token = `${kind}_${next++}`
    realToToken.set(key, token)
    tokenToReal.set(token, real.trim())
    tokenKind.set(token, kind)
    return token
  }

  /** Emails, phones and money by their shape, anywhere. */
  const byShape = (s: string): string =>
    s
      .replace(EMAIL, (m) => tokenFor('EMAIL', m))
      .replace(PHONE, (m) => tokenFor('PHONE', m))
      .replace(MONEY_PCT, (m) => tokenFor('RATE', m))
      .replace(MONEY_SHAPE, (m) => tokenFor(/(\/|per\s)/.test(m) ? 'RATE' : 'AMOUNT', m))
      .replace(RATE_WORDS, (m) => tokenFor('RATE', m))

  /** Names the record knows, whole, longest first. */
  const known: { kind: MaskTokenKind; name: string; re: RegExp }[] = []
  for (const [kind, list] of [['PERSON', vocab.people ?? []], ['FIRM', vocab.firms ?? []]] as const) {
    for (const raw of list) {
      const name = raw.trim().replace(/\s+/g, ' ')
      if (name.length < 3) continue
      known.push({ kind, name, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'giu') })
    }
  }
  known.sort((a, b) => b.name.length - a.name.length)
  const byRecord = (s: string): string => {
    let out = s
    for (const k of known) out = out.replace(k.re, () => tokenFor(k.kind, k.name))
    return out
  }

  /** A run of capitalized words in prose, unless every word is a common one. */
  const byProse = (s: string): string =>
    s.replace(PROSE_NAME, (m) => {
      const words = m.split(/\s+/)
      if (words.every((w) => NOT_A_NAME.has(w.toLowerCase()))) return m
      if (NOT_A_NAME.has(words[0].toLowerCase()) && words.length === 2) return m
      return tokenFor('PERSON', m)
    })

  let masked: string
  const table = tableShape(text)
  if (table) {
    const headers = splitDelimited(table.lines[0], table.delim)
    const kindOf = headers.map((h): MaskTokenKind | 'TEXT' => {
      if (EMAIL_HEADER.test(h)) return 'EMAIL'
      if (PHONE_HEADER.test(h)) return 'PHONE'
      if (MONEY_HEADER.test(h)) return 'AMOUNT'
      if (FIRM_HEADER.test(h)) return 'FIRM'
      if (PERSON_HEADER.test(h)) return 'PERSON'
      return 'TEXT'
    })
    const rows = table.lines.slice(1).map((line) =>
      splitDelimited(line, table.delim).map((cell, i) => {
        if (cell === '') return cell
        const kind = kindOf[i] ?? 'TEXT'
        if (kind === 'AMOUNT') return tokenFor(/(\/|per\s|hour|hr\b)/i.test(cell) || /rate|pay|wage/i.test(headers[i]) ? 'RATE' : 'AMOUNT', cell)
        if (kind !== 'TEXT') return tokenFor(kind, cell)
        return byProse(byRecord(byShape(cell)))
      }),
    )
    masked = [headers, ...rows].map((r) => r.map((c) => joinCell(c, table.delim)).join(table.delim)).join('\n')
  } else {
    masked = byProse(byRecord(byShape(text)))
  }

  const unmask = (s: string): string => s.replace(TOKEN, (t) => tokenToReal.get(t) ?? t)

  const unmaskValue = (value: unknown, opts: { asNumber?: boolean } = {}): unknown => {
    if (typeof value === 'string') {
      const whole = value.trim()
      const kind = tokenKind.get(whole)
      if (opts.asNumber && (kind === 'RATE' || kind === 'AMOUNT')) {
        return plainNumber(tokenToReal.get(whole) ?? '') ?? unmask(value)
      }
      return unmask(value)
    }
    if (Array.isArray(value)) return value.map((v) => unmaskValue(v))
    return value
  }

  return {
    masked,
    unmask,
    unmaskValue,
    realValues(): string[] {
      // A bare short number ("98") is not checked as a leak: it is in every
      // answer's confidences and dates, and would withhold every log line.
      return [...new Set(tokenToReal.values())].filter((v) => !/^[\d.,\s]{1,4}$/.test(v))
    },
  }
}
