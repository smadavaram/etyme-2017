/**
 * A card's words (record 130): an act, a name, a figure and a tag, in
 * twelve words or fewer, and no sentence. Pure.
 *
 *   Pay invoice · Tecwyn Partners · $18,400 · Due today
 */

import { daysToDue, daysOpen, type Scorable } from './score'

export const MAX_CARD_WORDS = 12

export interface CardWords {
  act: string
  name: string
  figure: string | null
  tag: string | null
}

export function wordsIn(s: string | null | undefined): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length
}

export function cardWordCount(c: CardWords): number {
  return wordsIn(c.act) + wordsIn(c.name) + wordsIn(c.figure) + wordsIn(c.tag)
}

/** The card cut to fit: the name gives words first, then the tag is dropped. Never a sentence's ending mark. */
export function fitCard(c: CardWords): CardWords {
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[.!?…]+$/, '').trim()
  let out: CardWords = { act: clean(c.act), name: clean(c.name), figure: c.figure ? clean(c.figure) : null, tag: c.tag ? clean(c.tag) : null }
  if (cardWordCount(out) <= MAX_CARD_WORDS) return out
  const room = MAX_CARD_WORDS - wordsIn(out.act) - wordsIn(out.figure) - wordsIn(out.tag)
  if (room >= 1) return { ...out, name: out.name.split(' ').slice(0, room).join(' ') }
  out = { ...out, tag: null }
  const room2 = MAX_CARD_WORDS - wordsIn(out.act) - wordsIn(out.figure)
  return { ...out, name: out.name.split(' ').slice(0, Math.max(1, room2)).join(' ') }
}

/** True where the text reads as a sentence: two or more clauses, or an ending mark. */
export function readsAsSentence(s: string): boolean {
  return /[.!?]\s*\S/.test(s) || /[.!?]$/.test(s.trim())
}

/** "Late 2 d", "Due today", "Due in 3 d", "Open 4 d": where the card stands, from the record's own days. */
export function tagOf(c: Pick<Scorable, 'dueOn' | 'openedOn'>, now: Date): string | null {
  const d = daysToDue(c, now)
  if (d === null) return null
  if (c.dueOn) {
    if (d < 0) return `Late ${-d} d`
    return d === 0 ? 'Due today' : `Due in ${d} d`
  }
  // No due date: the days it has been open, which is all the record knows.
  const open = daysOpen(c, now) ?? 0
  return open === 0 ? 'New today' : `Open ${open} d`
}

/** "40 h" from a subtitle that begins "40 hours"; null where it does not. */
export function hoursFigure(subtitle: string | null | undefined): string | null {
  const m = (subtitle ?? '').trim().match(/^(\d+(?:\.\d+)?) hours?\b/)
  return m ? `${m[1]} h` : null
}

/** The first dollar amount the row itself states, verbatim; null where it states none. */
export function moneyFigure(subtitle: string | null | undefined): string | null {
  const m = (subtitle ?? '').match(/\$\d[\d,]*(?:\.\d{2})?/)
  return m ? m[0] : null
}
