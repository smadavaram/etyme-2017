'use client'

import { FilterChips } from '@/components/ui/filter-chips'
import { FILTER_WORD, type NetworkFilter } from '@/lib/network-filters'

/**
 * The Network filter bar, in the reader's order (`filterOrderFor`). A
 * client reads Favorites first; the shared bar draws the five questions
 * in one fixed order, so this page draws its own row of the same chips
 * with the same words, the same rule (a filter with no count is not
 * offered) and the same place picker.
 */
export function OrderedFilterBar({ order, filter, onFilter, counts, places, place, onPlace }: {
  order: readonly NetworkFilter[]
  filter: NetworkFilter
  onFilter: (f: NetworkFilter) => void
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
      options={order.filter((f) => counts[f] !== undefined).map((f) => ({
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
