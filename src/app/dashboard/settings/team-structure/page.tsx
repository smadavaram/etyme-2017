'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent } from 'react'
import { usePageSection } from '@/components/page-section'
import { ErrorState, LoadingState, PageHead, RefusedState, Field, Input, Select } from '@/components/ui'
import { actBody, type Act, type ActValues } from '@/lib/team-structure/acts'
import { deletePlan, KINDS_OFFERED, kindWord, namesShown } from '@/lib/team-structure/tree'
import type { BoxRead, SeatName, TreeRead } from '@/lib/team-structure/types'
import { ImportDialog } from './import-dialog'
import { useSession } from '@/components/session-provider'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { mayOpen } from '@/lib/nav-table'
import { IMPORT_RECORDS_HREF, IMPORT_RECORDS_LABEL, READ_TEAMS_LABEL, READ_TEAMS_SAYS } from '@/lib/team-structure/directory/words'
import { googleOutcomeSays, entraOutcomeSays } from '@/lib/team-structure/directory/outcome'
import { centeredScroll, drawsAsList, foldedAtOpen, holdStopsHere, LIST_SHOWS, listPeople, menuStaysOpen, noTeamsSays, offersMakeLead, PERSON_LINK, roleInWords } from '@/lib/team-structure/screen'
import { clockFor, dayOfMomentFor, momentFor, readerZone } from '@/lib/when'

/**
 * Settings → Team structure: who leads what, and where (founder,
 * 2026-11-09, "Build it", on the drawing of Corvane Packaging).
 *
 * The company at the top, then its departments, regions, sites and teams,
 * drawn top down, the last level stacked downward, the chosen box's
 * editor beside the tree, and on a phone the same tree as an indented
 * list. Every act is one gesture and one call to /api/settings/team-structure:
 * drag a box onto a box to put it under, onto its edge to put it beside;
 * drag a name onto a box to move that person, or a contractor's charging
 * unit; + Under and + Beside (U and B); Delete with the confirmation that
 * says what moves up; Undo; and a right-click menu (press and hold on a
 * phone) on a box and on a name. After every act the tree is read again,
 * so the screen never shows a change the record did not make.
 *
 * Two of the drawing's menu lines open the screen that owns the act rather
 * than doing it here, because both change what somebody may do: a seat's
 * role is changed under Users & permissions, and "Give access to this
 * team" opens Give access there.
 */

type Said = { says: string; no: boolean } | null
type Drag = { kind: 'box'; id: string } | { kind: 'person'; contextId: string; from: string | null } | { kind: 'contractor'; sellContractId: string; from: string }
type Zone = 'in' | 'before' | 'after'
type MenuFor = { for: 'box'; id: string | null } | { for: 'person'; contextId: string; box: string | null; name: string } | { for: 'contractor'; sellContractId: string; box: string; name: string }
type Menu = MenuFor & { x: number; y: number; at: number; touch: boolean }
type Choose = { kind: 'person'; contextId: string; name: string; from: string | null } | { kind: 'contractor'; sellContractId: string; name: string; from: string }

const ROOT = '__company__'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const zoneOf = (e: DragEvent, el: HTMLElement, stacked: boolean): Zone => {
  const r = el.getBoundingClientRect()
  const f = stacked ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
  return f < 0.22 ? 'before' : f > 0.78 ? 'after' : 'in'
}
const localTime = (tz: string) => clockFor(new Date(), tz) ?? ''

