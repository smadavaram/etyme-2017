/**
 * Every transaction, end to end, as each party (CLAUDE.md, 2026-10-20).
 *
 *   npm run simulate -- --placements 200 --weeks 12
 *
 * 1. Copies today's seeded world template to `etyme_sim_<stamp>`
 *    (building the template first if today's is not built yet).
 * 2. Builds the app into `.next-sim` if anything changed since the last
 *    build, and starts it on a free port against that copy.
 * 3. Opens seats through the demo door as each stage asks for them, and
 *    runs the stations in the order of the trade.
 * 4. Stops the app, writes `reports/simulation-<stamp>.md` and the JSON
 *    ledger beside it, and keeps the database unless `--drop`.
 *
 * See args.ts for every flag and stage.ts for how a station is written.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { Cast, readCatalog, type Wire } from './actors'
import { parseArgs } from './args'
import { Ledger, faultsOf, isError, isRefusal } from './ledger'
import { lessonsOf } from './lessons'
import { writeReport, type StageRun } from './report'
import { build, freePort, serverEnv, staleBecause, start, DIST_DIR, type Running } from './server'
import { emptyWorld, expectRefusalOn, parallel, type Ctx } from './stage'
import { STAGES } from './stages'
import { dropWorld, prepareWorld } from './world-db'

const ROOT = join(__dirname, '..', '..')
const REPORTS = join(ROOT, 'reports')

function stampNow(d = new Date()): string {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const startedAt = new Date()
  const stamp = stampNow(startedAt)
  const say = (line: string) => console.log(`[simulate] ${line}`)

  // The same secret the integration suite signs sessions with; the
  // server and the actors must agree on it (lib/demo-session).
  const nextAuthSecret = 'integration-test-secret'
  process.env.NEXTAUTH_SECRET = nextAuthSecret
  const cronSecret = randomBytes(18).toString('hex')

  const db = await prepareWorld(stamp, say, args.template)
  say(`world copied to ${db.name} from ${db.template}`)

  let server: Running | null = null
  const reader = new PrismaClient({ datasources: { db: { url: db.readerUrl } } })
  const ledger = new Ledger()
  const stages: StageRun[] = []
  const world = emptyWorld()
  let buildNote = 'the existing build was reused'
  let cast: Cast | null = null
  let catalog = { seats: [], unreachable: [] } as Awaited<ReturnType<typeof readCatalog>>
  let base = ''
  let failure: unknown = null

  const stopAll = async () => {
    if (server) await server.stop()
    server = null
  }
  process.once('SIGINT', () => { void stopAll().then(() => process.exit(130)) })

  try {
    const port = await freePort()
    const env = serverEnv({ databaseUrl: db.url, nextAuthSecret, cronSecret, port })
    const stale = args.build === 'always' ? 'a rebuild was asked for' : args.build === 'never' ? null : staleBecause()
    if (stale) {
      say(`building the app into ${DIST_DIR}, because ${stale} (a few minutes)`)
      build(env, join(REPORTS, `simulation-${stamp}.build.log`))
      buildNote = `built for this run because ${stale}`
    }
    say(`starting the app on port ${port}`)
    server = await start(env, port, join(REPORTS, `simulation-${stamp}.server.log`))
    base = server.base
    say(`app ready at ${base}`)

    catalog = await readCatalog(reader)
    for (const s of catalog.seats) {
      if (!s.company) continue
      const c = (world.companies[s.company.slug] ??= { ...s.company, seats: [] })
      c.seats.push(s.key)
    }
    say(`${catalog.seats.length} seats in the world, at ${Object.keys(world.companies).length} firms`)

    const wire: Wire = { base, ledger, secret: nextAuthSecret, cronSecret, timeoutMs: args.timeoutMs }
    cast = new Cast(catalog, wire)
    const options = { placements: args.placements, weeks: args.weeks, concurrency: args.concurrency, only: args.only }

    for (const stage of STAGES) {
      if (args.only.length && !args.only.includes(stage.name)) continue
      ledger.stage = stage.name
      const ctx: Ctx = {
        cast, world, ledger, options, read: reader, base,
        parallel: (items, fn, n) => parallel(items, fn, n ?? args.concurrency),
        expectRefusal: (seat, call, phrase) => expectRefusalOn(ledger, seat, call, phrase),
        log: (line) => say(`${stage.name}: ${line}`),
      }
      const t0 = Date.now()
      const run: StageRun = { name: stage.name, domain: stage.domain, built: stage.built, ms: 0 }
      try {
        run.result = (await stage.run(ctx)) ?? undefined
      } catch (e: any) {
        run.error = String(e?.message ?? e)
        say(`${stage.name}: the stage stopped — ${run.error}`)
      }
      run.ms = Date.now() - t0
      stages.push(run)
      if (stage.built) {
        const sc = ledger.ofStage(stage.name)
        say(
          `${stage.name}: ${run.result?.says ?? `closed ${run.result?.closed ?? 0}`} ` +
            `(${sc.length} calls, ${sc.filter((c) => isRefusal(c.status)).length} refused, ${sc.filter((c) => isError(c.status)).length} server errors, ${(run.ms / 1000).toFixed(1)}s)`
        )
      }
    }
    ledger.stage = 'harness'
  } catch (e) {
    failure = e
  } finally {
    await stopAll()
    await reader.$disconnect().catch(() => {})
  }

  const finishedAt = new Date()
  const files = writeReport(
    {
      stamp, startedAt, finishedAt, options: { placements: args.placements, weeks: args.weeks, concurrency: args.concurrency, only: args.only },
      database: { name: db.name, template: db.template, kept: !args.drop }, base, build: buildNote,
      stages, world, ledger, catalog, opened: cast?.opened ?? 0,
    },
    REPORTS
  )
  if (args.drop) dropWorld(db.name)

  const faults = faultsOf(ledger.calls)
  say(`${ledger.calls.length} calls, ${lessonsOf(ledger.calls).length} distinct refusal sentences, ${faults.length} faults`)
  say(`report: ${files.md}`)
  say(`ledger: ${files.json}`)
  if (!args.drop) say(`database kept: ${db.name}`)
  if (failure) {
    console.error(`[simulate] the run could not finish: ${String((failure as any)?.message ?? failure)}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`[simulate] ${String(e?.message ?? e)}`)
  process.exit(1)
})
