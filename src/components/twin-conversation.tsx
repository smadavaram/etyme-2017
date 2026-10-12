'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { Field, Textarea, SubmitButton, FormMessage, LoadingState, RefusedState } from '@/components/ui'
import { statusMeans } from '@/lib/read-response'
import {
  RULE_QUESTIONS, decisionRequest, hrs,
  type Answer, type Link as AnswerLink, type WaitingItem, type VarianceRow,
} from '@/app/api/conversations/twin/ask'

/**
 * The twin's conversation, Door 2 (CLAUDE.md, "The job twin"): a chat
 * over the twin's ledger for the signed-in seat.
 *
 * Asks go to POST /api/conversations/twin, which answers the rule
 * questions from the ledger and anything else through the model, and
 * writes nothing. A yes or a no is sent from here to the one approval
 * route the web and Teams share, POST /api/twin/approvals/:id with the
 * surface named, and the panel confirms it in the words the button used.
 *
 * Phone-first: one column, the box at the bottom, tables scroll sideways.
 */

type Turn =
  | { id: number; from: 'you'; text: string }
  | { id: number; from: 'twin'; answer: Answer }
  | { id: number; from: 'note'; tone: 'ok' | 'error'; text: string }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

type Decided = Record<string, { tone: 'ok' | 'error'; text: string }>

export function TwinConversation({ companyId }: { companyId?: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [decided, setDecided] = useState<Decided>({})
  const [deciding, setDeciding] = useState<string | null>(null)
  const next = useRef(1)

  const add = (t: DistributiveOmit<Turn, 'id'>) => setTurns((all) => [...all, { ...t, id: next.current++ } as Turn])

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
        body: JSON.stringify({ text: q, ...(companyId ? { companyId } : {}) }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 401 || res.status === 403) {
        setRefused(body?.error?.message ?? statusMeans(res.status))
        return
      }
      if (!res.ok || !body?.data?.answer) {
        add({ from: 'note', tone: 'error', text: body?.error?.message ?? statusMeans(res.status) })
        return
      }
      add({ from: 'twin', answer: body.data.answer as Answer })
    } catch {
      add({ from: 'note', tone: 'error', text: 'The twin could not be reached. Check your connection and ask again.' })
    } finally {
      setPending(false)
    }
  }

  /** A yes or a no, through the one approval route. Nothing else here writes. */
  async function decide(item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null) {
    setDeciding(item.approvalId)
    const { url, init } = decisionRequest(item.approvalId, decision, reason)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setDecided((d) => ({ ...d, [item.approvalId]: { tone: 'error', text: body?.error?.message ?? statusMeans(res.status) } }))
        return
      }
      const done = decision === 'APPROVED'
        ? `Approved ${item.title}. ${body?.data?.note ?? ''}`.trim()
        : `Rejected ${item.title}. ${body?.data?.note ?? ''}`.trim()
      setDecided((d) => ({ ...d, [item.approvalId]: { tone: 'ok', text: done } }))
    } catch {
      setDecided((d) => ({ ...d, [item.approvalId]: { tone: 'error', text: 'Your answer did not reach Etyme, so nothing changed. Try again.' } }))
    } finally {
      setDeciding(null)
    }
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

  if (refused) return <RefusedState says={refused} />

  return (
    <section aria-label="Ask the twin" className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3" aria-live="polite">
        {turns.length === 0 && (
          <li className="text-[13.5px] leading-relaxed text-etyme-muted">
            Ask what needs you, why the twin did something, or how invoice receipts compare by supplier.
            Approve and reject happen here too, and every answer is recorded in the twin’s ledger under your name.
          </li>
        )}
        {turns.map((t) => (
          <li key={t.id}>
            {t.from === 'you' && (
              <p className="ml-auto max-w-[85%] rounded-panel bg-etyme-sunk px-3 py-2 text-[14px] text-etyme-ink">{t.text}</p>
            )}
            {t.from === 'note' && <FormMessage tone={t.tone}>{t.text}</FormMessage>}
            {t.from === 'twin' && (
              <TwinAnswer answer={t.answer} decided={decided} deciding={deciding} onDecide={decide} />
            )}
          </li>
        ))}
        {pending && <li><LoadingState compact says="Reading the ledger…" /></li>}
      </ol>

      <div className="flex flex-wrap gap-2">
        {RULE_QUESTIONS.map((q) => (
          <button key={q} type="button" className="btn-secondary text-[13px]" disabled={pending} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Ask the twin" help="For example: approve 1, or reject 1 because the hours are over.">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={2000} />
          </Field>
        </div>
        <SubmitButton pending={pending} pendingLabel="Asking…" disabled={!text.trim()}>Ask</SubmitButton>
      </form>
    </section>
  )
}

function Links({ links }: { links?: AnswerLink[] }) {
  if (!links?.length) return null
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
      {links.map((l) => (
        <Link key={l.href + l.label} href={l.href as Route} className="text-etyme-action underline-offset-2 hover:underline">{l.label}</Link>
      ))}
    </p>
  )
}

function Bubble({ children }: { children: ReactNode }) {
  return <div className="max-w-full rounded-panel border border-etyme-rule bg-etyme-surface px-3 py-3 text-[14px] leading-relaxed text-etyme-ink">{children}</div>
}

function TwinAnswer({ answer, decided, deciding, onDecide }: {
  answer: Answer
  decided: Decided
  deciding: string | null
  onDecide: (item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null) => void
}) {
  switch (answer.kind) {
    case 'TEXT':
      return <Bubble><p>{answer.says}</p><Links links={answer.links} /></Bubble>

    case 'WHY':
      return (
        <Bubble>
          <p>{answer.says}</p>
          <p className="mt-2"><span className="font-medium">Rule: </span>{answer.ruleCited}</p>
          <p className="mt-1"><span className="font-medium">Why: </span>{answer.rationale}</p>
          <Links links={answer.links} />
        </Bubble>
      )

    case 'MODEL':
      return (
        <Bubble>
          <p className="whitespace-pre-line">{answer.says}</p>
          <p className="mt-2 text-[12px] text-etyme-muted">Written by the model from the ledger lines you can read. It describes; it does not act.</p>
          <Links links={answer.links} />
        </Bubble>
      )

    case 'NEEDS':
      return (
        <Bubble>
          <p>{answer.says}</p>
          {answer.items.length > 0 && (
            <ol className="mt-3 flex flex-col gap-3">
              {answer.items.map((item) => (
                <WaitingCard key={item.approvalId} item={item} done={decided[item.approvalId]} busy={deciding === item.approvalId} onDecide={onDecide} />
              ))}
            </ol>
          )}
        </Bubble>
      )

    case 'CONFIRM': {
      const done = decided[answer.item.approvalId]
      return (
        <Bubble>
          <p>{answer.says}</p>
          <Links links={[{ label: 'Open it', href: answer.item.href }]} />
          {done?.tone === 'ok' ? (
            <div className="mt-2"><FormMessage tone="ok">{done.text}</FormMessage></div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <SubmitButton
                type="button"
                tone={answer.decision === 'APPROVED' ? 'primary' : 'secondary'}
                pending={deciding === answer.item.approvalId}
                onClick={() => onDecide(answer.item, answer.decision, answer.reason)}
              >
                {answer.decision === 'APPROVED' ? `Approve ${answer.item.title}` : `Reject ${answer.item.title}`}
              </SubmitButton>
              {done && <FormMessage tone="error">{done.text}</FormMessage>}
            </div>
          )}
        </Bubble>
      )
    }

    case 'VARIANCE':
      return (
        <Bubble>
          <p>{answer.says}</p>
          {answer.rows.length > 0 && <VarianceTable rows={answer.rows} label={answer.period.label} />}
        </Bubble>
      )
  }
}

function WaitingCard({ item, done, busy, onDecide }: {
  item: WaitingItem
  done?: { tone: 'ok' | 'error'; text: string }
  busy: boolean
  onDecide: (item: WaitingItem, decision: 'APPROVED' | 'REJECTED', reason: string | null) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <li className="rounded-panel border border-etyme-rule bg-etyme-raised px-3 py-3">
      <p className="font-medium">{item.n}. {item.title}</p>
      <p className="mt-1 text-[13px] text-etyme-muted">{item.says}</p>
      <p className="mt-1 text-[13px]"><span className="font-medium">Rule: </span>{item.ruleCited}</p>
      <Links links={[{ label: 'Open it', href: item.href }]} />
      {done?.tone === 'ok' ? (
        <div className="mt-2"><FormMessage tone="ok">{done.text}</FormMessage></div>
      ) : rejecting ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onDecide(item, 'REJECTED', reason.trim()) }}
        >
          <Field label="Why are you rejecting it?" help="The reason is recorded in the twin’s ledger under your name.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton tone="secondary" pending={busy} disabled={!reason.trim()}>Reject with this reason</SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => setRejecting(false)}>Keep it waiting</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <SubmitButton type="button" pending={busy} onClick={() => onDecide(item, 'APPROVED', null)}>Approve</SubmitButton>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
        </div>
      )}
      {done?.tone === 'error' && <div className="mt-2"><FormMessage tone="error">{done.text}</FormMessage></div>}
    </li>
  )
}

