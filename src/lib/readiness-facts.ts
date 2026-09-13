/**
 * The facts lib/readiness judges, read off this deployment.
 *
 * Environment variables are named and never valued. Counts are counts.
 * A query that fails is a fact too — it means the database is not there
 * — so nothing here throws.
 */

import { prisma } from '@/lib/db'
import type { ReadinessFacts } from '@/lib/readiness'

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
    teams: { channels: 0, sent: 0 },
    // The daily job writes nothing down when it runs. Until it does, this
    // is the honest answer, and lib/readiness says so.
    cron: { tracked: false, lastRunAt: null },
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
  } catch {
    schemaCurrent = false
  }

  const [
    realCompanies, realSignIns, importsTotal, importsCommitted,
    emailSent, emailUnsent, teamsChannels, teamsSent, nike, nikeHr,
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
    prisma.company.count({ where: { teamsWebhookUrl: { not: null } } }),
    prisma.notification.count({ where: { channel: 'TEAMS', deliveryState: 'SENT' } }),
    prisma.company.findUnique({ where: { slug: 'world-nike' }, select: { id: true } }),
    // The HR desk is what the 2026-09-13 seed adds; an older world has none.
    prisma.person.findUnique({ where: { primaryEmail: `world-nike-hr${DEMO_DOMAIN}` }, select: { id: true } }),
  ])

  return {
    env,
    db: { reachable: true, schemaCurrent, ms },
    realCompanies,
    realSignIns,
    imports: { total: importsTotal, committed: importsCommitted },
    email: { sent: emailSent, unsent: emailUnsent },
    teams: { channels: teamsChannels, sent: teamsSent },
    cron: { tracked: false, lastRunAt: null },
    demo: { seeded: Boolean(nike), current: Boolean(nike && nikeHr) },
  }
}
