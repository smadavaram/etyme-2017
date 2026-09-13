'use client'

import type { MouseEvent } from 'react'
import { NETWORK_FILTERS, FILTER_WORD, type NetworkFilter } from '@/lib/network-filters'

/**
 * The parts the two Network pages share — contractors and suppliers —
 * so the feed-or-table switch, the five-question filter bar and the
 * star are learned once and mean the same thing on both.
 */

export type View = 'feed' | 'table'

/** Feed or table. The same people either way; only the density changes. */
export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-etyme-rule bg-etyme-surface p-0.5 text-[12px]">
      {(['feed', 'table'] as View[]).map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 ${view === v ? 'bg-etyme-raised text-etyme-ink shadow-sm' : 'text-etyme-muted hover:text-etyme-ink'}`}
        >
          {v === 'feed' ? 'Feed' : 'Table'}
        </button>
      ))}
    </div>
  )
}

/** The five questions, and where. */
export function FilterBar({ filter, onFilter, counts, places, place, onPlace }: {
  filter: NetworkFilter
  onFilter: (f: NetworkFilter) => void
  /** A filter with no count is not offered — Contractors has nothing pending. */
  counts: Partial<Record<NetworkFilter, number>>
  places: string[]
  place: string | null
  onPlace: (p: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {NETWORK_FILTERS.filter((f) => counts[f] !== undefined).map((f) => (
        <button
          key={f}
          onClick={() => onFilter(f)}
          aria-pressed={filter === f}
          className={`rounded-full border px-3 py-1 text-[12px] ${
            filter === f
              ? f === 'BLOCKED' ? 'border-etyme-attention bg-etyme-attention text-white' : 'border-etyme-ink bg-etyme-ink text-white'
              : 'border-etyme-rule bg-etyme-surface text-etyme-muted hover:text-etyme-ink'
          }`}
        >
          {FILTER_WORD[f]}
          <span className="ml-1.5 tabular-nums opacity-70">{counts[f]}</span>
        </button>
      ))}
      {places.length > 0 && (
        <select
          aria-label="Location"
          value={place ?? ''}
          onChange={(e) => onPlace(e.target.value || null)}
          className="ml-auto rounded-full border border-etyme-rule bg-etyme-surface px-3 py-1 text-[12px] text-etyme-muted"
        >
          <option value="">Anywhere</option>
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
    </div>
  )
}

export function Star({ on, onClick, name }: { on: boolean; onClick: (e: MouseEvent) => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `${name}: one to take again. Unmark.` : `Mark ${name} as one to take again`}
      title={on ? 'One to take again' : 'Take again?'}
      className={`text-[16px] leading-none ${on ? 'text-etyme-attention' : 'text-etyme-faint hover:text-etyme-ink'}`}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

export function emptyWord(filter: NetworkFilter, place: string | null): string {
  const where = place ? ` in ${place}` : ''
  switch (filter) {
    case 'ON_SITE': return `Nobody on site${where} right now.`
    case 'RECENT': return `Nobody engaged${where} in the last ninety days.`
    case 'FAVORITES': return `Nobody marked to take again${where} yet. The star on a row does it.`
    case 'PENDING': return `Nothing in the pipeline${where}. Recommend a supplier and it shows here until every desk has said yes.`
    case 'BLOCKED': return `Nobody blocked${where}.`
    default: return `Nobody${where}.`
  }
}
