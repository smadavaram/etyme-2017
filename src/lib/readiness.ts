/**
 * Is this deployment ready for a real company?
 *
 * The founder, twice in one evening: "it is still not production ready."
 * He was right, and nothing in the building could say so. /api/health
 * answered "This deployment is working" on a site nobody outside could
 * sign in to; the delivery matrix said BUILT on all seventy-five rows.
 * Both measured the inside — tests green, database up — and the inside
 * has been fine for months.
 *
 * Ready is the edges. A real tenant signing in. A real file imported. An
 * email that left the building. A Teams channel that heard. A person
 * who was not us. None of these is proven by a test; each is proven only
 * by the outside world doing it once. So every edge here has three
 * states, and the middle one is the honest one:
 *
 *   MISSING  nothing is configured; it cannot happen
 *   SET      configured, and it has never happened
 *   PROVEN   it happened, on this deployment, at least once
 *
 * Ready means every edge PROVEN. Until then this says what is missing
 * and what to do about it, in a sentence, on a page anybody can open.
 *
 * Pure: facts in, verdict out. Gathering the facts is lib/readiness-facts.
 */

import { teamsEdge, type TeamsFacts } from '@/lib/notify/teams-link'

export type EdgeState = 'MISSING' | 'SET' | 'PROVEN' | 'OFF'

export interface Edge {
  key: string
  /** What a person would call it. */
  name: string
  state: EdgeState
  /** What is true, in a sentence. */
  says: string
  /** What to do about it, when there is something to do. */
  fix?: string
  /** Counts toward ready. Optional edges do not. */
  required: boolean
}

export interface ReadinessFacts {
  env: {
    database: boolean
    nextauthSecret: boolean
    cronSecret: boolean
    microsoft: boolean
    google: boolean
    emailLink: boolean
    /** RESEND_API_KEY and NOTIFY_FROM_EMAIL both present. */
    emailSender: boolean
    anthropic: boolean
  }
  db: {
    reachable: boolean
    /** The newest column the code reads is there. */
    schemaCurrent: boolean
    ms: number | null
  }
  /** Companies that are not seed and not a demo workspace. */
  realCompanies: number
  /** People who have signed in through Microsoft, Google, an email link or a password. */
  realSignIns: number
  imports: { total: number; committed: number }
  email: { sent: number; unsent: number }
  /** Workflows links saved, retired links still saved, and posts a Workflows link accepted. */
  teams: TeamsFacts
  cron: {
    tracked: boolean
    lastRunAt: Date | null
    /** How many jobs broke on the last run. */
    lastBroke: number
  }
  watch: {
    /** ETYME_STAFF_EMAILS names at least one address. */
    staffConfigured: boolean
    /** Heartbeats and failure alerts that actually reached staff. */
    alertsSent: number
    /** Failures recorded in the last day. */
    incidentsToday: number
  }
  demo: { seeded: boolean; current: boolean }
  /**
   * A privacy contact somebody owns: `contactEmail()` in lib/data-request,
   * ETYME_PRIVACY_EMAIL or else the first staff alert address.
   */
  privacyContact: boolean
}

export interface Readiness {
  ready: boolean
  proven: number
  required: number
  says: string
  edges: Edge[]
  at: string
}

const HOURS = 60 * 60 * 1000

