/**
 * The founder's test of 2026-11-08, read for the report: "1000 jobs and
 * 20 hires go through multiple levels … all types of workers."
 *
 * Two tables, each counted by the domain that owns the station and only
 * said here:
 *   - by worker class: regulatory's `tallyByWorkerClass()`
 *     (stages/regulatory/stage-tally), labeled with supply's
 *     `WORK_AUTH_CLASSES` (lib/seed-scale/types);
 *   - by rungs walked: demand's `awardsByRungs()` (stages/demand/common).
 *
 * The three exports were built in parallel with this file, so each is
 * read through its module rather than imported by name: a missing export
 * reads as "not counted this run", never a failed build, and a shape this
 * file does not expect is read as far as it can be and no further. A
 * count nobody made is never shown as nought.
 *
 * The normalizers are pure, so a unit test holds them.
 */
import * as regulatoryTally from './stages/regulatory/stage-tally'
import * as demandCommon from './stages/demand/common'
import * as scaleTypes from '@/lib/seed-scale/types'
import type { World } from './stage'

// ── The shapes the report prints ───────────────────────────────────────

export interface WorkerClassRow {
  /** The machine key (CITIZEN, F1_CPT …). */
  key: string
  /** What a person reads. */
  label: string
  /** Null where the station did not count it: shown as "not counted", never 0. */
  people: number | null
  awarded: number | null
  started: number | null
  refused: number | null
  /** The one line that says why this class was refused at the start, or null. */
  reason: string | null
}

export type RungBucket = '1' | '2' | '3' | '4+'
export const RUNG_BUCKETS: readonly RungBucket[] = ['1', '2', '3', '4+']

export interface RungCount {
  byRungs: Record<RungBucket, number>
  /** The awards that walked four rungs or more, each named in a line. */
  chain: string[]
}

export interface Tallies {
  /** Null where regulatory's tally was not there to read. */
  workerClasses: WorkerClassRow[] | null
  /** Null where demand's count was not there to read. */
  rungs: RungCount | null
  /** Why a table is missing, in a sentence, for the report. */
  notes: string[]
}

// ── Reading loosely, never inventing ──────────────────────────────────

type Loose = Record<string, unknown>
const isObj = (x: unknown): x is Loose => typeof x === 'object' && x !== null && !Array.isArray(x)

function numOf(row: Loose, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (Array.isArray(v)) return v.length
    if (v instanceof Set || v instanceof Map) return v.size
  }
  return null
}

function strOf(row: Loose, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (Array.isArray(v)) {
      const s = v.find((x) => typeof x === 'string' && x.trim())
      if (typeof s === 'string') return s.trim()
    }
  }
  return null
}

/** Supply's labels, as an ordered key → label list, from a record or an array. */
export function labelsFrom(classes: unknown): [string, string][] {
  if (Array.isArray(classes)) {
    return classes.flatMap((c): [string, string][] => {
      if (typeof c === 'string') return [[c, c]]
      if (!isObj(c)) return []
      const key = strOf(c, 'key', 'workAuth', 'value', 'id', 'code')
      if (!key) return []
      return [[key, strOf(c, 'label', 'name', 'says', 'title') ?? key]]
    })
  }
  if (isObj(classes)) {
    return Object.entries(classes).map(([key, v]): [string, string] =>
      [key, typeof v === 'string' ? v : isObj(v) ? strOf(v, 'label', 'name', 'says', 'title') ?? key : key])
  }
  return []
}

/** Regulatory's tally, in supply's order and words; a class in either list is a row. */
export function workerClassRows(tally: unknown, classes: unknown): WorkerClassRow[] {
  const labels = labelsFrom(classes)
  const raw: [string, Loose][] = Array.isArray(tally)
    ? tally.flatMap((r): [string, Loose][] => {
        if (!isObj(r)) return []
        const key = strOf(r, 'key', 'workAuth', 'workerClass', 'class', 'cls')
        return key ? [[key, r]] : []
      })
    : tally instanceof Map
      ? [...tally.entries()].filter(([, v]) => isObj(v)).map(([k, v]) => [String(k), v as Loose])
      : isObj(tally)
        ? Object.entries(tally).filter(([, v]) => isObj(v)).map(([k, v]) => [k, v as Loose])
        : []
  const byKey = new Map(raw)
  const keys = [...labels.map(([k]) => k), ...raw.map(([k]) => k).filter((k) => !labels.some(([l]) => l === k))]
  const label = new Map(labels)
  return keys.map((key) => {
    const r = byKey.get(key) ?? {}
    return {
      key,
      label: label.get(key) ?? strOf(r, 'label', 'name') ?? key,
      people: numOf(r, 'people', 'inWorld', 'peopleInWorld', 'world', 'count'),
      awarded: numOf(r, 'awarded', 'awards'),
      started: numOf(r, 'started', 'starts'),
      refused: numOf(r, 'refused', 'refusedAtStart', 'refusals', 'held'),
      reason: strOf(r, 'reason', 'why', 'sentence', 'sentences', 'says', 'rule'),
    }
  })
}

function bucketOf(rungs: number): RungBucket {
  return rungs >= 4 ? '4+' : rungs <= 1 ? '1' : (String(rungs) as RungBucket)
}

function nameAward(a: Loose): string {
  const own = strOf(a, 'says', 'label', 'name', 'line')
  if (own) return own
  const person = strOf(a, 'personName', 'person', 'who')
  const job = strOf(a, 'jobTitle', 'job', 'title')
  const client = strOf(a, 'clientName', 'client', 'clientSlug')
  const path = Array.isArray(a.path) ? a.path.filter((x) => typeof x === 'string').join(' → ') : strOf(a, 'chain', 'via')
  const head = [person, job && `for ${job}`, client && `at ${client}`].filter(Boolean).join(' ')
  return [head || strOf(a, 'id', 'awardId', 'submissionId') || 'an award', path && `(${path})`].filter(Boolean).join(' ')
}

