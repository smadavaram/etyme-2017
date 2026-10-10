/**
 * The map of the memory — the model behind `/map`.
 *
 * The founder asked for one picture of how the system hangs together,
 * drawn from the two files everything else reads, so he sees the system
 * instead of reading reports (2026-10-08). Those two files are
 * `lib/domains` — who owns what, and what each agent knows — and
 * `lib/matrix` — every process, its status, the files behind it and the
 * tests that prove it. This module joins them and adds nothing of its own:
 * no status, no count, no color is typed here.
 *
 * It shows, never stores. It reads no database and writes nothing; the
 * test sentences are handed in by the page, read off the test files by
 * `lib/map-disk` while the page is built.
 *
 * The drawing — rings, angles, search — is `lib/system-map-layout`, which
 * the browser loads. This file imports the whole matrix, so it stays on
 * the server.
 */

import { DOMAINS, READERS, type DomainKey } from '@/lib/domains'
import { MATRIX, type Status } from '@/lib/matrix'
import { STEPS } from '@/lib/public-site/steps'

// ── The four steps ───────────────────────────────────────────────────

/**
 * Which public step a row sits under: 1–4, or null for "Behind the steps".
 *
 * Computed from the steps' own `process` list, which names the
 * documentation's process pages by the slug of an L1 stream ("Source to
 * contract" → `source-to-contract`). An L1 claimed by exactly one step goes
 * under it. One L1 is claimed by two — steps 1 and 2 both read "Source to
 * contract", because raising the job and choosing the person are one
 * stream — so its groups are split by what they do, below, and a group of
 * that stream that is neither (reaching the market; how the product looks)
 * is behind the steps rather than forced under one.
 */
const SPLIT_BY_GROUP: Record<string, number | null> = {
  'L2.1.1': 1, // Demand intake — the job is raised and sent to suppliers
  'L2.1.2': 2, // Supply response — suppliers put people forward
  'L2.1.3': 2, // Evaluation — interviews and the choice
  'L2.1.4': null, // Reaching the market — behind every step
  'L2.1.5': null, // How the product looks — behind every step
}

export const slugOf = (stream: string) => stream.toLowerCase().trim().replace(/\s+/g, '-')

export function stepFor(l1Stream: string, l2Code: string): number | null {
  if (l2Code in SPLIT_BY_GROUP) return SPLIT_BY_GROUP[l2Code]
  const claim = STEPS.filter((s) => s.process.includes(slugOf(l1Stream)))
  return claim.length === 1 ? claim[0].n : null
}

export interface MapStep { n: number; name: string }
export const MAP_STEPS: MapStep[] = STEPS.map((s) => ({ n: s.n, name: s.name }))
export const BEHIND = 'Behind the steps'

// ── The model ────────────────────────────────────────────────────────

export interface MapAgent {
  agent: string
  label: string
  knows: string
  /** The domain it writes; null for the two that only read. */
  domain: DomainKey | null
}

export interface MapGroup {
  code: string
  name: string
  domain: DomainKey
  l1: string
  stream: string
}

export interface MapRow {
  code: string
  name: string
  l1: string
  stream: string
  l2: string
  l2Name: string
  domain: DomainKey
  /** The agent that codes it. */
  agent: string
  /** The role that owns the process in the business. */
  owner: string
  status: Status
  /** What it is, in a line: the row's first task. */
  first: string
  /** Task lines that start OWED or OPEN — what is still owed. */
  owed: string[]
  files: string[]
  tests: string[]
  step: number | null
}

export interface MapCounts {
  /** Files under src with an owner, read off the disk; null where the disk is not there. */
  filesOwned: number | null
  rows: number
  groups: number
  agents: number
  byStatus: Record<Status, number>
  owedLines: number
  /** Distinct files the rows name in `implementedBy`. */
  filesNamed: number
  /** Distinct test files the rows name. */
  testFiles: number
  /** Row-to-test links. */
  links: number
  /** Sentences in the test files that prove rows; null where none could be read. */
  sentences: number | null
  /** Test files on disk that prove no row; null where the disk is not there. */
  testsProvingNothing: number | null
}

export interface MapModel {
  agents: MapAgent[]
  groups: MapGroup[]
  rows: MapRow[]
  steps: MapStep[]
  /** Sentences per proving test file; null where the file is not on disk. */
  sentences: Record<string, string[] | null>
  counts: MapCounts
  statuses: Status[]
}

export const OWED_LINE = /^(OWED|OPEN)\b/

/** Every status the matrix's type allows, in reading order. */
export const ALL_STATUSES: Status[] = ['BUILT', 'PARTIAL', 'SPEC', 'NONE']

export interface DiskFacts {
  /** Sentences per test path, as read by lib/map-disk. */
  sentences: Record<string, string[] | null>
  /** Files under src that have an owner, or null where src is not on disk. */
  filesOwned: number | null
  /** Every test file on disk, or null where the folders are not there. */
  testFiles: string[] | null
}

export function buildModel(disk: DiskFacts): MapModel {
  const agentOf = new Map(DOMAINS.map((d) => [d.key, d.agent]))

  const agents: MapAgent[] = [
    ...DOMAINS.map((d) => ({ agent: d.agent, label: d.label, knows: d.knows, domain: d.key })),
    ...READERS.map((r) => ({ agent: r.agent, label: r.label, knows: r.knows, domain: null })),
  ]

  const groups: MapGroup[] = MATRIX.flatMap((l1) =>
    l1.groups.map((g) => ({ code: g.code, name: g.name, domain: g.domain, l1: l1.code, stream: l1.stream }))
  )

  const rows: MapRow[] = MATRIX.flatMap((l1) =>
    l1.groups.flatMap((g) =>
      g.processes.map((p) => ({
        code: p.code,
        name: p.name,
        l1: l1.code,
        stream: l1.stream,
        l2: g.code,
        l2Name: g.name,
        domain: g.domain,
        agent: agentOf.get(g.domain) ?? g.domain,
        owner: p.owner,
        status: p.status,
        first: p.tasks[0] ?? '',
        owed: p.tasks.filter((t) => OWED_LINE.test(t)),
        files: p.implementedBy ?? [],
        tests: p.testedBy ?? [],
        step: stepFor(l1.stream, g.code),
      }))
    )
  )

  const proving = [...new Set(rows.flatMap((r) => r.tests))].sort()
  const sentences: Record<string, string[] | null> = {}
  for (const t of proving) sentences[t] = disk.sentences[t] ?? null
  const readable = proving.filter((t) => sentences[t] !== null)

  const byStatus = Object.fromEntries(
    ALL_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])
  ) as Record<Status, number>

  const provingSet = new Set(proving)

  return {
    agents,
    groups,
    rows,
    steps: MAP_STEPS,
    sentences,
    statuses: ALL_STATUSES,
    counts: {
      filesOwned: disk.filesOwned,
      rows: rows.length,
      groups: groups.length,
      agents: agents.length,
      byStatus,
      owedLines: rows.reduce((n, r) => n + r.owed.length, 0),
      filesNamed: new Set(rows.flatMap((r) => r.files)).size,
      testFiles: proving.length,
      links: rows.reduce((n, r) => n + r.tests.length, 0),
      sentences: readable.length === 0 ? null : readable.reduce((n, t) => n + (sentences[t]?.length ?? 0), 0),
      testsProvingNothing: disk.testFiles === null ? null : disk.testFiles.filter((t) => !provingSet.has(t)).length,
    },
  }
}
