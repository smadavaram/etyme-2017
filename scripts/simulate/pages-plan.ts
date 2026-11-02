/**
 * Every page a person opens, under load, as each party: the plan and the
 * arithmetic, with no server and no database in it.
 *
 * The founder, 2026-11-01: "Do load and performance testing for 100000
 * transactions on each page." The simulation (run.ts) already times every
 * route its stations call. What it never timed is the screens themselves:
 * the page a hiring manager opens, the Today a supplier's owner reads, the
 * greeting the mark re-reads every minute. `pages.ts` opens those, as real
 * seats, on a kept simulation database full of what the stations made;
 * this file decides which seats, which pages and which reads, and writes
 * the report. Pure, so a test holds every rule without a server.
 *
 * Three rules it keeps:
 *
 * - **The pages are the menu's.** Every page a seat is offered is read off
 *   `lib/nav-table` for that seat — its kind, its role's permissions, a
 *   seat in a client's program, a region — exactly as the sidebar draws
 *   it. A page added to a menu tomorrow is timed tomorrow, and a page the
 *   menu stops offering stops being timed. No hand list to drift.
 * - **The reads are the page's.** Each page's own route, where the menu
 *   names it (`routesOf`), plus what every page in the shell reads on load
 *   (who you are, and the number on the mark) and the greeting's reads.
 * - **The numbers are computed from the calls.** Percentiles come from
 *   `ledger.ts` (`routeStats`, `percentile`), the fault line is the one
 *   the simulation uses (`SLOW_P95_MS`), and the owner of every page and
 *   route is read off `lib/domains`.
 */
import { getNavForKind, routesOf, type CompanyKind, type NavSection } from '@/lib/nav-table'
import type { DomainKey } from '@/lib/domains'
import type { Desk } from '@/lib/demo-desks'
import type { SeatSpec } from './actors'
import { isError, isRefusal, percentile, routeStats, SLOW_P95_MS, type Call } from './ledger'

// ── The flags ──────────────────────────────────────────────────────────

export interface PagesArgs {
  /** The kept simulation database to read, `etyme_sim_<stamp>`. */
  db: string
  /** Calls at once. */
  concurrency: number
  /** Timed visits to every page and read, per seat. */
  rounds: number
  /** Untimed visits first, so a page's first load of its code is not counted as the page. */
  warmup: number
  /** Firms (or workers) sampled per role: the seeded demo one first, then the busiest. */
  firms: number
  timeoutMs: number
  build: 'auto' | 'never' | 'always'
}

const SIM_PREFIX = 'etyme_sim_'

function count(name: string, v: string | undefined, min: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`--${name} takes a whole number of ${min} or more; it was given "${v ?? ''}".`)
  }
  return n
}

/**
 *   --db NAME         the kept simulation database (required), etyme_sim_<stamp>
 *   --concurrency C   calls at once (40)
 *   --rounds N        timed visits to every page, per seat (3)
 *   --warmup N        untimed visits first (1)
 *   --firms K         firms per role: the seeded one, then the busiest (2)
 *   --timeout MS      per call (60000)
 *   --no-build        use the existing build even if it looks stale
 *   --rebuild         build again even if the build looks current
 */
