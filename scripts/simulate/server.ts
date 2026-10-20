/**
 * The app under test: built once into its own folder, started on a free
 * port against the run's copy of the world, stopped by its own pid.
 *
 * `.next-sim`, not `.next`. Somebody's `next dev` writes `.next` while
 * they work, and a production build into the same folder corrupts both
 * (next.config.mjs reads NEXT_DIST_DIR for this). The build is reused
 * until a file under src/, the schema or the config is newer than it.
 *
 * ── Two runs at once, and a build that fails (2026-10-20) ─────────────
 *
 * Two agents ran twenty placements each in the same hour and broke each
 * other: one built into `.next-sim` while the other's server was serving
 * from it, and one deleted `.next-sim/cache` while the other was still
 * compiling into it. So:
 *
 * - every build goes into a folder of its own, `.next-sim/builds/<stamp>`,
 *   and only a finished one is pointed at, by rewriting `.next-sim/current`
 *   in one rename. A failed build is deleted and the last good one stands;
 * - one build at a time: `.next-sim/build.lock` names the process
 *   building, and a second run waits for it and then uses what it built;
 * - a server is started on the build that was current when it started,
 *   and keeps it for its whole run, whatever is built after;
 * - a build's compiler cache is deleted once that build has finished, by
 *   the run that holds the lock, so nothing is deleted under a compiler;
 * - builds nobody points at are deleted after six hours.
 *
 * `next build` adds its folder's types to tsconfig.json's include list.
 * A folder per build would add a line per build to a file nobody here
 * owns, so the line it added is taken out again as soon as it finishes.
 *
 * The server never sends anything out: the email, model and Teams keys
 * are removed from its environment, so a run of two hundred placements
 * emails nobody and calls no model. What it would have sent is still
 * written on the record as it would be for a person.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
/** Every simulation build lives under here, and only under here (it is ignored by git). */
export const DIST_DIR = '.next-sim'
const SIM_ROOT = join(ROOT, DIST_DIR)
const BUILDS = join(SIM_ROOT, 'builds')
/** One line: the folder name, under builds/, of the build a new server starts on. */
const CURRENT = join(SIM_ROOT, 'current')
const LOCK = join(SIM_ROOT, 'build.lock')
/** A build nobody points at is kept this long, for a server still serving from it. */
const KEEP_MS = 6 * 60 * 60 * 1000
/** How long a run waits for another run's build before saying so. */
const WAIT_MS = 30 * 60 * 1000
const NEXT_BIN = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

/** Never handed to the server: anything that would reach the outside world. */
const OUTBOUND = [
  'ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'EMAIL_SERVER', 'ETYME_STAFF_EMAILS',
  'AZURE_AD_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET', 'DEV_BYPASS_AUTH', 'VERCEL_URL', 'VERCEL_ENV',
]

export interface ServerEnv {
  databaseUrl: string
  nextAuthSecret: string
  cronSecret: string
  port: number
}

export function serverEnv(e: ServerEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of OUTBOUND) delete env[k]
  for (const k of Object.keys(env)) if (k.startsWith('TEAMS_') || k.startsWith('MICROSOFT_APP_')) delete env[k]
  return {
    ...env,
    NODE_ENV: 'production',
    DATABASE_URL: e.databaseUrl,
    NEXTAUTH_SECRET: e.nextAuthSecret,
    NEXTAUTH_URL: `http://localhost:${e.port}`,
    CRON_SECRET: e.cronSecret,
    PRISMA_QUIET: '1',
    PORT: String(e.port),
  }
}

/** The folder (relative to the root, as NEXT_DIST_DIR wants it) of the current build, or null. */
export function currentDist(): string | null {
  if (!existsSync(CURRENT)) return null
  const name = readFileSync(CURRENT, 'utf8').trim()
  if (!name || name.includes('/') || name.includes('..')) return null
  return existsSync(join(BUILDS, name, 'BUILD_ID')) ? `${DIST_DIR}/builds/${name}` : null
}

/**
 * When a build started, as a file's time inside it. Not BUILD_ID's own
 * time, which is when the build finished: a file saved while the build
 * was compiling would be older than BUILD_ID and newer than what the
 * build read.
 */
const STARTED_FILE = 'SIM_BUILD_STARTED'

