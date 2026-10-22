/**
 * The run, written down for the founder and for the agents who fix it.
 *
 * `reports/simulation-<stamp>.md` says, in plain English: what closed at
 * every station, what refused and why (each sentence once, with how
 * often and whose it is), which rules held when a stage expected a
 * refusal, the faults, the timings per route and the ten slowest calls.
 * `reports/simulation-<stamp>.json` beside it holds every call, so any
 * line of the page can be traced to the calls behind it.
 *
 * A code is never shown without the sentence the route said beside it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DomainKey } from '@/lib/domains'
import type { Catalog } from './actors'
import { faultsOf, isError, isRefusal, routeStats, slowest, SLOW_P95_MS, type Ledger } from './ledger'
import { lessonsOf } from './lessons'
import type { Options, StageResult, World } from './stage'

export interface StageRun {
  name: string
  domain: DomainKey
  built: boolean
  ms: number
  result?: StageResult
  /** The stage itself threw: a bug in the stage, not a refusal. */
  error?: string
}

export interface RunRecord {
  stamp: string
  startedAt: Date
  finishedAt: Date
  options: Options
  database: { name: string; template: string; kept: boolean }
  base: string
  /** How the app was built: reused, or built and why. */
  build: string
  stages: StageRun[]
  world: World
  ledger: Ledger
  catalog: Catalog
  /** Seats actually taken. */
  opened: number
}

const owner = (d: DomainKey | null | undefined) => (d ? d.toLowerCase() : 'nobody')
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n} ms`)
const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 0)}%`
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function seatLabel(catalog: Catalog, key: string): string {
  if (key === 'cron') return 'the nightly jobs'
  if (key === 'harness') return 'the run itself'
  const s = catalog.seats.find((x) => x.key === key)
  if (!s) return key
  if (s.role === 'Worker') return `${s.personName}, worker${s.company ? ` (${s.company.name})` : ''}`
  return `${s.personName}, ${s.role} at ${s.company?.name ?? 'no firm'}`
}

/**
 * The bench in one line: how many people, how many of them may be put
 * forward today (said yes, or the firm's own between projects), and how
 * many said no. Read off the facts supply's stations leave (`benchOf`).
 */
export function benchLine(bench: readonly { kind: string; state: string }[]): string {
  if (bench.length === 0) return 'People on a bench: none recorded this run'
  const live = bench.filter((b) => b.state === 'GRANTED' || b.kind === 'EMPLOYEE').length
  const no = bench.filter((b) => b.state === 'DECLINED').length
  const own = bench.filter((b) => b.kind === 'EMPLOYEE').length
  return (
    `People on a bench: ${bench.length}, ${live} of them may be put forward today` +
    (own ? ` (${own} the firm's own between projects)` : '') +
    (no ? `; ${no} said no` : '')
  )
}

/**
 * A station's table, as the lines to print. Blank lines are dropped,
 * because one inside a markdown table ends it, and a station that sent
 * no rows prints nothing at all rather than an empty heading.
 */
export function stationTable(result: StageResult | undefined): string[] {
  return (result?.table ?? []).map((l) => l.replace(/\n/g, ' ').trimEnd()).filter((l) => l.trim() !== '')
}