export function parsePagesArgs(argv: string[]): PagesArgs {
  const a: PagesArgs = { db: '', concurrency: 40, rounds: 3, warmup: 1, firms: 2, timeoutMs: 60_000, build: 'auto' }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=', 2)
    const value = () => inline ?? argv[++i]
    switch (flag) {
      case '--': break
      case '--db': a.db = String(value() ?? ''); break
      case '--concurrency': a.concurrency = count('concurrency', value(), 1); break
      case '--rounds': a.rounds = count('rounds', value(), 1); break
      case '--warmup': a.warmup = count('warmup', value(), 0); break
      case '--firms': a.firms = count('firms', value(), 1); break
      case '--timeout': a.timeoutMs = count('timeout', value(), 1); break
      case '--no-build': a.build = 'never'; break
      case '--rebuild': a.build = 'always'; break
      default:
        throw new Error(`There is no flag ${flag}. The flags are --db, --concurrency, --rounds, --warmup, --firms, --timeout, --no-build and --rebuild.`)
    }
  }
  if (!a.db) throw new Error('Name the kept simulation database to read with --db etyme_sim_<stamp>. A simulation run prints it as "database kept".')
  if (!a.db.startsWith(SIM_PREFIX) || !/^[a-z0-9_]+$/.test(a.db)) {
    throw new Error(`${a.db} is not a simulation database. The pages are read only on a copy the simulation made, named ${SIM_PREFIX}<stamp>.`)
  }
  return a
}

// ── Who is sampled ─────────────────────────────────────────────────────

export type Party = 'client' | 'supplier' | 'integrator' | 'MSP' | 'one-person firm' | 'worker'
export const PARTIES: readonly Party[] = ['client', 'supplier', 'integrator', 'MSP', 'one-person firm', 'worker']

export interface Probe {
  party: Party
  /** In the trade's words, for the report. */
  role: string
  /** The firm kinds this role is sat at; null for a worker, who is a person. */
  kinds: readonly CompanyKind[] | null
  /** The seat key's suffix: a role key from lib/demo-desks, the oldest seat (`owner`), or a person. */
  seat: Desk | 'owner' | 'person'
  /** Seats tried first, by firm slug or by person seat key. */
  prefer: readonly string[]
  /** Only a firm holding a live seat in a client's program (an MSP reads that program). */
  seatedOnly?: boolean
}

/** The roles the founder named, at the firms the demo seeds for them; the busiest firm of the same kind beside each. */
export const PROBES: readonly Probe[] = [
  { party: 'client', role: 'program manager', kinds: ['CLIENT'], seat: 'programme', prefer: ['world-nike'] },
  { party: 'client', role: 'hiring manager', kinds: ['CLIENT'], seat: 'hiring', prefer: ['world-nike'] },
  { party: 'client', role: 'AP clerk', kinds: ['CLIENT'], seat: 'ap', prefer: ['world-nike'] },
  { party: 'client', role: 'compliance officer', kinds: ['CLIENT'], seat: 'compliance', prefer: ['world-nike'] },
  { party: 'client', role: 'regional manager', kinds: ['CLIENT'], seat: 'region', prefer: ['world-corvane'] },
  { party: 'supplier', role: 'owner', kinds: ['VENDOR'], seat: 'owner', prefer: ['world-brightmoor'] },
  { party: 'supplier', role: 'account manager', kinds: ['VENDOR'], seat: 'account', prefer: ['world-brightmoor'] },
  { party: 'supplier', role: 'accounts receivable', kinds: ['VENDOR'], seat: 'ar', prefer: ['world-brightmoor'] },
  { party: 'supplier', role: 'AP & payroll', kinds: ['VENDOR'], seat: 'payroll', prefer: ['world-brightmoor'] },
  { party: 'supplier', role: 'HR', kinds: ['VENDOR'], seat: 'hr', prefer: ['world-brightmoor'] },
  { party: 'integrator', role: 'delivery manager', kinds: ['GSI'], seat: 'delivery', prefer: ['world-teleworld'] },
  { party: 'MSP', role: 'seated in a client’s program', kinds: ['MSP'], seat: 'owner', prefer: ['world-aptiva'], seatedOnly: true },
  { party: 'one-person firm', role: 'owner', kinds: ['CONSULTANT_CORP'], seat: 'owner', prefer: ['world-byrne-critical-care'] },
  { party: 'worker', role: 'worker', kinds: null, seat: 'person', prefer: ['person/helena-marsh', 'person/karthik-menon'] },
]

