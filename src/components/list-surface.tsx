'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DataTable, defaultSearch, type Column, type DataTableProps } from '@/components/data-table'
import { ViewToggle, type View } from '@/components/network-view'
import { EmptyState, LoadingState, RefusedState } from '@/components/ui/states'

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
 *
 * Both views share one toolbar: the search on the left, the switch at
 * the right end, and the filter chips in their own row under it. A
 * reader who switches views finds every control where it was.
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
  const toggle = <ViewToggle view={view} onChange={choose} />

  return (
    <div className={table.className}>
      {view === 'table'
        ? <DataTable {...table} className="" toolbarEnd={toggle} />
        : <Feed {...table} card={card} feedOmit={feedOmit} toolbarEnd={toggle} />}
    </div>
  )
}

function Feed<T extends Record<string, any>>({
  columns, data, rowKey, searchPlaceholder = 'Search…', searchFilter, searchable = true,
  emptyMessage = 'Nothing here yet.', emptyDetail, emptyAction,
  onRowClick, loading, loadingMessage, error, filters, rowClassName, card, feedOmit, toolbarEnd,
}: DataTableProps<T> & { card?: (row: T) => ReactNode; feedOmit: string[] }) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(50)
  const matches = useMemo(
    () => (searchable ? searchFilter ?? defaultSearch(columns) : null),
    [searchable, searchFilter, columns]
  )
  const rows = useMemo(() => {
    if (!query.trim() || !matches) return data
    const q = query.trim().toLowerCase()
    return data.filter((r) => matches(r, q))
  }, [data, query, matches])
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

  // The same three states the table draws, the same way.
  if (error) return <RefusedState says={error} />
  if (loading) return <LoadingState says={loadingMessage} />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {matches && (
          <div className="relative min-w-0 flex-1 basis-[220px] sm:max-w-[360px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-etyme-faint"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(50) }}
              placeholder={searchPlaceholder} aria-label={searchPlaceholder.replace(/…$/, '')}
              className="input pl-9"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">{toolbarEnd}</div>
      </div>
      {filters && <div className="mb-3">{filters}</div>}

      {rows.length === 0 && (
        query.trim() && data.length > 0
          ? <EmptyState says={`Nothing matches “${query.trim()}”.`} action={{ label: 'Clear the search', onClick: () => setQuery('') }} />
          : <EmptyState says={emptyMessage} detail={emptyDetail} action={emptyAction} />
      )}
      <div className="space-y-2.5">
        {rows.slice(0, shown).map((row, i) => (
          <article
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(row) } } : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            className={`rounded-panel border border-etyme-rule bg-etyme-surface px-5 py-4 transition-shadow ${onRowClick ? 'cursor-pointer hover:shadow-lift hover:border-etyme-action-line' : ''} ${rowClassName?.(row) ?? ''}`}
          >
            {card ? card(row) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-etyme-rule pt-3">
          <p className="text-[12.5px] text-etyme-muted tabular-nums">Showing {shown} of {rows.length}</p>
          <button type="button" onClick={() => setShown((n) => n + 50)} className="btn-secondary !py-1.5 !text-[12.5px]">
            Show {Math.min(50, rows.length - shown)} more
          </button>
        </div>
      )}
    </div>
  )
}
