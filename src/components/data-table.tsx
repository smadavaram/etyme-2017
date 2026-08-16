'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'

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
 */

// ── Types ────────────────────────────────────────────

export interface Column<T> {
  key: string
  label: string
  /** Render cell content. Falls back to row[key] as string. */
  render?: (row: T, index: number) => ReactNode
  /** Value extractor for sorting. Falls back to row[key]. */
  sortValue?: (row: T) => string | number | null
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
  /** Text filter — return true if row matches the query. */
  searchFilter?: (row: T, query: string) => boolean
  /** Empty state message. */
  emptyMessage?: string
  /** Empty state detail. */
  emptyDetail?: string
  /** Row click handler. */
  onRowClick?: (row: T) => void
  /** Loading state. */
  loading?: boolean
  /** Error message. */
  error?: string | null
  /** Optional filter pills rendered between search and table. */
  filters?: ReactNode
  /** Extra CSS class on the outer wrapper. */
  className?: string
  /** Export filename (without extension). Enables CSV export button. */
  exportName?: string
  /** Custom row className. */
  rowClassName?: (row: T) => string
}

// ── Sort state ───────────────────────────────────────

type SortDir = 'asc' | 'desc' | null

interface SortState {
  key: string | null
  dir: SortDir
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
  emptyMessage = 'No data.',
  emptyDetail,
  onRowClick,
  loading = false,
  error = null,
  filters,
  className = '',
  exportName,
  rowClassName,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: null, dir: null })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Filter ─────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim() || !searchFilter) return data
    const q = query.trim().toLowerCase()
    return data.filter((row) => searchFilter(row, q))
  }, [data, query, searchFilter])

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

  // Reset page on filter/sort change
  const prevFilteredLen = useMemo(() => filtered.length, [filtered.length])
  if (page > 1 && prevFilteredLen !== filtered.length) {
    // Can't call setPage in render — but this is a memo-based guard.
    // The safePage clamp above handles it; the effect below resets properly.
  }

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
      columns.map((c) => {
        const val = row[c.key]
        if (val == null) return ''
        if (Array.isArray(val)) return val.join('; ')
        return String(val)
      })
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

  // ── Render ─────────────────────────────────────────

  const allPageSelected = paged.length > 0 && paged.every((r) => selected.has(rowKey(r)))

  return (
    <div className={className}>
      {/* Toolbar — search + actions */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Search */}
        {searchFilter && (
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-etyme-faint"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-[13px] rounded-md border border-etyme-rule
                         bg-etyme-surface text-etyme-ink placeholder:text-etyme-faint
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                         transition-all"
            />
          </div>
        )}

        {/* Bulk actions */}
        {selectable && selected.size > 0 && bulkActions && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-etyme-muted tabular-nums">
              {selected.size} selected
            </span>
            {bulkActions(selected, () => setSelected(new Set()))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export */}
        {exportName && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium
                       text-etyme-muted border border-etyme-rule rounded-md
                       hover:bg-etyme-canvas hover:text-etyme-ink transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        )}

        {/* Page size */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="text-[11px] text-etyme-muted border border-etyme-rule rounded-md
                     px-2 py-1.5 bg-etyme-surface focus:outline-none"
        >
          {pageSizes.map((s) => (
            <option key={s} value={s}>{s} per page</option>
          ))}
        </select>
      </div>

      {/* Optional filter pills */}
      {filters && <div className="mb-4">{filters}</div>}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="panel text-center py-12">
          <p className="text-body-sm text-etyme-muted">Loading…</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr>
                  {selectable && (
                    <th style={{ width: 34, padding: '9px 10px' }}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-etyme-rule"
                      />
                    </th>
                  )}
                  {columns.map((col) => {
                    const isSortable = col.sortable !== false
                    const isSorted = sort.key === col.key
                    const align = col.align ?? 'left'
                    return (
                      <th
                        key={col.key}
                        className={`
                          ${col.width ?? ''}
                          ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                          ${align === 'right' ? '!text-right' : align === 'center' ? '!text-center' : ''}
                          ${isSortable ? 'cursor-pointer select-none hover:text-etyme-ink' : ''}
                        `}
                        onClick={isSortable ? () => handleSort(col.key) : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {isSortable && isSorted && (
                            <svg width="10" height="10" viewBox="0 0 10 10"
                              className={`transition-transform ${sort.dir === 'desc' ? 'rotate-180' : ''}`}
                            >
                              <path d="M2 6l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                          )}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="!text-center !py-12 text-etyme-muted !border-b-0"
                    >
                      <p className="text-[13px]">{emptyMessage}</p>
                      {emptyDetail && (
                        <p className="text-[12px] text-etyme-faint mt-1 max-w-md mx-auto leading-relaxed">{emptyDetail}</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  paged.map((row, i) => {
                    const key = rowKey(row)
                    const isSelected = selected.has(key)
                    return (
                      <tr
                        key={key}
                        className={`
                          transition-colors
                          ${onRowClick ? 'cursor-pointer' : ''}
                          ${isSelected ? '!bg-[#EDEFFC]' : 'hover:bg-etyme-canvas/50'}
                          ${rowClassName?.(row) ?? ''}
                        `}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {selectable && (
                          <td style={{ width: 34 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(key)}
                              className="rounded border-etyme-rule"
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
                                ${align === 'right' ? '!text-right tabular-nums' : align === 'center' ? '!text-center' : ''}
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer — from onboarding prototype */}
          {sorted.length > 0 && (
            <div className="flex items-center justify-between px-[14px] py-[10px] border-t border-etyme-rule">
              <p className="text-[12.5px] text-etyme-faint tabular-nums">
                {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
                {filtered.length !== data.length && (
                  <span> (filtered from {data.length})</span>
                )}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-2.5 py-1 text-[12px] rounded-[3px] border border-etyme-rule
                             text-etyme-muted hover:bg-etyme-canvas
                             disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ←
                </button>
                <span className="text-[12px] text-etyme-muted tabular-nums px-2">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2.5 py-1 text-[12px] rounded-[3px] border border-etyme-rule
                             text-etyme-muted hover:bg-etyme-canvas
                             disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
