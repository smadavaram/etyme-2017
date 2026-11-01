/**
 * Every page a person opens, under load, as each party (founder,
 * 2026-11-01: "Do load and performance testing for 100000 transactions
 * on each page").
 *
 *   npm run simulate:pages -- --db etyme_sim_<stamp> --concurrency 40 --rounds 3
 *
 * On a database a simulation run kept (run.ts prints "database kept"),
 * with the app built for the simulation:
 *
 * 1. Starts the app on a free port against that database, never against
 *    a copy, so the pages are read over every transaction the stations
 *    made. The build is reused unless something changed since (server.ts).
 * 2. Sits as a sample of seats of every party through the demo door,
 *    exactly as the stations do (actors.ts): the client's program manager,
 *    hiring manager, AP clerk, compliance officer and a regional manager;
 *    a supplier's owner, account manager, accounts receivable, AP &
 *    payroll and HR; an integrator's delivery manager; an MSP seated in a
 *    client's program; a one-person firm; workers. Each at the firm the
 *    demo names and at the busiest firm of the same kind (pages-plan.ts).
 * 3. Reads each seat's menu off lib/nav-table, as the sidebar draws it,
 *    and opens every page on it and every route those pages read on load,
 *    with the seat's own session: one untimed visit, then the timed rounds,
 *    at the concurrency asked for.
 * 4. Stops the app and writes `reports/pages-<stamp>.md`, with the JSON of
 *    every call beside it.
 *
 * It writes nothing itself. Reading a page writes what reading it always
 * writes — the access log, a notice — and the report counts both before
 * and after.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { liveSeatWhere } from '@/lib/program-seat'
import { REGION_UNIT_KIND } from '@/lib/region-scope'
import { databaseExists, ensurePostgres, urlFor, PG_HOST, PG_PORT } from '../../__integration__/postgres'
import { Cast, readCatalog, type Actor, type Wire } from './actors'
import { Ledger, isError } from './ledger'
import {
  COUNTED, PROBES, kindOf, menuFor, pagesOf, pagesReportMarkdown, parsePagesArgs, pickSeats, readsOf, roundOf,
  type Busy, type Hit, type PageRef, type Party, type PagesRecord, type SeatRead, type Visit,
} from './pages-plan'
import { routeOf } from './routes'
import { build, freePort, serverEnv, start, type Running } from './server'
import { parallel } from './stage'
import { READER_ROLE } from './world-db'

const ROOT = join(__dirname, '..', '..')
const REPORTS = join(ROOT, 'reports')

function stampNow(d = new Date()): string {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

/** The read-only role on this database, the way world-db.ts writes its address. */
function readerUrlFor(db: string): string {
  const pw = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : ''
  return `postgresql://${READER_ROLE}${pw}@${PG_HOST}:${PG_PORT}/${db}`
}

/** Whether a GET answers at /api/<route>: its route file exists and exports one. */
function hasGet(route: string): boolean {
  const file = join(ROOT, 'src', 'app', 'api', ...route.split('/'), 'route.ts')
  return existsSync(file) && /export\s+(async\s+function|const)\s+GET\b/.test(readFileSync(file, 'utf8'))
}

