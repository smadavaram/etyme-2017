/**
 * The one-card queue, built from the decisions list (record 130). Pure.
 *
 * It wraps the readers that already exist: the list `GET /api/decisions`
 * answers (the one the number on Ask Etyme counts), turned into cards by
 * `todayRows` (the same cards Today and Ask Etyme draw, each with its act
 * through the one route that performs it). Nothing here decides anything
 * a second way; it only orders the cards, words each one in twelve words
 * or fewer, and attaches the Why.
 */

import { queueFrom, type QueueAct, type QueueCard, type QueueItem } from '@/app/api/conversations/twin/ask'
import { todayRows } from '@/components/twin-conversation/today-decisions'
import { inOrder, medianAmount, scoreOf, type Scorable } from './score'
import { fitCard, hoursFigure, moneyFigure, tagOf, type CardWords } from './wording'

export interface Why {
  /** The rule the card is asked under. */
  rule: string
  /** What the card is read from, in the record's own words. */
  source: string
  /** The latest ledger line on the record, or the plain fact that none is written yet. */
  ledger: string
}

export interface OneCard extends CardWords, Scorable {
  type: string
  /** The one route's act, where one route performs it; the card's Yes. */
  yes: QueueAct | null
  /** A second act through the same route where a no is an answer (an Owner ask's No). */
  no: QueueAct | null
  /** Where a row with no verdict route opens its record: the one button. */
  open: { href: string; words: string } | null
  why: Why
  score: number
}

/** Why each kind of row is asked, in the trade's words. Anything else reads the plain rule below. */
export const RULES: Record<string, string> = {
  TIMESHEET_APPROVAL: 'Approve only the hours the worker filed for the week.',
  EXPENSE_APPROVAL: 'Approve only an expense with its receipt.',
  INVOICE_RECEIPT_TO_PAY: 'Pay only a matched invoice, on signed hours, with the bank checked.',
  SUBMISSION_REVIEW: 'Answer each candidate put forward to the job.',
  START_HELD: 'Nobody starts without the paper that lets them.',
}
export const PLAIN_RULE = 'Yes is recorded under your name. Not now changes nothing.'
export const NO_LEDGER_YET = 'No ledger line yet. Yes writes one.'

const rawRows = (body: unknown): Record<string, unknown>[] => {
  const d = (body as { data?: { decisions?: unknown } } | null)?.data?.decisions
  return Array.isArray(d) ? d.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []
}

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

/** The person or thing a card is about: the route's own word, else the title after its dash, with no ending mark. */
export function nameOf(item: QueueItem | undefined, card: QueueCard): string {
  const who = item?.whose?.trim()
  if (who) return who
  const t = card.title.trim()
  const at = t.indexOf(' — ')
  return (at >= 0 ? t.slice(at + 3) : t).replace(/[.!?\s]+$/, '')
}

export function oneCardsFrom(body: unknown, ledgerByEntity: ReadonlyMap<string, string>, now: Date): { cards: OneCard[]; total: number } | null {
  const read = queueFrom(body)
  if (!read) return null
  const { rows } = todayRows(body)
  const items = new Map(read.items.map((i) => [`${i.type}:${i.entityId}`, i]))
  const raw = new Map(rawRows(body).map((r) => [`${r.type}:${r.entityId}`, r]))
  const unscored = rows.map((card) => {
    const item = items.get(card.key)
    const r = raw.get(card.key)
    const dueOn = str(r?.dueDate)
    const openedOn = str(r?.createdAt)
    const amount = typeof r?.amount === 'number' && Number.isFinite(r.amount) ? r.amount : null
    const words = fitCard({
      act: card.act?.label ?? card.open ?? 'Open',
      name: nameOf(item, card),
      figure: moneyFigure(item?.subtitle) ?? hoursFigure(item?.subtitle),
      tag: tagOf({ dueOn, openedOn }, now),
    })
    const entityId = card.key.slice(card.key.indexOf(':') + 1)
    return {
      key: card.key, type: card.type, ...words, dueOn, openedOn, amount, confidence: null as number | null,
      yes: card.act, no: card.no ?? null,
      open: card.act ? null : { href: card.href, words: card.open ?? 'Open' },
      why: {
        rule: card.why ?? RULES[card.type] ?? PLAIN_RULE,
        source: card.fact?.trim() || card.title.trim(),
        ledger: ledgerByEntity.get(entityId) ?? NO_LEDGER_YET,
      },
    }
  })
  const median = medianAmount(unscored.map((c) => c.amount))
  const ordered = inOrder(unscored, now).map((c): OneCard => ({ ...c, score: scoreOf(c, median, now) }))
  return { cards: ordered, total: read.total }
}