function VarianceTable({ rows, label }: { rows: VarianceRow[]; label: string }) {
  const notAccepted = rows.some((r) => r.hoursNotAccepted > 0)
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[13px] tabular-nums">
        <caption className="mb-2 text-left text-[12px] text-etyme-muted">
          Invoice variance by supplier, {label}: the receipts the twin recorded, read again through its rule.
        </caption>
        <thead className="text-[11px] uppercase tracking-wide text-etyme-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Supplier</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">Receipts</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">Clean</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">Not clean</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">Hours over accepted</th>
            <th scope="col" className="py-1 font-medium">Open a receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.supplier} className="border-t border-etyme-rule align-top">
              <th scope="row" className="py-2 pr-3 font-medium">{r.supplier}</th>
              <td className="py-2 pr-3 text-right">{r.receipts}</td>
              <td className="py-2 pr-3 text-right">{r.clean}</td>
              <td className={`py-2 pr-3 text-right ${r.mismatch + r.held > 0 ? 'text-etyme-attention' : ''}`}>
                {r.mismatch + r.held}{r.held > 0 ? ` (${r.held} held)` : ''}
              </td>
              <td className="py-2 pr-3 text-right">
                {r.hoursOverAccepted == null ? 'No week accepted yet' : hrs(r.hoursOverAccepted)}
              </td>
              <td className="py-2">
                <span className="flex flex-wrap gap-x-2">
                  {r.receiptLinks.map((l) => (
                    <Link key={l.href} href={l.href as Route} className="text-etyme-action underline-offset-2 hover:underline">{l.label}</Link>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {notAccepted && (
        <p className="mt-2 text-[12px] text-etyme-muted">
          Hours billed on weeks nobody has accepted are not counted as over; they hold the receipt until the week is accepted.
        </p>
      )}
    </div>
  )
}
