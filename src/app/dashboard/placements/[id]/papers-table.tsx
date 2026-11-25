'use client'

import { PaperDoorButtons } from '@/app/dashboard/documents/paper-doors'
import type { PaperDoors } from '@/lib/document-stages/paper-doors'
import { formatDay } from '@/lib/format-date'
import { inSentence } from '@/lib/document-stages'

/**
 * "Papers for this line" (record 117, step 2): one table per side, one row
 * per paper, drawn from the placement route's checklist. The route's own
 * state decides what stands; the facts beside it (asked, received,
 * examined, the provider's word) only say what happened.
 *
 * Asking again is the existing Ask door, drawn by PaperDoorButtons, and a
 * screening row has none: its verdict is a third party's, so it is shown
 * word for word with the provider, reference and date.
 */
export interface Facted {
  asked?: { when: string; via: string; firmId: string | null; firmName: string | null } | null
  received?: { when: string; fileName: string | null; firmId: string | null; firmName: string | null } | null
  examined?: { state: 'NOT_EXAMINED' | 'ACCEPTED' | 'SENT_BACK'; by: string | null; when: string | null; firmId: string | null; firmName: string | null } | null
  verdict?: { word: string | null; provider: string | null; reference: string | null; date: string | null } | null
}

export interface PaperRow extends Facted {
  key: string
  label: string
  required: boolean
  state: string
  note: string
  blocks: boolean
  owedByRole?: string
  owedByName?: string | null
  renderedBy?: string | null
  renderedSays?: string | null
}

/** A firm the reader may not name is said as what it is to them. */
const firmWords = (f: { firmName: string | null }) => f.firmName ?? 'the supplier’s supplier'

export function askedWords(it: Facted): string {
  if (!it.asked) return '—'
  return `${formatDay(it.asked.when)} by ${firmWords(it.asked)}`
}

export function receivedWords(it: Facted): string {
  if (!it.received) return '—'
  return `${formatDay(it.received.when)}${it.received.fileName ? ` · ${it.received.fileName}` : ''}`
}

export function examinedWords(it: Facted): string {
  const v = it.verdict
  if (v && (v.word || v.provider || v.reference || v.date)) {
    return [v.word ? `“${v.word}”` : null, v.provider, v.reference ? `ref. ${v.reference}` : null, v.date ? formatDay(v.date) : null].filter(Boolean).join(' · ')
  }
  const e = it.examined
  if (!e) return '—'
  if (e.state === 'NOT_EXAMINED') return 'Arrived, not examined'
  const what = e.state === 'ACCEPTED' ? 'Accepted' : 'Sent back'
  return [what, e.by ? `by ${e.by}` : null, e.when ? formatDay(e.when) : null].filter(Boolean).join(' · ')
}

/** What is missing, in the checklist's own words; nothing where the paper stands. */
export function missingWords(it: PaperRow): string {
  return it.state === 'ALREADY_HELD' ? '—' : it.note || 'Missing'
}

const OWED: Record<string, string> = { WORKER: 'The worker', SUPPLIER: 'The supplier', CUSTOMER: 'The customer', US: 'Us' }
export const owedWords = (it: PaperRow) => (it.state === 'ALREADY_HELD' ? '—' : it.owedByName ?? (it.owedByRole ? OWED[it.owedByRole] ?? it.owedByRole : '—'))

/** The customer's papers, and the worker's and supplier's. */
export function sidesOf(items: PaperRow[]): { title: string; items: PaperRow[] }[] {
  const customer = items.filter((i) => i.owedByRole === 'CUSTOMER')
  const rest = items.filter((i) => i.owedByRole !== 'CUSTOMER')
  return [
    ...(customer.length ? [{ title: 'The customer’s papers', items: customer }] : []),
    ...(rest.length ? [{ title: 'The worker’s and supplier’s papers', items: rest }] : []),
  ]
}

export function PapersTable({ items, paperDoors, onDone }: {
  items: PaperRow[]
  paperDoors?: Record<string, PaperDoors>
  onDone: (says: string) => void
}) {
  return (
    <div className="space-y-4">
      {sidesOf(items).map((side) => (
        <section key={side.title} aria-label={`Papers for this line: ${side.title}`}>
          <h4 className="lbl mb-1">Papers for this line · {side.title}</h4>
          <div className="overflow-scroll-x">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-etyme-rule text-left">
                  <th className="lbl pb-2 pr-3">Paper</th>
                  <th className="lbl pb-2 pr-3">Asked</th>
                  <th className="lbl pb-2 pr-3">Received</th>
                  <th className="lbl pb-2 pr-3">Examined</th>
                  <th className="lbl pb-2 pr-3">Missing</th>
                  <th className="lbl pb-2">Owed by</th>
                </tr>
              </thead>
              <tbody>
                {side.items.map((it) => {
                  const doors = paperDoors?.[it.key]
                  return (
                    <tr key={it.key} className="border-b border-etyme-rule align-top" title={it.note}>
                      <td className="py-2 pr-3 text-etyme-ink">
                        {inSentence(it.label)}
                        {it.state === 'ALREADY_HELD' && <span className="ml-1 text-etyme-verified">on file</span>}
                        {doors && (doors.doors.length > 0 || doors.says) && (
                          <div className="mt-1"><PaperDoorButtons doors={doors} onDone={onDone} /></div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-etyme-muted">{askedWords(it)}</td>
                      <td className="py-2 pr-3 text-etyme-muted">{receivedWords(it)}</td>
                      <td className="py-2 pr-3 text-etyme-muted">{examinedWords(it)}</td>
                      <td className={`py-2 pr-3 ${it.blocks ? 'text-etyme-danger' : 'text-etyme-muted'}`}>{missingWords(it)}</td>
                      <td className="py-2 text-etyme-muted">{owedWords(it)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="text-[12px] text-etyme-faint">Requests are matched by person and firm, so two lines for the same person at the same firm show the same requests.</p>
    </div>
  )
}