export function reportMarkdown(r: RunRecord): string {
  const calls = r.ledger.calls
  const stats = routeStats(calls)
  const faults = faultsOf(calls)
  const lessons = lessonsOf(calls)
  const refusals = calls.filter((c) => isRefusal(c.status) && !c.expected).length
  const errors = calls.filter((c) => isError(c.status)).length
  const seconds = (r.finishedAt.getTime() - r.startedAt.getTime()) / 1000
  const built = r.stages.filter((s) => s.built).length
  const L: string[] = []

  L.push(`# The simulation, ${r.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
  L.push('')
  L.push(
    `Asked for ${r.options.placements} placements of ${r.options.weeks} weeks each, ${r.options.concurrency} calls at a time. ` +
      `${r.stages.length} stations ran (${built} built, ${r.stages.length - built} not built yet). ` +
      `${calls.length} calls in ${seconds.toFixed(0)}s: ${refusals} refused when no station expected it, ` +
      `${calls.filter((c) => c.expected).length} refused where a station expected the rule to say no, ` +
      `${errors} failed on the server, ${faults.length} route${faults.length === 1 ? '' : 's'} at fault.`
  )
  L.push('')
  L.push(`Every call was made through the real routes as a seeded person, on a fresh copy of the seeded world. Nothing was written into a table directly.`)
  L.push('')

  L.push('## What closed at every station')
  L.push('')
  L.push('| Station | Owner | Built | Closed | Calls | Refused | Server errors | Time | What happened |')
  L.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of r.stages) {
    const sc = calls.filter((c) => c.stage === s.name)
    const closed = s.result ? (s.result.of != null ? `${s.result.closed} of ${s.result.of}` : String(s.result.closed)) : '—'
    const said = s.error ? `The stage stopped: ${s.error}` : s.result?.says ?? ''
    L.push(
      `| ${s.name} | ${owner(s.domain)} | ${s.built ? 'yes' : 'not yet'} | ${closed} | ${sc.length} | ` +
        `${sc.filter((c) => isRefusal(c.status) && !c.expected).length} | ${sc.filter((c) => isError(c.status)).length} | ${ms(s.ms)} | ${cell(said)} |`
    )
  }
  L.push('')

  // A station's own table, under its name, in the order the stations ran.
  for (const s of r.stages) {
    const rows = stationTable(s.result)
    if (rows.length === 0) continue
    L.push(`### ${s.name}`)
    L.push('')
    for (const row of rows) L.push(row)
    L.push('')
  }

  L.push('## What the world holds that this run made')
  L.push('')
  const w = r.world
  const counts: [string, number][] = [
    ['Job requests', w.jobs.length], ['Candidates put forward', w.submissions.length], ['Awards', w.awards.length],
    ['Contract lines', w.contracts.length], ['Weeks', w.weeks.length], ['Expenses', w.expenses.length],
    ['Bills', w.bills.length], ['Invoice receipts', w.receipts.length], ['Payments', w.payments.length],
    ['Payroll runs', w.payrollRuns.length],
  ]
  for (const [k, v] of counts) L.push(`- ${k}: ${v}`)
  L.push(`- ${benchLine(w.bench ?? [])}`)
  L.push('')

  L.push('## What refused, and why')
  L.push('')
  if (lessons.length === 0) {
    L.push('Nothing refused that a stage did not expect.')
  } else {
    L.push(
      'Each sentence once, with how often it was said. The station\'s owner decides: the person in the run was wrong and learns, ' +
        'or the rule was wrong and the route\'s owner changes it.'
    )
    L.push('')
    for (const l of lessons) {
      const kind = l.kind === 'RULE' ? 'a rule said no' : 'the request itself was wrong'
      L.push(`- **${l.count}×** "${l.sentence}"`)
      L.push(
        `  ${kind} (status ${l.statuses.join(', ')}) · on ${l.routes.join(', ')} · route owner: ${l.routeOwners.map(owner).join(', ') || 'nobody'} · ` +
          `station: ${l.stages.join(', ')} · for example ${l.seats.map((k) => seatLabel(r.catalog, k)).join('; ')}`
      )
      if (!l.said) L.push('  The route refused without a sentence. That is a fault of its own: a refusal says what is missing and what to do.')
    }
  }
  L.push('')

  if (r.ledger.expectations.length > 0) {
    L.push('## Rules the run expected to hold')
    L.push('')
    L.push('| Station | Who | Route | Expected words | Held | What the route said |')
    L.push('|---|---|---|---|---|---|')
    for (const e of r.ledger.expectations) {
      L.push(
        `| ${e.stage} | ${cell(seatLabel(r.catalog, e.seat))} | ${e.route} | ${cell(e.phrase)} | ${e.held ? 'yes' : '**no**'} | ` +
          `${cell(e.sentence ?? `nothing (status ${e.status})`)} |`
      )
    }
    L.push('')
  }

  L.push('## Faults')
  L.push('')
  if (faults.length === 0) {
    L.push(`None. No route returned a server error and none took longer than ${SLOW_P95_MS / 1000}s for 95% of its calls.`)
  } else {
    for (const f of faults) {
      L.push(`- **${f.method} ${f.route}**, owned by ${owner(f.owner)}: ${f.why}${f.sample ? ` It said: "${f.sample}"` : ''}`)
    }
  }
  L.push('')

  L.push('## Timings per route')
  L.push('')
  L.push('Half of the calls were at or under p50; 95% at or under p95.')
  L.push('')
  L.push('| Route | Owner | Calls | p50 | p95 | Slowest | Server errors | Refused |')
  L.push('|---|---|---|---|---|---|---|---|')
  for (const s of stats) {
    L.push(
      `| ${s.method} ${s.route} | ${owner(s.owner)} | ${s.count} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)} | ` +
        `${s.errors ? `${s.errors} (${pct(s.errorRate)})` : '0'} | ${s.refusals} |`
    )
  }
  L.push('')

  L.push('## The ten slowest calls')
  L.push('')
  L.push('| # | Station | Who | Call | Status | Time |')
  L.push('|---|---|---|---|---|---|')
  for (const c of slowest(calls, 10)) {
    L.push(`| ${c.n} | ${c.stage} | ${cell(seatLabel(r.catalog, c.seat))} | ${c.method} ${c.path} | ${c.status} | ${ms(c.ms)} |`)
  }
  L.push('')

  L.push('## Seats')
  L.push('')
  const count = (prefix: string) => r.catalog.seats.filter((s) => s.key.startsWith(prefix)).length
  L.push(
    `${r.catalog.seats.length} seats could be taken: ${count('world-')} through the demo door at seeded firms, ` +
      `${count('person/')} people the demo page seats by name, ${count('worker/')} more workers and ` +
      `${count('staff/')} more people at seeded firms whose role has no door. This run took ${r.opened}.`
  )
  if (r.catalog.unreachable.length > 0) {
    L.push('')
    L.push('People in the world nobody can sit as (no door names them, and their address is not a seeded one):')
    for (const u of r.catalog.unreachable) L.push(`- ${u.personName}, ${u.role} at ${u.company}`)
  }
  L.push('')

  L.push('## How this run was made')
  L.push('')
  L.push(`- Database: \`${r.database.name}\`, copied from \`${r.database.template}\`; ${r.database.kept ? 'kept for inspection' : 'dropped at the end'}.`)
  L.push(`- App: ${r.build}, served at ${r.base} for the run and stopped after.`)
  L.push(`- Flags: \`--placements ${r.options.placements} --weeks ${r.options.weeks} --concurrency ${r.options.concurrency}${r.options.only.length ? ` --only ${r.options.only.join(',')}` : ''}\`.`)
  L.push('- The clock is the real one: the app has no way to move "today", so the weeks a stage files are real past and present weeks.')
  L.push('- Every call is in the JSON file beside this one.')
  L.push('')
  return L.join('\n')
}

export function writeReport(r: RunRecord, dir: string): { md: string; json: string } {
  mkdirSync(dir, { recursive: true })
  const md = join(dir, `simulation-${r.stamp}.md`)
  const json = join(dir, `simulation-${r.stamp}.json`)
  writeFileSync(md, reportMarkdown(r))
  writeFileSync(
    json,
    JSON.stringify(
      {
        stamp: r.stamp, startedAt: r.startedAt, finishedAt: r.finishedAt, options: r.options,
        database: r.database, base: r.base, build: r.build, opened: r.opened,
        stages: r.stages,
        routes: routeStats(r.ledger.calls), faults: faultsOf(r.ledger.calls), lessons: lessonsOf(r.ledger.calls),
        expectations: r.ledger.expectations,
        world: r.world,
        seats: r.catalog,
        calls: r.ledger.calls,
      },
      null,
      1
    )
  )
  return { md, json }
}
