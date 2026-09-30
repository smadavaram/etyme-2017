/**
 * A visitor's demo sandbox is removed after thirty days nobody used it,
 * and a visitor who left an address is told a week before.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Decided by the founder, 2026-09-30 (CLAUDE.md, "Demo housekeeping").
 * The demo door builds a sandbox per visitor — a vendor or a whole chain
 * of firms under `demo-<handle>` — and the reaper that should have
 * cleared them deleted on a fixed fourteen days from creation, used or
 * not, wrote nothing down, and on production had left sandboxes behind
 * that went on tying the demo world down.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * - **Only a visitor's own sandbox.** A company counts when it carries
 *   the demo flag, its slug is `demo-…` as the door writes it, it is not
 *   one of the seeded world's, and `lib/seed-owners` reads it as a
 *   visitor's sandbox — which a verified, registrable domain never is.
 *   Anything else is refused, whatever its flag says.
 * - **Unused is measured from the last time anybody used it**: the
 *   latest seat use in any of its companies (`Context.lastUsedAt`, which
 *   every signed-in request stamps, so a write counts as a use), or the
 *   day it was made. A chain's firms are one sandbox and go together.
 * - **Day 23: warned, once.** Each person seated in it at an address
 *   that can receive mail is told the day it goes and that opening it
 *   keeps it. A warning is not repeated until the sandbox is used again.
 * - **Day 30: removed.** Its companies are deleted, with everything that
 *   hangs off them, and one automation row says which, why and when it
 *   was last used — not reversible, because nothing puts it back.
 *
 * The date a visitor is shown (`demoExpiresAt`) is kept at the day this
 * rule would remove it, so the page and the job say one date.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { WORLD_SLUGS } from '@/lib/seed-world'
import { describeCompanies } from '@/lib/seed-owners'
import { reservedAddress } from '@/lib/demo-session'
import { send } from '@/lib/messages'

export const SANDBOX_UNUSED_DAYS = 30
export const SANDBOX_WARN_DAYS = 23

const DAY = 86_400_000

/** `demo-84d952625583-msp` → `84d952625583`; null for anything the demo door did not name. */
export function sandboxHandle(slug: string): string | null {
  const m = /^demo-([a-z0-9]+)(?:-[a-z0-9-]+)?$/.exec(slug)
  return m ? m[1] : null
}

export type SandboxAct = 'KEEP' | 'WARN' | 'REMOVE'

/** What the daily job does with one sandbox. Pure. */
export function sandboxVerdict(i: { lastUsedAt: Date; warnedAt: Date | null; now: Date }): {
  act: SandboxAct
  removeOn: Date
  unusedDays: number
} {
  const removeOn = new Date(i.lastUsedAt.getTime() + SANDBOX_UNUSED_DAYS * DAY)
  const unusedDays = Math.floor((i.now.getTime() - i.lastUsedAt.getTime()) / DAY)
  if (unusedDays >= SANDBOX_UNUSED_DAYS) return { act: 'REMOVE', removeOn, unusedDays }
  const warnedSinceUse = i.warnedAt != null && i.warnedAt.getTime() >= i.lastUsedAt.getTime()
  if (unusedDays >= SANDBOX_WARN_DAYS && !warnedSinceUse) return { act: 'WARN', removeOn, unusedDays }
  return { act: 'KEEP', removeOn, unusedDays }
}

const plainDay = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** What a visitor who left an address is told. */
export function warningText(i: { name: string; removeOn: Date }): { subject: string; body: string } {
  return {
    subject: `Your Etyme demo sandbox is removed on ${plainDay(i.removeOn)}`,
    body:
      `Your demo sandbox, ${i.name}, has not been opened for ${SANDBOX_WARN_DAYS} days.\n\n` +
      `It is removed on ${plainDay(i.removeOn)}, with everything in it.\n\n` +
      'Open it before then to keep it. Each time you open it, the thirty days start again.',
  }
}

export interface ExpiryOutcome {
  kept: number
  warned: number
  removed: number
  /** Sandboxes a removal failed for, in words. Nothing of theirs was changed. */
  failed: string[]
  says: string
}

/**
 * How the job writes its two rows. The daily route passes it, so the
 * actions a scheduled job writes are named in that job's own file, which
 * is where the autonomy ladder reads them (`__tests__/invariants/autonomy`).
 */
export interface ExpiryLog {
  removed: (tx: Prisma.TransactionClient, row: Omit<Prisma.AutomationLogUncheckedCreateInput, 'action'>) => Promise<unknown>
  warned: (row: Omit<Prisma.AutomationLogUncheckedCreateInput, 'action'>) => Promise<unknown>
}