/**
 * Demand's count, whatever shape it came in: a list of awards each with
 * its rungs; a record of bucket → count (with or without a `chain` list
 * of the four-rung awards); or `{ byRungs, chain }`.
 */
export function rungCount(x: unknown): RungCount | null {
  const byRungs: Record<RungBucket, number> = { '1': 0, '2': 0, '3': 0, '4+': 0 }
  const chain: string[] = []
  const awards: Loose[] = Array.isArray(x)
    ? x.filter(isObj)
    : isObj(x) && Array.isArray(x.awards) ? x.awards.filter(isObj) : []
  if (awards.length > 0 || (Array.isArray(x) && x.length === 0)) {
    for (const a of awards) {
      const n = numOf(a, 'rungs', 'rung', 'levels', 'depth')
      if (n == null) continue
      const b = bucketOf(n)
      byRungs[b]++
      if (b === '4+') chain.push(nameAward(a))
    }
    return { byRungs, chain }
  }
  if (!isObj(x) && !(x instanceof Map)) return null
  const counts: unknown = x instanceof Map ? Object.fromEntries(x) : isObj(x.byRungs) ? x.byRungs : x.counts ?? x
  if (!isObj(counts)) return null
  let any = false
  for (const [k, v] of Object.entries(counts)) {
    const n = typeof v === 'number' ? v : Array.isArray(v) ? v.length : null
    const r = Number(String(k).replace('+', ''))
    if (n == null || !Number.isFinite(r)) continue
    byRungs[bucketOf(r)] += n
    any = true
    if (r >= 4 && Array.isArray(v)) for (const a of v) chain.push(isObj(a) ? nameAward(a) : String(a))
  }
  const named = isObj(x) ? (x.chain ?? x.chainAwards ?? x.fourRungs) : null
  if (Array.isArray(named)) {
    chain.length = 0
    for (const a of named) chain.push(isObj(a) ? nameAward(a) : String(a))
  }
  return any || chain.length ? { byRungs, chain } : null
}

// ── Read at the end of the run ────────────────────────────────────────

function exported(mod: unknown, name: string): unknown {
  return mod != null ? (mod as Loose)[name] : undefined
}

/** Calls the two counts and reads the labels; never throws. */
export function readTallies(world: World): Tallies {
  const notes: string[] = []
  const classes = exported(scaleTypes, 'WORK_AUTH_CLASSES')
  let workerClasses: WorkerClassRow[] | null = null
  const tally = exported(regulatoryTally, 'tallyByWorkerClass')
  if (typeof tally === 'function') {
    try {
      workerClasses = workerClassRows(tally(world), classes)
    } catch (e: any) {
      notes.push(`The count by worker class could not be read: ${String(e?.message ?? e)}`)
    }
  } else {
    notes.push('The count by worker class was not made this run: regulatory’s tallyByWorkerClass is not in this build.')
  }
  if (workerClasses && workerClasses.length === 0) workerClasses = null
  let rungs: RungCount | null = null
  const byRungs = exported(demandCommon, 'awardsByRungs')
  if (typeof byRungs === 'function') {
    try {
      rungs = rungCount(byRungs(world))
      if (!rungs) notes.push('The awards by rungs walked came back in a shape the report cannot read.')
    } catch (e: any) {
      notes.push(`The awards by rungs walked could not be read: ${String(e?.message ?? e)}`)
    }
  } else {
    notes.push('The awards by rungs walked were not counted this run: demand’s awardsByRungs is not in this build.')
  }
  return { workerClasses, rungs, notes }
}

// ── Said in the report ────────────────────────────────────────────────

const n = (x: number | null) => (x == null ? 'not counted' : x.toLocaleString('en-US'))
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** The headline line under complete transactions. */
export function chainHeadline(rungs: RungCount | null, target: number): string {
  if (!rungs) return `The rungs each award walked were not counted this run, so it cannot say how many of the ${target} chain hires asked for walked four rungs.`
  const four = rungs.byRungs['4+']
  return `${four.toLocaleString('en-US')} award${four === 1 ? '' : 's'} walked four rungs (target ${target}${four >= target ? ', met' : `, ${target - four} short`}).`
}

export function workerClassLines(rows: WorkerClassRow[] | null): string[] {
  const L = ['## Every kind of worker', '']
  if (!rows) return [...L, 'Not counted this run.', '']
  L.push('| Worker class | People in the world | Awarded | Started | Refused at the start | Why |', '|---|---|---|---|---|---|')
  for (const r of rows) {
    L.push(`| ${cell(r.label)} | ${n(r.people)} | ${n(r.awarded)} | ${n(r.started)} | ${n(r.refused)} | ${cell(r.reason ?? (r.refused ? 'no sentence was kept' : '—'))} |`)
  }
  L.push('')
  return L
}

export function rungLines(rungs: RungCount | null): string[] {
  const L = ['## Awards by rungs walked', '']
  if (!rungs) return [...L, 'Not counted this run.', '']
  L.push('| Rungs walked | Awards |', '|---|---|')
  for (const b of RUNG_BUCKETS) L.push(`| ${b} | ${rungs.byRungs[b].toLocaleString('en-US')} |`)
  L.push('')
  if (rungs.chain.length) {
    L.push('The awards that walked four rungs or more:', '')
    for (const c of rungs.chain) L.push(`- ${c}`)
    L.push('')
  }
  return L
}
