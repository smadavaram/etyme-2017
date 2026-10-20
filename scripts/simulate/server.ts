/**
 * The app under test: built once into its own folder, started on a free
 * port against the run's copy of the world, stopped by its own pid.
 *
 * `.next-sim`, not `.next`. Somebody's `next dev` writes `.next` while
 * they work, and a production build into the same folder corrupts both
 * (next.config.mjs reads NEXT_DIST_DIR for this). The build is reused
 * until a file under src/, the schema or the config is newer than it.
 *
 * The server never sends anything out: the email, model and Teams keys
 * are removed from its environment, so a run of two hundred placements
 * emails nobody and calls no model. What it would have sent is still
 * written on the record as it would be for a person.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
export const DIST_DIR = '.next-sim'
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
    NEXT_DIST_DIR: DIST_DIR,
    DATABASE_URL: e.databaseUrl,
    NEXTAUTH_SECRET: e.nextAuthSecret,
    NEXTAUTH_URL: `http://localhost:${e.port}`,
    CRON_SECRET: e.cronSecret,
    PRISMA_QUIET: '1',
    PORT: String(e.port),
  }
}

/**
 * When the build in `.next-sim` started, as a file's time. Not BUILD_ID's
 * own time, which is when the build finished: a file saved while the
 * build was compiling would be older than BUILD_ID and newer than what
 * the build read.
 */
const STARTED = join(ROOT, DIST_DIR, 'SIM_BUILD_STARTED')

/** What would make the existing build stale, or null where it is current. */
export function staleBecause(): string | null {
  const id = STARTED
  if (!existsSync(join(ROOT, DIST_DIR, 'BUILD_ID')) || !existsSync(id)) return `there is no simulation build in ${DIST_DIR} yet`
  const r = spawnSync('find', ['src', 'prisma/schema.prisma', 'next.config.mjs', 'package.json', '-newer', id, '-type', 'f', '-print', '-quit'], {
    cwd: ROOT, encoding: 'utf8',
  })
  const newer = r.stdout.trim()
  return newer ? `${newer} changed since the last build` : null
}

export function build(env: NodeJS.ProcessEnv, logFile: string): void {
  const startedAt = new Date()
  const r = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
    cwd: ROOT, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  })
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  writeFileSync(logFile, out)
  if (r.status !== 0) {
    const tail = out.trim().split('\n').slice(-30).join('\n')
    throw new Error(`The build failed (the whole log is in ${logFile}). Its last lines:\n${tail}`)
  }
  // The compiler's cache only speeds the next build, and on this machine
  // it is most of a gigabyte: the first full run filled the disk with it.
  rmSync(join(ROOT, DIST_DIR, 'cache'), { recursive: true, force: true })
  writeFileSync(STARTED, startedAt.toISOString() + '\n')
  utimesSync(STARTED, startedAt, startedAt)
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
  const out = createWriteStream(logFile)
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
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
