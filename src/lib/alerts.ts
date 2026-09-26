/**
 * Somebody is told when it breaks.
 *
 * Until this existed a failure went to console.error, which on Vercel is
 * a log nobody opens, and the daily job ran or did not with nothing
 * written down either way. The database and the dev server both died
 * during one evening's work and the first anybody knew was a test
 * failing. /ready said so, in red, and this is the row's fix.
 *
 * Three things, all of which refuse to make anything worse:
 *
 *   reportError   writes an Incident row and emails staff, at most once
 *                 an hour per place, and never throws — a reporter that
 *                 can crash the thing it reports on is a second bug
 *   tellStaff     one email to the addresses in ETYME_STAFF_EMAILS,
 *                 through whichever email sender is configured
 *   heartbeat     what the daily job sends when it finishes, so the
 *                 alert channel is proven to work on a day nothing broke
 *
 * Staff means us. Not a tenant role — no company's admin should be able
 * to grant themselves the platform's failure mail.
 */

import { prisma } from '@/lib/db'
import { emailSender } from '@/lib/senders'

const HOUR = 60 * 60 * 1000

/** Who hears. Comma-separated in ETYME_STAFF_EMAILS; empty means nobody. */
export function staffAddresses(): string[] {
  return (process.env.ETYME_STAFF_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export type Told = { sent: true; to: string[] } | { sent: false; reason: string }

/** One plain-text email to every staff address. Says why when it cannot. */
export async function tellStaff(subject: string, body: string): Promise<Told> {
  const to = staffAddresses()
  if (to.length === 0) return { sent: false, reason: 'No ETYME_STAFF_EMAILS is set, so there is nobody to tell.' }
  const sender = emailSender()
  if (!sender) return { sent: false, reason: 'No email sender is configured (RESEND_API_KEY and NOTIFY_FROM_EMAIL).' }
  try {
    for (const address of to) await sender.send(address, subject, body)
    return { sent: true, to }
  } catch (err: any) {
    return { sent: false, reason: `The email sender refused: ${String(err?.message ?? err).slice(0, 160)}` }
  }
}

/** A short line for a subject: where, and the first hundred characters of what. */
function subjectFor(where: string, message: string): string {
  const what = message.replace(/\s+/g, ' ').trim().slice(0, 100)
  return `Etyme: ${where} failed — ${what}`
}

export interface IncidentContext {
  side?: 'SERVER' | 'BROWSER'
  path?: string | null
  personId?: string | null
  companyId?: string | null
}

/**
 * Write it down and tell somebody. Fire-and-forget: callers write
 * `void reportError(...)` and carry on answering the request.
 *
 * Emails are held to one per `where` per hour, so a route that fails on
 * every request produces one message and a row per failure, not a
 * thousand messages. The Incident rows are the full record.
 */
export async function reportError(place: string, err?: unknown, ctx: IncidentContext = {}): Promise<void> {
  // Call sites were console.error labels — "Payroll run failed:" — and
  // a colon on the end of a subject line reads as a typo.
  const where = place.replace(/:\s*$/, "")
  const message = err instanceof Error ? err.message : err === undefined ? where : String(err)
  const stack = err instanceof Error ? (err.stack ?? null) : null

  // The log line stays. Vercel keeps it, and it is the only record when
  // the database itself is what failed.
  console.error(`[${where}]`, message)

  let row: { id: string } | null = null
  try {
    row = await prisma.incident.create({
      data: {
        side: ctx.side ?? 'SERVER',
        where,
        message: message.slice(0, 2000),
        stack: stack ? stack.slice(0, 8000) : null,
        path: ctx.path ?? null,
        personId: ctx.personId ?? null,
        companyId: ctx.companyId ?? null,
      },
      select: { id: true },
    })
  } catch {
    // The database is the thing that broke. The console line above is
    // all there is, and that is honest.
    return
  }

  try {
    const toldRecently = await prisma.incident.findFirst({
      where: { where, toldAt: { gte: new Date(Date.now() - HOUR) } },
      select: { id: true },
    })
    if (toldRecently) return

    const told = await tellStaff(
      subjectFor(where, message),
      [
        `Where: ${where}`,
        ctx.path ? `Path: ${ctx.path}` : null,
        `When: ${new Date().toISOString()}`,
        '',
        message,
        '',
        stack ? stack.slice(0, 3000) : '(no stack)',
        '',
        'Further failures in the same place within the hour are recorded and not mailed.',
      ]
        .filter((l) => l !== null)
        .join('\n')
    )
    if (told.sent) {
      await prisma.incident.update({ where: { id: row.id }, data: { toldAt: new Date() } })
    }
  } catch {
    // Telling is best-effort. The row exists.
  }
}

/**
 * The daily job, written down.
 *
 * `startRun` before the first job; `finishRun` after the last, with
 * what ran and what broke; then the heartbeat goes to staff whether or
 * not anything broke — a channel that only speaks on bad days is never
 * known to work until one.
 */
export async function startRun(job: string): Promise<string | null> {
  try {
    const row = await prisma.jobRun.create({ data: { job }, select: { id: true } })
    return row.id
  } catch {
    return null
  }
}

export interface RunOutcome {
  ran: { job: string; does: string; says: string | null; ms: number }[]
  broke: { job: string; does: string; why: string; ms: number }[]
  says: string
}

export async function finishRun(id: string | null, job: string, outcome: RunOutcome): Promise<Told> {
  const ok = outcome.broke.length === 0
  if (id) {
    try {
      await prisma.jobRun.update({
        where: { id },
        data: {
          finishedAt: new Date(),
          ok,
          ran: outcome.ran.length,
          broke: outcome.broke.length,
          results: { ran: outcome.ran, broke: outcome.broke } as object,
        },
      })
    } catch {
      // Recorded nothing; the heartbeat below still says what happened.
    }
  }

  const lines = [
    outcome.says,
    '',
    ...outcome.broke.map((b) => `✗ ${b.job} — ${b.does}: ${b.why}`),
    ...(outcome.broke.length ? [''] : []),
    ...outcome.ran.map((r) => `✓ ${r.job} — ${r.does}${r.says ? `: ${r.says}` : ''} (${r.ms} ms)`),
  ]
  const told = await tellStaff(
    ok ? `Etyme ${job}: all ${outcome.ran.length} jobs ran` : `Etyme ${job}: ${outcome.broke.length} of ${outcome.ran.length + outcome.broke.length} jobs failed`,
    lines.join('\n')
  )
  if (told.sent && id) {
    try {
      await prisma.jobRun.update({ where: { id }, data: { toldAt: new Date() } })
    } catch {
      // Nothing more to do.
    }
  }
  return told
}