export function assess(f: ReadinessFacts, now: Date = new Date()): Readiness {
  const edges: Edge[] = []

  // ── The database, and the schema the code was built against ─────────
  if (!f.env.database) {
    edges.push({
      key: 'database', name: 'Database', state: 'MISSING', required: true,
      says: 'No database is configured. Nothing works until there is one.',
      fix: 'Set DATABASE_URL on the deployment.',
    })
  } else if (!f.db.reachable) {
    edges.push({
      key: 'database', name: 'Database', state: 'SET', required: true,
      says: 'The database is configured and not answering.',
      fix: 'Check that the database is awake and DATABASE_URL still points at it.',
    })
  } else if (!f.db.schemaCurrent) {
    edges.push({
      key: 'database', name: 'Database', state: 'SET', required: true,
      says: 'The database answers, but its tables are older than the code. Screens that read the new columns will fail.',
      fix: 'Set DB_PUSH_ON_BUILD=1, redeploy, then unset it.',
    })
  } else {
    edges.push({
      key: 'database', name: 'Database', state: 'PROVEN', required: true,
      says: `Reachable, and the tables match the code${f.db.ms != null ? ` (${f.db.ms} ms)` : ''}.`,
    })
  }

  // ── Somebody outside can sign in ─────────────────────────────────────
  //
  // The password door (2026-10-08) has no key of its own; it needs only a
  // way to send the email that confirms an address. Without a sender it is
  // off, and the row says so rather than listing a door nobody can use.
  const passwordOn = f.env.emailSender
  const passwordOff = passwordOn
    ? ''
    : ' The password door cannot confirm emails without an email sender, so it is off.'
  const passwordFix = passwordOn ? '' : ' Set RESEND_API_KEY and NOTIFY_FROM_EMAIL to turn on sign-up with a password.'
  const providers = [
    f.env.microsoft && 'Microsoft', f.env.google && 'Google', f.env.emailLink && 'an email link', passwordOn && 'password',
  ].filter(Boolean) as string[]
  if (!f.env.nextauthSecret) {
    edges.push({
      key: 'signin', name: 'Sign-in', state: 'MISSING', required: true,
      says: 'Sessions cannot be issued: there is no signing secret.',
      fix: 'Set NEXTAUTH_SECRET on the deployment.',
    })
  } else if (providers.length === 0) {
    edges.push({
      key: 'signin', name: 'Sign-in', state: 'MISSING', required: true,
      says: 'Nobody outside can sign in. The only way in is the demo button.' + passwordOff,
      fix:
        'Register Etyme as an app in Microsoft Entra (any tenant) and set AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET; ' +
        'do the same in Google Cloud for GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Candidates need EMAIL_SERVER for the magic link.' +
        passwordFix,
    })
  } else if (f.realSignIns === 0) {
    edges.push({
      key: 'signin', name: 'Sign-in', state: 'SET', required: true,
      says: `Sign-in with ${list(providers)} is configured. Nobody has used it yet.` + passwordOff,
      fix: 'Sign in yourself with a company account. If the provider refuses, the redirect URL on the app registration does not match this deployment.' + passwordFix,
    })
  } else {
    edges.push({
      key: 'signin', name: 'Sign-in', state: 'PROVEN', required: true,
      says: `${count(f.realSignIns, 'person has', 'people have')} signed in through ${list(providers)}.` + passwordOff,
      ...(passwordFix ? { fix: passwordFix.trim() } : {}),
    })
  }

  // ── A company that is not us ─────────────────────────────────────────
  edges.push(
    f.realCompanies === 0
      ? {
          key: 'company', name: 'A real company', state: 'MISSING', required: true,
          says: 'Every company here is seed. Nobody is using this for real work.',
          fix: 'Have one client and one of its suppliers sign in with their own accounts. Their company is created from their email domain.',
        }
      : {
          key: 'company', name: 'A real company', state: 'PROVEN', required: true,
          says: `${count(f.realCompanies, 'company', 'companies')} here ${f.realCompanies === 1 ? 'is' : 'are'} real, not seed.`,
        }
  )

  // ── Their data ───────────────────────────────────────────────────────
  edges.push(
    f.imports.total === 0
      ? {
          key: 'import', name: 'Their data', state: 'MISSING', required: true,
          says: 'No file has ever been imported. A system of record with none of the client’s records is a demo.',
          fix: 'Bring one client’s supplier list and contractor list through Data → Import. The first real spreadsheet will find what the seed did not.',
        }
      : f.imports.committed === 0
        ? {
            key: 'import', name: 'Their data', state: 'SET', required: true,
            says: `${count(f.imports.total, 'file was', 'files were')} uploaded and none committed.`,
            fix: 'Open Data → Import, read the issues on the rows, and commit.',
          }
        : {
            key: 'import', name: 'Their data', state: 'PROVEN', required: true,
            says: `${count(f.imports.committed, 'import has', 'imports have')} been committed.`,
          }
  )

  // ── Email leaves the building ────────────────────────────────────────
  edges.push(
    !f.env.emailSender
      ? {
          key: 'email', name: 'Email', state: 'MISSING', required: true,
          says: `Nothing is sent. ${f.email.unsent > 0 ? `${f.email.unsent} messages are waiting with nowhere to go.` : 'Candidates and invitees hear nothing.'}`,
          fix: 'Set RESEND_API_KEY and NOTIFY_FROM_EMAIL on the deployment, from a domain you own.',
        }
      : f.email.sent === 0
        ? {
            key: 'email', name: 'Email', state: 'SET', required: true,
            says: 'A sender is configured. No email has left this deployment yet.',
            fix: 'Invite yourself to a company from Access → Invite and read the email that arrives.',
          }
        : {
            key: 'email', name: 'Email', state: 'PROVEN', required: true,
            says: `${count(f.email.sent, 'email has', 'emails have')} been sent.`,
          }
  )

  // ── Teams hears ──────────────────────────────────────────────────────
  //
  // Set up only once a company has a Workflows link, proven only once one
  // has posted; a retired connector link counts for neither and is named.
  // The sentence is conversation's (`teamsEdge` in lib/notify/teams-link).
  {
    const t = teamsEdge(f.teams)
    edges.push({ key: 'teams', name: 'Teams', state: t.state, required: true, says: t.says, ...(t.fix ? { fix: t.fix } : {}) })
  }

  // ── The daily job runs, and leaves a trace ───────────────────────────
  if (!f.env.cronSecret) {
    edges.push({
      key: 'cron', name: 'The daily job', state: 'MISSING', required: true,
      says: 'The daily job cannot run: it has no secret to answer to.',
      fix: 'Set CRON_SECRET on the deployment.',
    })
  } else if (!f.cron.tracked) {
    edges.push({
      key: 'cron', name: 'The daily job', state: 'SET', required: true,
      says: 'The daily job is scheduled and leaves no record of running, so nobody can tell whether it did.',
      fix: 'Record each run in the automation log. Until then, check the Vercel cron log by hand.',
    })
  } else if (!f.cron.lastRunAt || now.getTime() - f.cron.lastRunAt.getTime() > 36 * HOURS) {
    edges.push({
      key: 'cron', name: 'The daily job', state: 'SET', required: true,
      says: f.cron.lastRunAt
        ? `The daily job last ran ${daysAgo(f.cron.lastRunAt, now)}. It should run every morning.`
        : 'The daily job has never run here. It is scheduled for 06:00 UTC.',
      fix: 'Wait for the morning, or run it now: GET /api/cron/daily with the CRON_SECRET.',
    })
  } else if (f.cron.lastBroke > 0) {
    edges.push({
      key: 'cron', name: 'The daily job', state: 'SET', required: true,
      says: `The daily job ran ${daysAgo(f.cron.lastRunAt, now)} and ${count(f.cron.lastBroke, 'job', 'jobs')} failed.`,
      fix: 'The run’s record names the job and why. Staff were emailed the same.',
    })
  } else {
    edges.push({
      key: 'cron', name: 'The daily job', state: 'PROVEN', required: true,
      says: `The daily job last ran ${daysAgo(f.cron.lastRunAt, now)}, every job clean.`,
    })
  }

  // ── Somebody is told when it breaks ──────────────────────────────────
  // Failures are written down (lib/alerts) and staff are emailed, once
  // an hour per place; the daily job sends a heartbeat so the channel is
  // proven on a day nothing broke. Proven means a mail actually reached
  // somebody.
  const today = f.watch.incidentsToday
  const recorded = today === 0 ? 'No failure recorded in the last day.' : `${count(today, 'failure', 'failures')} recorded in the last day.`
  if (!f.watch.staffConfigured) {
    edges.push({
      key: 'watch', name: 'Somebody is told when it breaks', state: 'MISSING', required: true,
      says: `Failures are written down and nobody is told. ${recorded}`,
      fix: 'Set ETYME_STAFF_EMAILS to the addresses that should hear, comma-separated.',
    })
  } else if (!f.env.emailSender) {
    edges.push({
      key: 'watch', name: 'Somebody is told when it breaks', state: 'MISSING', required: true,
      says: `Staff are named and there is no way to reach them: no email sender. ${recorded}`,
      fix: 'Set RESEND_API_KEY and NOTIFY_FROM_EMAIL.',
    })
  } else if (f.watch.alertsSent === 0) {
    edges.push({
      key: 'watch', name: 'Somebody is told when it breaks', state: 'SET', required: true,
      says: `Staff are named and reachable. No heartbeat or alert has gone out yet. ${recorded}`,
      fix: 'The daily job sends a heartbeat when it runs; run it once, or wait for the morning.',
    })
  } else {
    edges.push({
      key: 'watch', name: 'Somebody is told when it breaks', state: 'PROVEN', required: true,
      says: `${count(f.watch.alertsSent, 'message has', 'messages have')} reached staff. ${recorded}`,
    })
  }

  // ── Who a person asks about their data ───────────────────────────────
  // Your data, and every data-rights letter, name a privacy contact. With
  // none they say that nobody is named yet, which is honest and is not a
  // contact. Not required for the edges to be proven, because nobody
  // outside proves an address by writing to it on cue; it is still a gap,
  // and it reads as missing until somebody owns the address.
  edges.push(f.privacyContact
    ? { key: 'privacy', name: 'Privacy contact', state: 'SET', required: false, says: 'An address is named for questions about personal data.' }
    : {
        key: 'privacy', name: 'Privacy contact', state: 'MISSING', required: false,
        says: 'Nobody is named for questions about personal data. Your data and the data-rights letters say so.',
        fix: 'Set ETYME_PRIVACY_EMAIL to an address somebody reads, or set ETYME_STAFF_EMAILS.',
      })

  // ── Optional: the one model call ─────────────────────────────────────
  edges.push(
    f.env.anthropic
      ? { key: 'model', name: 'CV evidence check', state: 'SET', required: false, says: 'On.' }
      : {
          key: 'model', name: 'CV evidence check', state: 'OFF', required: false,
          says: 'Off. The CV evidence check reports itself as unverified; every other check is arithmetic and runs anyway.',
          fix: 'Optional. Set ANTHROPIC_API_KEY to turn it on.',
        }
  )

  // ── Optional: the demo world ─────────────────────────────────────────
  edges.push(
    !f.demo.seeded
      ? {
          key: 'demo', name: 'Demo world', state: 'OFF', required: false,
          says: 'Not seeded. The demo button has nowhere to go.',
          fix: 'POST /api/seed-world with the CRON_SECRET.',
        }
      : !f.demo.current
        ? {
            key: 'demo', name: 'Demo world', state: 'SET', required: false,
            says: 'Seeded by an older build. Northbend Athletic has no HR or Procurement desk, so the approval chain has nobody to route to.',
            fix: 'POST /api/seed-world again with the CRON_SECRET. It renames and adds; it never duplicates.',
          }
        : { key: 'demo', name: 'Demo world', state: 'PROVEN', required: false, says: 'Seeded and current.' }
  )

  const required = edges.filter((e) => e.required)
  const proven = required.filter((e) => e.state === 'PROVEN').length
  const missing = required.filter((e) => e.state === 'MISSING').length
  const set = required.filter((e) => e.state === 'SET').length
  const ready = proven === required.length

  return {
    ready,
    proven,
    required: required.length,
    says: ready
      ? 'Ready. Every edge has been used by the outside world at least once.'
      : `Not production ready. ${proven} of ${required.length} edges proven` +
        `${set ? `, ${set} configured but never used` : ''}` +
        `${missing ? `, ${missing} missing` : ''}.`,
    edges,
    at: now.toISOString(),
  }
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function daysAgo(then: Date, now: Date): string {
  const h = Math.round((now.getTime() - then.getTime()) / HOURS)
  if (h < 1) return 'within the hour'
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