/** What would make the current build stale, or null where it is current. */
export function staleBecause(): string | null {
  const dist = currentDist()
  if (!dist) return `there is no simulation build in ${DIST_DIR} yet`
  const id = join(ROOT, dist, STARTED_FILE)
  if (!existsSync(id)) return `the build in ${dist} does not say when it started`
  const r = spawnSync('find', ['src', 'prisma/schema.prisma', 'next.config.mjs', 'package.json', '-newer', id, '-type', 'f', '-print', '-quit'], {
    cwd: ROOT, encoding: 'utf8',
  })
  const newer = r.stdout.trim()
  return newer ? `${newer} changed since the last build` : null
}

/**
 * The include line `next build` added to tsconfig.json for its own
 * folder, taken out again. Pure: returns the text to write back, or null
 * where the file changed in any other way (then it is left alone, and the
 * log says so) or did not change at all.
 */
export function withoutAddedInclude(before: string, after: string, dist: string): string | null {
  if (before === after) return null
  let a: any, b: any
  try {
    a = JSON.parse(after)
    b = JSON.parse(before)
  } catch {
    return null
  }
  const added = `${dist}/types/**/*.ts`
  if (!Array.isArray(a?.include) || !Array.isArray(b?.include)) return null
  const rest = a.include.filter((x: unknown) => x !== added)
  if (rest.length !== a.include.length - 1) return null
  if (JSON.stringify({ ...a, include: rest }) !== JSON.stringify(b)) return null
  return before
}

/**
 * Which entries under `.next-sim` may go: builds nobody points at that are
 * older than six hours, and anything an older version of this file left
 * at the top (the build that lived directly in `.next-sim`). Pure.
 */
export function pruneable(
  entries: { name: string; under: 'builds' | 'top'; mtimeMs: number }[],
  current: string | null,
  nowMs: number,
  keepMs = KEEP_MS
): { name: string; under: 'builds' | 'top' }[] {
  const keepTop = new Set(['builds', 'current', 'build.lock'])
  return entries
    .filter((e) => (e.under === 'builds' ? e.name !== current : !keepTop.has(e.name) && !e.name.startsWith('current.')))
    .filter((e) => nowMs - e.mtimeMs > keepMs)
    .map(({ name, under }) => ({ name, under }))
}

function prune(say: (line: string) => void): void {
  const current = currentDist()?.split('/').pop() ?? null
  const entries: { name: string; under: 'builds' | 'top'; mtimeMs: number }[] = []
  for (const [dir, under] of [[BUILDS, 'builds'], [SIM_ROOT, 'top']] as const) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      try {
        entries.push({ name, under, mtimeMs: statSync(join(dir, name)).mtimeMs })
      } catch {
        // Gone between the listing and the look: somebody else pruned it.
      }
    }
  }
  const gone = pruneable(entries, current, Date.now())
  for (const e of gone) rmSync(join(e.under === 'builds' ? BUILDS : SIM_ROOT, e.name), { recursive: true, force: true })
  if (gone.length) say(`removed ${gone.length} old simulation build folder${gone.length === 1 ? '' : 's'}`)
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === 'EPERM'
  }
}