export default function TeamStructurePage() {
  const seat = sidebarPropsFrom(useSession())
  const eyebrow = usePageSection('/dashboard/settings/team-structure')
  const [tree, setTree] = useState<TreeRead | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<string>(ROOT)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [said, setSaid] = useState<Said>(null)
  const [busy, setBusy] = useState(false)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [allNames, setAllNames] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<Menu | null>(null)
  const [importing, setImporting] = useState(false)
  const [everyone, setEveryone] = useState(false)
  // Google sends the administrator back here with a short code; the
  // sentence is chosen from the code, and the code leaves the address.
  const [googleBack, setGoogleBack] = useState<{ source: 'GOOGLE' | 'ENTRA'; said: { says: string; no: boolean } } | null>(null)
  useEffect(() => {
    // Microsoft does the same with ?entra=<code>.
    const url = new URL(window.location.href)
    const key = url.searchParams.has('entra') ? 'entra' : url.searchParams.has('google') ? 'google' : null
    if (!key) return
    const said = key === 'entra' ? entraOutcomeSays(url.searchParams.get('entra')) : googleOutcomeSays(url.searchParams.get('google'))
    url.searchParams.delete(key)
    window.history.replaceState(null, '', url.pathname + (url.search || ''))
    if (said) { setGoogleBack({ source: key === 'entra' ? 'ENTRA' : 'GOOGLE', said }); setImporting(true) }
  }, [])
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null)
  const [choose, setChoose] = useState<Choose | null>(null)
  const pane = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  // Center the company box once per open, after the folded tree is drawn
  // and laid out (re-walk 10b: a timer before layout missed 6 times in 8).
  const center = useRef(false)
  const editor = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/team-structure')
      const j = await res.json().catch(() => null)
      if (res.status === 403) return setRefused(j?.error?.message ?? 'The team structure is drawn by the Owner and the Admin.')
      if (!res.ok) throw new Error(j?.error?.message ?? 'The team structure could not be read. Try again.')
      setTree(j.data)
      setError(null)
      if (!opened.current) {
        opened.current = true
        // Opens the way the drawing did: every region folded but the first,
        // so the tree fits, and the company box in the middle of the pane.
        setFolded(foldedAtOpen((j.data as TreeRead).boxes))
        center.current = true
      }
    } catch (e: any) {
      setError(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const boxes = useMemo(() => new Map((tree?.boxes ?? []).map((b) => [b.id, b])), [tree])
  const kidsOf = useCallback((id: string | null) => (tree?.boxes ?? []).filter((b) => b.parentId === id), [tree])
  const isUnder = useCallback((id: string | null, ancestor: string) => {
    for (let at = id, i = 0; at && i < 64; i++) {
      if (at === ancestor) return true
      at = boxes.get(at)?.parentId ?? null
    }
    return false
  }, [boxes])

  /** One act, one call; the tree is read again whatever came back. */
  const act = useCallback(async (a: Act, v: ActValues, select?: (unitId: string | null) => string | null) => {
    setBusy(true)
    setMenu(null)
    try {
      const res = await fetch('/api/settings/team-structure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(actBody(a, v)) })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        setSaid({ says: j?.error?.message ?? 'That change was not saved. Try again.', no: true })
      } else {
        setSaid({ says: j.data.says, no: false })
        setPendingDelete(false)
        const next = select ? select(j.data.unitId ?? null) : null
        if (next !== null) setSel(next)
      }
    } catch {
      setSaid({ says: 'That change was not saved: the connection dropped. Try again.', no: true })
    } finally {
      await load()
      setBusy(false)
    }
  }, [load])

  const addUnder = useCallback((parent: string | null) => act('ADD', { parentId: parent, at: null, name: null, kind: null }, (id) => id), [act])
  const addBeside = useCallback((id: string) => {
    const b = boxes.get(id)
    if (!b) return
    const row = kidsOf(b.parentId).map((x) => x.id)
    act('ADD', { parentId: b.parentId, at: row.indexOf(id) + 1, name: null, kind: null }, (nid) => nid)
  }, [act, boxes, kidsOf])
  const askDelete = (id: string) => {
    setSel(id)
    setPendingDelete(true)
    setSaid(null)
  }

  useLayoutEffect(() => {
    if (!center.current || !tree) return
    center.current = false
    const place = () => {
      const p = pane.current
      const root = p?.querySelector<HTMLElement>(`[data-box="${ROOT}"]`)
      if (p && root) p.scrollLeft = centeredScroll(root.offsetLeft, root.offsetWidth, p.clientWidth)
    }
    place()
    // Once more after the browser has painted, in case fonts or the pane's width settled late.
    const frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [tree, folded])

  // ── Keyboard: U, B, Delete on a box ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setImporting(false); return }
      const el = e.target as HTMLElement | null
      const id = el?.dataset?.box
      if (!id || busy) return
      const k = e.key.toLowerCase()
      if (k === 'u') { e.preventDefault(); addUnder(id === ROOT ? null : id) }
      if (k === 'b' && id !== ROOT) { e.preventDefault(); addBeside(id) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && id !== ROOT) { e.preventDefault(); askDelete(id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addUnder, addBeside, busy])
  useEffect(() => {
    // A held press on a phone scrolls a little as it lifts; that is not
    // somebody leaving the menu.
    const close = () => setMenu((m) => (m && menuStaysOpen(m, Date.now(), 'scroll') ? m : null))
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [])

  // ── Drag and drop ──
  const onDragStart = (d: Drag) => (e: DragEvent) => {
    e.stopPropagation()
    drag.current = d
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', 'etyme-team') } catch {}
  }
  const onDragOver = (id: string, stacked: boolean) => (e: DragEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'contractor' && id === ROOT) return
    e.preventDefault()
    // A box onto itself or a box below it is let through, so the route's
    // own sentence says why it cannot go there; it is never drawn as a target.
    if (d.kind === 'box' && (id === d.id || (id !== ROOT && isUnder(id, d.id)))) { if (drop) setDrop(null); return }
    const zone: Zone = d.kind !== 'box' || id === ROOT ? 'in' : zoneOf(e, e.currentTarget, stacked)
    if (drop?.id !== id || drop.zone !== zone) setDrop({ id, zone })
  }
  const onDrop = (id: string, stacked: boolean) => (e: DragEvent<HTMLElement>) => {
    const d = drag.current
    drag.current = null
    setDrop(null)
    if (!d) return
    e.preventDefault()
    const target = id === ROOT ? null : id
    if (d.kind === 'person') return act('MOVE_PERSON', { contextId: d.contextId, unitId: target }, () => id)
    if (d.kind === 'contractor') return target && act('MOVE_CONTRACTOR', { sellContractId: d.sellContractId, unitId: target }, () => id)
    const zone: Zone = id === ROOT || id === d.id || isUnder(id, d.id) ? 'in' : zoneOf(e, e.currentTarget, stacked)
    if (zone === 'in') return act('MOVE', { unitId: d.id, parentId: target, at: null }, () => d.id)
    const b = boxes.get(id)!
    const row = kidsOf(b.parentId).map((x) => x.id).filter((x) => x !== d.id)
    act('MOVE', { unitId: d.id, parentId: b.parentId, at: row.indexOf(id) + (zone === 'after' ? 1 : 0) }, () => d.id)
  }
  const onDragEnd = () => { drag.current = null; setDrop(null) }

  // ── The menu, by right-click or a press held on a phone ──
  const openMenu = (m: MenuFor, x: number, y: number, touch = false) => {
    setMenu({ ...m, at: Date.now(), touch, x: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 240), y: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320) })
  }
  const onContext = (m: MenuFor) => (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (m.for === 'box') { setSel(m.id ?? ROOT); setPendingDelete(false) }
    openMenu(m, e.clientX, e.clientY)
  }
  const onTouchStart = (m: MenuFor) => (e: TouchEvent) => {
    // A name held inside a box opens the name's menu, never the box's.
    if (holdStopsHere(m.for)) e.stopPropagation()
    const t = e.touches[0]
    if (press.current) clearTimeout(press.current)
    press.current = setTimeout(() => { if (m.for === 'box') setSel(m.id ?? ROOT); openMenu(m, t.clientX, t.clientY, true) }, 550)
  }
  const onTouchEnd = () => { if (press.current) clearTimeout(press.current) }
  const focusField = (id: string) => setTimeout(() => {
    const f = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
    f?.focus()
    f?.scrollIntoView({ block: 'center' })
  }, 0)

  if (refused) return <RefusedState says={refused} />
  if (error && !tree) return <ErrorState says={error} />
  if (!tree) return <LoadingState says="Opening your team structure…" />

  const company = tree.company
  const chosen = sel === ROOT ? null : boxes.get(sel) ?? null

  // ── A box, and the tree under it ──
  const nameRow = (key: string, label: string, aside: string, d: Drag, m: MenuFor) => (
    <div
      key={key}
      draggable
      onDragStart={onDragStart(d)}
      onDragEnd={onDragEnd}
      onContextMenu={onContext(m)}
      onTouchStart={onTouchStart(m)}
      onTouchEnd={onTouchEnd}
      className="-mx-1 flex cursor-grab justify-between gap-2 rounded-box px-1 text-[12px] leading-snug hover:bg-etyme-sunk"
    >
      {/* A name and a role wrap to a second line and are never cut
          (fault 18: "Account Man…"); a person's name opens Users &
          permissions. */}
      {m.for === 'person'
        ? <a href={PERSON_LINK} draggable={false} onClick={(e) => e.stopPropagation()} className="min-w-0 break-words text-etyme-ink hover:underline [-webkit-touch-callout:none]">{label}</a>
        : <span className="min-w-0 break-words">{label}</span>}
      <span className="max-w-[50%] shrink-0 break-words text-right text-[11px] text-etyme-faint">{aside}</span>
    </div>
  )

  const names = (b: BoxRead | null): ReactNode => {
    const id = b?.id ?? ROOT
    const people: SeatName[] = b ? b.people : tree.unplaced
    const rows = [
      ...people.map((p) => ({ key: `p-${p.contextId}`, node: nameRow(`p-${p.contextId}`, p.name, p.role ?? '', { kind: 'person', contextId: p.contextId, from: b?.id ?? null }, { for: 'person', contextId: p.contextId, box: b?.id ?? null, name: p.name }) })),
      ...(b?.contractors ?? []).map((c) => ({
        key: `c-${c.sellContractId}`,
        node: nameRow(`c-${c.sellContractId}`, c.name, c.onSite ? (c.job ?? 'Contractor') : 'Starting', { kind: 'contractor', sellContractId: c.sellContractId, from: b!.id }, { for: 'contractor', sellContractId: c.sellContractId, box: b!.id, name: c.name }),
      })),
    ]
    if (!rows.length) return null
    const { shown, more } = namesShown(rows, allNames.has(id))
    const extra = (b?.morePeople ?? 0) + (b?.moreContractors ?? 0)
    return (
      <div className="mt-1.5 flex flex-col gap-px border-t border-etyme-rule pt-1.5">
        {shown.map((r) => r.node)}
        {(more > 0 || allNames.has(id)) && (
          <button
            className="-mx-1 rounded-box px-1 text-left text-[12px] text-etyme-action-press hover:bg-etyme-sunk"
            onClick={(e) => { e.stopPropagation(); const s = new Set(allNames); s.has(id) ? s.delete(id) : s.add(id); setAllNames(s) }}
          >
            {more > 0 ? `and ${more} more` : 'Show fewer'}
          </button>
        )}
        {extra > 0 && <span className="text-[11px] text-etyme-faint">{plural(extra, 'more name')} on the full lists</span>}
      </div>
    )
  }

  const boxCard = (b: BoxRead | null, stacked: boolean) => {
    const id = b?.id ?? ROOT
    const isSel = sel === id
    const isRoot = !b
    const kids = kidsOf(b?.id ?? null)
    const hint = drop?.id === id ? drop.zone : null
    const tag = b?.site ? b.roll.currencies.join(', ') : b && b.roll.countries.length > 1 ? plural(b.roll.countries.length, 'country', 'countries') : ''
    const warn = b && b.roll.nearestLimitDays !== null && b.roll.nearestLimitDays <= 30
    return (
      <div
        data-box={id}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSel}
        aria-label={`${b ? `${b.kindWord} ${b.name}` : company.name}`}
        draggable={!isRoot}
        onDragStart={b ? onDragStart({ kind: 'box', id: b.id }) : undefined}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver(id, stacked)}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop(id, stacked)}
        onClick={() => {
          if (sel !== id) { setSel(id); setPendingDelete(false); setSaid(null) }
          if (typeof window !== 'undefined' && window.innerWidth < 1024) setTimeout(() => editor.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(id) } }}
        onContextMenu={onContext({ for: 'box', id: b?.id ?? null })}
        onTouchStart={onTouchStart({ for: 'box', id: b?.id ?? null })}
        onTouchEnd={onTouchEnd}
        className={[
          'relative flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left sm:w-[176px]',
          isRoot ? 'cursor-pointer border-etyme-ink bg-etyme-ink text-etyme-canvas sm:w-[210px]' : 'cursor-grab border-etyme-rule bg-etyme-raised hover:border-etyme-faint',
          b?.kind === 'DEPARTMENT' ? 'border-t-[3px] border-t-etyme-action' : '',
          b?.kind === 'REGION' ? 'border-t-[3px] border-t-etyme-verified' : '',
          isSel ? 'border-etyme-action ring-[3px] ring-etyme-action-wash' : '',
          hint === 'in' ? 'border-etyme-action bg-etyme-action-wash' : '',
          hint === 'before' ? (stacked ? 'shadow-[0_-3px_0_0_var(--color-action)]' : 'shadow-[-3px_0_0_0_var(--color-action)]') : '',
          hint === 'after' ? (stacked ? 'shadow-[0_3px_0_0_var(--color-action)]' : 'shadow-[3px_0_0_0_var(--color-action)]') : '',
        ].join(' ')}
      >
        <span className={`flex justify-between gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] ${isRoot ? 'opacity-75' : 'text-etyme-muted'}`}>
          <span>{b ? b.kindWord : 'Company'}</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {tag}
            {b && kids.length > 0 && (
              <button
                aria-label={`${folded.has(b.id) ? 'Open' : 'Fold'} ${b.name}`}
                onClick={(e) => { e.stopPropagation(); const s = new Set(folded); s.has(b.id) ? s.delete(b.id) : s.add(b.id); setFolded(s) }}
                className="h-5 w-5 rounded-full border border-etyme-rule text-[11px] leading-[18px] text-etyme-muted"
              >
                {folded.has(b.id) ? kids.length : '−'}
              </button>
            )}
          </span>
        </span>
        <span className="text-[13.5px] font-medium leading-tight">{b ? b.name : company.name}</span>
        <span className={`text-[12px] leading-snug ${isRoot ? 'opacity-75' : 'text-etyme-muted'}`}>
          {b ? (b.lead ? `${b.lead.name}${b.lead.role ? ` · ${b.lead.role}` : ''}` : 'No lead yet') : tree.owner ? `${tree.owner.name} · Owner` : 'No Owner seated'}
        </span>
        {b && (
          <span className="font-mono text-[11px] tabular-nums text-etyme-faint">
            {b.line.split(' · ').map((part, i) => (
              <span key={i} className={warn && /limit/.test(part) ? 'text-etyme-attention' : ''}>{i ? ' · ' : ''}{part}</span>
            ))}
          </span>
        )}
        {names(b)}
        {isSel && (
          <span className="mt-2 flex flex-wrap gap-1">
            <QuickButton root={isRoot} onClick={() => addUnder(b?.id ?? null)} disabled={busy}>+ Under</QuickButton>
            {b && <QuickButton root={false} onClick={() => addBeside(b.id)} disabled={busy}>+ Beside</QuickButton>}
            {b && <QuickButton root={false} onClick={() => askDelete(b.id)} disabled={busy}>Delete</QuickButton>}
          </span>
        )}
      </div>
    )
  }

  const branch = (b: BoxRead | null, stacked: boolean): ReactNode => {
    const kids = kidsOf(b?.id ?? null)
    const open = kids.length > 0 && !(b && folded.has(b.id))
    // The last level stacks downward: a row whose boxes have nothing under them.
    const stack = Boolean(b) && kids.every((k) => kidsOf(k.id).length === 0)
    return (
      <li key={b?.id ?? ROOT}>
        {boxCard(b, stacked)}
        {open && <ul className={stack ? 'org-stack' : ''}>{kids.map((k) => branch(k, stack))}</ul>}
      </li>
    )
  }

  const asList = drawsAsList(tree)
  const peopleLine = `${tree.peopleSays}${tree.peopleSays.endsWith('.') ? '' : '.'}`
  const head = (
    <PageHead
      eyebrow={eyebrow}
      title="Who leads what, and where"
      subtitle={asList
        ? `Every change is kept with who made it and when. ${peopleLine}`
        : `Drag a box to move a team. Drag a name to move a person. Every change is kept with who made it and when. ${peopleLine}`}
      actions={
        <>
          {asList && <button className="btn-primary" disabled={busy} onClick={() => addUnder(null)}>Add a team</button>}
          <button className={asList ? 'btn-secondary' : 'btn-primary'} onClick={() => setImporting(true)}>{READ_TEAMS_LABEL}</button>
          {/* Undo only where there is a change to undo; another person's last change says whose it was. */}
          {tree.lastChange && (
            <button
              className="btn-secondary"
              disabled={busy || !tree.lastChange.yours}
              title={!tree.lastChange.yours ? `The last change was ${tree.lastChange.by ?? 'somebody else'}'s.` : undefined}
              onClick={() => act('UNDO', {})}
            >
              Undo
            </button>
          )}
        </>
      }
    />
  )
  const crossLink = (
    <p className="text-[12.5px] text-etyme-muted">
      {READ_TEAMS_SAYS}{' '}
      {mayOpen(IMPORT_RECORDS_HREF, seat.permissions)
        ? <><a href={IMPORT_RECORDS_HREF} className="text-etyme-action-press hover:underline">{IMPORT_RECORDS_LABEL}</a>.</>
        : `${IMPORT_RECORDS_LABEL}.`}
    </p>
  )
  const popups = (
    <>
      {menu && (
        <ContextMenu
          menu={menu}
          tree={tree}
          boxes={boxes}
          kidsOf={kidsOf}
          folded={folded}
          onClose={() => setMenu(null)}
          onAct={act}
          onAddUnder={addUnder}
          onAddBeside={addBeside}
          onAskDelete={askDelete}
          onFold={(id) => { const s = new Set(folded); s.has(id) ? s.delete(id) : s.add(id); setFolded(s) }}
          onFocus={focusField}
          onSay={(says) => setSaid({ says, no: false })}
          onChoose={setChoose}
        />
      )}
      {choose && <Chooser choose={choose} tree={tree} busy={busy} onClose={() => setChoose(null)} onAct={act} />}
      {importing && <ImportDialog opening={googleBack ?? undefined} onClose={() => { setImporting(false); setGoogleBack(null) }} onApplied={async (says: string) => { setImporting(false); setSaid({ says, no: false }); await load() }} />}
    </>
  )

  // ── A company with no teams: a plain list of its people, never a chart of one box ──
  if (asList) {
    const people = listPeople(tree.owner, tree.unplaced)
    const shown = everyone ? people : people.slice(0, LIST_SHOWS)
    return (
      <div className="mx-auto max-w-[900px] space-y-5 px-4 py-6">
        {head}
        {crossLink}
        {said && <p role="status" className={`text-[13px] ${said.no ? 'text-etyme-attention' : 'text-etyme-verified'}`}>{said.says}</p>}
        <section className="rounded-lg border border-etyme-rule bg-etyme-surface p-4">
          <p className="text-[14px] text-etyme-ink">{noTeamsSays(company.name)}</p>
          <ul className="mt-3 divide-y divide-etyme-rule" aria-label={`${company.name}'s people`}>
            {shown.map((p) => {
              const m: MenuFor = { for: 'person', contextId: p.contextId, box: null, name: p.name }
              return (
                <li
                  key={p.contextId}
                  onContextMenu={onContext(m)}
                  onTouchStart={onTouchStart(m)}
                  onTouchEnd={onTouchEnd}
                  className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="min-w-0">
                    <a href={PERSON_LINK} className="break-words text-[14px] font-medium text-etyme-ink hover:underline [-webkit-touch-callout:none]">{p.name}</a>
                    {p.email && <span className="block break-all text-[12px] text-etyme-muted">{p.email}</span>}
                  </span>
                  <span className="break-words text-[13px] text-etyme-muted sm:text-right">{roleInWords(p.role)}</span>
                </li>
              )
            })}
          </ul>
          {people.length > LIST_SHOWS && (
            <button className="mt-2 text-[13px] text-etyme-action-press hover:underline" onClick={() => setEveryone(!everyone)}>
              {everyone ? 'Show fewer' : `Show everyone (${people.length})`}
            </button>
          )}
          <p className="mt-3 text-[12px] text-etyme-faint">Right-click a name, or press and hold on a phone, for what you can do with that person.</p>
        </section>
        {popups}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-5 px-4 py-6">
      {head}
      {crossLink}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-etyme-muted">
        <span><b className="font-medium text-etyme-ink">Drop on a box</b> to put it under that box</span>
        <span><b className="font-medium text-etyme-ink">Drop on its edge</b> to put it beside</span>
        <span><b className="font-medium text-etyme-ink">Right-click a box</b> (or press and hold on a phone) for every action</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div ref={pane} className="max-h-[78vh] overflow-auto rounded-r-lg border border-etyme-rule bg-etyme-surface px-3.5 pb-8 pt-5" role="tree" aria-label={`${company.name}'s team structure`}>
          <ul className="org-tree">{branch(null, false)}</ul>
        </div>
        <div ref={editor} className="scroll-mt-4">
        <Editor
          tree={tree}
          box={chosen}
          kidsOf={kidsOf}
          isUnder={isUnder}
          busy={busy}
          said={said}
          pendingDelete={pendingDelete}
          onAct={act}
          onAddUnder={() => addUnder(chosen?.id ?? null)}
          onAddBeside={() => chosen && addBeside(chosen.id)}
          onAskDelete={() => chosen && askDelete(chosen.id)}
          onKeep={() => setPendingDelete(false)}
          onSelect={setSel}
        />
        </div>
      </div>

      {popups}
    </div>
  )
}

