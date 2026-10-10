'use client'

import type { MouseEvent } from 'react'
import { NETWORK_FILTERS, FILTER_WORD, type NetworkFilter } from '@/lib/network-filters'
import { FilterChips } from '@/components/ui/filter-chips'

/**
 * The parts the two Network pages share — contractors and suppliers —
 * so the feed-or-table switch, the five-question filter bar and the
 * star are learned once and mean the same thing on both.
 */

export type View = 'feed' | 'table'

/** Feed or table. The same people either way; only the density changes. */
export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="tablist" aria-label="View" className="inline-flex shrink-0 rounded-nav border border-etyme-rule bg-etyme-sunk/60 p-0.5 text-[12px]">
      {(['feed', 'table'] as View[]).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-[5px] px-3 py-1 transition-colors ${view === v ? 'bg-etyme-raised font-medium text-etyme-ink shadow-sm' : 'text-etyme-muted hover:text-etyme-ink'}`}
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
    <FilterChips<NetworkFilter>
      label="Show"
      value={filter}
      onChange={onFilter}
      options={NETWORK_FILTERS.filter((f) => counts[f] !== undefined).map((f) => ({
        key: f, label: FILTER_WORD[f], count: counts[f], warn: f === 'BLOCKED',
      }))}
      end={places.length > 0 && (
        <select
          aria-label="Location"
          value={place ?? ''}
          onChange={(e) => onPlace(e.target.value || null)}
          className="rounded-pill border border-etyme-rule bg-etyme-surface px-3 py-1 text-[12.5px] text-etyme-muted"
        >
          <option value="">Anywhere</option>
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
    />
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

/**
 * `of` is what the list holds — 'firms' or 'people'.
 *
 * Pending means something different on each and the word has to follow:
 * a firm is pending while it walks the desks, a person while nobody has
 * put them forward yet. The contractors list showed the firms sentence
 * for a week because this took no argument.
 */
export function emptyWord(filter: NetworkFilter, place: string | null, of: 'firms' | 'people' = 'firms'): string {
  const where = place ? ` in ${place}` : ''
  switch (filter) {
    case 'ON_SITE': return `Nobody on site${where} right now.`
    case 'RECENT': return `Nobody engaged${where} in the last ninety days.`
    case 'FAVORITES': return `Nobody marked to take again${where} yet. The star on a row does it.`
    case 'PENDING':
      return of === 'people'
        ? `Nobody waiting${where}. Ask somebody you already know and they show here until a supplier puts them forward.`
        : `Nothing in the pipeline${where}. Recommend a supplier and it shows here until every desk has said yes.`
    case 'BLOCKED': return `Nobody blocked${where}.`
    default: return `Nobody${where}.`
  }
}
