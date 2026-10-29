'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { ErrorState, LoadingState, RefusedState } from '@/components/ui'
import { ItemBody, type SetupRead } from './items'
import { itemHref, type ItemKey } from '@/lib/setup-checklist'

/**
 * The setup checklist (founder, 2026-10-22; drawn, and built on "Build
 * it", 2026-10-28). One column per screen, a short heading, plain fields:
 * the list on the left and one item open on the right; on a phone the
 * list, then the item with "‹ Setup" back.
 *
 * Every item has its defaults filled, "Save and continue", "Skip for
 * now", the one line saying what skipping stops, and the stamp saying who
 * saved it and when. Three words, never a percentage: done, skipped, to
 * do. Only the Owner and the Admin read it; anybody else is refused in a
 * sentence by the route (`/api/settings/setup`).
 *
 * Not here, on purpose: "Read from our website". The guarded website read
 * decided on 2026-10-27 is not built, so the button is not drawn.
 */

/**
 * Every item has its own address (`/dashboard/settings/setup/<item>`,
 * `itemHref`), so a refusal or a greeting line opens "Papers you require"
 * itself. Opening an item from the list moves the address with it, so a
 * reload or a shared link opens the same item.
 */
export function SetupChecklist({ item: asked }: { item?: ItemKey | null }) {
  const eyebrow = usePageSection('/dashboard/settings')
  const [read, setRead] = useState<SetupRead | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<ItemKey | null>(null)
  // On a phone the list and the item are two screens.
  const [showing, setShowing] = useState<'LIST' | 'ITEM'>(asked ? 'ITEM' : 'LIST')

  const load = useCallback(async (keepOpen?: ItemKey | null) => {
    try {
      const res = await fetch('/api/settings/setup')
      if (res.status === 403) {
        const j = await res.json().catch(() => null)
        setRefused(j?.error?.message ?? 'The setup checklist is read by the Owner and the Admin.')
        return
      }
      const j = await readJson(res)
      const data: SetupRead = j.data
      setRead(data)
      setError(null)
      // The item the address names; the older "?item=" still opens it.
      const named = asked ?? (typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('item') as ItemKey | null) : null)
      setOpen((now) => keepOpen ?? now ?? (named && data.checklist.rows.some((r) => r.key === named) ? named : data.checklist.owed[0] ?? data.checklist.rows[0]?.key ?? null))
    } catch (e: any) {
      setError(e.message)
    }
  }, [asked])
  useEffect(() => { load() }, [load])

  /** Open one item, and move the address to it without reloading the page. */
  const openItem = useCallback((key: ItemKey) => {
    setOpen(key)
    if (typeof window !== 'undefined' && window.location.pathname !== itemHref(key)) window.history.replaceState(null, '', itemHref(key))
  }, [])

  if (refused) return <RefusedState says={refused} />
  if (error && !read) return <ErrorState says={error} />
  if (!read) return <LoadingState says="Opening your setup…" />

  const rows = read.checklist.rows
  const finished = read.checklist.owed.length === 0

  /** After a save or a skip: the next item still owed, after this one. */
  function moveOn(from: ItemKey, next: SetupRead) {
    setRead(next)
    const keys = next.checklist.rows.map((r) => r.key)
    const after = keys.slice(keys.indexOf(from) + 1).find((k) => next.checklist.owed.includes(k))
    const target = after ?? next.checklist.owed[0] ?? null
    if (target) openItem(target)
    else setShowing('LIST')
  }

  const list = (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.09em] text-etyme-muted">{eyebrow ?? 'Settings'} · Setup</p>
      <h1 className="font-serif text-[26px] leading-tight tracking-[-0.02em] text-etyme-ink [text-wrap:balance]">
        {finished ? `${read.company.name} is set up` : `Finish setting up ${read.company.name}`}
      </h1>
      <p className="text-[13.5px] text-etyme-muted">
        {finished ? 'Every item is done. Change any answer here at any time.' : read.checklist.intro}
      </p>
      <p className="text-[12.5px] tabular-nums text-etyme-muted">{read.checklist.countLine}</p>
      <ol className="border-t border-etyme-rule">
        {rows.map((r) => {
          const on = r.key === open
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => { openItem(r.key); setShowing('ITEM') }}
                aria-current={on ? 'step' : undefined}
                className={`grid w-full grid-cols-[22px_1fr] gap-2.5 border-b border-etyme-rule py-2.5 text-left ${on ? 'border-l-2 border-l-etyme-action-press bg-etyme-raised pl-3 pr-2' : 'px-1.5'}`}
              >
                <Mark state={r.state} on={on} />
                <span>
                  <span className="block text-[14px] text-etyme-ink">{r.label}</span>
                  <span className={`block text-[12px] ${r.state === 'SKIPPED' ? 'text-etyme-attention' : 'text-etyme-muted'}`}>{r.line}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="text-[12px] text-etyme-muted">Later is fine. A skipped item stops only the one thing that needs it, and says which step to finish.</p>
    </div>
  )

  const row = rows.find((r) => r.key === open) ?? null
  const item = row && (
    <ItemBody
      key={row.key}
      item={row.key}
      place={row.place}
      read={read}
      onDone={(next) => moveOn(row.key, next)}
      onReload={() => load(row.key)}
    />
  )

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6">
      {/* Phone: one screen at a time. */}
      <div className="md:hidden">
        {showing === 'LIST' || !item ? list : (
          <div className="space-y-4">
            <button type="button" className="text-[13px] text-etyme-action-press" onClick={() => setShowing('LIST')}>‹ Setup</button>
            {item}
          </div>
        )}
      </div>
      {/* Desktop: the list beside the open item. */}
      <div className="hidden overflow-hidden rounded-[10px] border border-etyme-rule md:grid md:grid-cols-[340px_1fr]">
        <div className="border-r border-etyme-rule bg-etyme-canvas px-[22px] py-7">{list}</div>
        <div className="bg-etyme-surface px-10 py-7">{item}</div>
      </div>
    </div>
  )
}

function Mark({ state, on }: { state: 'DONE' | 'SKIPPED' | 'TODO'; on: boolean }) {
  if (state === 'DONE') {
    return <span aria-label="Done" className="mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-etyme-verified/15 text-[11px] font-bold text-etyme-verified">✓</span>
  }
  if (state === 'SKIPPED') {
    return <span aria-label="Skipped" className="mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-[1.5px] border-dashed border-etyme-attention text-[11px] font-bold text-etyme-attention">–</span>
  }
  return <span aria-label="To do" className={`mt-0.5 h-[18px] w-[18px] rounded-full border-[1.5px] ${on ? 'border-etyme-action-press' : 'border-etyme-faint'}`} />
}