/** What the database says about how busy each firm and each worker is, and which firms hold a seat in a client's program. */
export interface Busy {
  /** Sell lines on either side, by company id. */
  firms: ReadonlyMap<string, number>
  /** Weeks filed, by person id. */
  people: ReadonlyMap<string, number>
  /** Firms holding a live seat in a client's program. */
  seated: ReadonlySet<string>
}

export interface Picked {
  probe: Probe
  seat: SeatSpec
  /** Why this one: the seeded one the demo names, or the busiest of its kind. */
  why: 'named' | 'busiest'
}

function holdsProbe(s: SeatSpec, p: Probe, busy: Busy): boolean {
  if (p.seat === 'person') return s.key.startsWith('person/') || s.key.startsWith('worker/')
  if (!s.company || !p.kinds?.includes(s.company.kind as CompanyKind)) return false
  if (s.key !== `${s.company.slug}/${p.seat}`) return false
  return !p.seatedOnly || busy.seated.has(s.company.id)
}

/**
 * The seats each role is read as: the seeded one the demo names first,
 * then the busiest others of the same kind, `perRole` in all. One seat is
 * read once, whichever roles it would answer for. Pure.
 */
export function pickSeats(seats: readonly SeatSpec[], probes: readonly Probe[], busy: Busy, perRole: number): Picked[] {
  const out: Picked[] = []
  const taken = new Set<string>()
  for (const p of probes) {
    const fits = seats.filter((s) => holdsProbe(s, p, busy) && !taken.has(s.key))
    const named = p.prefer
      .map((pref) => fits.find((s) => s.key === pref || s.company?.slug === pref))
      .filter((s): s is SeatSpec => !!s)
    const weight = (s: SeatSpec) => (p.seat === 'person' ? busy.people.get(s.personId) ?? 0 : busy.firms.get(s.company!.id) ?? 0)
    const rest = fits
      .filter((s) => !named.includes(s))
      .sort((a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key))
    const chosen: Picked[] = [
      ...named.map((seat) => ({ probe: p, seat, why: 'named' as const })),
      ...rest.map((seat) => ({ probe: p, seat, why: 'busiest' as const })),
    ].slice(0, perRole)
    for (const c of chosen) taken.add(c.seat.key)
    out.push(...chosen)
  }
  return out
}

// ── What a seat is offered ─────────────────────────────────────────────

/** What the shell reads to draw a seat's menu, from /api/me and the seat itself. */
export interface MenuFacts {
  kind: CompanyKind | null
  isConsultant: boolean
  /** A person seat is always somebody the work is about (the demo door says so). */
  worker: boolean
  permissions: readonly string[] | null
  /** The client whose program this firm holds a seat in, if any. */
  seatedAtClient: string | null
  region: string | null
}

/** The menu this seat reads, exactly as the sidebar draws it. */
export function menuFor(f: MenuFacts): NavSection[] {
  return getNavForKind(f.kind, f.isConsultant, {
    worker: f.worker,
    permissions: f.permissions,
    seatedAtClient: f.seatedAtClient,
    region: f.region,
  })
}

export interface PageRef {
  /** The menu's own words: the noun, then the tab. */
  label: string
  href: string
}

/** Every page on a menu, the nine links and every tab under them, once each, in menu order. */
export function pagesOf(sections: readonly NavSection[]): PageRef[] {
  const out: PageRef[] = []
  const seen = new Set<string>()
  for (const s of sections) {
    for (const i of s.items) {
      if (seen.has(i.href)) continue
      seen.add(i.href)
      out.push({ label: s.label === i.label ? i.label : `${s.label} › ${i.label}`, href: i.href })
    }
  }
  return out
}

/** What every page in the shell reads on load: who you are, and the number on the Ask Etyme mark (re-read every minute). */
export const SHELL_READS: readonly string[] = ['/api/me', '/api/conversations/twin?only=owed']
/** The greeting's reads, where a menu has Ask Etyme: the thread and its greeting, the one decisions list, the firm's Today, and the notices. */
export const GREETING_READS: readonly string[] = ['/api/conversations/twin', '/api/decisions', '/api/today', '/api/notifications']

