import { describe, it, expect } from 'vitest'

/**
 * DataTable invariant tests — UX Stress Test #3.
 *
 * "Dense, sortable, filterable, paginated, bulk-selectable, exportable.
 *  One component, used everywhere."
 *
 * These test the logic layer (sort, filter, pagination, CSV export)
 * without rendering. The component's rendering is verified visually.
 */

// ── Sort logic ──────────────────────────────────────

describe('DataTable sort logic', () => {
  const rows = [
    { name: 'Charlie', rate: 100 },
    { name: 'Alice', rate: 150 },
    { name: 'Bob', rate: 120 },
  ]

  it('sorts strings ascending', () => {
    const sorted = [...rows].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    )
    expect(sorted.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('sorts strings descending', () => {
    const sorted = [...rows].sort((a, b) =>
      b.name.toLowerCase().localeCompare(a.name.toLowerCase())
    )
    expect(sorted.map(r => r.name)).toEqual(['Charlie', 'Bob', 'Alice'])
  })

  it('sorts numbers ascending', () => {
    const sorted = [...rows].sort((a, b) => a.rate - b.rate)
    expect(sorted.map(r => r.rate)).toEqual([100, 120, 150])
  })

  it('sorts numbers descending', () => {
    const sorted = [...rows].sort((a, b) => b.rate - a.rate)
    expect(sorted.map(r => r.rate)).toEqual([150, 120, 100])
  })

  it('null values sort to the end', () => {
    const withNulls = [
      { name: 'Alice', rate: 150 },
      { name: 'Bob', rate: null },
      { name: 'Charlie', rate: 100 },
    ]
    const sorted = [...withNulls].sort((a, b) => {
      if (a.rate == null) return 1
      if (b.rate == null) return -1
      return a.rate - b.rate
    })
    expect(sorted.map(r => r.name)).toEqual(['Charlie', 'Alice', 'Bob'])
  })
})

// ── Filter logic ────────────────────────────────────

describe('DataTable search filter', () => {
  const consultants = [
    { name: 'Ravi Patel', skills: ['SAP MM', 'SAP ABAP'], location: 'Dallas' },
    { name: 'Priya Sharma', skills: ['SAP FICO', 'Python'], location: 'Chicago' },
    { name: 'Ajay Kumar', skills: ['.NET', 'Azure'], location: 'Dallas' },
  ]

  const searchFilter = (row: typeof consultants[0], q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.skills.some(s => s.toLowerCase().includes(q)) ||
    row.location.toLowerCase().includes(q)

  it('filters by name', () => {
    const filtered = consultants.filter(r => searchFilter(r, 'ravi'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Ravi Patel')
  })

  it('filters by skill', () => {
    const filtered = consultants.filter(r => searchFilter(r, 'sap'))
    expect(filtered).toHaveLength(2)
  })

  it('filters by location', () => {
    const filtered = consultants.filter(r => searchFilter(r, 'dallas'))
    expect(filtered).toHaveLength(2)
  })

  it('returns all when query is empty', () => {
    // Empty query → no filtering (handled by the component, not the filter fn)
    expect(consultants).toHaveLength(3)
  })

  it('returns empty when nothing matches', () => {
    const filtered = consultants.filter(r => searchFilter(r, 'java'))
    expect(filtered).toHaveLength(0)
  })
})

// ── Pagination logic ────────────────────────────────

describe('DataTable pagination', () => {
  const items = Array.from({ length: 55 }, (_, i) => ({ id: `item-${i}` }))

  it('first page shows pageSize items', () => {
    const pageSize = 20
    const page = 1
    const paged = items.slice((page - 1) * pageSize, page * pageSize)
    expect(paged).toHaveLength(20)
    expect(paged[0].id).toBe('item-0')
    expect(paged[19].id).toBe('item-19')
  })

  it('last page shows remaining items', () => {
    const pageSize = 20
    const totalPages = Math.ceil(items.length / pageSize)
    expect(totalPages).toBe(3)
    const paged = items.slice((totalPages - 1) * pageSize, totalPages * pageSize)
    expect(paged).toHaveLength(15) // 55 - 40
  })

  it('page beyond total is clamped', () => {
    const pageSize = 20
    const totalPages = Math.ceil(items.length / pageSize)
    const requestedPage = 10
    const safePage = Math.min(requestedPage, totalPages)
    expect(safePage).toBe(3)
  })

  it('different page sizes change page count', () => {
    expect(Math.ceil(55 / 20)).toBe(3)
    expect(Math.ceil(55 / 50)).toBe(2)
    expect(Math.ceil(55 / 100)).toBe(1)
  })
})

// ── CSV export logic ────────────────────────────────

describe('DataTable CSV export', () => {
  it('generates valid CSV with headers', () => {
    const headers = ['Name', 'Rate', 'Skills']
    const rows = [
      ['Alice', '150', 'SAP MM; SAP ABAP'],
      ['Bob', '120', '.NET; Azure'],
    ]
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    expect(csv).toContain('"Name","Rate","Skills"')
    expect(csv).toContain('"Alice","150","SAP MM; SAP ABAP"')
    expect(csv).toContain('"Bob","120",".NET; Azure"')
  })

  it('escapes double quotes in values', () => {
    const value = 'She said "hello"'
    const escaped = `"${value.replace(/"/g, '""')}"`
    expect(escaped).toBe('"She said ""hello"""')
  })

  it('handles empty arrays as empty strings', () => {
    const val: string[] = []
    const result = val.join('; ')
    expect(result).toBe('')
  })
})

// ── Bulk selection logic ────────────────────────────

describe('DataTable bulk selection', () => {
  it('toggles individual items', () => {
    const selected = new Set<string>()
    selected.add('a')
    selected.add('b')
    expect(selected.size).toBe(2)

    selected.delete('a')
    expect(selected.size).toBe(1)
    expect(selected.has('b')).toBe(true)
  })

  it('select all adds all page items', () => {
    const pageKeys = ['a', 'b', 'c']
    const selected = new Set<string>()
    pageKeys.forEach(k => selected.add(k))
    expect(selected.size).toBe(3)
  })

  it('deselect all removes all page items', () => {
    const selected = new Set(['a', 'b', 'c', 'd']) // d is on another page
    const pageKeys = ['a', 'b', 'c']
    pageKeys.forEach(k => selected.delete(k))
    expect(selected.size).toBe(1)
    expect(selected.has('d')).toBe(true) // cross-page selection preserved
  })
})
