/**
 * Every link Ask Etyme hands a person opens a page that person's own menu
 * offers. Walk 8, item 14 (2026-11-09): Brightmoor's account manager asked
 * what she earned in commission, the answer was right, and its link went to
 * Payroll's Commissions, which refuses her. "A menu entry the route will
 * refuse is a menu entry that lies"; a link in an answer is the same door
 * one step further out.
 *
 * So an answer is put through the reader's own menu, the one the sidebar
 * draws from the same permissions, before it is sent:
 *
 *  - a link to a page this kind of firm's menu draws, kept off this seat's
 *    menu by its permissions, goes to the seat's own page of the same name
 *    where it has one, and is dropped where it has none;
 *  - a link to a page this kind of firm's menu never draws (a client's job
 *    page handed to a supplier) goes to the seat's own page of the same
 *    name where it has one, and is otherwise left: the menu table is not
 *    the route's gate, and the twin's ledger, which a supplier's menu does
 *    not name yet, opens for any seat that reads the twin;
 *  - a link to a page no menu draws (a placement, a week, a decision) is
 *    left as it is: its own route decides it.
 *
 * Where the seat's permissions are unknown the answer is left untouched,
 * because a menu read with no permissions shows every page. Pure.
 */

import { getNavForKind, ASK_ETYME_HREF, type NavSection, type CompanyKind } from '@/lib/nav-table'
import type { Answer } from './ask'

type Link = { label: string; href: string }

/** The seat facts the reader's own menu was read with, permissions aside. */
export interface MenuFacts {
  companyKind?: string | null
  party?: string | null
  client?: string | null
  earnsCommission?: boolean
}

const pathOf = (href: string) => href.split(/[?#]/)[0]
const KINDS: CompanyKind[] = ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP']

let anyMenu: Set<string> | null = null
/** Every page any menu draws, for any kind of firm and for a worker: the pages a menu decides. */
function pagesAnyMenuDraws(): Set<string> {
  if (anyMenu) return anyMenu
  const out = new Set<string>()
  const add = (menu: readonly NavSection[]) => { for (const s of menu) for (const i of s.items) out.add(pathOf(i.href)) }
  for (const k of KINDS) for (const earns of [false, true]) add(getNavForKind(k, false, { permissions: null, earnsCommission: earns }))
  for (const k of KINDS) add(getNavForKind(k, false, { permissions: null, seatedAtClient: 'a client' }))
  add(getNavForKind(null, true, { permissions: null }))
  anyMenu = out
  return out
}

/** The pages this kind of seat's menu draws for somebody holding every permission. */
function pagesThisKindDraws(f: MenuFacts): Set<string> {
  const worker = f.party === 'WORKER'
  const kind = (f.companyKind ?? null) as CompanyKind | null
  const menu = getNavForKind(kind, worker, { permissions: null, seatedAtClient: f.client ?? null, earnsCommission: Boolean(f.earnsCommission) })
  return new Set(menu.flatMap((s) => s.items.map((i) => pathOf(i.href))))
}

/** The reader's own pages, by path and by the name the menu gives them. */
function readersPages(menu: readonly NavSection[]): { paths: Set<string>; byLabel: Map<string, string> } {
  const paths = new Set<string>([pathOf(ASK_ETYME_HREF)])
  const byLabel = new Map<string, string>()
  for (const s of menu) {
    for (const i of s.items) {
      paths.add(pathOf(i.href))
      const name = i.label.trim().toLowerCase()
      if (!byLabel.has(name)) byLabel.set(name, i.href)
    }
  }
  return { paths, byLabel }
}

/** "Open the bench" → "bench"; "Open Invoice receipts" → "invoice receipts". */
const nameOf = (label: string) => label.trim().replace(/^open\s+/i, '').replace(/^the\s+/i, '').toLowerCase()

/**
 * Where a link should go for this reader: its own href, the reader's own
 * page of the same name, or nowhere (null). Pure.
 */
export function doorFor(
  href: string,
  label: string | null,
  ctx: { mine: ReturnType<typeof readersPages>; kindDraws: Set<string>; anyDraws: Set<string> },
): string | null {
  const p = pathOf(href)
  if (!/^\/dashboard(\/|$)/.test(p) || ctx.mine.paths.has(p) || !ctx.anyDraws.has(p)) return href
  const same = label ? ctx.mine.byLabel.get(nameOf(label)) : undefined
  if (same) return same
  // Kept off this seat's menu by its permissions: the route refuses them.
  if (ctx.kindDraws.has(p)) return null
  // A page this kind of firm's menu never draws: its own route decides it.
  return href
}

/**
 * The answer with every link, table row and "take me there" read through
 * the reader's own menu. `menu` is the seat's menu as the sidebar draws it
 * (`menuOf` in ./ask); `facts` are what it was read with. Pure.
 */
/** What the guard reads and writes on any answer: the parts that carry a page. */
type Doors = {
  links?: Link[]
  saysLinks?: { text: string; href: string }[]
  table?: { caption: string; head: string[]; rows: { cells: string[]; href?: string }[] }
  place?: string
  go?: boolean
}

export function onTheReadersMenu<A extends Answer>(answer: A, menu: readonly NavSection[], facts: MenuFacts & { permissions?: readonly string[] | null }): A {
  // Read with no permissions, the menu shows every page: nothing to judge by.
  if (facts.permissions === null) return answer
  const ctx = { mine: readersPages(menu), kindDraws: pagesThisKindDraws(facts), anyDraws: pagesAnyMenuDraws() }
  const a = answer as unknown as Doors
  const out: Doors = { ...a }
  if (Array.isArray(a.links)) {
    const seen = new Set<string>()
    const kept: Link[] = []
    for (const l of a.links) {
      const href = doorFor(l.href, l.label, ctx)
      if (href && !seen.has(href)) {
        seen.add(href)
        kept.push(href === l.href ? l : { ...l, href })
      }
    }
    out.links = kept
  }
  if (Array.isArray(a.saysLinks)) {
    const kept: { text: string; href: string }[] = []
    for (const l of a.saysLinks) {
      const href = doorFor(l.href, l.text, ctx)
      if (href) kept.push(href === l.href ? l : { ...l, href })
    }
    out.saysLinks = kept
  }
  if (a.table && Array.isArray(a.table.rows)) {
    out.table = {
      ...a.table,
      rows: a.table.rows.map((r) => {
        if (!r.href) return r
        const href = doorFor(r.href, null, ctx)
        if (href) return href === r.href ? r : { ...r, href }
        // Kept off the reader's menu: the row reads, and opens nothing.
        return { cells: r.cells }
      }),
    }
  }
  if (typeof a.place === 'string') {
    const href = doorFor(a.place, null, ctx)
    if (href) out.place = href
    else {
      delete out.place
      delete out.go
    }
  }
  return out as unknown as A
}
