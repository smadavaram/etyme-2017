'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DataTable, type Column, type DataTableProps } from '@/components/data-table'
import { ViewToggle, type View } from '@/components/network-view'

export type { Column } from '@/components/data-table'

/**
 * Every list, two ways.
 *
 * The table is the working surface — dense, sortable, searchable,
 * exportable — and the feed is the same rows as cards, one line each,
 * for the day there are eight of them and somebody wants to read, not
 * scan. Decided after the Contractors and Suppliers pages had both and
 * every other list had one: "all tables must have feed and table
 * options." The columns are the single source of both — the first is
 * the card's title, the second its subtitle, the rest its lines — so a
 * page describes its rows once. A page with a richer card passes one.
 * The choice is remembered per list, on this device.
 */
export interface ListSurfaceProps<T> extends DataTableProps<T> {
  /** Remembers the view under this name; defaults to exportName. */
  name?: string
  defaultView?: View
  /**
   * Drive the view from the page, for a list whose two views are not
   * interchangeable for acting — a table row that starts something the
   * card finishes has to be able to move the reader to the card.
   * Uncontrolled and remembered per reader when left out, as before.
   */
  view?: View
  onView?: (v: View) => void
  /** A richer card than the one derived from the columns. */
  card?: (row: T) => ReactNode
  /** Columns to leave off the derived card (an action column, say). */
  feedOmit?: string[]
}

export function ListSurface<T extends Record<string, any>>(props: ListSurfaceProps<T>) {
  const { name, defaultView = 'table', card, feedOmit = [], view: given, onView, ...table } = props
  const key = `etyme.view.${name ?? table.exportName ?? 'list'}`
  const [own, setOwn] = useState<View>(defaultView)
  const view = given ?? own
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key)
      if (saved === 'feed' || saved === 'table') { setOwn(saved); onView?.(saved) }
    } catch {}
    // The remembered choice is read once, on mount, for this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const choose = (v: View) => {
    setOwn(v)
    onView?.(v)
    try { window.localStorage.setItem(key, v) } catch {}
  }

  return (
    <div className={table.className}>
      <div className="mb-3 flex justify-end">
        <ViewToggle view={view} onChange={choose} />
      </div>
      {view === 'table'
        ? <DataTable {...table} className="" />
        : <Feed {...table} card={card} feedOmit={feedOmit} />}
    </div>
  )
}

function Feed<T extends Record<string, any>>({
  columns, data, rowKey, searchPlaceholder = 'Search…', searchFilter, emptyMessage = 'Nothing here.', emptyDetail,
  onRowClick, loading, error, filters, rowClassName, card, feedOmit,
}: DataTableProps<T> & { card?: (row: T) => ReactNode; feedOmit: string[] }) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(50)
  const rows = useMemo(() => {
    if (!query.trim() || !searchFilter) return data
    const q = query.trim().toLowerCase()
    return data.filter((r) => searchFilter(r, q))
  }, [data, query, searchFilter])
  const shape = useMemo(() => {
    // An action column — buttons, an unlabeled tail — has no place on a
    // card; the card is for reading, the row's own page is for acting.
    const cols = columns.filter((c) => !feedOmit.includes(c.key) && c.label.trim() !== '' && !/^actions?$/i.test(c.label) && !/^actions?$/i.test(c.key))
    return { title: cols[0], subtitle: cols[1], rest: cols.slice(2) }
  }, [columns, feedOmit])
  const cell = (c: Column<T> | undefined, row: T, i: number): ReactNode => {
    if (!c) return null
    if (c.render) return c.render(row, i)
    const v = row[c.key]
    return v == null ? null : Array.isArray(v) ? v.join(', ') : String(v)
  }

  return (
    <div>
      {(searchFilter || filters) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {searchFilter && (
            <input
              type="text" value={query} onChange={(e) => { setQuery(e.target.value); setShown(50) }} placeholder={searchPlaceholder}
              className="w-full max-w-[360px] min-w-[200px] flex-1 rounded-md border border-etyme-rule bg-etyme-surface px-3 py-2 text-[13px] text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
            />
          )}
          {filters}
        </div>
      )}
      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}
      {error && <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>}
      {!loading && !error && rows.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">{emptyMessage}</p>
          {emptyDetail && <p className="mt-1 text-[12px] text-etyme-faint">{emptyDetail}</p>}
        </div>
      )}
      <div className="space-y-3">
        {rows.slice(0, shown).map((row, i) => (
          <article
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`panel ${onRowClick ? 'cursor-pointer hover:border-etyme-action/40' : ''} ${rowClassName?.(row) ?? ''}`}
          >
            {card ? card(row) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0 text-[15px] font-semibold text-etyme-ink">{cell(shape.title, row, i)}</div>
                  <div className="text-[13px] text-etyme-muted">{cell(shape.subtitle, row, i)}</div>
                </div>
                {shape.rest.length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                    {shape.rest.map((c) => {
                      const v = cell(c, row, i)
                      if (v == null || v === '' || v === '—') return null
                      return (
                        <div key={c.key} className="flex items-baseline gap-1.5">
                          <dt className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint">{c.label}</dt>
                          <dd className="text-etyme-ink tabular-nums">{v}</dd>
                        </div>
                      )
                    })}
                  </dl>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      {rows.length > shown && (
        <button onClick={() => setShown((n) => n + 50)} className="mt-3 text-[12px] text-etyme-action hover:underline">
          and {rows.length - shown} more
        </button>
      )}
    </div>
  )
}
