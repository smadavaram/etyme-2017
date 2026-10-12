'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useSession } from '@/components/session-provider'
import { EtymeMark } from '@/components/logo'
import { RefusedState, Textarea, FormMessage } from '@/components/ui'
import { statusMeans } from '@/lib/read-response'
import { formatDay, formatRange } from '@/lib/format-date'
import {
  SUGGESTED_QUESTIONS, FOOTER_LINE, decisionRequest, entryHref, hrs, money, partOfDay,
  type Answer, type Link as AnswerLink, type WaitingItem, type VarianceRow, type LimitRow, type SpendRow, type WeekRow,
} from '@/app/api/conversations/twin/ask'

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
 * The thread lives for this page load only (KNOWN-LIMITS.md, "Ask Etyme"):
 * a stored thread needs a per-person conversation the schema does not
 * have yet.
 */

type Turn =
  | { id: number; from: 'you'; text: string }
  | { id: number; from: 'etyme'; answer: Answer }
  | { id: number; from: 'note'; text: string }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What happened to a card: answered (with the words), kept waiting, or refused by the route. */
type CardState = { state: 'APPROVED' | 'REJECTED' | 'LATER' } | { state: 'ERROR'; text: string }
type Cards = Record<string, CardState>

type Decide = (item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null) => void

/** The twin's numbers, the hours tolerance among them: the architect's rules page. */
const RULES_HREF = '/dashboard/twin/rules'

const SUBTITLE = 'Answers from your record and its rules. Anything it does is in the twin’s ledger.'

