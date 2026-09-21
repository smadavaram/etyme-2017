'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { readJson } from '@/lib/read-response'

/**
 * What an order — or one line on it — asks for on paper.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * The required set landed as an API and nothing else, so the one thing
 * a client actually does with it — add the induction its own plant
 * needs, waive a background check with a reason, read back the refusal
 * on work authorization — could only be done with a POST body. A rule
 * nobody can click is a rule nobody checks.
 *
 * A working surface: the set as a table or a feed, every item saying
 * where it came from and who owes it, with add, remove and waive on the
 * row. The refusal on work authorization is shown as the sentence it
 * is, not as a disabled control — CLAUDE.md: "never a disabled button
 * with no words."
 */

interface Item {
  id: string | null
  key: string
  label: string
  required: boolean
  owedBy: string
  owedByName: string | null
  blocks: boolean
  typeBlocks: boolean
  from: 'DEFAULT' | 'ORDER' | 'LINE'
  says: string
  waived: boolean
  waivedSays: string | null
  waiverRefused: boolean
  note: string | null
}

interface Answer {
  side: string
  shape: string
  order: { id: string; number: string; issuedBy: string } | null
  items: Item[]
  says: string
}

/** The party that owes it, as a person would say it. */
const OWED_BY_WORD: Record<string, string> = {
  WORKER: 'The worker',
  SUPPLIER: 'The supplier',
  CUSTOMER: 'The customer',
  US: 'Ours',
}

/** Where it came from, in three words rather than an enum. */
const FROM_WORD: Record<string, string> = {
  DEFAULT: 'The floor',
  ORDER: 'The order',
  LINE: 'This line',
}

