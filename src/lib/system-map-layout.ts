/**
 * Where each node of the map is drawn, and which ones a search finds.
 *
 * Pure, and loaded by the browser: it takes the model `lib/system-map`
 * built on the server and returns rings. Nothing here imports the matrix,
 * so the page does not ship it twice.
 *
 * Four rings, inside out: the hubs (an agent, a status or a step, by the
 * view), the L2 groups under each hub, the L3 rows, and at the edge the
 * test files that prove the rows. Every color is read from
 * `lib/chart-colors`; a node that is not data is drawn in the ink of the
 * page (`currentColor`), never in a hex of its own.
 */

import { STATUS } from '@/lib/chart-colors'
import type { MapModel, MapRow } from '@/lib/system-map'
import type { Status } from '@/lib/matrix'

export type View = 'owner' | 'status' | 'steps'

export const VIEWS: { key: View; label: string }[] = [
  { key: 'owner', label: 'By owner' },
  { key: 'status', label: 'By status' },
  { key: 'steps', label: 'By the four steps' },
]

/** A status's color, from the chart palette's reserved status colors. */
export const STATUS_COLOR: Record<Status, string> = {
  BUILT: STATUS.good,
  PARTIAL: STATUS.warning,
  SPEC: STATUS.neutral,
  NONE: STATUS.serious,
}

/** The word beside each color, from the matrix's own definitions. */
export const STATUS_WORD: Record<Status, string> = {
  BUILT: 'Built',
  PARTIAL: 'Partial',
  SPEC: 'Written down, nothing coded',
  NONE: 'Not started',
}

/** A test file is evidence, not a state, so it wears the neutral. */
export const TEST_COLOR = STATUS.neutral

export const SIZE = 1000
const C = SIZE / 2
export const RADII = { hub: 120, group: 235, row: 335, test: 445 } as const

export type NodeKind = 'agent' | 'hub' | 'group' | 'row' | 'test'

export interface MapNode {
  id: string
  kind: NodeKind
  /** What the node stands for: an agent name, a status, a step, a code or a path. */
  key: string
  label: string
  x: number
  y: number
  r: number
  /** A palette color, or null for the page's ink. */
  color: string | null
}

export interface MapLink { from: string; to: string; kind: 'hub' | 'group' | 'test' }

export interface Layout { nodes: MapNode[]; links: MapLink[] }

interface Hub { key: string; label: string; kind: 'agent' | 'hub'; color: string | null }

/** The hubs of a view, in drawing order, and which hub a row sits under. */
export function hubsOf(model: MapModel, view: View): { hubs: Hub[]; hubOf: (r: MapRow) => string } {
  if (view === 'owner') {
    return {
      hubs: model.agents.map((a) => ({ key: a.agent, label: a.label, kind: 'agent' as const, color: null })),
      hubOf: (r) => r.agent,
    }
  }
  if (view === 'status') {
    return {
      hubs: model.statuses.map((s) => ({ key: s, label: STATUS_WORD[s], kind: 'hub' as const, color: STATUS_COLOR[s] })),
      hubOf: (r) => r.status,
    }
  }
  return {
    hubs: [
      ...model.steps.map((s) => ({ key: `step-${s.n}`, label: `${s.n}. ${s.name}`, kind: 'hub' as const, color: null })),
      { key: 'behind', label: 'Behind the steps', kind: 'hub' as const, color: null },
    ],
    hubOf: (r) => (r.step === null ? 'behind' : `step-${r.step}`),
  }
}

const at = (angle: number, radius: number) => ({
  x: Math.round((C + radius * Math.cos(angle)) * 10) / 10,
  y: Math.round((C + radius * Math.sin(angle)) * 10) / 10,
})