/**
 * The routes the pages on this menu read on load, where the menu names
 * them: each link's own route (`routesOf` in lib/nav-table), never one
 * with an id in it, and only where a GET answers there (`hasGet`). A page
 * whose link carries a query reads its route with the same query. Then
 * the shell's reads, and the greeting's where the menu has Ask Etyme.
 */
export function readsOf(sections: readonly NavSection[], hasGet: (route: string) => boolean): string[] {
  const out: string[] = [...SHELL_READS]
  const hasAsk = sections.some((s) => s.items.some((i) => i.href === '/dashboard/conversations/etyme'))
  if (hasAsk) out.push(...GREETING_READS)
  for (const s of sections) {
    for (const i of s.items) {
      const query = i.href.includes('?') ? `?${i.href.split('?')[1]}` : ''
      for (const r of routesOf(i)) {
        if (r.includes('*') || !hasGet(r)) continue
        out.push(`/api/${r}${query}`)
      }
    }
  }
  return [...new Set(out)]
}

// ── The visits ─────────────────────────────────────────────────────────

export interface Visit {
  party: Party
  seat: string
  kind: 'page' | 'read'
  /** The menu's words for a page; the path for a read. */
  label: string
  /** Path with its query. */
  path: string
}

/**
 * Every visit of one round, mixed across seats and pages, in the same
 * order every time for the same round. Pure.
 *
 * Mixed, not taken in menu order (2026-11-02). The first founder-scale
 * pass took each seat's pages in turn, so the last section of the longest
 * menu (a supplier's Settings) was opened when every shorter menu had
 * moved on to its reads: a median of 17 of the heaviest reads (Today, the
 * greeting, the decisions list) were in flight beside each Settings tab,
 * against 3 beside the supplier's other pages, and the tabs read 5.5 to
 * 9.4 seconds where, measured alone at 40 at once, they take 1.1 to 2.3.
 * A page's place on the menu must not decide how busy the server is when
 * it is opened.
 */