async function countTables(reader: PrismaClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const { table } of COUNTED) {
    const [row] = await reader.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "${table}"`)
    out[table] = Number(row?.n ?? 0)
  }
  return out
}

async function busyOf(reader: PrismaClient): Promise<Busy & { seats: Map<string, { client: string; permissions: string[] }> }> {
  const firms = await reader.$queryRawUnsafe<{ id: string; n: bigint }[]>(`
    select c.id, count(s.id)::bigint as n
    from "Company" c
    left join "SellContract" s on s."companyId" = c.id or s."clientCompanyId" = c.id
    where c.slug like 'world-%'
    group by c.id`)
  const people = await reader.$queryRawUnsafe<{ personId: string; n: bigint }[]>(
    `select "personId", count(*)::bigint as n from "Timesheet" group by "personId"`
  )
  // The same live seat the shell reads (`seatFor` in lib/program-seat): the
  // first by the client's name, and its permissions are the client role's.
  const live = await reader.programSeat.findMany({
    where: liveSeatWhere(),
    select: { officeCompanyId: true, clientCompany: { select: { name: true } }, role: { select: { permissions: true } } },
    orderBy: [{ clientCompany: { name: 'asc' } }, { id: 'asc' }],
  })
  const seats = new Map<string, { client: string; permissions: string[] }>()
  for (const s of live) if (!seats.has(s.officeCompanyId)) seats.set(s.officeCompanyId, { client: s.clientCompany.name, permissions: s.role.permissions })
  return {
    firms: new Map(firms.map((f) => [f.id, Number(f.n)])),
    people: new Map(people.map((p) => [p.personId, Number(p.n)])),
    seated: new Set(seats.keys()),
    seats,
  }
}

async function main() {
  const args = parsePagesArgs(process.argv.slice(2))
  const startedAt = new Date()
  const stamp = stampNow(startedAt)
  const say = (line: string) => console.log(`[pages] ${line}`)

  ensurePostgres()
  if (!databaseExists(args.db)) throw new Error(`There is no database called ${args.db}. A simulation run says which it kept on its last line.`)

  // The secret the simulation signs sessions with (run.ts); the server
  // and the actors must agree on it (lib/demo-session).
  const nextAuthSecret = 'integration-test-secret'
  process.env.NEXTAUTH_SECRET = nextAuthSecret
  const cronSecret = randomBytes(18).toString('hex')

  const reader = new PrismaClient({ datasources: { db: { url: readerUrlFor(args.db) } } })
  const ledger = new Ledger()
  let server: Running | null = null
  let base = ''
  let buildNote = 'the existing build was reused'
  const hits: Hit[] = []
  const warmupErrors: Hit[] = []
  const seatsRead: SeatRead[] = []
  let countsBefore: Record<string, number> = {}
  let countsAfter: Record<string, number> = {}
  let failure: unknown = null

  const stopAll = async () => {
    if (server) await server.stop()
    server = null
  }
  process.once('SIGINT', () => { void stopAll().then(() => process.exit(130)) })

  try {
    try {
      countsBefore = await countTables(reader)
    } catch (e: any) {
      throw new Error(`The read-only role cannot open ${args.db} (${String(e?.message ?? e).split('\n')[0]}). It is set up when a simulation run copies its world (scripts/simulate/world-db.ts); read a database a run kept.`)
    }
    say(`${args.db}: ${COUNTED.map((c) => `${(countsBefore[c.table] ?? 0).toLocaleString('en-US')} ${c.table}`).join(', ')}`)

    const port = await freePort()
    const env = serverEnv({ databaseUrl: urlFor(args.db), nextAuthSecret, cronSecret, port })
    if (args.build !== 'never') {
      const why = await build(env, join(REPORTS, `pages-${stamp}.build.log`), { force: args.build === 'always', say })
      if (why) buildNote = `built for this pass because ${why}`
    }
    say(`starting the app on port ${port}`)
    server = await start(env, port, join(REPORTS, `pages-${stamp}.server.log`))
    base = server.base
    say(`app ready at ${base}`)

    const catalog = await readCatalog(reader)
    const busy = await busyOf(reader)
    const picked = pickSeats(catalog.seats, PROBES, busy, args.firms)
    const wire: Wire = { base, ledger, secret: nextAuthSecret, cronSecret, timeoutMs: args.timeoutMs }
    const cast = new Cast(catalog, wire, reader)

    // ── Each seat's menu, as the sidebar draws it ──
    ledger.stage = 'menu'
    const plans: { party: Party; seat: string; actor: Actor; pages: PageRef[]; reads: string[] }[] = []
    for (const p of picked) {
      const actor = cast.seat(p.seat.key)
      const read: SeatRead = {
        party: p.probe.party, role: p.probe.role, key: p.seat.key, personName: p.seat.personName,
        firm: p.seat.company?.name ?? null, why: p.why, pages: 0, reads: 0, seatedAt: null, region: null,
      }
      seatsRead.push(read)
      try {
        const me = await actor.get('/api/me')
        if (!me.ok) throw new Error(me.sentence ?? `/api/me answered ${me.status}`)
        const active = me.json?.data?.activeContext ?? null
        const kind = kindOf(active?.company?.kind)
        const companyId: string | null = active?.company?.id ?? null
        const seat = kind && companyId ? busy.seats.get(companyId) ?? null : null
        // A seat on a REGION unit reads its region alone (lib/region-scope),
        // as the layout's `readersRegion` finds it.
        const unit = companyId
          ? await reader.context.findFirst({
              where: { personId: p.seat.personId, companyId, revokedAt: null, roleId: { not: null } },
              orderBy: { grantedAt: 'asc' },
              select: { orgUnit: { select: { name: true, kind: true } } },
            })
          : null
        const region = unit?.orgUnit?.kind === REGION_UNIT_KIND ? unit.orgUnit.name : null
        const menu = menuFor({
          kind,
          isConsultant: active?.type === 'CONSULTANT',
          worker: p.probe.seat === 'person',
          // A firm in a client's program reads the client role's permissions (`deskOf` in the shell).
          permissions: seat ? seat.permissions : (active?.role?.permissions ?? []),
          seatedAtClient: seat?.client ?? null,
          region,
        })
        const pages = pagesOf(menu)
        const reads = readsOf(menu, hasGet)
        read.pages = pages.length
        read.reads = reads.length
        read.seatedAt = seat?.client ?? null
        read.region = region
        plans.push({ party: p.probe.party, seat: p.seat.key, actor, pages, reads })
      } catch (e: any) {
        read.failed = String(e?.message ?? e).split('\n')[0]
        say(`${p.seat.key} could not be read: ${read.failed}`)
      }
    }
    const perRound = plans.reduce((n, p) => n + p.pages.length + p.reads.length, 0)
    say(`${plans.length} seats; ${perRound} pages and reads a round; ${args.warmup} untimed and ${args.rounds} timed round${args.rounds === 1 ? '' : 's'} at ${args.concurrency} at once`)

    const actors = new Map(plans.map((p) => [p.seat, p.actor]))
    const visit = async (v: Visit): Promise<Hit> => {
      const actor = actors.get(v.seat)!
      const owner = routeOf(v.path.split('?')[0]).owner
      if (v.kind === 'page') {
        const r = await actor.page(v.path)
        return { ...v, status: r.status, ms: r.ms, owner, ...(r.landed ? { landed: r.landed } : {}), ...(r.sentence ? { sentence: r.sentence } : {}) }
      }
      const r = await actor.get(v.path)
      return { ...v, status: r.status, ms: r.ms, owner, ...(r.sentence ? { sentence: r.sentence } : {}) }
    }
    const round = roundOf(plans)

    ledger.stage = 'warmup'
    for (let w = 0; w < args.warmup; w++) {
      const t0 = Date.now()
      const done = await parallel(round, visit, args.concurrency)
      for (const d of done) if (d.ok && isError(d.value.status)) warmupErrors.push(d.value)
      say(`untimed round ${w + 1}: ${round.length} calls in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }
    ledger.stage = 'pages'
    for (let r = 0; r < args.rounds; r++) {
      const t0 = Date.now()
      const done = await parallel(round, visit, args.concurrency)
      for (const d of done) if (d.ok) hits.push(d.value)
      const errors = done.filter((d) => d.ok && isError(d.value.status)).length
      say(`timed round ${r + 1}: ${round.length} calls in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${errors} server error${errors === 1 ? '' : 's'}`)
    }
    ledger.stage = 'harness'
    countsAfter = await countTables(reader)
  } catch (e) {
    failure = e
  } finally {
    await stopAll()
    await reader.$disconnect().catch(() => {})
  }

  const record: PagesRecord = {
    stamp, startedAt, finishedAt: new Date(), db: args.db, base, build: buildNote,
    args: { concurrency: args.concurrency, rounds: args.rounds, warmup: args.warmup, firms: args.firms, timeoutMs: args.timeoutMs },
    seats: seatsRead, countsBefore, countsAfter, hits, warmupErrors,
  }
  mkdirSync(REPORTS, { recursive: true })
  const md = join(REPORTS, `pages-${stamp}.md`)
  const json = join(REPORTS, `pages-${stamp}.json`)
  writeFileSync(md, pagesReportMarkdown(record))
  writeFileSync(json, JSON.stringify({ ...record, calls: ledger.calls }, null, 1))
  say(`report: ${md}`)
  say(`every call: ${json}`)
  if (failure) {
    console.error(`[pages] the pass could not finish: ${String((failure as any)?.message ?? failure)}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`[pages] ${String(e?.message ?? e)}`)
  process.exit(1)
})