export default function DocumentRequirementsPage() {
  return (
    <Suspense fallback={<p className="text-body-sm text-etyme-muted">Loading…</p>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const params = useSearchParams()
  const workOrderId = params.get('workOrderId') ?? ''
  const sellContractId = params.get('sellContractId') ?? ''
  const buyContractId = params.get('buyContractId') ?? ''

  const query = workOrderId
    ? `workOrderId=${encodeURIComponent(workOrderId)}`
    : sellContractId
      ? `sellContractId=${encodeURIComponent(sellContractId)}`
      : buyContractId
        ? `buyContractId=${encodeURIComponent(buyContractId)}`
        : ''

  const target = workOrderId
    ? { workOrderId }
    : sellContractId
      ? { sellContractId }
      : buyContractId
        ? { buyContractId }
        : null

  const [answer, setAnswer] = useState<Answer | null>(null)
  const [loading, setLoading] = useState(!!query)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [adding, setAdding] = useState({ key: '', note: '' })
  const [waiving, setWaiving] = useState<{ item: Item; reason: string; remove: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!query) return
    setLoading(true)
    setError(null)
    try {
      const body = await fetch(`/api/documents/requirements?${query}`).then(readJson)
      if (body?.error) throw new Error(body.error.message)
      setAnswer(body?.data ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  async function post(payload: Record<string, unknown>) {
    setError(null)
    setSaid(null)
    const body = await fetch('/api/documents/requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, ...payload }),
    }).then(readJson)
    if (body?.error) {
      // The refusal is the product. Work authorization that cannot be
      // waived says so here, in the sentence the route wrote, rather
      // than as a control that was never offered.
      setError(body.error.message)
      return false
    }
    setSaid(body?.data?.says ?? null)
    await load()
    return true
  }

  if (!target) {
    return (
      <div className="panel p-6">
        <h1 className="text-h2 font-serif text-etyme-ink">What a document set asks for</h1>
        <p className="text-body-sm text-etyme-muted mt-2">
          Open this from an order or from a placement. A required set belongs to exactly one of
          them — the order carries the buyer’s own rules, and a line may add to them or waive one
          with a reason.
        </p>
      </div>
    )
  }

  const items = answer?.items ?? []

  const columns: Column<Item>[] = [
    {
      key: 'label',
      label: 'Document',
      render: (r) => (
        <span className="font-medium text-etyme-ink">
          {r.label.charAt(0).toUpperCase() + r.label.slice(1)}
        </span>
      ),
    },
    {
      key: 'word',
      label: 'Standing',
      render: (r) => (
        <span className={`chip ${
          r.waiverRefused ? 'chip--danger'
            : r.waived ? 'chip--passive'
              : r.blocks ? 'chip--danger'
                : r.required ? 'chip--attention' : 'chip--passive'
        }`}>
          {r.waiverRefused ? 'Waiver refused'
            : r.waived ? 'Waived'
              : r.blocks ? 'Stops work'
                : r.required ? 'Required' : 'Optional'}
        </span>
      ),
      sortValue: (r) => (r.blocks ? 0 : r.required ? 1 : 2),
    },
    {
      key: 'owedBy',
      label: 'Who owes it',
      render: (r) => (
        <span className="text-etyme-muted">
          {OWED_BY_WORD[r.owedBy] ?? r.owedBy}
          {r.owedByName ? ` — ${r.owedByName}` : ''}
        </span>
      ),
    },
    {
      key: 'from',
      label: 'Where it came from',
      render: (r) => (
        <span className="text-etyme-muted">
          {FROM_WORD[r.from] ?? r.from} · {r.says}
        </span>
      ),
    },
    {
      key: 'act',
      label: '',
      sortable: false,
      render: (r) => (
        <div className="flex gap-2 justify-end">
          {!r.waived && (
            <button
              className="text-xs text-etyme-action hover:underline"
              onClick={() => setWaiving({ item: r, reason: '', remove: false })}
            >
              Waive
            </button>
          )}
          {r.from !== 'DEFAULT' && (
            <button
              className="text-xs text-etyme-action hover:underline"
              onClick={() => setWaiving({ item: r, reason: '', remove: true })}
            >
              Stop asking
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <p className="lbl">Governance</p>
        <h1 className="text-h2 font-serif text-etyme-ink">
          {answer?.order
            ? `What ${answer.order.issuedBy}’s order ${answer.order.number} asks for`
            : 'What this line asks for on paper'}
        </h1>
        {answer?.says && <p className="text-body-sm text-etyme-muted mt-1">{answer.says}</p>}
      </div>

      {error && (
        <div className="panel p-4 border-etyme-attention">
          <p className="text-[13px] text-etyme-ink">{error}</p>
        </div>
      )}
      {said && (
        <div className="panel p-4">
          <p className="text-[13px] text-etyme-ink">{said}</p>
        </div>
      )}

      <ListSurface<Item>
        name="document-requirements"
        columns={columns}
        data={items}
        rowKey={(r) => r.key}
        loading={loading}
        exportName="document-requirements"
        searchPlaceholder="Search documents…"
        searchFilter={(r, q) =>
          `${r.label} ${r.key} ${r.owedByName ?? ''} ${r.says}`.toLowerCase().includes(q.toLowerCase())
        }
        feedOmit={['act']}
        emptyMessage="Nothing is asked for here yet."
        emptyDetail="Every line still carries the floor for its own shape. Add a document below to ask for more."
      />

      {/* ── Asking for one more ── */}
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-etyme-ink">Ask for another document</h2>
        <p className="text-[12px] text-etyme-muted mt-0.5">
          Name the type. A type nobody here has defined is still asked for, by its own words, and
          the reply says so — nothing watches an undefined type for expiry until somebody defines
          it under Settings → Documents.
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <input
            className="flex-1 min-w-[200px] border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised"
            placeholder="FURNACE_SAFETY_INDUCTION"
            value={adding.key}
            onChange={(e) => setAdding({ ...adding, key: e.target.value })}
          />
          <input
            className="flex-1 min-w-[200px] border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised"
            placeholder="Why this order needs it"
            value={adding.note}
            onChange={(e) => setAdding({ ...adding, note: e.target.value })}
          />
          <button
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={!adding.key.trim()}
            onClick={async () => {
              const ok = await post({
                documentTypeKey: adding.key.trim().toUpperCase().replace(/\s+/g, '_'),
                note: adding.note.trim() || undefined,
                required: true,
              })
              if (ok) setAdding({ key: '', note: '' })
            }}
          >
            Ask for it
          </button>
        </div>
      </div>

      {/* ── Waiving, or taking it off ── */}
      {waiving && (
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-etyme-ink">
            {waiving.remove ? 'Stop asking for' : 'Waive'} {waiving.item.label}
          </h2>
          <p className="text-[12px] text-etyme-muted mt-0.5">
            Say why. The reason goes on the record with your name, and whoever audits this will
            read it. A waived item stays on the checklist, marked, rather than disappearing from
            it.
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <input
              className="flex-1 min-w-[240px] border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised"
              placeholder="The reason, in your own words"
              value={waiving.reason}
              onChange={(e) => setWaiving({ ...waiving, reason: e.target.value })}
            />
            <button
              className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
              disabled={!waiving.reason.trim()}
              onClick={async () => {
                const ok = await post({
                  documentTypeKey: waiving.item.key,
                  waivedReason: waiving.reason.trim(),
                  ...(waiving.remove ? { remove: true } : {}),
                })
                if (ok) setWaiving(null)
              }}
            >
              {waiving.remove ? 'Stop asking' : 'Waive it'}
            </button>
            <button className="px-4 py-2 border border-etyme-rule rounded text-sm text-etyme-muted hover:text-etyme-ink" onClick={() => setWaiving(null)}>
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