/** The daily pass. Touches nothing but visitors' own sandboxes. */
export async function expireSandboxes(log: ExpiryLog, now: Date = new Date()): Promise<ExpiryOutcome> {
  const world = new Set(WORLD_SLUGS)
  const candidates = (await prisma.company.findMany({
    where: { isDemo: true, slug: { startsWith: 'demo-' } },
    select: { id: true, slug: true, name: true, createdAt: true, demoExpiresAt: true },
  })).filter((c) => !world.has(c.slug) && sandboxHandle(c.slug))
  if (!candidates.length) return { kept: 0, warned: 0, removed: 0, failed: [], says: 'No visitor sandbox is on the record.' }

  // Refuse anything the owner words do not read as a visitor's sandbox.
  const words = await describeCompanies(prisma, candidates.map((c) => c.id), new Set())
  const sandboxes = candidates.filter((c) => words.get(c.id)?.standing === 'VISITOR_SANDBOX')

  const groups = new Map<string, typeof sandboxes>()
  for (const c of sandboxes) {
    const h = sandboxHandle(c.slug)!
    groups.set(h, [...(groups.get(h) ?? []), c])
  }
  const ids = sandboxes.map((c) => c.id)
  const [used, warnings, seats] = await Promise.all([
    prisma.context.groupBy({ by: ['companyId'], where: { companyId: { in: ids } }, _max: { lastUsedAt: true } }),
    prisma.automationLog.findMany({
      where: { action: 'DEMO_SANDBOX_EXPIRY_WARNED', companyId: { in: ids } },
      select: { companyId: true, at: true },
    }),
    prisma.context.findMany({
      where: { companyId: { in: ids }, revokedAt: null },
      select: { companyId: true, person: { select: { id: true, primaryEmail: true } } },
    }),
  ])
  const lastUse = new Map(used.map((u) => [u.companyId, u._max.lastUsedAt]))
  const warnedAt = new Map<string, Date>()
  for (const w of warnings) {
    if (!w.companyId) continue
    const had = warnedAt.get(w.companyId)
    if (!had || w.at > had) warnedAt.set(w.companyId, w.at)
  }

  let kept = 0, warned = 0, removed = 0
  const failed: string[] = []
  for (const [handle, firms] of groups) {
    const main = firms.find((f) => f.slug === `demo-${handle}`) ?? firms[0]
    const lastUsedAt = new Date(Math.max(
      ...firms.map((f) => f.createdAt.getTime()),
      ...firms.map((f) => lastUse.get(f.id)?.getTime() ?? 0),
    ))
    const warnedLast = firms.map((f) => warnedAt.get(f.id)).filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    const v = sandboxVerdict({ lastUsedAt, warnedAt: warnedLast, now })
    const firmIds = firms.map((f) => f.id)

    if (v.act === 'REMOVE') {
      try {
        await prisma.$transaction(async (tx) => {
          const n = await tx.company.deleteMany({ where: { id: { in: firmIds }, isDemo: true } })
          await log.removed(tx, {
              companyId: null,
              summary: `Removed the demo sandbox ${main.name} (${main.slug}): nobody had used it for ${v.unusedDays} days.`,
              reason:
                `A visitor’s demo sandbox is removed after ${SANDBOX_UNUSED_DAYS} days nobody used it ` +
                `(founder, 2026-09-30). It was last used on ${plainDay(lastUsedAt)}.`,
              payload: {
                handle, companies: firms.map((f) => ({ id: f.id, slug: f.slug, name: f.name })),
                deleted: n.count, lastUsedAt: lastUsedAt.toISOString(),
              } as unknown as Prisma.InputJsonValue,
              reversible: false,
          })
        })
        removed++
      } catch (err: any) {
        failed.push(`${main.name} (${main.slug}): ${String(err?.message ?? err).slice(0, 160)}`)
      }
      continue
    }

    // The date the visitor is shown is the date this rule removes it.
    const shown = firms.filter((f) => f.demoExpiresAt?.getTime() !== v.removeOn.getTime()).map((f) => f.id)
    if (shown.length) await prisma.company.updateMany({ where: { id: { in: shown } }, data: { demoExpiresAt: v.removeOn } })

    if (v.act === 'WARN') {
      const text = warningText({ name: main.name, removeOn: v.removeOn })
      const to = seats.filter((s) => firmIds.includes(s.companyId ?? '') && !reservedAddress(s.person.primaryEmail))
      for (const s of to) {
        await send({
          companyId: s.companyId!, personId: s.person.id, kind: 'LINK',
          to: s.person.primaryEmail, subject: text.subject, body: text.body,
        })
      }
      await log.warned({
          companyId: main.id,
          summary:
            `The demo sandbox ${main.name} is removed on ${plainDay(v.removeOn)}; ` +
            (to.length ? `${to.length} ${to.length === 1 ? 'person was' : 'people were'} told.` : 'nobody left an address to tell.'),
          reason: `Nobody has used it for ${v.unusedDays} days. It is removed after ${SANDBOX_UNUSED_DAYS}, and opening it keeps it.`,
          payload: { handle, removeOn: v.removeOn.toISOString(), told: to.map((s) => s.person.id) } as unknown as Prisma.InputJsonValue,
          // The message has left; nothing takes it back.
          reversible: false,
      })
      warned++
      continue
    }
    kept++
  }

  const says =
    `${removed} ${removed === 1 ? 'sandbox' : 'sandboxes'} removed, ${warned} warned, ${kept} kept.` +
    (failed.length ? ` ${failed.length} could not be removed and were left as they were.` : '')
  return { kept, warned, removed, failed, says }
}
