/**
 * A worker's one-card queue (record 130: "Ask Etyme is every end user's
 * harness"). Pure. Her cards are the ones her own Ask Etyme already
 * draws (`cardsFor`: file my week, sign papers, answer an interview,
 * renew a stay), read from her own record and nobody else's; here they
 * only take the one-card shape. Each opens the page where she does it:
 * Etyme never files, signs or sends for her.
 */

import type { WorkerCard } from '@/app/api/conversations/twin/worker'
import { actHeading } from './acts'
import { NO_LEDGER_YET, type OneCard } from './build'

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function workerCardsFrom(cards: readonly WorkerCard[]): OneCard[] {
  return cards.map((c, i) => ({
    key: `${c.act}:${c.key}`,
    type: c.act,
    // A paper she uploads is not signed: the card says the act the button does.
    act: c.act === 'PAPER' && c.button === 'Upload' ? 'Upload paper' : actHeading(c.act, c.title, null),
    name: capital(c.name.replace(/^your\s+/i, '')),
    figure: null,
    tag: c.stopsWork ? 'Stops your work' : null,
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
