'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DuplicateDrafts as Group } from '@/lib/money/duplicate-drafts'

/**
 * "Two drafts hold the same week; keep the first." The repair for drafts
 * written before "Bill this week" learned to refuse a week already on a
 * bill (lib/money/duplicate-drafts). Each later draft is withdrawn through
 * the Bills page's own withdraw route, with the reason on the trail. A
 * bill that was sent is never offered. Draws nothing where nothing is
 * duplicated.
 */
export function DuplicateDrafts({
  onDone,
  onToast,
}: {
  onDone: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
}) {
  const [groups, setGroups] = useState<Group[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // A failed read draws nothing and never throws: the Bills list beside
  // it stays (walk 7, 2026-11-08, when this read answered 500 on every open).
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices?duplicates=drafts')
      if (!res.ok) return setGroups([])
      const json = await res.json().catch(() => ({}))
      setGroups(Array.isArray(json?.data) ? json.data : [])
    } catch {
      setGroups([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function keepFirst(g: Group) {
    setBusy(g.keep.id)
    try {
      for (const d of g.withdraw) {
        const res = await fetch(`/api/invoices/${d.id}/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: g.reason }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          onToast(json?.error?.message ?? `Draft ${d.number} could not be withdrawn.`, 'error')
          return
        }
      }
      onToast(`Kept ${g.keep.number}; withdrew ${g.withdraw.map((d) => d.number).join(', ')}.`)
      await load()
      onDone()
    } finally {
      setBusy(null)
    }
  }

  if (groups.length === 0) return null
  return (
    <div className="panel mb-4">
      <p className="eyebrow mb-2">Drafts that hold the same week</p>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.keep.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-etyme-ink">{g.says}</span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => keepFirst(g)}
              className="text-[13px] text-etyme-action-press underline disabled:opacity-60"
            >
              {busy === g.keep.id ? 'Withdrawing…' : `Keep ${g.keep.number}, withdraw ${g.withdraw.map((d) => d.number).join(', ')}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
