import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import tailwindConfig from '../../tailwind.config'
import { DataTable, NAME_OPENS, ROW_FOCUS_RING, ROW_OPENS, ROW_OPENS_FILL, type Column } from '@/components/data-table'
import { ListSurface } from '@/components/list-surface'

/**
 * A row that opens a drawer looks like it opens (fix list, 2026-11-15: a
 * tester never found the drawer behind a Companies row, because the row
 * only changed the pointer). On every list with `onRowClick`: the name in
 * the first column is drawn in the action text color and underlined while
 * the row is hovered or focused from the keyboard, and the row takes a
 * visible fill. A table nobody can open is drawn exactly as before.
 */

type Row = { id: string; name: string; city: string }
const rows: Row[] = [{ id: 'a', name: 'Northwind Staffing', city: 'Denver' }]
const columns: Column<Row>[] = [
  { key: 'name', label: 'Name', render: (r) => createElement('div', null, createElement('p', { className: 'font-medium text-etyme-ink' }, r.name), createElement('p', { className: 'text-[11px] text-etyme-faint' }, r.city)) },
  { key: 'city', label: 'City' },
]
const table = (onRowClick?: (r: Row) => void) =>
  renderToStaticMarkup(createElement(DataTable<Row>, { data: rows, columns, rowKey: (r: Row) => r.id, onRowClick } as any))
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
const cells = (html: string) => [...html.matchAll(/<td class="([^"]*)"/g)].map((m) => unescape(m[1]))
const bodyRow = (html: string) => html.slice(html.indexOf('<tbody'))

async function css(classes: string): Promise<string> {
  const out = await postcss([tailwindcss({ ...(tailwindConfig as any), content: [{ raw: classes, extension: 'html' }] })]).process('@tailwind utilities;', { from: undefined })
  return out.css
}

describe('a row that opens a drawer', () => {
  it('a table row that opens is reached by Tab, takes the canvas fill under the pointer and the keyboard, and its first cell carries the name style', () => {
    const html = table(() => {})
    const tr = unescape(bodyRow(html).match(/<tr[^>]*>/)![0])
    expect(tr).toContain('tabindex="0"')
    for (const c of ROW_OPENS.split(' ')) expect(tr).toContain(c)
    for (const c of ROW_OPENS_FILL.split(' ')) expect(tr).toContain(c)
    const [first, second] = cells(bodyRow(html))
    for (const c of NAME_OPENS.split(' ')) expect(first).toContain(c)
    expect(second).not.toContain('text-etyme-action-press')
  })

  it('a table nobody can open draws no pointer, no fill and no colored name', () => {
    const html = bodyRow(table())
    expect(html).not.toContain('cursor-pointer')
    expect(html).not.toContain('bg-etyme-canvas')
    expect(html).not.toContain('text-etyme-action-press')
    expect(html).not.toContain('tabindex')
  })

  it('the feed view of a list that opens draws the title as the name, with the same color and underline', () => {
    const html = renderToStaticMarkup(createElement(ListSurface<Row>, { data: rows, columns, rowKey: (r: Row) => r.id, onRowClick: () => {}, defaultView: 'feed' } as any))
    expect(html).toContain('<article')
    expect(html).toContain(NAME_OPENS.split(' ')[0])
    expect(html).toContain('focus-visible:shadow-lift')
  })

  it('the classes compile to an action-colored name that is underlined on hover and on keyboard focus, in the brand kit’s action text color', async () => {
    const out = await css(`${ROW_OPENS} ${ROW_OPENS_FILL} ${NAME_OPENS}`)
    // #4421D6, the action color for text.
    expect(out).toContain('color: rgb(68 33 214 / var(--tw-text-opacity, 1)) !important')
    expect(out).toMatch(/\.group\\\/row:hover [^{]*>div>:first-child\s*\{\s*text-decoration-line: underline/)
    expect(out).toMatch(/\.group\\\/row:focus-visible [^{]*>div>:first-child\s*\{\s*text-decoration-line: underline/)
    // The canvas, #F0EEE6, under the pointer.
    expect(out).toMatch(/:hover\s*\{\s*--tw-bg-opacity: 1 !important;\s*background-color: rgb\(240 238 230/)
    // A name printed as plain text is underlined with the row too.
    expect(out).toMatch(/\.group\\\/row:hover [^{]*:not\(:has\(\*\)\)\s*\{\s*text-decoration-line: underline/)
  })

  it('a row that opens, in the table and in the feed, draws a two-pixel ring in the brand action color under keyboard focus, and none under the pointer', async () => {
    const tr = unescape(bodyRow(table(() => {})).match(/<tr[^>]*>/)![0])
    for (const c of ROW_FOCUS_RING.split(' ')) expect(tr).toContain(c)
    const feed = renderToStaticMarkup(createElement(ListSurface<Row>, { data: rows, columns, rowKey: (r: Row) => r.id, onRowClick: () => {}, defaultView: 'feed' } as any))
    for (const c of ROW_FOCUS_RING.split(' ')) expect(unescape(feed)).toContain(c)
    expect(bodyRow(table())).not.toContain('outline')
    const out = await css(ROW_FOCUS_RING)
    // #5228FF, the action color the brand kit gives a filled button and a ring.
    expect(out).toMatch(/:focus-visible\s*\{\s*outline-color: #5228FF/i)
    expect(out).toMatch(/:focus-visible\s*\{\s*outline-width: 2px/)
    expect(out).toMatch(/:focus-visible\s*\{\s*outline-style: solid/)
    expect(out).toMatch(/:focus-visible\s*\{\s*outline-offset: -2px/)
    expect(out).not.toMatch(/:focus\s*\{|:hover\s*\{/)
  })
})
