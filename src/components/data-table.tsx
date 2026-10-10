'use client'

import { useState, useMemo, useCallback, type ReactNode, type KeyboardEvent } from 'react'
import { EmptyState, LoadingState, RefusedState, type StateAction } from '@/components/ui/states'

/**
 * Working-surface table — UX Stress Test #3.
 *
 * "Dense, sortable, filterable, paginated, bulk-selectable, exportable.
 *  One component, used everywhere."
 *
 * Design tokens from CLAUDE.md:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * ── What every list gets without asking ──────────────────────────────
 *
 * Search, first (UX Stress Test #1: "Search on every list. Before
 * anything else."). A page that passes `searchFilter` decides what a
 * query matches; one that passes nothing gets a search over the text of
 * its own columns. A page that searches for itself, above the list,
 * says `searchable={false}` so the reader never meets two boxes.
 *
 * Column headings that stay in view while the rows scroll, a sort that
 * says which way it runs to the eye and to a screen reader, rows that
 * Tab reaches when they open something, and a footer that reads as
 * pages: "21–40 of 143", Previous, Next.
 *
 * ── What a page opts into ────────────────────────────────────────────
 *
 * Bulk selection (`selectable` with `bulkActions`) and CSV export
 * (`exportName`). Neither is drawn on a list that did not ask: a
 * checkbox column with nothing to do with the rows is a question the
 * reader cannot answer.
 *
 * ── The three states that are not rows ───────────────────────────────
 *
 * Loading, empty and refused are the shared primitives in
 * components/ui/states. A refused list is its sentence alone — no
 * search box, no column heads, no "0 of 0" — the same rule every page
 * follows (sign-up walk, rounds four to seven).
 */

// ── Types ────────────────────────────────────────────

export interface Column<T> {
  key: string
  label: string
  /** Render cell content. Falls back to row[key] as string. */
  render?: (row: T, index: number) => ReactNode
  /** Value extractor for sorting. Falls back to row[key]. */
  sortValue?: (row: T) => string | number | null
  /** What the CSV says for this column. Falls back to row[key]. */
  exportValue?: (row: T) => string | number | null
  /** Disable sorting for this column. */
  sortable?: boolean
  /** Column width class (Tailwind). */
  width?: string
  /** Right-align (for numbers). */
  align?: 'left' | 'right' | 'center'
  /** Hide on mobile. */
  hideOnMobile?: boolean
}

export interface DataTableProps<T> {
  /** Column definitions. */
  columns: Column<T>[]
  /** Full data array — filtering, sorting, pagination happen client-side. */
  data: T[]
  /** Unique key extractor. */
  rowKey: (row: T) => string
  /** Page size options. Default: [20, 50, 100]. */
  pageSizes?: number[]
  /** Default page size. */
  defaultPageSize?: number
  /** Enable row selection checkboxes. */
  selectable?: boolean
  /** Called when selection changes (set of keys). */
  onSelectionChange?: (selected: Set<string>) => void
  /** Bulk action buttons rendered above the table when rows are selected. */
  bulkActions?: (selected: Set<string>, clearSelection: () => void) => ReactNode
  /** Search placeholder. */
  searchPlaceholder?: string
  /** Text filter — return true if row matches the query. Without one, the
   *  query is matched against the text of the row's own columns. */
  searchFilter?: (row: T, query: string) => boolean
  /** False where the page draws its own search above the list. */
  searchable?: boolean
  /** Empty state message — one sentence about what would be here. */
  emptyMessage?: string
  /** Empty state detail. */
  emptyDetail?: string
  /** The one thing to do about an empty list, if there is one. */
  emptyAction?: StateAction
  /** Row click handler. */
  onRowClick?: (row: T) => void
  /** Loading state. */
  loading?: boolean
  /** What is being opened, while loading: "Opening your contracts…". */
  loadingMessage?: string
  /** A refusal or failure, in the route's own sentence. Drawn alone. */
  error?: string | null
  /** Filter chips, drawn in their own row under the search. */
  filters?: ReactNode
  /** Extra CSS class on the outer wrapper. */
  className?: string
  /** Export filename (without extension). Enables CSV export button. */
  exportName?: string
  /** Custom row className. */
  rowClassName?: (row: T) => string
  /** Drawn at the right end of the toolbar — the feed/table switch. */
  toolbarEnd?: ReactNode
}

// ── Sort state ───────────────────────────────────────

type SortDir = 'asc' | 'desc' | null

interface SortState {
  key: string | null
  dir: SortDir
}

/** The text a value reads as, for search and for the CSV. */
export function cellText(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(cellText).join('; ')
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') return ''
  return String(v)
}