function QuickButton({ root, children, ...props }: { root: boolean; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      {...props}
      onClick={(e) => { e.stopPropagation(); props.onClick() }}
      className={`rounded-nav border px-1.5 py-0.5 text-[11.5px] ${root ? 'border-etyme-canvas/40 bg-transparent text-etyme-canvas' : 'border-etyme-rule bg-etyme-raised text-etyme-ink'}`}
    >
      {children}
    </button>
  )
}

// ── The editor beside the tree ───────────────────────────────────────

function Editor(props: {
  tree: TreeRead
  box: BoxRead | null
  kidsOf: (id: string | null) => BoxRead[]
  isUnder: (id: string | null, ancestor: string) => boolean
  busy: boolean
  said: Said
  pendingDelete: boolean
  onAct: (a: Act, v: ActValues, select?: (unitId: string | null) => string | null) => Promise<void>
  onAddUnder: () => void
  onAddBeside: () => void
  onAskDelete: () => void
  onKeep: () => void
  onSelect: (id: string) => void
}) {
  const { tree, box, busy, said } = props
  const [name, setName] = useState(box?.name ?? '')
  useEffect(() => setName(box?.name ?? ''), [box?.id, box?.name])
  const company = tree.company

  const kids = props.kidsOf(box?.id ?? null)
  const people = box ? box.people : tree.unplaced
  const onBox = new Set(people.map((p) => p.contextId))
  const moveTargets = box ? tree.boxes.filter((b) => b.id !== box.parentId && !props.isUnder(b.id, box.id)) : []

  const plan = box && props.pendingDelete
    ? deletePlan({
        unit: box, parent: tree.boxes.find((b) => b.id === box.parentId) ?? null, companyName: company.name,
        childNames: kids.map((k) => k.name), people: box.people.map((p) => p.name),
        contractors: box.contractors.filter((c) => c.onSite).length, starting: box.contractors.filter((c) => !c.onSite).length, holds: [], accountWalls: company.accountWalls,
      })
    : null

  return (
    <aside className="flex flex-col gap-3.5 rounded-r-lg border border-etyme-rule bg-etyme-surface p-4 lg:sticky lg:top-4" aria-live="polite">
      <div>
        <p className="eyebrow">{box ? box.kindWord : 'Company'}</p>
        <h2 className="headline-serif text-[21px] leading-tight text-etyme-ink">{box ? box.name : company.name}</h2>
      </div>

      {plan && (
        <div className="flex flex-col gap-2.5 rounded-lg bg-etyme-danger-wash p-3 text-[13px]">
          <strong className="font-medium">{plan.ok ? `Delete ${box!.name}?` : 'This box stays.'}</strong>
          <span>{plan.says.replace(/^Delete [^?]+\? /, '')}</span>
          <span className="flex flex-wrap gap-2">
            {plan.ok && <button className="btn-primary !bg-etyme-danger !border-etyme-danger" disabled={busy} onClick={() => props.onAct('DELETE', { unitId: box!.id }, (up) => up ?? ROOT)}>Delete</button>}
            <button className="btn-secondary" onClick={props.onKeep}>Keep it</button>
          </span>
        </div>
      )}

      {box ? (
        <>
          <Field label="Name">
            <Input
              id="ts-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (name.trim() && name.trim() !== box.name) props.onAct('RENAME', { unitId: box.id, name: name.trim() }, () => box.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          </Field>
          <Field label="Lead" help={box.lead?.setBy ? `Named by ${box.lead.setBy}${box.lead.setAt ? `, ${dayOfMomentFor(new Date(box.lead.setAt), readerZone())}` : ''}.` : box.lead ? 'Named when the company was set up.' : 'Leading a box gives no access by itself.'}>
            <Select id="ts-lead" value={box.lead?.contextId ?? ''} disabled={busy} onChange={(e) => props.onAct('LEAD', { unitId: box.id, contextId: e.target.value || null }, () => box.id)}>
              <option value="">No lead yet</option>
              {tree.seats.map((s) => <option key={s.contextId} value={s.contextId}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Kind">
            <Select id="ts-kind" value={box.kind} disabled={busy} onChange={(e) => props.onAct('KIND', { unitId: box.id, kind: e.target.value }, () => box.id)}>
              {[...new Set([...KINDS_OFFERED, box.kind])].map((k) => <option key={k} value={k}>{kindWord(k)}</option>)}
            </Select>
          </Field>
          <dl className="grid grid-cols-1 gap-x-3.5 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            <dt className="text-etyme-muted">People</dt><dd className="tabular-nums">{box.roll.people}</dd>
            <dt className="text-etyme-muted">Contractors</dt><dd className="tabular-nums">{box.roll.contractors}</dd>
            <dt className="text-etyme-muted">Teams under it</dt><dd className="tabular-nums">{kids.length}</dd>
            {box.roll.sites > 0 && <><dt className="text-etyme-muted">Sites</dt><dd className="tabular-nums">{box.roll.sites}</dd></>}
            <dt className="text-etyme-muted">Open jobs</dt><dd className="tabular-nums">{box.roll.openJobs}</dd>
            {box.roll.nearestLimitDays !== null && (
              <><dt className="text-etyme-muted">Nearest time limit</dt><dd className={`tabular-nums ${box.roll.nearestLimitDays <= 30 ? 'text-etyme-attention' : ''}`}>{box.roll.nearestLimitDays < 0 ? 'Past it' : plural(box.roll.nearestLimitDays, 'day')}</dd></>
            )}
            {box.roll.currencies.length > 0 && <><dt className="text-etyme-muted">Money in</dt><dd>{box.roll.currencies.join(', ')}</dd></>}
            {box.roll.timeZones.length > 0 && (
              <><dt className="text-etyme-muted">Local time</dt><dd>{box.roll.timeZones.slice(0, 3).map((t) => `${t.split('/').pop()!.replace(/_/g, ' ')} ${localTime(t)}`).join(' · ')}{box.roll.timeZones.length > 3 ? ` · +${box.roll.timeZones.length - 3}` : ''}</dd></>
            )}
            {box.site && <><dt className="text-etyme-muted">Site</dt><dd><a className="text-etyme-action-press" href={`/dashboard/settings/sites?site=${box.site.id}`}>{box.site.name}</a></dd></>}
          </dl>
        </>
      ) : (
        <p className="text-[13px] text-etyme-muted">The company. Boxes under it are its departments; somebody on no box reads the whole company.</p>
      )}

      <div>
        <p className="eyebrow">{box ? `People on this team (${box.people.length})` : `On no team yet (${tree.unplaced.length})`}</p>
        <ul className="mt-1.5 flex max-h-[260px] flex-col gap-1 overflow-auto">
          {people.map((p) => (
            <li key={p.contextId} className="flex items-center gap-2 border-b border-etyme-rule py-0.5 text-[13px]">
              <span className="min-w-0 flex-1">{p.name} <small className="text-etyme-muted">{p.role}</small></span>
              {box && (
                <button aria-label={`Take ${p.name} off this team`} disabled={busy} className="rounded-nav border border-etyme-rule px-1.5 text-[12px]" onClick={() => props.onAct('MOVE_PERSON', { contextId: p.contextId, unitId: null }, () => box.id)}>×</button>
              )}
            </li>
          ))}
          {people.length === 0 && <li className="text-[12.5px] text-etyme-muted">Nobody yet. Add somebody below, or drag a name in.</li>}
        </ul>
      </div>
      {box && box.contractors.length > 0 && (
        <p className="text-[12.5px] text-etyme-muted">
          {plural(box.contractors.length, 'contractor')} charged here. Drag a name onto another box to charge them there; their supplier, rate and dates stay as they are.
        </p>
      )}
      {box && (
        <Field label="Add a person">
          <Select id="ts-person" value="" disabled={busy} onChange={(e) => e.target.value && props.onAct('MOVE_PERSON', { contextId: e.target.value, unitId: box.id }, () => box.id)}>
            <option value="">Choose somebody seated here…</option>
            {tree.seats.filter((s) => !onBox.has(s.contextId)).map((s) => <option key={s.contextId} value={s.contextId}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>)}
          </Select>
        </Field>
      )}
      {box && (
        <Field label="Move under">
          <Select id="ts-move" value="" disabled={busy} onChange={(e) => e.target.value && props.onAct('MOVE', { unitId: box.id, parentId: e.target.value === ROOT ? null : e.target.value, at: null }, () => box.id)}>
            <option value="">Choose a box…</option>
            {box.parentId !== null && <option value={ROOT}>{company.name} (the top)</option>}
            {moveTargets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={props.onAddUnder}>+ Under</button>
        {box && <button className="btn-secondary" disabled={busy} onClick={props.onAddBeside}>+ Beside</button>}
        {box && <button className="btn-secondary" disabled={busy} onClick={props.onAskDelete}>Delete</button>}
      </div>
      <p role={said?.no ? 'alert' : 'status'} className={`min-h-[1.3em] text-[12.5px] ${said?.no ? 'text-etyme-danger' : 'text-etyme-muted'}`}>{said?.says ?? ''}</p>
      {tree.lastChange && (
        <p className="text-[11.5px] text-etyme-faint">
          Last change: {tree.lastChange.says} {tree.lastChange.by ? `${tree.lastChange.by}, ` : ''}{momentFor(new Date(tree.lastChange.at), readerZone())}.
        </p>
      )}
    </aside>
  )
}

// ── The menu on a box or a name ──────────────────────────────────────

function ContextMenu(props: {
  menu: Menu
  tree: TreeRead
  boxes: Map<string, BoxRead>
  kidsOf: (id: string | null) => BoxRead[]
  folded: Set<string>
  onClose: () => void
  onAct: (a: Act, v: ActValues, select?: (unitId: string | null) => string | null) => Promise<void>
  onAddUnder: (parent: string | null) => void
  onAddBeside: (id: string) => void
  onAskDelete: (id: string) => void
  onFold: (id: string) => void
  onFocus: (fieldId: string) => void
  onSay: (says: string) => void
  onChoose: (c: Choose) => void
}) {
  const { menu } = props
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    // The mouse-down a phone sends after a held press is not a press outside.
    const away = (e: MouseEvent) => {
      if (menuStaysOpen(menu, Date.now(), 'mousedown')) return
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [props])
  const keys = (e: ReactKeyboardEvent) => {
    const bs = [...(ref.current?.querySelectorAll('button') ?? [])]
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus() }
  }
  const item = (label: string, on: () => void, opts: { kbd?: string; bad?: boolean } = {}) => (
    <button key={label} role="menuitem" onClick={() => { props.onClose(); on() }} className={`flex justify-between gap-3 rounded-nav px-2.5 py-1.5 text-left text-[13px] hover:bg-etyme-sunk focus:bg-etyme-sunk focus:outline-none ${opts.bad ? 'text-etyme-danger' : ''}`}>
      <span>{label}</span>{opts.kbd && <kbd className="font-mono text-[11px] text-etyme-faint">{opts.kbd}</kbd>}
    </button>
  )
  const hr = (k: string) => <hr key={k} className="my-1 border-etyme-rule" />

  let head = ''
  let items: ReactNode[] = []
  if (menu.for === 'box') {
    const b = menu.id ? props.boxes.get(menu.id) ?? null : null
    head = b ? b.name : props.tree.company.name
    items = [
      item('Add a box under', () => props.onAddUnder(b?.id ?? null), { kbd: 'U' }),
      b && item('Add a box beside', () => props.onAddBeside(b.id), { kbd: 'B' }),
      b && item('Add a person…', () => props.onFocus('ts-person')),
      hr('h1'),
      b && item('Rename…', () => props.onFocus('ts-name')),
      b && item('Name the lead…', () => props.onFocus('ts-lead')),
      b?.lead && item('Change the lead’s role…', () => { window.location.href = '/dashboard/access' }),
      ...(b ? KINDS_OFFERED.filter((k) => k !== b.kind).map((k) => item(`Make it a ${kindWord(k).toLowerCase()}`, () => props.onAct('KIND', { unitId: b.id, kind: k }, () => b.id))) : []),
      hr('h2'),
      b && props.kidsOf(b.id).length > 0 && item(`${props.folded.has(b.id) ? 'Open' : 'Fold'} the boxes under it`, () => props.onFold(b.id)),
      b && item('Move under…', () => props.onFocus('ts-move')),
      b && item('Give access to this team…', () => { window.location.href = `/dashboard/access?unit=${encodeURIComponent(b.id)}` }),
      b && hr('h3'),
      b && item('Delete', () => props.onAskDelete(b.id), { kbd: 'Del', bad: true }),
    ].filter(Boolean) as ReactNode[]
  } else if (menu.for === 'person') {
    head = menu.name
    items = [
      menu.box && offersMakeLead(props.boxes.get(menu.box)?.lead, menu.contextId) && item('Make team lead', () => props.onAct('LEAD', { unitId: menu.box, contextId: menu.contextId }, () => menu.box)),
      item('Change role…', () => { window.location.href = '/dashboard/access' }),
      item('Move to another team…', () => props.onChoose({ kind: 'person', contextId: menu.contextId, name: menu.name, from: menu.box })),
      menu.box && hr('h1'),
      menu.box && item('Take off this team', () => props.onAct('MOVE_PERSON', { contextId: menu.contextId, unitId: null }, () => menu.box), { bad: true }),
    ].filter(Boolean) as ReactNode[]
  } else {
    head = menu.name
    items = [
      item('Charge to another box…', () => props.onChoose({ kind: 'contractor', sellContractId: menu.sellContractId, name: menu.name, from: menu.box })),
    ]
  }
  return (
    <div ref={ref} role="menu" onKeyDown={keys} style={{ left: menu.x, top: menu.y }} className="fixed z-50 flex min-w-[220px] flex-col rounded-lg border border-etyme-rule bg-etyme-raised p-1.5 shadow-float">
      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-etyme-muted">{head}</p>
      {items}
    </div>
  )
}

// ── Move a person, or charge a contractor elsewhere, without a mouse ──

function Chooser(props: {
  choose: Choose
  tree: TreeRead
  busy: boolean
  onClose: () => void
  onAct: (a: Act, v: ActValues, select?: (unitId: string | null) => string | null) => Promise<void>
}) {
  const { choose, tree } = props
  const [to, setTo] = useState('')
  useEffect(() => { document.getElementById('ts-choose')?.focus() }, [])
  const person = choose.kind === 'person'
  const options = tree.boxes.filter((b) => b.id !== choose.from)
  const go = async () => {
    if (!to) return
    if (choose.kind === 'person') await props.onAct('MOVE_PERSON', { contextId: choose.contextId, unitId: to === ROOT ? null : to }, () => to)
    else await props.onAct('MOVE_CONTRACTOR', { sellContractId: choose.sellContractId, unitId: to }, () => to)
    props.onClose()
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-etyme-ink/35 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={person ? `Move ${choose.name}` : `Charge ${choose.name} to another box`} className="flex w-full max-w-[420px] flex-col gap-3 rounded-r-lg border border-etyme-rule bg-etyme-surface p-5 shadow-float">
        <h2 className="headline-serif text-[19px] text-etyme-ink">{person ? `Move ${choose.name} to another team` : `Charge ${choose.name} to another box`}</h2>
        {!person && <p className="text-[13px] text-etyme-muted">Only the box their line is charged to changes. Their supplier, rate and dates stay as they are.</p>}
        <Field label={person ? 'Team' : 'Box'}>
          <Select id="ts-choose" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go() }}>
            <option value="">Choose a box…</option>
            {person && choose.from !== null && <option value={ROOT}>On no team ({tree.company.name})</option>}
            {options.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.kindWord}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!to || props.busy} onClick={() => void go()}>{person ? 'Move' : 'Charge there'}</button>
          <button className="btn-secondary" onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