const byCode = (a: string, b: string) => {
  const pa = a.replace(/^L\d/, '').split('.').map(Number)
  const pb = b.replace(/^L\d/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function layout(model: MapModel, view: View): Layout {
  const { hubs, hubOf } = hubsOf(model, view)
  const nodes: MapNode[] = []
  const links: MapLink[] = []

  // Rows in hub order, then group, then row code, with a gap between hubs.
  const GAP = 2
  const sections = hubs.map((h) => ({
    hub: h,
    rows: model.rows.filter((r) => hubOf(r) === h.key).sort((a, b) => byCode(a.l2, b.l2) || byCode(a.code, b.code)),
  }))
  const filled = sections.filter((s) => s.rows.length > 0)
  const slots = model.rows.length + GAP * filled.length
  const angleOf = (slot: number) => -Math.PI / 2 + (2 * Math.PI * (slot + 0.5)) / Math.max(slots, 1)

  const rowAngle = new Map<string, number>()
  const rowSlot = new Map<string, number>()
  let slot = 0
  const empty: Hub[] = []
  for (const s of sections) {
    if (s.rows.length === 0) { empty.push(s.hub); continue }
    const first = slot
    const hubId = `${s.hub.kind}:${s.hub.key}`
    const groupsHere = [...new Set(s.rows.map((r) => r.l2))]
    const groupSlots = new Map<string, number[]>()
    for (const r of s.rows) {
      const a = angleOf(slot)
      rowAngle.set(r.code, a)
      rowSlot.set(r.code, slot)
      groupSlots.set(r.l2, [...(groupSlots.get(r.l2) ?? []), slot])
      nodes.push({ id: `row:${r.code}`, kind: 'row', key: r.code, label: `${r.code} ${r.name}`, ...at(a, RADII.row), r: 6, color: STATUS_COLOR[r.status] })
      links.push({ from: `group:${s.hub.key}:${r.l2}`, to: `row:${r.code}`, kind: 'group' })
      slot++
    }
    const mid = (first + slot - 1) / 2
    nodes.push({ id: hubId, kind: s.hub.kind, key: s.hub.key, label: s.hub.label, ...at(angleOf(mid), RADII.hub), r: 20, color: s.hub.color })
    for (const g of groupsHere) {
      const gs = groupSlots.get(g)!
      const grp = model.groups.find((x) => x.code === g)!
      nodes.push({
        id: `group:${s.hub.key}:${g}`, kind: 'group', key: g, label: `${g} ${grp.name}`,
        ...at(angleOf((gs[0] + gs[gs.length - 1]) / 2), RADII.group), r: 9, color: null,
      })
      links.push({ from: hubId, to: `group:${s.hub.key}:${g}`, kind: 'hub' })
    }
    slot += GAP
  }

  // A hub with no rows — an agent that only reads, a status nobody holds
  // today — is still drawn, in the middle, so the map never hides one.
  empty.forEach((h, i) => {
    const spread = 34
    const x = C + (i - (empty.length - 1) / 2) * spread * 2
    nodes.push({ id: `${h.kind}:${h.key}`, kind: h.kind, key: h.key, label: h.label, x, y: C, r: 16, color: h.color })
  })

  // Tests at the edge, in the order of the first row each proves.
  const tests = Object.keys(model.sentences)
  const firstSlot = (t: string) =>
    Math.min(...model.rows.filter((r) => r.tests.includes(t)).map((r) => rowSlot.get(r.code) ?? Infinity))
  const ordered = tests.map((t) => ({ t, s: firstSlot(t) })).sort((a, b) => a.s - b.s || (a.t < b.t ? -1 : 1))
  ordered.forEach(({ t }, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / Math.max(ordered.length, 1)
    nodes.push({ id: `test:${t}`, kind: 'test', key: t, label: t, ...at(a, RADII.test), r: 2.5, color: TEST_COLOR })
  })
  for (const r of model.rows) for (const t of r.tests) links.push({ from: `row:${r.code}`, to: `test:${t}`, kind: 'test' })

  return { nodes, links }
}

// ── Search ───────────────────────────────────────────────────────────

/**
 * The words a node can be found by: a row by its code, title, files and
 * the sentences of the tests that prove it; a test by its path and its
 * sentences; a group or a hub by its name.
 */
export function wordsOf(model: MapModel, node: MapNode): string {
  if (node.kind === 'row') {
    const r = model.rows.find((x) => x.code === node.key)!
    return [r.code, r.name, r.first, ...r.files, ...r.tests, ...r.tests.flatMap((t) => model.sentences[t] ?? [])].join(' ')
  }
  if (node.kind === 'test') return [node.key, ...(model.sentences[node.key] ?? [])].join(' ')
  if (node.kind === 'agent') {
    const a = model.agents.find((x) => x.agent === node.key)
    return [node.label, node.key, a?.knows ?? ''].join(' ')
  }
  return node.label
}

/** The ids a query finds. Every word must appear; case does not matter. An empty query finds everything. */
export function search(model: MapModel, nodes: MapNode[], query: string): Set<string> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return new Set(nodes.map((n) => n.id))
  return new Set(
    nodes.filter((n) => {
      const hay = wordsOf(model, n).toLowerCase()
      return words.every((w) => hay.includes(w))
    }).map((n) => n.id)
  )
}
