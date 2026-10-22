/**
 * Kept only what is used: the nightly deletion of forwarded email.
 *
 * An accepted email's subject, body and fields are deleted once its card
 * is decided, and after thirty days if nobody decides it. Attachments not
 * filed as evidence go with them; a filed one stays where it was filed.
 * The row itself stays, because "what came in and what was kept" is the
 * company's question to ask afterwards. A dropped message never kept a
 * body, so there is nothing of it to delete.
 *
 * Run by `cron/email-intake`, on the automation ladder at L5: a written
 * rule says the day has come, and a deleted body cannot be put back.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const UNDECIDED_DAYS = 30
const BATCH = 200

export interface SweepOutcome {
  /** Emails whose body went because their card was decided. */
  decided: number
  /** Emails whose body went because nobody decided them in thirty days. */
  undecided: number
  /** Unfiled attachments deleted with them. */
  attachments: number
}

/** Whether an accepted email's body is due to go, and why. Pure. */
export function dueForDeletion(row: { decidedAt: Date | null; receivedAt: Date; deletedAt: Date | null }, now: Date): 'DECIDED' | 'UNDECIDED' | null {
  if (row.deletedAt) return null
  if (row.decidedAt && row.decidedAt <= now) return 'DECIDED'
  if (now.getTime() - row.receivedAt.getTime() >= UNDECIDED_DAYS * 86_400_000) return 'UNDECIDED'
  return null
}

export async function sweepForwardedEmail(now: Date): Promise<SweepOutcome> {
  const out: SweepOutcome = { decided: 0, undecided: 0, attachments: 0 }
  const cutoff = new Date(now.getTime() - UNDECIDED_DAYS * 86_400_000)
  for (;;) {
    const rows = await prisma.inboundEmail.findMany({
      where: {
        verdict: 'ACCEPTED',
        deletedAt: null,
        OR: [{ decidedAt: { lte: now } }, { receivedAt: { lte: cutoff } }],
      },
      select: { id: true, companyId: true, decidedAt: true, receivedAt: true, deletedAt: true },
      orderBy: { receivedAt: 'asc' },
      take: BATCH,
    })
    if (rows.length === 0) break
    for (const r of rows) {
      const why = dueForDeletion(r, now)
      if (!why) continue
      await prisma.$transaction(async (tx) => {
        const gone = await tx.inboundEmailAttachment.deleteMany({ where: { inboundEmailId: r.id, filedAt: null } })
        await tx.inboundEmail.update({
          where: { id: r.id },
          // Fields hold numbers and a firm matched against the record; they go with the body.
          data: { subject: null, body: null, fields: Prisma.DbNull, deletedAt: now },
        })
        await tx.automationLog.create({
          data: {
            companyId: r.companyId,
            action: 'EMAIL_INTAKE_BODY_DELETED',
            summary: why === 'DECIDED'
              ? 'A forwarded email’s text was deleted because its card was decided.'
              : `A forwarded email’s text was deleted because nobody decided it in ${UNDECIDED_DAYS} days.`,
            reason: `Forwarded email is kept only until it is used: the text goes once its card is decided, and after ${UNDECIDED_DAYS} days if nobody decides it. Files not filed as evidence go with it.`,
            payload: { inboundEmailId: r.id, why, attachmentsDeleted: gone.count },
            // Deleted, and nothing puts it back.
            reversible: false,
          },
        })
        out.attachments += gone.count
      })
      if (why === 'DECIDED') out.decided++
      else out.undecided++
    }
    if (rows.length < BATCH) break
  }
  return out
}
