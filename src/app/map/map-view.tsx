'use client'

import { useMemo, useState } from 'react'
import type { MapModel, MapRow } from '@/lib/system-map'
import {
  layout, search, wordsOf, VIEWS, STATUS_COLOR, STATUS_WORD, TEST_COLOR, SIZE,
  type View, type MapNode,
} from '@/lib/system-map-layout'

/**
 * The map, drawn: three views, a search, and a panel that says what a
 * node is when it is clicked. Every figure comes from the model; every
 * color from the chart palette through lib/system-map-layout.
 */
export function MapView({ model }: { model: MapModel }) {
  const [view, setView] = useState<View>('owner')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const drawn = useMemo(() => layout(model, view), [model, view])
  const hay = useMemo(
    () => new Map(drawn.nodes.map((n) => [n.id, wordsOf(model, n).toLowerCase()])),
    [model, drawn],
  )
  const found = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return search(model, drawn.nodes, '')
    return new Set(drawn.nodes.filter((n) => words.every((w) => hay.get(n.id)!.includes(w))).map((n) => n.id))
  }, [query, drawn, hay, model])

  const byId = useMemo(() => new Map(drawn.nodes.map((n) => [n.id, n])), [drawn])
  const near = useMemo(() => {
    if (!selected) return null
    const s = new Set([selected])
    for (const l of drawn.links) {
      if (l.from === selected) s.add(l.to)
      if (l.to === selected) s.add(l.from)
    }
    return s
  }, [selected, drawn])

  // A row selected in one view is the same row in another; a group or a
  // hub is not, so it is let go when the view changes.
  const pick = (id: string | null) => setSelected(id)
  const switchView = (v: View) => {
    setView(v)
    if (selected && !/^(row|test):/.test(selected)) setSelected(null)
  }

  const c = model.counts
  const n = (x: number | null) => (x === null ? '—' : x.toLocaleString('en-US'))
  const searching = query.trim().length > 0
  const shown = searching ? drawn.nodes.filter((x) => found.has(x.id) && x.kind !== 'test').length : null

  return (
    <div className="mt-8">
      <p className="text-sm tabular-nums text-etyme-muted" data-counts>
        <span className="text-etyme-ink">{n(c.filesOwned)}</span> files owned ·{' '}
        <span className="text-etyme-ink">{n(c.agents)}</span> agents ·{' '}
        <span className="text-etyme-ink">{n(c.groups)}</span> groups ·{' '}
        <span className="text-etyme-ink">{n(c.rows)}</span> processes ·{' '}
        {model.statuses.map((s) => (
          <span key={s}><span className="text-etyme-ink">{n(c.byStatus[s])}</span> {STATUS_WORD[s].toLowerCase()} · </span>
        ))}
        <span className="text-etyme-ink">{n(c.owedLines)}</span> lines still owed ·{' '}
        <span className="text-etyme-ink">{n(c.testFiles)}</span> test files ·{' '}
        <span className="text-etyme-ink">{n(c.links)}</span> links ·{' '}
        <span className="text-etyme-ink">{n(c.sentences)}</span> test sentences
      </p>
      {c.sentences === null && (
        <p className="mt-1 text-xs text-etyme-faint">No test file could be read where this page was built, so no sentence is counted.</p>
      )}
      {c.testsProvingNothing !== null && c.testsProvingNothing > 0 && (
        <p className="mt-1 text-xs text-etyme-faint tabular-nums">
          {n(c.testsProvingNothing)} more test files on disk prove no process in the matrix, so they are not drawn.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-md border border-etyme-rule bg-etyme-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key} role="tab" aria-selected={view === v.key}
              onClick={() => switchView(v.key)}
              className={`rounded px-3 py-1.5 text-sm ${view === v.key ? 'bg-etyme-raised text-etyme-ink shadow-sm' : 'text-etyme-muted hover:text-etyme-ink'}`}
            >{v.label}</button>
          ))}
        </div>
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a title, a file or a test sentence"
          aria-label="Search the map"
          className="min-w-[16rem] flex-1 rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-sm"
        />
        {shown !== null && <span className="text-sm tabular-nums text-etyme-muted">{n(shown)} found</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-etyme-muted">
        {model.statuses.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="5" fill={STATUS_COLOR[s]} /></svg>
            {STATUS_WORD[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3" fill={TEST_COLOR} /></svg>
          A test file
        </span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-etyme-rule bg-etyme-surface p-2 text-etyme-ink">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="The map of the system">
            <g>
              {drawn.links.map((l, i) => {
                const a = byId.get(l.from), b = byId.get(l.to)
                if (!a || !b) return null
                const on = near ? near.has(l.from) && near.has(l.to) && (l.from === selected || l.to === selected) : false
                const dim = searching && !(found.has(l.from) && found.has(l.to))
                const base = l.kind === 'test' ? 0.05 : 0.18
                return (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="currentColor" strokeWidth={on ? 1.2 : 0.6}
                    opacity={on ? 0.7 : dim ? 0.02 : near ? base / 2 : base} />
                )
              })}
            </g>
            <g>
              {drawn.nodes.map((node) => (
                <Node key={node.id} node={node}
                  dim={(searching && !found.has(node.id)) || (near !== null && !near.has(node.id))}
                  selected={node.id === selected}
                  onClick={() => pick(node.id === selected ? null : node.id)} />
              ))}
            </g>
          </svg>
        </div>

        <aside className="max-h-[80vh] overflow-auto rounded-lg border border-etyme-rule bg-etyme-surface p-5" aria-live="polite">
          {selected && byId.get(selected)
            ? <Panel model={model} node={byId.get(selected)!} pick={pick} />
            : <p className="text-sm text-etyme-muted">Click a dot to see what it is, who owns it, the files behind it and the sentences that prove it.</p>}
        </aside>
      </div>
    </div>
  )
}

function Node({ node, dim, selected, onClick }: { node: MapNode; dim: boolean; selected: boolean; onClick: () => void }) {
  const fill = node.color ?? 'currentColor'
  const isHub = node.kind === 'agent' || node.kind === 'hub'
  return (
    <g onClick={onClick} className="cursor-pointer" opacity={dim ? 0.15 : 1}>
      <title>{node.label}</title>
      <circle cx={node.x} cy={node.y} r={node.r + (node.kind === 'test' ? 2 : 0)} fill="transparent" />
      <circle cx={node.x} cy={node.y} r={node.r}
        fill={isHub && !node.color ? 'none' : fill}
        stroke={isHub || selected ? 'currentColor' : 'none'}
        strokeWidth={selected ? 2.5 : isHub ? 1.5 : 0} />
      {isHub && <HubLabel node={node} />}
      {node.kind === 'group' && (
        <text x={node.x} y={node.y - node.r - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.6}>
          {node.key.replace(/^L2\./, '')}
        </text>
      )}
    </g>
  )
}

/**
 * A hub's name, set outward from the middle so two neighbors never print
 * over each other: beside the circle on the left and right, above or below
 * it at the top and the bottom.
 */
function HubLabel({ node }: { node: MapNode }) {
  const dx = node.x - SIZE / 2
  const dy = node.y - SIZE / 2
  const side = Math.abs(dx) > 15
  const x = side ? node.x + Math.sign(dx) * (node.r + 6) : node.x
  const y = side ? node.y + 4 : node.y + (dy < 0 ? -(node.r + 6) : node.r + 15)
  return (
    <text x={x} y={y} textAnchor={side ? (dx > 0 ? 'start' : 'end') : 'middle'} fontSize="13" fill="currentColor">
      {node.label}
    </text>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-etyme-faint">{children}</p>
}

function StatusChip({ status }: { status: MapRow['status'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-etyme-muted">
      <svg width="8" height="8" aria-hidden><circle cx="4" cy="4" r="4" fill={STATUS_COLOR[status]} /></svg>
      {STATUS_WORD[status]}
    </span>
  )
}

function RowLink({ r, pick }: { r: MapRow; pick: (id: string) => void }) {
  return (
    <li>
      <button onClick={() => pick(`row:${r.code}`)} className="text-left text-sm hover:underline">
        <span className="tabular-nums text-etyme-faint">{r.code}</span> {r.name}
      </button>{' '}
      <StatusChip status={r.status} />
    </li>
  )
}

export function Panel({ model, node, pick }: { model: MapModel; node: MapNode; pick: (id: string) => void }) {
  if (node.kind === 'row') {
    const r = model.rows.find((x) => x.code === node.key)!
    const agent = model.agents.find((a) => a.agent === r.agent)
    const step = r.step === null ? 'Behind the steps' : `Step ${r.step}: ${model.steps.find((s) => s.n === r.step)?.name}`
    const sentences = r.tests.reduce((k, t) => k + (model.sentences[t]?.length ?? 0), 0)
    return (
      <div data-panel="row">
        <p className="text-xs tabular-nums text-etyme-faint">{r.code}</p>
        <h2 className="mt-1 font-serif text-2xl leading-tight tracking-[-0.02em]">{r.name}</h2>
        <div className="mt-2"><StatusChip status={r.status} /></div>
        <Lbl>What it is</Lbl>
        <p className="mt-1 text-sm">{r.first}</p>
        <Lbl>Who owns it</Lbl>
        <p className="mt-1 text-sm">{r.owner}, in the business. Built by {agent?.label ?? r.agent} ({r.agent}).</p>
        <p className="mt-1 text-xs text-etyme-muted">{r.l1} {r.stream} → {r.l2} {r.l2Name} · {step}</p>
        <Lbl>Files behind it ({r.files.length})</Lbl>
        {r.files.length === 0
          ? <p className="mt-1 text-sm text-etyme-muted">None named.</p>
          : <ul className="mt-1 space-y-0.5 font-mono text-xs text-etyme-muted">{r.files.map((f) => <li key={f} className="break-all">{f}</li>)}</ul>}
        <Lbl>The sentences that prove it ({sentences})</Lbl>
        {r.tests.length === 0
          ? <p className="mt-1 text-sm text-etyme-muted">No test is named for this process.</p>
          : r.tests.map((t) => <TestBlock key={t} model={model} path={t} pick={pick} />)}
        <Lbl>Still owed ({r.owed.length})</Lbl>
        {r.owed.length === 0
          ? <p className="mt-1 text-sm text-etyme-muted">No task line on this process starts with OWED or OPEN.</p>
          : <ul className="mt-1 space-y-2 text-sm">{r.owed.map((o, i) => <li key={i}>{o}</li>)}</ul>}
      </div>
    )
  }

  if (node.kind === 'test') {
    const proves = model.rows.filter((r) => r.tests.includes(node.key))
    return (
      <div data-panel="test">
        <p className="text-xs text-etyme-faint">A test file</p>
        <h2 className="mt-1 break-all font-mono text-sm">{node.key}</h2>
        <Lbl>It proves ({proves.length})</Lbl>
        <ul className="mt-1 space-y-1">{proves.map((r) => <RowLink key={r.code} r={r} pick={pick} />)}</ul>
        <Lbl>Its sentences</Lbl>
        <Sentences list={model.sentences[node.key] ?? null} />
      </div>
    )
  }

  if (node.kind === 'group') {
    const g = model.groups.find((x) => x.code === node.key)!
    const agent = model.agents.find((a) => a.domain === g.domain)
    const rows = model.rows.filter((r) => r.l2 === g.code)
    return (
      <div data-panel="group">
        <p className="text-xs tabular-nums text-etyme-faint">{g.code} · {g.l1} {g.stream}</p>
        <h2 className="mt-1 font-serif text-2xl leading-tight tracking-[-0.02em]">{g.name}</h2>
        <p className="mt-2 text-sm">Built by {agent?.label} ({agent?.agent}).</p>
        <Lbl>Processes ({rows.length})</Lbl>
        <ul className="mt-1 space-y-1">{rows.map((r) => <RowLink key={r.code} r={r} pick={pick} />)}</ul>
      </div>
    )
  }

  if (node.kind === 'agent') {
    const a = model.agents.find((x) => x.agent === node.key)!
    const rows = model.rows.filter((r) => r.agent === a.agent)
    const groups = model.groups.filter((g) => g.domain === a.domain)
    return (
      <div data-panel="agent">
        <p className="text-xs text-etyme-faint">{a.agent}</p>
        <h2 className="mt-1 font-serif text-2xl leading-tight tracking-[-0.02em]">{a.label}</h2>
        <p className="mt-2 text-sm">{a.knows}</p>
        {a.domain === null
          ? <p className="mt-3 text-sm text-etyme-muted">Reads only. Owns no file and no process.</p>
          : <>
              <Lbl>Groups ({groups.length})</Lbl>
              <ul className="mt-1 space-y-1 text-sm">
                {groups.map((g) => <li key={g.code}><span className="tabular-nums text-etyme-faint">{g.code}</span> {g.name}</li>)}
              </ul>
              <Lbl>Processes ({rows.length})</Lbl>
              <ul className="mt-1 space-y-1">{rows.map((r) => <RowLink key={r.code} r={r} pick={pick} />)}</ul>
            </>}
      </div>
    )
  }

  // A status or a step.
  const rows = model.rows.filter((r) =>
    node.key === 'behind' ? r.step === null
      : node.key.startsWith('step-') ? r.step === Number(node.key.slice(5))
      : r.status === node.key)
  return (
    <div data-panel="hub">
      <h2 className="font-serif text-2xl leading-tight tracking-[-0.02em]">{node.label}</h2>
      <Lbl>Processes ({rows.length})</Lbl>
      {rows.length === 0
        ? <p className="mt-1 text-sm text-etyme-muted">None today.</p>
        : <ul className="mt-1 space-y-1">{rows.map((r) => <RowLink key={r.code} r={r} pick={pick} />)}</ul>}
    </div>
  )
}

function TestBlock({ model, path, pick }: { model: MapModel; path: string; pick: (id: string) => void }) {
  return (
    <div className="mt-3">
      <button onClick={() => pick(`test:${path}`)} className="break-all text-left font-mono text-xs text-etyme-muted hover:underline">{path}</button>
      <Sentences list={model.sentences[path] ?? null} />
    </div>
  )
}

function Sentences({ list }: { list: string[] | null }) {
  if (list === null) return <p className="mt-1 text-sm text-etyme-muted">This file was not on disk when the page was built.</p>
  if (list.length === 0) return <p className="mt-1 text-sm text-etyme-muted">No sentence could be read from this file.</p>
  return <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{list.map((s, i) => <li key={i}>{s}</li>)}</ul>
}