export function roundOf(
  seats: readonly { party: Party; seat: string; pages: readonly PageRef[]; reads: readonly string[] }[],
  round = 0,
): Visit[] {
  const out: Visit[] = []
  for (const s of seats) {
    for (const p of s.pages) out.push({ party: s.party, seat: s.seat, kind: 'page', label: p.label, path: p.href })
    for (const r of s.reads) out.push({ party: s.party, seat: s.seat, kind: 'read', label: r, path: r })
  }
  // Fisher-Yates on a seeded generator (mulberry32), so a round is the same mix on every run.
  let t = (0x9e3779b9 ^ (round + 1)) >>> 0
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── The arithmetic ─────────────────────────────────────────────────────

/** One timed visit: the visit, what came back, and how long the whole answer took. */
export interface Hit extends Visit {
  status: number
  ms: number
  /** The page's or route's file owner, from lib/domains. */
  owner: DomainKey | null
  /** Where a redirect landed, where it was not the page asked for. */
  landed?: string
  /** The sentence a refused read said. */
  sentence?: string
}

export interface PageStat {
  party: Party
  kind: 'page' | 'read'
  label: string
  path: string
  owner: DomainKey | null
  calls: number
  p50: number
  p95: number
  max: number
  /** Answers that were not 200, with each status and how often. */
  not200: number
  statuses: Record<string, number>
  /** 5xx and calls nobody answered. */
  errors: number
  landed: string[]
}

/**
 * Per party, per page or read, from the hits alone: percentiles through
 * the simulation's own `routeStats`, keyed on the page as the menu names
 * it rather than on the route, so two tabs on one route stay two rows.
 */
export function pageStats(hits: readonly Hit[]): PageStat[] {
  const groups = new Map<string, Hit[]>()
  for (const h of hits) {
    const k = `${h.party}\u0000${h.kind}\u0000${h.path}`
    const g = groups.get(k)
    if (g) g.push(h)
    else groups.set(k, [h])
  }
  const out: PageStat[] = []
  for (const list of groups.values()) {
    const first = list[0]
    const calls: Call[] = list.map((h, i) => ({
      n: i + 1, at: '', stage: 'pages', seat: h.seat, method: 'GET', path: h.path, route: h.path, owner: h.owner, status: h.status, ms: h.ms,
    }))
    const [s] = routeStats(calls)
    const statuses: Record<string, number> = {}
    for (const h of list) if (h.status !== 200) statuses[String(h.status)] = (statuses[String(h.status)] ?? 0) + 1
    out.push({
      party: first.party, kind: first.kind, label: first.label, path: first.path, owner: first.owner,
      calls: s.count, p50: s.p50, p95: s.p95, max: s.max,
      not200: list.filter((h) => h.status !== 200).length, statuses, errors: s.errors,
      landed: [...new Set(list.map((h) => h.landed).filter((x): x is string => !!x))],
    })
  }
  const order = (p: Party) => PARTIES.indexOf(p)
  return out.sort((a, b) => order(a.party) - order(b.party) || (a.kind === b.kind ? b.p95 - a.p95 : a.kind === 'page' ? -1 : 1))
}

export interface PageFault {
  party: Party
  kind: 'page' | 'read'
  label: string
  path: string
  owner: DomainKey | null
  why: string
  sample?: string
}

/** A page or read that answered any call with a server error or not at all, or whose p95 passed the simulation's two-second line. */
export function pageFaults(stats: readonly PageStat[], hits: readonly Hit[], slowMs = SLOW_P95_MS): PageFault[] {
  const out: PageFault[] = []
  for (const s of stats) {
    const why: string[] = []
    if (s.errors > 0) why.push(`${s.errors} of ${s.calls} call${s.calls === 1 ? '' : 's'} failed with a server error or no answer`)
    if (s.p95 > slowMs) why.push(`95% of calls took up to ${(s.p95 / 1000).toFixed(1)}s, over the ${slowMs / 1000}s line`)
    if (why.length === 0) continue
    const failing = hits.find((h) => h.party === s.party && h.path === s.path && isError(h.status) && h.sentence)
    out.push({ party: s.party, kind: s.kind, label: s.label, path: s.path, owner: s.owner, why: why.join('; ') + '.', ...(failing?.sentence ? { sample: failing.sentence } : {}) })
  }
  return out
}

// ── What was behind the pages ──────────────────────────────────────────

/** The tables counted, in the founder's words beside each: the transactions the pages were read over. */
export const COUNTED: readonly { table: string; says: string }[] = [
  { table: 'Requirement', says: 'job requests' },
  { table: 'Submission', says: 'candidates put forward' },
  { table: 'Timesheet', says: 'weeks filed' },
  { table: 'Invoice', says: 'bills and invoice receipts' },
  { table: 'InvoiceLine', says: 'lines on them' },
  { table: 'Verification', says: 'papers checked' },
  { table: 'DocInstance', says: 'papers sent and signed' },
  { table: 'AccessLog', says: 'reads of somebody’s data, logged' },
  { table: 'Notification', says: 'notices' },
]

/** The founder's figure: transactions behind each page. */
export const FOUNDER_TRANSACTIONS = 100_000

/** The total, and one honest sentence about it against the founder's figure. Pure. */
export function behindThePages(counts: Readonly<Record<string, number>>): { total: number; says: string } {
  const total = COUNTED.reduce((n, c) => n + (counts[c.table] ?? 0), 0)
  const n = total.toLocaleString('en-US')
  const says = total >= FOUNDER_TRANSACTIONS
    ? `The pages were read over ${n} transactions, past the ${FOUNDER_TRANSACTIONS.toLocaleString('en-US')} asked for.`
    : `The pages were read over ${n} transactions, short of the ${FOUNDER_TRANSACTIONS.toLocaleString('en-US')} asked for: a larger run of the simulation (more placements, more weeks) fills the database further before this pass.`
  return { total, says }
}

// ── The report ─────────────────────────────────────────────────────────

export interface SeatRead {
  party: Party
  role: string
  key: string
  personName: string
  firm: string | null
  why: 'named' | 'busiest'
  pages: number
  reads: number
  /** The client whose program it read, for a seat in one. */
  seatedAt: string | null
  region: string | null
  /** Where the seat could not be read at all, the sentence. */
  failed?: string
}

export interface PagesRecord {
  stamp: string
  startedAt: Date
  finishedAt: Date
  db: string
  base: string
  build: string
  args: Pick<PagesArgs, 'concurrency' | 'rounds' | 'warmup' | 'firms' | 'timeoutMs'>
  seats: SeatRead[]
  countsBefore: Record<string, number>
  countsAfter: Record<string, number>
  hits: Hit[]
  /** Untimed first visits, counted only for their server errors. */
  warmupErrors: Hit[]
}

const own = (d: DomainKey | null | undefined) => (d ? d.toLowerCase() : 'nobody')
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n} ms`)
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function statusSays(s: PageStat): string {
  if (s.not200 === 0) return '0'
  return `${s.not200} (${Object.entries(s.statuses).map(([k, v]) => `${v}×${k}`).join(', ')})`
}

/** The report, in plain English, from the record alone. Pure. */
export function pagesReportMarkdown(r: PagesRecord): string {
  const stats = pageStats(r.hits)
  const faults = pageFaults(stats, r.hits)
  const behind = behindThePages(r.countsBefore)
  const lines: string[] = []
  const timed = r.hits.length
  const took = Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)
  const all = r.hits.map((h) => h.ms).sort((a, b) => a - b)

  lines.push(`# Every page, under load, as each party — ${r.stamp}`, '')
  lines.push(
    `Read on \`${r.db}\` at ${r.base}, ${r.build}. ` +
      `${r.seats.filter((s) => !s.failed).length} seats, ${r.args.concurrency} calls at once, ` +
      `${r.args.warmup} untimed and ${r.args.rounds} timed visit${r.args.rounds === 1 ? '' : 's'} to every page and read. ` +
      `${timed.toLocaleString('en-US')} timed calls in ${took}s; half answered within ${ms(percentile(all, 50) ?? 0)}, 95% within ${ms(percentile(all, 95) ?? 0)}.`,
    ''
  )
  lines.push(
    'A page is timed from the request to the last byte of its answer, with the seat’s own session, following any redirect. ' +
      'The data a page loads in the browser after that is timed on its own, as the reads below each party’s pages. ' +
      `A page or read is a fault where any call failed with a server error or none came back, or where 95% of calls took longer than ${SLOW_P95_MS / 1000}s.`,
    ''
  )

  lines.push('## What was behind the pages', '', behind.says, '')
  lines.push('| Table | What it holds | Before | After |', '|---|---|---|---|')
  for (const c of COUNTED) {
    lines.push(`| ${c.table} | ${c.says} | ${(r.countsBefore[c.table] ?? 0).toLocaleString('en-US')} | ${(r.countsAfter[c.table] ?? 0).toLocaleString('en-US')} |`)
  }
  lines.push('', 'Reading a page writes to the access log and may write notices, so those two grow while the pages are read.', '')

  lines.push('## Faults', '')
  if (faults.length === 0) lines.push(`None. No page or read failed with a server error, and none took longer than ${SLOW_P95_MS / 1000}s at the 95th percentile.`)
  for (const f of faults) {
    lines.push(`- **${f.kind === 'page' ? 'Page' : 'Read'} ${cell(f.label)}** (\`${f.path}\`) for the ${f.party}, owned by ${own(f.owner)}: ${f.why}${f.sample ? ` It said: “${cell(f.sample)}”` : ''}`)
  }
  if (r.warmupErrors.length) {
    lines.push('', `The untimed first visits met ${r.warmupErrors.length} server error${r.warmupErrors.length === 1 ? '' : 's'}: ` +
      [...new Set(r.warmupErrors.map((h) => `\`${h.path}\` (${h.status}) for the ${h.party}`))].join('; ') + '.')
  }
  lines.push('')

  lines.push('## The seats', '', '| Party | Role | Who | Firm | Chosen as | Pages | Reads |', '|---|---|---|---|---|---|---|')
  for (const s of r.seats) {
    const firm = s.firm ? `${s.firm}${s.seatedAt ? `, in ${s.seatedAt}’s program` : ''}${s.region ? `, ${s.region} region` : ''}` : '—'
    const chosen = s.why === 'named' ? 'the seeded one' : 'the busiest'
    lines.push(`| ${s.party} | ${cell(s.role)} | ${cell(s.personName)} | ${cell(firm)} | ${chosen} | ${s.failed ? `not read: ${cell(s.failed)}` : s.pages} | ${s.failed ? '—' : s.reads} |`)
  }
  lines.push('')

  for (const party of PARTIES) {
    const mine = stats.filter((s) => s.party === party)
    if (mine.length === 0) continue
    lines.push(`## The ${party}`, '')
    for (const kind of ['page', 'read'] as const) {
      const rows = mine.filter((s) => s.kind === kind)
      if (rows.length === 0) continue
      lines.push(kind === 'page' ? '### Pages' : '### What the pages read on load', '')
      lines.push(`| ${kind === 'page' ? 'Page' : 'Read'} | Owner | Calls | p50 | p95 | Slowest | Not 200 |`, '|---|---|---|---|---|---|---|')
      for (const s of rows) {
        const name = kind === 'page' ? `${cell(s.label)} \`${s.path}\`` : `\`${s.path}\``
        const landed = s.landed.length ? ` (landed on ${s.landed.map((l) => `\`${l}\``).join(', ')})` : ''
        lines.push(`| ${name}${landed} | ${own(s.owner)} | ${s.calls} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)} | ${statusSays(s)} |`)
      }
      lines.push('')
    }
  }

  const refused = r.hits.filter((h) => isRefusal(h.status) && h.sentence)
  if (refused.length) {
    lines.push('## Refused reads', '', 'A read a page makes on load that refused the seat it was opened as: the menu offered a page whose data that role may not read.', '')
    const seen = new Map<string, { n: number; h: Hit }>()
    for (const h of refused) {
      const k = `${h.party}\u0000${h.path}\u0000${h.sentence}`
      const e = seen.get(k)
      if (e) e.n++
      else seen.set(k, { n: 1, h })
    }
    for (const { n, h } of seen.values()) lines.push(`- \`${h.path}\` for the ${h.party} (${h.status}, ${n}×, owned by ${own(h.owner)}): “${cell(h.sentence!)}”`)
    lines.push('')
  }

  lines.push('## The ten slowest calls', '', '| Party | Seat | Page or read | Status | Time |', '|---|---|---|---|---|')
  for (const h of [...r.hits].sort((a, b) => b.ms - a.ms).slice(0, 10)) {
    lines.push(`| ${h.party} | \`${h.seat}\` | \`${h.path}\` | ${h.status} | ${ms(h.ms)} |`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * The kind a menu is drawn for, read the way the session does it
 * (`normalizeKind` in components/session-provider, a client component
 * this script cannot import): the four named kinds as they are, anything
 * else a vendor, and no firm at all a person.
 */
export function kindOf(raw: unknown): CompanyKind | null {
  if (raw == null) return null
  return raw === 'CLIENT' || raw === 'MSP' || raw === 'GSI' || raw === 'CONSULTANT_CORP' ? raw : 'VENDOR'
}
