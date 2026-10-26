'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useSession } from '@/components/session-provider'
import { EtymeMark } from '@/components/logo'
import { RefusedState, Textarea, FormMessage, Input, Select } from '@/components/ui'
import { statusMeans } from '@/lib/read-response'
import { formatDay, formatRange } from '@/lib/format-date'
import { deskOf } from '@/components/shell/sidebar-props'
import {
  FOOTER_LINE, decisionRequest, entryHref, hrs, money, partOfDay, seatSays, partyOf, questionsFor, placeholderFor,
  billCardTitle, billRows, billSentSays, billKeptSays, heldBillTitle, heldBillSays, NOT_NOW_REASON,
  payQuestion, payYesSays, paidSays, NEEDS_BANK_REFERENCE, PAY_METHODS, type PayAnswer,
  type Answer, type Link as AnswerLink, type RichLine, type WaitingItem, type HeldBill, type VarianceRow, type LimitRow, type SpendRow, type WeekRow,
  type Party, type QueueCard, type ListTable,
} from '@/app/api/conversations/twin/ask'
import { WORKER_QUESTIONS, WORKER_FOOTER, type WorkerAnswer, type WorkerCard as WorkerCardFact } from '@/app/api/conversations/twin/worker'

/**
 * Ask Etyme — a chat inside Conversations, the way a person expects a
 * chat to look. The founder's prototype of 2026-10-12, built: a thread,
 * newest at the bottom; the box fixed at the bottom with four suggested
 * questions over it; one line under it saying what Etyme does and does
 * not do; nothing else on the screen.
 *
 * Underneath it is the program manager twin's second door (CLAUDE.md,
 * "The job twin"). The first message is the greeting, built from the
 * ledger and the rules by GET /api/conversations/twin. Every question
 * goes to POST /api/conversations/twin, which answers by rules first and
 * writes nothing. A yes or a no on a card goes to the one approval route
 * the web and Teams share, POST /api/twin/approvals/:id with surface WEB,
 * and the reply says what happened with links to the record and the
 * ledger entry. Nothing in this file writes state any other way.
 *
 * One conversation per seat, kept (founder, 2026-10-18). On load the
 * seat's saved lines are drawn first and today's greeting under them, as
 * the newest message, because the greeting is "what needs you now" and a
 * thread is read from the bottom. A card answered stays answered: what
 * the route says became of it is drawn from the saved line. After the
 * approval route answers a card, the chat asks its own route to record
 * that on the line, and to keep the reply. Clear starts over from the
 * greeting. A seat whose conversation is not kept — a demo seat other
 * visitors share — reads why, once, at the top.
 *
 * A worker reads the same chat about her own work (founder, 2026-10-16:
 * the same Ask Etyme, inside her own pages). Her chips are her five
 * questions; her cards open her own pages — "File my week" opens Your
 * work, because Etyme never files a week for her — and the one card that
 * does something, Renew, is her own press on the bench route her Who has
 * you page already uses. No approval route, no act of the twin.
 */

/** What the route says became of each card on a saved line. */
type SavedCards = Record<string, { state: 'APPROVED' | 'REJECTED' | 'LATER' | 'OVERTAKEN'; number?: string }>

type Turn =
  | { id: number; from: 'you'; text: string }
  /** `savedId` is the line on the seat's thread; a greeting, or a seat that keeps none, has none. */
  | { id: number; from: 'etyme'; answer: Answer; savedId?: string; saved?: SavedCards }
  | { id: number; from: 'note'; text: string }
  /** A quiet line about the conversation itself: an answer not kept, a Clear done. */
  | { id: number; from: 'aside'; text: string }

/** A saved line as the route returns it. */
interface SavedLine {
  id: string
  speaker: 'PERSON' | 'ETYME'
  text: string
  answer: unknown
  cards: SavedCards
  at: string
}

interface ThreadIn { saved: boolean; notKeptBecause: string | null; earlier: boolean; turns: SavedLine[] }

const THREAD = '/api/conversations/twin'
/** Her bench stays: the route Who has you renews a stay through. */
const RENEW = '/api/me/benches'

