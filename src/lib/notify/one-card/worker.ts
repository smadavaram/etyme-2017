/**
 * A worker's one-card queue (record 130: "Ask Etyme is every end user's
 * harness"). Pure. Her cards are the ones her own Ask Etyme already
 * draws (`cardsFor`: file my week, sign papers, answer an interview,
 * renew a stay), read from her own record and nobody else's; here they
 * only take the one-card shape. Each opens the page where she does it:
 * Etyme never files, signs or sends for her.
 */

import type { WorkerCard, WorkerFacts } from '@/app/api/conversations/twin/worker'
import { formatDay } from '@/lib/format-date'
import { actHeading } from './acts'
import { NO_LEDGER_YET, type OneCard } from './build'

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * A week's figure and due day, from her own facts: a week not filed is
 * "0 h" with the day it is due; a week saved and not sent is the hours it
 * holds. Null where the facts do not say, never a guess.
 */
function weekFigure(c: WorkerCard, f: Pick<WorkerFacts, 'toFile' | 'sent'> | undefined): { figure: string | null; due: string | null } {
  if (!f) return { figure: null, due: null }
  if (c.act === 'FILE_WEEK') {
    const w = f.toFile.find((x) => `file:${x.periodStart}` === c.key)
    return { figure: w ? '0 h' : null, due: w?.dueOn ? `Due ${formatDay(w.dueOn, { year: false })}` : null }
  }
  if (c.act === 'SEND_WEEK') {
    const w = f.sent.find((x) => `send:${x.id}` === c.key)
    return { figure: w ? `${Math.round(w.hours * 100) / 100} h` : null, due: null }
  }
  return { figure: null, due: null }
}

export function workerCardsFrom(cards: readonly WorkerCard[], facts?: Pick<WorkerFacts, 'toFile' | 'sent'>): OneCard[] {
  return cards.map((c, i) => ({
    key: `${c.act}:${c.key}`,
    type: c.act,
    // A paper she uploads is not signed: the card says the act the button does.
    act: c.act === 'PAPER' && c.button === 'Upload' ? 'Upload paper' : actHeading(c.act, c.title, null),
    name: capital(c.name.replace(/^your\s+/i, '')),
    figure: weekFigure(c, facts).figure,
    tag: c.stopsWork ? 'Stops your work' : weekFigure(c, facts).due,
    dueOn: null,
    openedOn: null,
    amount: null,
    confidence: null,
    yes: null,
    verb: null,
    no: null,
    open: { href: c.href, words: c.button },
    why: { rule: c.says, source: c.title, ledger: NO_LEDGER_YET },
    // Her list is already in the order that matters most; the score keeps it.
    score: cards.length - i,
  }))
}