export function AskEtyme() {
  const session = useSession()
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(true)
  const [refused, setRefused] = useState<string | null>(null)
  const [cards, setCards] = useState<Cards>({})
  const [deciding, setDeciding] = useState<string | null>(null)
  const next = useRef(1)
  const end = useRef<HTMLDivElement>(null)
  const firstName = session.person?.name?.trim().split(/\s+/)[0] ?? null

  const add = (t: DistributiveOmit<Turn, 'id'>) => setTurns((all) => [...all, { ...t, id: next.current++ } as Turn])

  // The greeting: what needs this seat today, from the ledger and the rules.
  useEffect(() => {
    let live = true
    fetch('/api/conversations/twin')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!live) return
        if (res.status === 401 || res.status === 403) { setRefused(body?.error?.message ?? statusMeans(res.status)); return }
        if (!res.ok || !body?.data?.answer) { add({ from: 'note', text: body?.error?.message ?? statusMeans(res.status) }); return }
        add({ from: 'etyme', answer: body.data.answer as Answer })
      })
      .catch(() => { if (live) add({ from: 'note', text: 'Etyme could not be reached. Check your connection, then ask a question.' }) })
      .finally(() => { if (live) setPending(false) })
    return () => { live = false }
  }, [])

  // Newest at the bottom, and the thread follows it.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, pending])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || pending) return
    add({ from: 'you', text: q })
    setText('')
    setPending(true)
    try {
      const res = await fetch('/api/conversations/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 401 || res.status === 403) { setRefused(body?.error?.message ?? statusMeans(res.status)); return }
      if (!res.ok || !body?.data?.answer) { add({ from: 'note', text: body?.error?.message ?? statusMeans(res.status) }); return }
      add({ from: 'etyme', answer: body.data.answer as Answer })
    } catch {
      add({ from: 'note', text: 'Your question did not reach Etyme. Check your connection and ask again.' })
    } finally {
      setPending(false)
    }
  }

  /** A yes or a no, through the one approval route. Nothing else here writes. */
  const decide: Decide = async (item, decision, reason) => {
    setDeciding(item.approvalId)
    const { url, init } = decisionRequest(item.approvalId, decision, reason)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setCards((c) => ({ ...c, [item.approvalId]: { state: 'ERROR', text: body?.error?.message ?? statusMeans(res.status) } }))
        return
      }
      setCards((c) => ({ ...c, [item.approvalId]: { state: decision } }))
      const entry: string | null = typeof body?.data?.ledgerEntryId === 'string' ? body.data.ledgerEntryId : null
      add({
        from: 'etyme',
        answer: {
          kind: 'TEXT',
          says: `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} ${item.title}. ${body?.data?.note ?? ''}`.trim(),
          links: [
            { label: `Open ${item.title}`, href: item.href },
            ...(entry ? [{ label: 'See it in the ledger', href: entryHref(entry) }] : []),
          ],
        },
      })
    } catch {
      setCards((c) => ({ ...c, [item.approvalId]: { state: 'ERROR', text: 'Your answer did not reach Etyme, so nothing changed. Try again.' } }))
    } finally {
      setDeciding(null)
    }
  }

  const later = (item: WaitingItem) => setCards((c) => ({ ...c, [item.approvalId]: { state: 'LATER' } }))

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
      <header className="flex items-center gap-2 border-b border-etyme-rule bg-etyme-surface px-3 py-2.5 sm:px-4">
        <Link
          href={'/dashboard/conversations' as Route}
          aria-label="Back to Conversations"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-etyme-rule bg-etyme-raised text-etyme-ink md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center md:text-left">
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
            <ol className="mx-auto flex max-w-[760px] flex-col gap-5" aria-live="polite">
              {turns.map((t) => (
                <li key={t.id}>
                  {t.from === 'you' && (
                    <div className="flex justify-end">
                      <p className="max-w-[80%] whitespace-pre-line rounded-[16px_16px_4px_16px] bg-etyme-action-wash px-3.5 py-2.5 text-[14.5px] text-etyme-ink">{t.text}</p>
                    </div>
                  )}
                  {t.from === 'note' && <FromEtyme><FormMessage tone="error">{t.text}</FormMessage></FromEtyme>}
                  {t.from === 'etyme' && (
                    <FromEtyme>
                      <Reply answer={t.answer} firstName={firstName} cards={cards} deciding={deciding} onDecide={decide} onLater={later} />
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
                {SUGGESTED_QUESTIONS.map((q) => (
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
                <label htmlFor="ask-etyme-box" className="sr-only">Ask Etyme about your program</label>
                <textarea
                  id="ask-etyme-box"
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKey}
                  maxLength={2000}
                  placeholder="Ask Etyme about your program…"
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
              <p className="mt-2 text-center text-[12px] leading-snug text-etyme-faint">{FOOTER_LINE}</p>
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

function Reply({ answer, firstName, cards, deciding, onDecide, onLater }: {
  answer: Answer
  firstName: string | null
  cards: Cards
  deciding: string | null
  onDecide: Decide
  onLater: (item: WaitingItem) => void
}) {
  switch (answer.kind) {
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
        ? `${partOfDay(new Date().getHours())}${firstName ? `, ${firstName}` : ''}. `
        : ''
      return (
        <>
          <p>{hello}{answer.says}</p>
          {answer.items.length > 0 && (
            <ol className="mt-2 flex flex-col gap-2">
              {answer.items.map((item) => (
                <ActCard key={item.approvalId} item={item} card={cards[item.approvalId]} busy={deciding === item.approvalId} onDecide={onDecide} onLater={onLater} />
              ))}
            </ol>
          )}
          {(answer.more ?? []).map((line) => <p key={line} className="mt-2.5">{line}</p>)}
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

  const done = card && card.state !== 'ERROR'
  return (
    <li className="rounded-[12px] border border-etyme-rule bg-etyme-raised px-3.5 py-3">
      <p className="font-medium">{only === 'REJECTED' ? 'Reject' : 'Approve'} {item.title}?</p>
      <p className="mt-0.5 text-[12.5px] text-etyme-muted">{item.says} {item.ruleCited}</p>
      <Links links={[{ label: `Open ${item.title}`, href: item.href }]} />
      {done ? (
        <p className="mt-2">
          <span className={`chip ${card.state === 'APPROVED' ? 'chip--verified' : 'chip--passive'}`}>
            {card.state === 'APPROVED' ? 'Approved' : card.state === 'REJECTED' ? 'Rejected' : 'Kept waiting'}
          </span>
          {card.state === 'LATER' && <span className="ml-2 text-[12.5px] text-etyme-muted">Nothing changed. Ask “What needs me today?” to see it again.</span>}
        </p>
      ) : rejecting ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onDecide(item, 'REJECTED', reason.trim()) }}
        >
          <label htmlFor={`why-${item.approvalId}`} className="text-[12.5px] text-etyme-muted">Why not? Your reason goes in the twin’s ledger under your name.</label>
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
        caption="Invoice variance by supplier"
        head={[{ label: 'Supplier' }, { label: 'Receipts', n: true }, { label: 'Clean', n: true }, { label: 'Not clean', n: true }, { label: 'Hours over accepted', n: true }]}
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
                {r.hoursOverAccepted == null ? 'No week accepted yet' : hrs(r.hoursOverAccepted)}
              </td>
            </tr>
          )
        })}
      </ReplyTable>
      {notAccepted && (
        <p className="text-[12px] text-etyme-muted">Hours billed on weeks nobody has accepted are not counted as over; they hold the receipt until the week is accepted.</p>
      )}
    </>
  )
}

function LimitTable({ rows }: { rows: LimitRow[] }) {
  return (
    <ReplyTable
      caption="People near the time limit"
      head={[{ label: 'Person' }, { label: 'Days left', n: true }, { label: 'Limit reached' }, { label: 'Suppliers' }]}
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
      caption="Weeks waiting for a signature"
      head={[{ label: 'Person' }, { label: 'Week' }, { label: 'Hours', n: true }, { label: 'Waiting', n: true }]}
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