/** Take the build lock, waiting for another run's build. Returns the release. */
async function takeLock(say: (line: string) => void): Promise<() => void> {
  mkdirSync(SIM_ROOT, { recursive: true })
  const until = Date.now() + WAIT_MS
  let told = false
  for (;;) {
    try {
      writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`, { flag: 'wx' })
      return () => rmSync(LOCK, { force: true })
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e
    }
    let holder = NaN
    let ageMs = 0
    try {
      holder = Number(readFileSync(LOCK, 'utf8').split(' ')[0])
      ageMs = Date.now() - statSync(LOCK).mtimeMs
    } catch {
      continue // released between the two looks
    }
    // A lock whose writer is gone is nobody's. One with no pid yet is
    // being written, unless it has said nothing for a minute.
    const stale = Number.isInteger(holder) && holder > 0 ? !alive(holder) : ageMs > 60_000
    if (stale) {
      rmSync(LOCK, { force: true })
      continue
    }
    if (Date.now() > until) {
      throw new Error(`Another simulation (process ${holder}) has been building the app for thirty minutes. Wait for it, or stop it, and run again.`)
    }
    if (!told) say(`another simulation (process ${holder}) is building the app; waiting for it`)
    told = true
    await new Promise((r) => setTimeout(r, 3_000))
  }
}

/**
 * Build the app into a folder of its own and point at it, unless another
 * run built it while this one waited for the lock. Returns why it built,
 * or null where the current build was used.
 */
export async function build(
  env: NodeJS.ProcessEnv,
  logFile: string,
  opts: { force?: boolean; say?: (line: string) => void } = {}
): Promise<string | null> {
  const say = opts.say ?? (() => {})
  const release = await takeLock(say)
  try {
    const stale = opts.force ? 'a rebuild was asked for' : staleBecause()
    if (!stale) return null
    say(`building the app, because ${stale} (a few minutes)`)

    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 17) + `-${process.pid}`
    const dist = `${DIST_DIR}/builds/${stamp}`
    const folder = join(ROOT, dist)
    const tsconfig = join(ROOT, 'tsconfig.json')
    const tsBefore = existsSync(tsconfig) ? readFileSync(tsconfig, 'utf8') : null
    const startedAt = new Date()
    const r = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
      cwd: ROOT, env: { ...env, NEXT_DIST_DIR: dist }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    })
    let out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`

    if (tsBefore !== null) {
      const tsAfter = readFileSync(tsconfig, 'utf8')
      const back = withoutAddedInclude(tsBefore, tsAfter, dist)
      if (back !== null) writeFileSync(tsconfig, back)
      else if (tsAfter !== tsBefore) out += `\n[simulate] tsconfig.json changed during the build in a way this run did not expect, so it was left as it is.\n`
    }
    writeFileSync(logFile, out)

    if (r.status !== 0) {
      rmSync(folder, { recursive: true, force: true })
      const tail = out.trim().split('\n').slice(-30).join('\n')
      throw new Error(`The build failed, and the last good build still stands (the whole log is in ${logFile}). Its last lines:\n${tail}`)
    }
    // The compiler's cache only speeds the next build, and on this machine
    // it is most of a gigabyte: the first full run filled the disk with it.
    // It is this build's own, and the compile that wrote it has finished.
    rmSync(join(folder, 'cache'), { recursive: true, force: true })
    const started = join(folder, STARTED_FILE)
    writeFileSync(started, startedAt.toISOString() + '\n')
    utimesSync(started, startedAt, startedAt)

    // Point at it in one rename, so a reader sees the old build or the new
    // one and never half of either.
    const next = `${CURRENT}.${process.pid}`
    writeFileSync(next, stamp + '\n')
    renameSync(next, CURRENT)
    prune(say)
    return stale
  } finally {
    release()
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
  })
}

export interface Running {
  base: string
  child: ChildProcess
  stop(): Promise<void>
}

export async function start(env: NodeJS.ProcessEnv, port: number, logFile: string, waitMs = 120_000): Promise<Running> {
  // The build current now, kept for this server's whole run: a build
  // another run finishes later is pointed at for the next server, never
  // swapped under this one.
  const dist = currentDist()
  if (!dist) throw new Error(`There is no simulation build in ${DIST_DIR} yet. Run without --build never, and the run builds one.`)
  const out = createWriteStream(logFile)
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    cwd: ROOT, env: { ...env, NEXT_DIST_DIR: dist }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.pipe(out)
  child.stderr!.pipe(out)
  const base = `http://localhost:${port}`

  const stop = async () => {
    // By its own pid, never by name: other people's servers run here too.
    if (child.exitCode !== null || child.signalCode !== null) return
    const gone = new Promise<void>((r) => child.once('exit', () => r()))
    child.kill('SIGTERM')
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 10_000)
    await gone
    clearTimeout(timer)
  }

  const until = Date.now() + waitMs
  while (Date.now() < until) {
    if (child.exitCode !== null) {
      const tail = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').slice(-20).join('\n') : ''
      throw new Error(`The app stopped before it was ready (log: ${logFile}).\n${tail}`)
    }
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5_000) })
      const j: any = await r.json().catch(() => null)
      const state = j?.data?.database?.state
      if (state === 'READY') return { base, child, stop }
      if (state && state !== 'READY') {
        await stop()
        throw new Error(`The app answered, but its database is ${state}: ${j?.data?.database?.says ?? ''}`)
      }
    } catch (e: any) {
      if (/database is/.test(String(e?.message))) throw e
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  await stop()
  throw new Error(`The app did not say READY on /api/health within ${waitMs / 1000}s (log: ${logFile}).`)
}