/** Whether a saved answer is one this screen draws; an older shape reads as its words. */
function asAnswer(line: SavedLine): Answer {
  const a = line.answer as { kind?: unknown; says?: unknown } | null
  const kinds = ['TEXT', 'NEEDS', 'TIME_LIMIT', 'SPEND', 'WEEKS', 'WHY', 'CONFIRM', 'VARIANCE', 'MODEL', 'WORKER', 'LIST']
  if (a && typeof a === 'object' && typeof a.kind === 'string' && kinds.includes(a.kind) && typeof a.says === 'string') return a as Answer
  return { kind: 'TEXT', says: line.text }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What happened to a card: answered (with the words), kept waiting, closed by events, or refused by the route. */
type CardState = { state: 'APPROVED' | 'REJECTED' | 'LATER' | 'OVERTAKEN'; number?: string } | { state: 'ERROR'; text: string }
type Cards = Record<string, CardState>

type Decide = (item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null, answer?: PayAnswer | null) => void

/** The twin's numbers, the hours tolerance among them: the architect's rules page. */
const RULES_HREF = '/dashboard/twin/rules'

const SUBTITLE = 'Answers from your record and its rules. Anything it does is recorded.'

export function AskEtyme() {
  const session = useSession()
  // The saved lines from before this page load, oldest first; then this load's turns, greeting first.
  const [history, setHistory] = useState<Turn[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [notKept, setNotKept] = useState<string | null>(null)
  const [earlier, setEarlier] = useState(false)
  const [oldestAt, setOldestAt] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(true)
  const [refused, setRefused] = useState<string | null>(null)
  const [cards, setCards] = useState<Cards>({})
  const [deciding, setDeciding] = useState<string | null>(null)
  // A worker's own Ask Etyme: her five questions, her cards (the route says which seat this is).
  const [worker, setWorker] = useState(false)
  const [renewed, setRenewed] = useState<Record<string, { ok: boolean; says: string }>>({})
  // A decision card's own act, through the one route that already does it; what the route said.
  const [acted, setActed] = useState<Record<string, { state: 'DONE' | 'LATER' | 'ERROR'; says: string }>>({})
  const next = useRef(1)
  const end = useRef<HTMLDivElement>(null)
  const firstName = session.person?.name?.trim().split(/\s+/)[0] ?? null
  // Where you are, said once in the greeting: the phone header carries no
  // words, so the desk, the company and, in the demo, that it is a sample
  // are the greeting's first line (founder, 2026-10-13).
  const desk = deskOf(session)
  // Whose Ask Etyme this is: the route says, and until it has, the session.
  const [party, setParty] = useState<Party>(() => partyOf({ companyKind: desk.companyKind, worker: desk.isConsultant || desk.worker, seatedAt: desk.seatedAtClient }))
  // Null until the greeting says which questions this desk gets an answer to.
  const [chips, setChips] = useState<readonly string[] | null>(null)
  const seat = seatSays({
    role: desk.isConsultant ? 'Consultant' : desk.roleName, company: session.company?.name ?? null, sample: session.isDemo,
    party, seatedAt: desk.seatedAtClient,
  })

  const add = (t: DistributiveOmit<Turn, 'id'>) => setTurns((all) => [...all, { ...t, id: next.current++ } as Turn])
  const fromSaved = (lines: SavedLine[]): Turn[] =>
    lines.map((l) => (l.speaker === 'PERSON'
      ? { id: next.current++, from: 'you', text: l.text }
      : { id: next.current++, from: 'etyme', answer: asAnswer(l), savedId: l.id, saved: l.cards ?? {} }))

  // The saved lines, then the greeting: what needs this seat now, from the ledger and the rules.
  const live = useRef(true)
  async function load(aside?: string) {
    setPending(true)
    try {
      const res = await fetch(THREAD)
      const body = await res.json().catch(() => null)
      if (!live.current) return
      if (res.status === 401 || res.status === 403) { setRefused(body?.error?.message ?? statusMeans(res.status)); return }
      const thread: ThreadIn | null = body?.data?.thread ?? null
      if (thread) {
        setHistory(fromSaved(thread.turns))
        setNotKept(thread.saved ? null : thread.notKeptBecause)
        setEarlier(thread.earlier)
        setOldestAt(thread.turns[0]?.at ?? null)
      }
      if (body?.data?.worker === true) setWorker(true)
      const said = body?.data?.party
      if (said === 'CLIENT' || said === 'MSP' || said === 'FIRM' || said === 'SOLO' || said === 'WORKER') setParty(said)
      // The desk's own chips, judged by the route on the seat's permissions.
      const chipsSaid = body?.data?.chips
      if (Array.isArray(chipsSaid) && chipsSaid.every((c: unknown) => typeof c === 'string')) setChips(chipsSaid)
      const first: Turn[] = aside ? [{ id: next.current++, from: 'aside', text: aside }] : []
      if (!res.ok || !body?.data?.answer) { setTurns([...first, { id: next.current++, from: 'note', text: body?.error?.message ?? statusMeans(res.status) }]); return }
      setTurns([...first, { id: next.current++, from: 'etyme', answer: body.data.answer as Answer }])
    } catch {
      if (live.current) setTurns([{ id: next.current++, from: 'note', text: 'Etyme could not be reached. Check your connection, then ask a question.' }])
    } finally {
      if (live.current) setPending(false)
    }
  }
  useEffect(() => {
    live.current = true
    void load()
    return () => { live.current = false }
  }, [])

  // Newest at the bottom, and the thread follows it.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, pending])

  /** "Show earlier": the lines older than the oldest one drawn, put above it. */
  async function showEarlier() {
    if (!oldestAt) return
    try {
      const res = await fetch(`${THREAD}?only=thread&take=1000`)
      const body = await res.json().catch(() => null)
      const thread: ThreadIn | null = body?.data?.thread ?? null
      if (!res.ok || !thread) return
      const older = thread.turns.filter((l) => l.at < oldestAt)
      setHistory((h) => [...fromSaved(older), ...h])
      setOldestAt(older[0]?.at ?? oldestAt)
      setEarlier(thread.earlier)
    } catch {
      // Nothing changes; the button stays for another try.
    }
  }

  /** Clear: the seat starts over from the greeting. The old lines stay on the record, unshown. */
  async function clear() {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch(THREAD, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { add({ from: 'note', text: body?.error?.message ?? statusMeans(res.status) }); setPending(false); return }
      setHistory([])
      setCards({})
      setEarlier(false)
      setOldestAt(null)
      await load(body?.data?.saved
        ? 'Conversation cleared. Earlier lines stay on the record and are no longer shown.'
        : 'Conversation cleared.')
    } catch {
      add({ from: 'note', text: 'Your conversation was not cleared, so nothing changed. Check your connection and try again.' })
      setPending(false)
    }
  }

  /**
   * Record on the seat's own line what the approval route said became of
   * a card, and keep the reply after a yes or a no. It approves nothing.
   */
  async function keepCard(mark: { approvalId: string; state: 'APPROVED' | 'REJECTED' | 'LATER'; turnId?: string; number?: string; said?: Answer }) {
    try {
      const res = await fetch(THREAD, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mark),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) add({ from: 'aside', text: body?.error?.message ?? 'This answer was not kept, so it will not be here after a reload.' })
    } catch {
      add({ from: 'aside', text: 'This answer was not kept, so it will not be here after a reload.' })
    }
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || pending) return
    add({ from: 'you', text: q })
    setText('')
    setPending(true)
    try {
      const res = await fetch(THREAD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 401 || res.status === 403) { setRefused(body?.error?.message ?? statusMeans(res.status)); return }
      if (!res.ok || !body?.data?.answer) { add({ from: 'note', text: body?.error?.message ?? statusMeans(res.status) }); return }
      add({ from: 'etyme', answer: body.data.answer as Answer, ...(typeof body.data.turnId === 'string' ? { savedId: body.data.turnId } : {}) })
      // Kept everywhere but a seat that keeps nothing, which the top line already says.
      if (body.data.kept === false && typeof body.data.notKeptBecause === 'string' && body.data.notKeptBecause !== notKept) {
        add({ from: 'aside', text: body.data.notKeptBecause })
      }
    } catch {
      add({ from: 'note', text: 'Your question did not reach Etyme. Check your connection and ask again.' })
    } finally {
      setPending(false)
    }
  }

  /** A yes or a no, through the one approval route; then the line that drew the card records it. */
  const decide = async (item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null, turnId?: string, answer?: PayAnswer | null) => {
    setDeciding(item.approvalId)
    const { url, init } = decisionRequest(item.approvalId, decision, reason, answer)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setCards((c) => ({ ...c, [item.approvalId]: { state: 'ERROR', text: body?.error?.message ?? statusMeans(res.status) } }))
        return
      }
      // A sent bill's number is the one markSent gave it, read back from the route.
      const number: string | undefined = typeof body?.data?.result?.number === 'string' ? body.data.result.number : undefined
      setCards((c) => ({ ...c, [item.approvalId]: { state: decision, ...(number ? { number } : {}) } }))
      const entry: string | null = typeof body?.data?.ledgerEntryId === 'string' ? body.data.ledgerEntryId : null
      const said: Answer = {
        kind: 'TEXT',
        says: item.bill
          ? `${decision === 'APPROVED' ? billSentSays(item.bill, number) : billKeptSays(item.bill)} Recorded under your name.`
          : item.pay && decision === 'APPROVED' && answer?.reference
          ? paidSays(item.pay, answer.reference.trim())
          : `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} ${item.title}. ${body?.data?.note ?? ''}`.trim(),
        links: [
          { label: `Open ${item.title}`, href: item.href },
          ...(entry ? [{ label: 'See it in the ledger', href: entryHref(entry) }] : []),
        ],
      }
      add({ from: 'etyme', answer: said })
      await keepCard({ approvalId: item.approvalId, state: decision, turnId, number, said })
    } catch {
      setCards((c) => ({ ...c, [item.approvalId]: { state: 'ERROR', text: 'Your answer did not reach Etyme, so nothing changed. Try again.' } }))
    } finally {
      setDeciding(null)
    }
  }

  /**
   * A decision card's act: the person's own press on the one route that
   * already performs it — the timesheet's approve, the expense's approve or
   * accept — exactly as the decisions page and Timesheets press it. A
   * refusal shows the route's own sentence and the card stays, with Open.
   */
  const act = async (card: QueueCard) => {
    if (!card.act) return
    setDeciding(card.key)
    try {
      const res = await fetch(card.act.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card.act.body) })
      const body = await res.json().catch(() => null)
      setActed((a) => ({
        ...a,
        [card.key]: res.ok
          ? { state: 'DONE', says: typeof body?.data?.message === 'string' ? body.data.message : card.act!.done }
          : { state: 'ERROR', says: body?.error?.message ?? statusMeans(res.status) },
      }))
    } catch {
      setActed((a) => ({ ...a, [card.key]: { state: 'ERROR', says: 'Your answer did not reach Etyme, so nothing changed. Try again.' } }))
    } finally {
      setDeciding(null)
    }
  }
  const actLater = (card: QueueCard) => setActed((a) => ({ ...a, [card.key]: { state: 'LATER', says: 'Kept waiting. Nothing changed.' } }))

  /** Renew a bench stay: her own press, on the route her Who has you page uses. Nothing else here writes. */
  const renew = async (card: WorkerCardFact) => {
    if (!card.listingId) return
    setDeciding(card.key)
    try {
      const res = await fetch(RENEW, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renew: card.listingId }),
      })
      const body = await res.json().catch(() => null)
      setRenewed((r) => ({
        ...r,
        [card.key]: res.ok
          ? { ok: true, says: body?.data?.message ?? 'Renewed.' }
          : { ok: false, says: body?.error?.message ?? statusMeans(res.status) },
      }))
    } catch {
      setRenewed((r) => ({ ...r, [card.key]: { ok: false, says: 'Your renewal did not reach Etyme, so nothing changed. Try again.' } }))
    } finally {
      setDeciding(null)
    }
  }

  // "Not now" changes nothing on the record: the card reads kept waiting, and the line that drew it remembers.
  const later = (item: WaitingItem, turnId?: string) => {
    setCards((c) => ({ ...c, [item.approvalId]: { state: 'LATER' } }))
    if (turnId) void keepCard({ approvalId: item.approvalId, state: 'LATER', turnId })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(text)
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void ask(text)
    }
  }

  return (
    <section aria-label="Ask Etyme" className="flex h-full min-h-0 flex-1 flex-col bg-etyme-canvas">
      {/* On a phone there is no heading: the header says where you are and
          the flip is the way back (founder, 2026-10-13, "no words in the
          header"). From md up the chat sits beside the list and keeps its
          title and close. The boundary is the greeting's last line. */}
      <header className="hidden items-center gap-2 border-b border-etyme-rule bg-etyme-surface px-3 py-2.5 sm:px-4 md:flex">
        <div className="min-w-0 flex-1 text-left">
          <h1 className="font-serif text-[20px] leading-tight tracking-[-0.02em] text-etyme-ink">Ask Etyme</h1>
          <p className="truncate text-[12px] text-etyme-muted">{SUBTITLE}</p>
        </div>
        <Link
          href={'/dashboard/conversations' as Route}
          aria-label="Close Ask Etyme"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-etyme-rule bg-etyme-raised text-etyme-ink"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </Link>
      </header>

      {refused ? (
        <div className="flex-1 overflow-y-auto p-4"><RefusedState says={refused} /></div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-6 sm:px-6">
            {notKept && (
              <p role="note" className="mx-auto mb-5 max-w-[760px] text-center text-[12.5px] leading-snug text-etyme-muted">{notKept}</p>
            )}
            {earlier && (
              <p className="mx-auto mb-5 max-w-[760px] text-center">
                <button type="button" onClick={() => void showEarlier()} className="text-[12.5px] text-etyme-action-press underline-offset-2 hover:underline">Show earlier</button>
              </p>
            )}
            <ol className="mx-auto flex max-w-[760px] flex-col gap-5" aria-live="polite">
              {[...history, ...turns].map((t) => (
                <li key={t.id}>
                  {t.from === 'you' && (
                    <div className="flex justify-end">
                      <p className="max-w-[80%] whitespace-pre-line rounded-[16px_16px_4px_16px] bg-etyme-action-wash px-3.5 py-2.5 text-[14.5px] text-etyme-ink">{t.text}</p>
                    </div>
                  )}
                  {t.from === 'note' && <FromEtyme><FormMessage tone="error">{t.text}</FormMessage></FromEtyme>}
                  {t.from === 'aside' && <p className="text-center text-[12.5px] leading-snug text-etyme-muted">{t.text}</p>}
                  {t.from === 'etyme' && (
                    <FromEtyme>
                      <Reply
                        answer={t.answer}
                        firstName={firstName}
                        seat={seat}
                        cards={{ ...(t.saved ?? {}), ...cards }}
                        deciding={deciding}
                        onDecide={(item, d, r, ans) => void decide(item, d, r, t.savedId, ans)}
                        onLater={(item) => later(item, t.savedId)}
                        renewed={renewed}
                        onRenew={(card) => void renew(card)}
                        acted={acted}
                        onAct={(card) => void act(card)}
                        onActLater={actLater}
                      />
                    </FromEtyme>
                  )}
                </li>
              ))}
              {pending && (
                <li>
                  <FromEtyme><p className="text-[14px] text-etyme-muted" role="status">Reading the record…</p></FromEtyme>
                </li>
              )}
            </ol>
            <div ref={end} />
          </div>

          <div className="border-t border-etyme-rule/60 bg-etyme-canvas px-3 pb-3 pt-2.5 sm:px-6 sm:pb-4">
            <div className="mx-auto max-w-[760px]">
              <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                {(worker || party === 'WORKER' ? WORKER_QUESTIONS : chips ?? questionsFor(party)).map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={pending}
                    onClick={() => void ask(q)}
                    className="shrink-0 rounded-full border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[13px] text-etyme-action-press hover:border-etyme-action-line disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form onSubmit={onSubmit} className="flex items-end gap-2.5 rounded-[16px] border border-etyme-rule bg-etyme-raised py-2 pl-4 pr-2 focus-within:border-etyme-action focus-within:ring-2 focus-within:ring-etyme-action-wash shadow-[0_8px_30px_-22px_rgba(0,0,0,0.35)]">
                <label htmlFor="ask-etyme-box" className="sr-only">{(worker ? placeholderFor('WORKER') : placeholderFor(party)).replace(/…$/, '')}</label>
                <textarea
                  id="ask-etyme-box"
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKey}
                  maxLength={2000}
                  placeholder={worker ? placeholderFor('WORKER') : placeholderFor(party)}
                  className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-etyme-ink placeholder:text-etyme-faint focus-visible:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={pending || !text.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-etyme-action text-white hover:bg-etyme-action-hover disabled:opacity-40"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 16V4M5 9l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
              <div className="mt-2 flex items-start gap-3">
                <p className="min-w-0 flex-1 text-left text-[12px] leading-snug text-etyme-faint sm:text-center">{worker ? WORKER_FOOTER : FOOTER_LINE}</p>
                {/* Clear sits with the box on every width: the phone header carries the logo and the flip only. */}
                {(history.length > 0 || turns.length > 1) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void clear()}
                    className="shrink-0 text-[12px] leading-snug text-etyme-action-press underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Clear conversation
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** A message from Etyme: the mark, then the reply. */
function FromEtyme({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
        <EtymeMark size={24} />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-[14.5px] leading-relaxed text-etyme-ink">{children}</div>
    </div>
  )
}

/** A sentence whose named phrases are links: a receipt number to its receipt, a count to its list. */
function Rich({ line }: { line: RichLine }) {
  const parts: ReactNode[] = []
  let rest = line.says
  let key = 0
  // In the order they appear, each phrase once.
  const links = [...(line.links ?? [])]
    .filter((l) => l.text && line.says.includes(l.text))
    .sort((a, b) => line.says.indexOf(a.text) - line.says.indexOf(b.text))
  for (const l of links) {
    const at = rest.indexOf(l.text)
    if (at < 0) continue
    if (at > 0) parts.push(rest.slice(0, at))
    parts.push(
      <Link key={key++} href={l.href as Route} className="text-etyme-action-press underline underline-offset-2 decoration-etyme-action-line hover:decoration-etyme-action-press">{l.text}</Link>
    )
    rest = rest.slice(at + l.text.length)
  }
  if (rest) parts.push(rest)
  return <>{parts}</>
}

function Links({ links }: { links?: AnswerLink[] }) {
  if (!links?.length) return null
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
      {links.map((l) => (
        <Link key={l.href + l.label} href={l.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">{l.label}</Link>
      ))}
    </p>
  )
}

type Acted = Record<string, { state: 'DONE' | 'LATER' | 'ERROR'; says: string }>

function Reply({ answer, firstName, seat, cards, deciding, onDecide, onLater, renewed, onRenew, acted, onAct, onActLater }: {
  answer: Answer
  firstName: string | null
  seat: string | null
  cards: Cards
  deciding: string | null
  onDecide: Decide
  onLater: (item: WaitingItem) => void
  renewed: Record<string, { ok: boolean; says: string }>
  onRenew: (card: WorkerCardFact) => void
  acted: Acted
  onAct: (card: QueueCard) => void
  onActLater: (card: QueueCard) => void
}) {
  switch (answer.kind) {
    case 'WORKER':
      return <WorkerReply answer={answer} firstName={firstName} deciding={deciding} renewed={renewed} onRenew={onRenew} acted={acted} onLater={(key) => onActLater({ key } as QueueCard)} />

    case 'LIST':
      return (
        <>
          <p>{answer.says}</p>
          {answer.table && <TableOf table={answer.table} />}
          <Links links={answer.links} />
        </>
      )

    case 'TEXT':
      return <><p>{answer.says}</p><Links links={answer.links} /></>

    case 'WHY':
      return (
        <>
          <p>{answer.says}</p>
          <p className="mt-2"><span className="font-medium">Rule: </span>{answer.ruleCited}</p>
          <p className="mt-1"><span className="font-medium">Why: </span>{answer.rationale}</p>
          <Links links={answer.links} />
        </>
      )

    case 'MODEL':
      return (
        <>
          <p className="whitespace-pre-line">{answer.says}</p>
          <p className="mt-2 text-[12px] text-etyme-muted">Written by the model from the ledger lines you can read. It describes; it does not act.</p>
          <Links links={answer.links} />
        </>
      )

    case 'NEEDS': {
      const hello = answer.greeting
        ? `${partOfDay(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.${seat ? ` ${seat}` : ''} `
        : ''
      return (
        <>
          {hello && <p>{hello.trim()}</p>}
          {/* Recommendation first, as a card; the fact under it. */}
          {answer.recommend && (
            <div className={`${hello ? 'mt-2' : ''} mb-2.5 rounded-[12px] border border-etyme-action-line bg-etyme-action-wash/60 px-3.5 py-2.5`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-etyme-action-press">Recommended</p>
              <p className="mt-0.5 font-medium"><Rich line={answer.recommend} /></p>
            </div>
          )}
          <p className={hello && !answer.recommend ? 'mt-2' : ''}><Rich line={{ says: answer.says, links: answer.saysLinks }} /></p>
          {(answer.queue ?? []).length > 0 && (
            <ol className="mt-2 flex flex-col gap-2">
              {answer.queue!.map((c) => (
                <QueueCardView key={c.key} card={c} done={acted[c.key]} busy={deciding === c.key} onAct={onAct} onLater={onActLater} />
              ))}
            </ol>
          )}
          {answer.items.length > 0 && (
            <ol className="mt-2 flex flex-col gap-2">
              {answer.items.map((item) => (
                <ActCard key={item.approvalId} item={item} card={cards[item.approvalId]} busy={deciding === item.approvalId} onDecide={onDecide} onLater={onLater} />
              ))}
            </ol>
          )}
          {(answer.held ?? []).length > 0 && (
            <ol className="mt-2 flex flex-col gap-2">
              {answer.held!.map((h) => <HeldCard key={h.invoiceId} held={h} />)}
            </ol>
          )}
          {(answer.more ?? []).map((line, i) => <p key={`${i}:${line.says}`} className="mt-2.5"><Rich line={line} /></p>)}
          <Links links={answer.links} />
        </>
      )
    }

    case 'CONFIRM':
      return (
        <>
          <p>{answer.says}</p>
          <ol className="mt-2">
            <ActCard
              item={answer.item}
              card={cards[answer.item.approvalId]}
              busy={deciding === answer.item.approvalId}
              onDecide={onDecide}
              onLater={onLater}
              only={answer.decision}
              reason={answer.reason}
            />
          </ol>
        </>
      )

    case 'VARIANCE':
      return (
        <>
          <p>{answer.says}</p>
          {answer.rows.length > 0 && <VarianceTable rows={answer.rows} />}
          <Links links={[
            ...answer.rows.flatMap((r) => r.receiptLinks.map((l) => ({ label: `Open ${l.label}`, href: l.href }))),
            { label: 'See the rule', href: RULES_HREF },
          ]} />
        </>
      )

    case 'TIME_LIMIT':
      return (
        <>
          <p>{answer.says}</p>
          {answer.rows.length > 0 && <LimitTable rows={answer.rows} />}
        </>
      )

    case 'SPEND':
      return (
        <>
          <p>{answer.says}</p>
          {answer.rows.length > 0 && <SpendTable rows={answer.rows} />}
          <Links links={answer.rows.flatMap((r) => r.receiptLinks.map((l) => ({ label: `Open ${l.label}`, href: l.href })))} />
        </>
      )

    case 'WEEKS':
      return (
        <>
          <p>{answer.says}</p>
          {answer.rows.length > 0 && <WeekTable rows={answer.rows} />}
          <Links links={answer.links} />
        </>
      )
  }
}

/**
 * An act Etyme needs a yes for, as a card inside the reply. Yes, Reject
 * with a reason (the ledger keeps it), or Not now, which changes nothing
 * and keeps it waiting. Drawn only for what the approval route already
 * accepts: the twin's own pending questions this seat may answer.
 */
function ActCard({ item, card, busy, onDecide, onLater, only, reason: given }: {
  item: WaitingItem
  card?: CardState
  busy: boolean
  onDecide: Decide
  onLater: (item: WaitingItem) => void
  /** From "approve 1" or "reject 1 because …": the one answer asked for. */
  only?: 'APPROVED' | 'REJECTED'
  reason?: string | null
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (item.bill) return <BillCard item={item} card={card} busy={busy} onDecide={onDecide} />
  if (item.pay) return <PayCard item={item} card={card} busy={busy} onDecide={onDecide} onLater={onLater} />

  const done = card && card.state !== 'ERROR'
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{only === 'REJECTED' ? 'Reject' : 'Approve'} {item.title}?</p>
      {item.askedYouBecause && <p className="mt-0.5 text-[12.5px] text-etyme-muted">{item.askedYouBecause}</p>}
      <p className="mt-0.5 text-[12.5px] text-etyme-muted">{item.says} {item.ruleCited}</p>
      <Links links={[{ label: `Open ${item.title}`, href: item.href }]} />
      {done ? (
        <p className="mt-2">
          <span className={`chip ${card.state === 'APPROVED' ? 'chip--verified' : 'chip--passive'}`}>
            {card.state === 'APPROVED' ? 'Approved' : card.state === 'REJECTED' ? 'Rejected' : card.state === 'OVERTAKEN' ? 'Closed' : 'Kept waiting'}
          </span>
          {card.state === 'LATER' && <span className="ml-2 text-[12.5px] text-etyme-muted">Nothing changed. Ask “What needs me today?” to see it again.</span>}
          {card.state === 'OVERTAKEN' && <span className="ml-2 text-[12.5px] text-etyme-muted">The record moved on before anybody answered, so there is nothing to approve.</span>}
        </p>
      ) : rejecting ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onDecide(item, 'REJECTED', reason.trim()) }}
        >
          <label htmlFor={`why-${item.approvalId}`} className="text-[12.5px] text-etyme-muted">Why not? Your reason is recorded under your name.</label>
          <Textarea id={`why-${item.approvalId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-secondary text-[13px]" disabled={busy || !reason.trim()}>{busy ? 'Recording…' : 'Reject with this reason'}</button>
            <button type="button" className="btn-secondary text-[13px]" onClick={() => setRejecting(false)}>Back</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {only === 'REJECTED' && given ? (
            <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => onDecide(item, 'REJECTED', given)}>
              {busy ? 'Recording…' : 'Yes, reject it'}
            </button>
          ) : (
            <>
              <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => onDecide(item, 'APPROVED', null)}>
                {busy ? 'Recording…' : 'Yes, approve it'}
              </button>
              {only !== 'APPROVED' && (
                <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
              )}
            </>
          )}
          <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => onLater(item)}>Not now</button>
        </div>
      )}
      {card?.state === 'ERROR' && <div className="mt-2"><FormMessage tone="error">{card.text}</FormMessage></div>}
    </li>
  )
}

/**
 * The twin asks to pay a supplier's invoice that passed the three-way
 * check (2026-10-26): "Pay Pinnacle Resourcing’s invoice PR-2026-0451?",
 * one box for the bank reference so the AP clerk can reconcile it, the
 * method if the person wants to say it, then Yes or Not now. Yes goes to
 * the one approval route with the reference; a blank one is refused there
 * in the sentence shown here beside the box, before anything is sent.
 */
function PayCard({ item, card, busy, onDecide, onLater }: {
  item: WaitingItem
  card?: CardState
  busy: boolean
  onDecide: Decide
  onLater: (item: WaitingItem) => void
}) {
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState('')
  const [blank, setBlank] = useState(false)
  const done = card && card.state !== 'ERROR'
  const id = `ref-${item.approvalId}`
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{payQuestion(item.pay!)}</p>
      {item.askedYouBecause && <p className="mt-0.5 text-[12.5px] text-etyme-muted">{item.askedYouBecause}</p>}
      {/* What the yes does, never the twin's "Approve it for payment" (walk three, 2026-10-26). */}
      <p className="mt-0.5 text-[12.5px] text-etyme-muted">{payYesSays(item.pay!)}</p>
      <Links links={[{ label: `Open ${item.title}`, href: item.href }]} />
      {done ? (
        <p className="mt-2">
          <span className={`chip ${card.state === 'APPROVED' ? 'chip--verified' : 'chip--passive'}`}>
            {card.state === 'APPROVED' ? 'Paid' : card.state === 'OVERTAKEN' ? 'Closed' : 'Kept waiting'}
          </span>
          {card.state === 'LATER' && <span className="ml-2 text-[12.5px] text-etyme-muted">Nothing was paid. Ask “What needs me today?” to see it again.</span>}
          {card.state === 'OVERTAKEN' && <span className="ml-2 text-[12.5px] text-etyme-muted">The record moved on before anybody answered, so there is nothing to pay.</span>}
        </p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reference.trim()) { setBlank(true); return }
            onDecide(item, 'APPROVED', null, { reference: reference.trim(), method: method || null })
          }}
        >
          <label htmlFor={id} className="text-[12.5px] text-etyme-muted">Bank reference</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              className="max-w-[16rem] text-[13px]"
              value={reference}
              maxLength={200}
              onChange={(e) => { setReference(e.target.value); if (e.target.value.trim()) setBlank(false) }}
              aria-describedby={blank ? `${id}-blank` : undefined}
            />
            <Select aria-label="Method, optional" className="w-auto text-[13px]" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Method (optional)</option>
              {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            {blank && <span id={`${id}-blank`} className="text-[12.5px] text-etyme-danger">{NEEDS_BANK_REFERENCE}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-[13px]" disabled={busy}>{busy ? 'Recording…' : 'Yes, pay it'}</button>
            <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => onLater(item)}>Not now</button>
          </div>
        </form>
      )}
      {card?.state === 'ERROR' && <div className="mt-2"><FormMessage tone="error">{card.text}</FormMessage></div>}
    </li>
  )
}

/**
 * A decision from the count, as a card (founder, 2026-10-19: every
 * decision in the count is a card). Its title names the person and the
 * step, one line of fact under it, then the act where one existing route
 * performs it — or Open, to the decision's own page, where no single
 * route does — and Not now on every card. Not now changes nothing on the
 * record: the decision stays in the count until somebody acts on it.
 */
function QueueCardView({ card, done, busy, onAct, onLater }: {
  card: QueueCard
  done?: { state: 'DONE' | 'LATER' | 'ERROR'; says: string }
  busy: boolean
  onAct: (card: QueueCard) => void
  onLater: (card: QueueCard) => void
}) {
  const settled = done && done.state !== 'ERROR'
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{card.title}</p>
      {card.fact && <p className="mt-0.5 text-[12.5px] text-etyme-muted">{card.fact}</p>}
      {settled ? (
        <p className="mt-2">
          <span className={`chip ${done.state === 'DONE' ? 'chip--verified' : 'chip--passive'}`}>{done.state === 'DONE' ? 'Done' : 'Kept waiting'}</span>
          <span className="ml-2 text-[12.5px] text-etyme-muted">{done.says}</span>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.act ? (
            <>
              <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => onAct(card)}>
                {busy ? 'Recording…' : card.act.label}
              </button>
              <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => onLater(card)}>Not now</button>
            </>
          ) : (
            // No single route says yes to it (a held start, a missing
            // agreement, a roll-off, a candidate to review): Open goes to
            // where it is decided, and Not now sets it aside for now, as on
            // every card in the count (founder, 2026-10-19).
            <>
              <Link href={card.href as Route} className="btn-primary text-[13px]">Open</Link>
              <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => onLater(card)}>Not now</button>
            </>
          )}
        </div>
      )}
      {done?.state === 'ERROR' && (
        <div className="mt-2">
          <FormMessage tone="error">{done.says}</FormMessage>
          <p className="mt-1 text-[12.5px]"><Link href={card.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">Open</Link></p>
        </div>
      )}
    </li>
  )
}

/** A firm's own book as a table: the first cell names the row and opens it. */
function TableOf({ table }: { table: ListTable }) {
  return (
    <ReplyTable caption={table.caption} head={table.head.map((label, i) => ({ label, n: i > 0 && /^(Days left|Hours|Still due)$/.test(label) }))}>
      {table.rows.map((r, i) => (
        <tr key={`${i}:${r.cells[0]}`}>
          <th scope="row" className={`${td} font-medium`}>
            {r.href ? <Link href={r.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">{r.cells[0]}</Link> : r.cells[0]}
          </th>
          {r.cells.slice(1).map((cell, j) => (
            <td key={j} className={/^(Days left|Hours|Still due)$/.test(table.head[j + 1] ?? '') ? tdN : td}>{cell}</td>
          ))}
        </tr>
      ))}
    </ReplyTable>
  )
}

/**
 * A bill Ask Etyme drafted, waiting for whoever sends bills. Send bill is
 * the yes, through the one approval route, and sends it exactly as the
 * Bills page's Submit does; Edit opens the draft on its own page; Not now
 * is a no, with a reason if the person gives one. A yes the three-way
 * check refuses shows the check's sentence and the card stays.
 */
function BillCard({ item, card, busy, onDecide }: { item: WaitingItem; card?: CardState; busy: boolean; onDecide: Decide }) {
  const [notNow, setNotNow] = useState(false)
  const [reason, setReason] = useState('')
  const b = item.bill!
  const rows = billRows(b)
  const done = card && card.state !== 'ERROR'
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{billCardTitle(b)}</p>
      {item.askedYouBecause && <p className="mt-0.5 text-[12.5px] text-etyme-muted">{item.askedYouBecause}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] tabular-nums">
        {rows.map((r, i) => (
          <div key={`${i}:${r.label}`} className="contents">
            <dt className="text-etyme-muted">{r.label}</dt>
            <dd className={r.label === 'Left off' ? 'text-etyme-attention' : ''}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {done ? (
        <p className="mt-2.5">
          <span className={`chip ${card.state === 'APPROVED' ? 'chip--verified' : 'chip--passive'}`}>
            {card.state === 'APPROVED' ? 'Sent' : card.state === 'OVERTAKEN' ? 'Closed' : 'Not sent'}
          </span>
          <span className="ml-2 text-[12.5px] text-etyme-muted">
            {card.state === 'APPROVED' ? billSentSays(b, card.number) : card.state === 'OVERTAKEN' ? 'The bill changed before anybody answered, so it was not sent from here.' : billKeptSays(b)}
          </span>
          <span className="ml-2 text-[12.5px]"><Link href={item.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">Open bill</Link></span>
        </p>
      ) : notNow ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); onDecide(item, 'REJECTED', reason.trim() || NOT_NOW_REASON) }}
        >
          <label htmlFor={`not-now-${item.approvalId}`} className="text-[12.5px] text-etyme-muted">Why not now? Optional. The bill stays a draft, and your answer is recorded under your name.</label>
          <Textarea id={`not-now-${item.approvalId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-secondary text-[13px]" disabled={busy}>{busy ? 'Recording…' : 'Keep it as a draft'}</button>
            <button type="button" className="btn-secondary text-[13px]" onClick={() => setNotNow(false)}>Back</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => onDecide(item, 'APPROVED', null)}>
            {busy ? 'Sending…' : 'Send bill'}
          </button>
          <Link href={item.href as Route} className="btn-secondary text-[13px]">Edit</Link>
          <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => setNotNow(true)}>Not now</button>
        </div>
      )}
      {card?.state === 'ERROR' && <div className="mt-2"><FormMessage tone="error">{card.text}</FormMessage></div>}
    </li>
  )
}

/** A bill the firm paying it put on hold: who, which bill, their reason, and the bill itself one tap away. */
function HeldCard({ held }: { held: HeldBill }) {
  return (
    <li className="rounded-[12px] border border-etyme-attention-line bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{heldBillTitle(held)}</p>
      <p className="mt-0.5 text-[13px]">{heldBillSays(held)}</p>
      {held.heldOn && <p className="mt-0.5 text-[12.5px] text-etyme-muted">On hold since {formatDay(held.heldOn)}.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={held.href as Route} className="btn-primary text-[13px]">Open bill</Link>
      </div>
    </li>
  )
}

/** A table inside a reply: scrolls sideways on a phone, figures tabular. */
function ReplyTable({ head, children, caption }: { head: { label: string; n?: boolean }[]; children: ReactNode; caption: string }) {
  return (
    <div className="my-2.5 overflow-x-auto rounded-[10px] border border-etyme-rule bg-etyme-raised">
      <table className="w-full min-w-[440px] text-left text-[13px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-etyme-surface">
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" className={`border-b border-etyme-rule px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-etyme-muted ${h.n ? 'text-right' : ''}`}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">{children}</tbody>
      </table>
    </div>
  )
}

const td = 'border-b border-etyme-rule px-3 py-2'
const tdN = `${td} text-right`

function VarianceTable({ rows }: { rows: VarianceRow[] }) {
  const notAccepted = rows.some((r) => r.hoursNotAccepted > 0)
  return (
    <>
      <ReplyTable
        caption="Invoice mismatches by supplier"
        head={[{ label: 'Supplier' }, { label: 'Receipts', n: true }, { label: 'Match', n: true }, { label: 'Do not match', n: true }, { label: 'Hours over approved', n: true }]}
      >
        {rows.map((r) => {
          const off = r.mismatch + r.held
          return (
            <tr key={r.supplier}>
              <th scope="row" className={`${td} font-medium`}>{r.supplier}</th>
              <td className={tdN}>{r.receipts}</td>
              <td className={tdN}>{r.clean}</td>
              <td className={`${tdN} ${off > 0 ? 'font-semibold text-etyme-attention' : ''}`}>{off}{r.held > 0 ? ` (${r.held} held)` : ''}</td>
              <td className={`${tdN} ${(r.hoursOverAccepted ?? 0) > 0 ? 'font-semibold text-etyme-attention' : ''}`}>
                {r.hoursOverAccepted == null ? 'No timesheet approved yet' : hrs(r.hoursOverAccepted)}
              </td>
            </tr>
          )
        })}
      </ReplyTable>
      {notAccepted && (
        <p className="text-[12px] text-etyme-muted">Hours billed on timesheets nobody has approved are not counted as over; they hold the invoice until the timesheet is approved.</p>
      )}
    </>
  )
}

function LimitTable({ rows }: { rows: LimitRow[] }) {
  return (
    <ReplyTable
      caption="Contractors near the time limit"
      head={[{ label: 'Contractor' }, { label: 'Days left', n: true }, { label: 'Limit reached' }, { label: 'Suppliers' }]}
    >
      {rows.map((r) => (
        <tr key={r.personId}>
          <th scope="row" className={`${td} font-medium`}>
            <Link href={r.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">{r.name}</Link>
          </th>
          <td className={`${tdN} ${r.daysToLimit <= 30 ? 'font-semibold text-etyme-attention' : ''}`}>{r.daysToLimit > 0 ? r.daysToLimit : 'At the limit'}</td>
          <td className={td}>{formatDay(r.limitOn)}</td>
          <td className={td}>{r.suppliers.length ? r.suppliers.join(', ') : '—'}</td>
        </tr>
      ))}
    </ReplyTable>
  )
}

function SpendTable({ rows }: { rows: SpendRow[] }) {
  return (
    <ReplyTable
      caption="Spend by supplier"
      head={[{ label: 'Supplier' }, { label: 'Invoice receipts', n: true }, { label: 'Billed', n: true }, { label: 'Paid', n: true }]}
    >
      {rows.map((r) => (
        <tr key={`${r.supplier}-${r.currency}`}>
          <th scope="row" className={`${td} font-medium`}>{r.supplier}</th>
          <td className={tdN}>{r.receipts}</td>
          <td className={tdN}>{money(r.billedMinor, r.currency)}</td>
          <td className={tdN}>{money(r.paidMinor, r.currency)}</td>
        </tr>
      ))}
    </ReplyTable>
  )
}

function WeekTable({ rows }: { rows: WeekRow[] }) {
  return (
    <ReplyTable
      caption="Timesheets waiting for approval"
      head={[{ label: 'Contractor' }, { label: 'Week' }, { label: 'Hours', n: true }, { label: 'Waiting', n: true }]}
    >
      {rows.map((r) => (
        <tr key={r.timesheetId}>
          <th scope="row" className={`${td} font-medium`}>
            <Link href={r.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">{r.person}</Link>
          </th>
          <td className={td}>{formatRange(r.periodStart, r.periodEnd)}</td>
          <td className={tdN}>{hrs(r.hours)}</td>
          <td className={`${tdN} ${r.waitingDays > 5 ? 'font-semibold text-etyme-attention' : ''}`}>{r.waitingDays} day{r.waitingDays === 1 ? '' : 's'}</td>
        </tr>
      ))}
    </ReplyTable>
  )
}

/**
 * A worker's reply: her name, the chain she works through, what to do
 * first, the cards, where her weeks stand. Every card opens her own page;
 * Renew is her own press on her bench route. Nothing here asks the
 * approval route, because nothing here is the twin's to do.
 */
function WorkerReply({ answer, firstName, deciding, renewed, onRenew, acted, onLater }: {
  answer: WorkerAnswer
  firstName: string | null
  deciding: string | null
  renewed: Record<string, { ok: boolean; says: string }>
  onRenew: (card: WorkerCardFact) => void
  acted: Acted
  onLater: (key: string) => void
}) {
  const hello = answer.greeting ? `${partOfDay(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.` : null
  return (
    <>
      {hello && <p>{hello}</p>}
      {(answer.where ?? []).map((w) => <p key={w} className="mt-0.5 text-[13px] text-etyme-muted">{w}</p>)}
      {answer.recommend && (
        <div className={`${hello ? 'mt-2' : ''} mb-2.5 rounded-[12px] border border-etyme-action-line bg-etyme-action-wash/60 px-3.5 py-2.5`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-etyme-action-press">Recommended</p>
          <p className="mt-0.5 font-medium"><Rich line={answer.recommend} /></p>
        </div>
      )}
      <p className={hello && !answer.recommend ? 'mt-2' : ''}>{answer.says}</p>
      {answer.cards.length > 0 && (
        <ol className="mt-2 flex flex-col gap-2">
          {answer.cards.map((c) => (
            <WorkerCardView key={c.key} card={c} busy={deciding === c.key} done={renewed[c.key]} onRenew={onRenew} />
          ))}
        </ol>
      )}
      {answer.note && <p className="mt-1.5 text-[12.5px] text-etyme-muted">{answer.note}</p>}
      {answer.table && (
        <ReplyTable caption={answer.table.caption} head={answer.table.head.map((label, i) => ({ label, n: i > 0 && i < answer.table!.head.length - 1 }))}>
          {answer.table.rows.map((r, i) => (
            <tr key={`${i}:${r.cells[0]}`}>
              <th scope="row" className={`${td} font-medium`}>
                {r.href
                  ? <Link href={r.href as Route} className="text-etyme-action-press underline-offset-2 hover:underline">{r.cells[0]}</Link>
                  : r.cells[0]}
              </th>
              {r.cells.slice(1).map((cell, j) => (
                <td key={j} className={j < r.cells.length - 2 ? tdN : td}>{cell}</td>
              ))}
            </tr>
          ))}
        </ReplyTable>
      )}
      {answer.more.map((line, i) => <p key={`${i}:${line.says}`} className="mt-2.5"><Rich line={line} /></p>)}
      {/* Papers that do not stop her work, after her week and her pay: one line, a card each with Upload and Later. */}
      {answer.papers && (
        <>
          <p className="mt-2.5">{answer.papers.says}</p>
          <ol className="mt-2 flex flex-col gap-2">
            {answer.papers.cards.map((c) => (
              <WorkerCardView key={c.key} card={c} busy={deciding === c.key} done={renewed[c.key]} onRenew={onRenew}
                later={acted[c.key]?.state === 'LATER'} onLater={() => onLater(c.key)} />
            ))}
          </ol>
        </>
      )}
      {(answer.tail ?? []).map((line, i) => <p key={`t${i}:${line.says}`} className="mt-2.5"><Rich line={line} /></p>)}
      <Links links={answer.links} />
    </>
  )
}

/** One thing that is hers to do: what, why, and the button that opens it. */
function WorkerCardView({ card, busy, done, onRenew, later, onLater }: {
  card: WorkerCardFact
  busy: boolean
  done?: { ok: boolean; says: string }
  onRenew: (card: WorkerCardFact) => void
  /** A paper put off with Later: nothing changes on the record; it stays on Your paperwork. */
  later?: boolean
  onLater?: () => void
}) {
  if (later) {
    return (
      <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
        <p className="font-medium">{card.title}</p>
        <p className="mt-2"><span className="chip chip--passive">Later</span><span className="ml-2 text-[12.5px] text-etyme-muted">It stays on Your paperwork.</span></p>
      </li>
    )
  }
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{card.title}</p>
      <p className="mt-0.5 text-[13px] text-etyme-muted">{card.says}</p>
      {done?.ok ? (
        <p className="mt-2">
          <span className="chip chip--verified">Renewed</span>
          <span className="ml-2 text-[12.5px] text-etyme-muted">{done.says}</span>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.act === 'RENEW' ? (
            <>
              <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => onRenew(card)}>
                {busy ? 'Renewing…' : card.button}
              </button>
              <Link href={card.href as Route} className="btn-secondary text-[13px]">Open Who has you</Link>
            </>
          ) : (
            <>
              <Link href={card.href as Route} className="btn-primary text-[13px]">{card.button}</Link>
              {onLater && <button type="button" className="btn-secondary text-[13px]" onClick={onLater}>Later</button>}
            </>
          )}
        </div>
      )}
      {done && !done.ok && <div className="mt-2"><FormMessage tone="error">{done.says}</FormMessage></div>}
    </li>
  )
}