/**
 * The search a list gets when its page wrote none: does the query appear
 * in the text of any column's value? Reads what the page described —
 * `sortValue` where a column has one, else the row's own field — and
 * never the rendered cell, which may be a button.
 */
export function defaultSearch<T extends Record<string, any>>(columns: Column<T>[]) {
  return (row: T, q: string): boolean =>
    columns.some((c) => cellText(c.sortValue ? c.sortValue(row) : row[c.key]).toLowerCase().includes(q))
}

/** "1–20 of 143", and "(filtered from 300)" when a search narrowed it. */
export function rangeWords(page: number, pageSize: number, shown: number, total: number): string {
  if (shown === 0) return 'None'
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, shown)
  return `${from}–${to} of ${shown}${shown !== total ? ` (filtered from ${total})` : ''}`
}

// ── Component ────────────────────────────────────────

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  pageSizes = [20, 50, 100],
  defaultPageSize = 20,
  selectable = false,
  onSelectionChange,
  bulkActions,
  searchPlaceholder = 'Search…',
  searchFilter,
  searchable = true,
  emptyMessage = 'Nothing here yet.',
  emptyDetail,
  emptyAction,
  onRowClick,
  loading = false,
  loadingMessage,
  error = null,
  filters,
  className = '',
  exportName,
  rowClassName,
  toolbarEnd,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: null, dir: null })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const matches = useMemo(
    () => (searchable ? searchFilter ?? defaultSearch(columns) : null),
    [searchable, searchFilter, columns]
  )

  // ── Filter ─────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim() || !matches) return data
    const q = query.trim().toLowerCase()
    return data.filter((row) => matches(row, q))
  }, [data, query, matches])

  // ── Sort ───────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered

    const getValue = col.sortValue ?? ((row: T) => row[sort.key!])

    return [...filtered].sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return sort.dir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va).toLowerCase()
      const sb = String(vb).toLowerCase()
      return sort.dir === 'asc'
        ? sa.localeCompare(sb)
        : sb.localeCompare(sa)
    })
  }, [filtered, sort, columns])

  // ── Paginate ───────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  // ── Handlers ───────────────────────────────────────

  const handleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return { key: null, dir: null } // third click clears
    })
    setPage(1)
  }, [])

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    setPage(1)
  }, [])

  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      onSelectionChange?.(next)
      return next
    })
  }, [onSelectionChange])

  const clearSelection = useCallback(() => {
    const next = new Set<string>()
    setSelected(next)
    onSelectionChange?.(next)
  }, [onSelectionChange])

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const allKeys = paged.map(rowKey)
      const allSelected = allKeys.every((k) => prev.has(k))
      const next = new Set(prev)
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k))
      } else {
        allKeys.forEach((k) => next.add(k))
      }
      onSelectionChange?.(next)
      return next
    })
  }, [paged, rowKey, onSelectionChange])

  const handleExport = useCallback(() => {
    if (!exportName) return
    const headers = columns.map((c) => c.label)
    const rows = sorted.map((row) =>
      columns.map((c) => cellText(c.exportValue ? c.exportValue(row) : row[c.key]))
    )
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportName, sorted, columns])

  const rowKeyDown = (row: T) => (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  // ── The states that are not rows ───────────────────
  //
  // A refusal is the sentence alone: no search box over it, no column
  // heads, no "0 of 0" under it.
  if (error) return <div className={className}><RefusedState says={error} /></div>
  if (loading) return <div className={className}><LoadingState says={loadingMessage} /></div>

  const allPageSelected = paged.length > 0 && paged.every((r) => selected.has(rowKey(r)))
  const bulk = selectable && selected.size > 0 && bulkActions
  const hasToolbar = Boolean(matches || exportName || toolbarEnd)

  return (
    <div className={className}>
      {/* Toolbar — search on the left, the list's own controls on the right */}
      {hasToolbar && (
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
                type="search"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder.replace(/…$/, '')}
                className="input pl-9"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {exportName && (
              <button
                type="button"
                onClick={handleExport}
                className="btn-secondary inline-flex items-center gap-1.5 !px-3 !py-[7px] !text-[12.5px] text-etyme-muted hover:text-etyme-ink"
                title={`Download these ${sorted.length} rows as a CSV file`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            )}
            {toolbarEnd}
          </div>
        </div>
      )}

      {/* Filter chips — one row, under the search, on every list */}
      {filters && <div className="mb-3">{filters}</div>}

      {/* Bulk bar — only while something is selected */}
      {bulk && (
        <div
          role="region"
          aria-label="Selected rows"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-panel border border-etyme-action-line bg-etyme-action-wash px-3 py-2"
        >
          <span className="text-[12.5px] font-medium text-etyme-action-press tabular-nums">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selected, clearSelection)}</div>
          <button type="button" onClick={clearSelection} className="btn-quiet ml-auto !py-1 !text-[12.5px]">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-panel border border-etyme-rule bg-etyme-surface">
        <div className={`overflow-x-auto ${paged.length > 15 ? 'max-h-[min(72vh,760px)] overflow-y-auto' : ''}`}>
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label={allPageSelected ? 'Clear every row on this page' : 'Select every row on this page'}
                      className="h-4 w-4 rounded-box accent-etyme-action"
                    />
                  </th>
                )}
                {columns.map((col) => {
                  const isSortable = col.sortable !== false && col.label.trim() !== ''
                  const isSorted = sort.key === col.key && sort.dir !== null
                  const align = col.align ?? 'left'
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : isSortable ? 'none' : undefined}
                      className={`
                        ${col.width ?? ''}
                        ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                        ${align === 'right' ? '!text-right' : align === 'center' ? '!text-center' : ''}
                      `}
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className={`group inline-flex items-center gap-1 rounded-box hover:text-etyme-ink ${isSorted ? 'text-etyme-ink' : ''}`}
                        >
                          {col.label}
                          <SortMark dir={isSorted ? sort.dir : null} />
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => {
                const key = rowKey(row)
                const isSelected = selected.has(key)
                return (
                  <tr
                    key={key}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? rowKeyDown(row) : undefined}
                    aria-selected={selectable ? isSelected : undefined}
                    className={`
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${isSelected ? '!bg-etyme-action-wash' : ''}
                      ${rowClassName?.(row) ?? ''}
                    `}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(key)}
                          aria-label="Select this row"
                          className="h-4 w-4 rounded-box accent-etyme-action"
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const align = col.align ?? 'left'
                      return (
                        <td
                          key={col.key}
                          className={`
                            ${col.width ?? ''}
                            ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                            ${align === 'right' ? '!text-right' : align === 'center' ? '!text-center' : ''}
                          `}
                        >
                          {col.render
                            ? col.render(row, (safePage - 1) * pageSize + i)
                            : (row[col.key] as ReactNode) ?? '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Empty — under the scroll box, not a cell spanning the table. A
            cell is as wide as the table, and a table wider than a phone
            centers its sentence somewhere off screen. The header row
            stays, so the columns still say what would be here. A search
            that found nothing says so, rather than that nothing exists. */}
        {paged.length === 0 && (
          query.trim() && data.length > 0
            ? <EmptyState compact says={`Nothing matches “${query.trim()}”.`} action={{ label: 'Clear the search', onClick: () => handleSearch('') }} />
            : <EmptyState compact says={emptyMessage} detail={emptyDetail} action={emptyAction} />
        )}

        {/* Pages — from the onboarding prototype */}
        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-etyme-rule px-3 py-2">
            <p className="text-[12.5px] text-etyme-muted tabular-nums" aria-live="polite">
              {rangeWords(safePage, pageSize, sorted.length, data.length)}
            </p>
            <div className="flex items-center gap-1">
              {sorted.length > Math.min(...pageSizes) && (
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  aria-label="Rows per page"
                  className="mr-1 rounded-nav border border-etyme-rule bg-etyme-raised px-2 py-1 text-[12px] text-etyme-muted"
                >
                  {pageSizes.map((s) => (
                    <option key={s} value={s}>{s} per page</option>
                  ))}
                </select>
              )}
              {totalPages > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-nav px-2.5 py-1 text-[12.5px] text-etyme-ink hover:bg-etyme-sunk
                               disabled:cursor-not-allowed disabled:text-etyme-faint disabled:hover:bg-transparent"
                  >
                    Previous
                  </button>
                  <span className="px-1 text-[12px] text-etyme-faint tabular-nums">
                    {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-nav px-2.5 py-1 text-[12.5px] text-etyme-ink hover:bg-etyme-sunk
                               disabled:cursor-not-allowed disabled:text-etyme-faint disabled:hover:bg-transparent"
                  >
                    Next
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Which way a column sorts: faint both ways when it does not, one arrow when it does. */
function SortMark({ dir }: { dir: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
      className={dir ? 'text-etyme-ink' : 'text-etyme-rule group-hover:text-etyme-faint'}>
      {dir !== 'desc' && <path d={dir ? 'M2 6.5l3-3 3 3' : 'M2.5 4l2.5-2.5L7.5 4'} fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {dir !== 'asc' && <path d={dir ? 'M2 3.5l3 3 3-3' : 'M2.5 6l2.5 2.5L7.5 6'} fill="none" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  )
}
