/**
 * The facts lib/readiness judges, read off this deployment.
 *
 * Environment variables are named and never valued. Counts are counts.
 * A query that fails is a fact too — it means the database is not there
 * — so nothing here throws.
 */

import { prisma } from '@/lib/db'
import type { ReadinessFacts } from '@/lib/readiness'
import { staffAddresses } from '@/lib/alerts'
import { countTeamsLinks, TEAMS_WORKFLOWS_SENT_NOTE, type TeamsFacts } from '@/lib/notify/teams-link'

const DEMO_DOMAIN = '@demo.etyme.local'

export async function gatherFacts(): Promise<ReadinessFacts> {
  const env = {
    database: Boolean(process.env.DATABASE_URL),
    nextauthSecret: Boolean(process.env.NEXTAUTH_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    microsoft: Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    emailLink: Boolean(process.env.EMAIL_SERVER),
    emailSender: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  }

  const empty: ReadinessFacts = {
    env,
    db: { reachable: false, schemaCurrent: false, ms: null },
    realCompanies: 0,
    realSignIns: 0,
    imports: { total: 0, committed: 0 },
    email: { sent: 0, unsent: 0 },
    teams: { workflowsChannels: 0, retiredChannels: 0, postedByWorkflows: 0 },
    cron: { tracked: true, lastRunAt: null, lastBroke: 0 },
    watch: { staffConfigured: staffAddresses().length > 0, alertsSent: 0, incidentsToday: 0 },
    demo: { seeded: false, current: false },
  }

  if (!env.database) return empty

  const started = Date.now()
  try {
    await prisma.company.count()
  } catch {
    return empty
  }
  const ms = Date.now() - started

  // The newest column the code reads. If this fails the tables are
  // behind the code, and every screen on a thread will fail the same way.
  let schemaCurrent = true
  try {
    await prisma.conversation.findFirst({ select: { withCompanyId: true } })
    // The password door's columns (2026-10-08): sign-in reads them on every try.
    await prisma.person.findFirst({ select: { passwordHash: true, emailVerifiedAt: true } })
    await prisma.emailToken.findFirst({ select: { id: true } })
  } catch {
    schemaCurrent = false
  }

  const [
    realCompanies, realSignIns, importsTotal, importsCommitted,
    emailSent, emailUnsent, teams, nike, nikeHr,
    lastRun, runsTold, incidentsTold, incidentsToday,
  ] = await Promise.all([
    // Not a demo workspace, not one of the seeded world's firms.
    prisma.company.count({
      where: { isDemo: false, NOT: [{ slug: { startsWith: 'world-' } }, { slug: { startsWith: 'demo-' } }] },
    }),
    // A credential that has been used, by somebody with a real address.
    prisma.credential.count({
      where: { lastUsedAt: { not: null }, NOT: { email: { endsWith: DEMO_DOMAIN } } },
    }),
    prisma.import.count(),
    prisma.import.count({ where: { committedAt: { not: null } } }),
    prisma.notification.count({ where: { channel: 'EMAIL', deliveryState: 'SENT' } }),
    prisma.notification.count({ where: { channel: 'EMAIL', deliveryState: { in: ['PENDING', 'NOT_CONFIGURED'] } } }),
    teamsFacts(),
    prisma.company.findUnique({ where: { slug: 'world-nike' }, select: { id: true } }),
    // The HR desk is what the 2026-09-13 seed adds; an older world has none.
    prisma.person.findUnique({ where: { primaryEmail: `world-nike-hr${DEMO_DOMAIN}` }, select: { id: true } }),
    // The daily job's own diary, and whether anybody heard.
    prisma.jobRun.findFirst({ where: { job: 'daily' }, orderBy: { startedAt: 'desc' }, select: { startedAt: true, finishedAt: true, broke: true } }),
    prisma.jobRun.count({ where: { toldAt: { not: null } } }),
    prisma.incident.count({ where: { toldAt: { not: null } } }),
    prisma.incident.count({ where: { at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ])

  return {
    env,
    db: { reachable: true, schemaCurrent, ms },
    realCompanies,
    realSignIns,
    imports: { total: importsTotal, committed: importsCommitted },
    email: { sent: emailSent, unsent: emailUnsent },
    teams,
    cron: { tracked: true, lastRunAt: lastRun ? (lastRun.finishedAt ?? lastRun.startedAt) : null, lastBroke: lastRun?.broke ?? 0 },
    watch: { staffConfigured: staffAddresses().length > 0, alertsSent: runsTold + incidentsTold, incidentsToday },
    demo: { seeded: Boolean(nike), current: Boolean(nike && nikeHr) },
  }
}

/**
 * The Teams edge's facts, counted honestly (2026-10-03, conversation's
 * Workflows change). A saved link counts as a channel only where it is a
 * Workflows link; a retired connector link is counted apart so the page
 * can name it. A post counts as proof only where a Workflows link
 * accepted it — the note `TEAMS_WORKFLOWS_SENT_NOTE` — never an older
 * TEAMS row that may have gone to a connector Microsoft has since
 * switched off. Read by /ready and by /api/health alike.
 */
export async function teamsFacts(): Promise<TeamsFacts> {
  const [links, postedByWorkflows] = await Promise.all([
    prisma.company.findMany({ where: { teamsWebhookUrl: { not: null } }, select: { teamsWebhookUrl: true } }),
    prisma.notification.count({
      where: { channel: 'TEAMS', deliveryState: 'SENT', deliveryNote: TEAMS_WORKFLOWS_SENT_NOTE },
    }),
  ])
  return { ...countTeamsLinks(links.map((l) => l.teamsWebhookUrl)), postedByWorkflows }
}
