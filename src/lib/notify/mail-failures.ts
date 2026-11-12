/**
 * The email that did not go, for Etyme's own staff.
 *
 * Read only behind the staff check (the Superadmin screen's route, which
 * logs every read and every refusal). It crosses companies by design: a
 * sending domain nobody verified fails every company's mail at once, and
 * only Etyme can fix it. So it carries as little as answers "what broke":
 * when, the kind of notice, the company's name, the provider's status and
 * its own cleaned words, and the recipient as its first letter and domain.
 * Never the notice's title or body (a body may hold a kept one-time link),
 * never a person's name, never the full address.
 */
import { prisma } from '@/lib/db'
import { ACCOUNT_MAIL } from './account-mail'
import { failureFromNote, maskAddress, type MailFailureKind, type MailProvider } from './mail-failure'

export interface MailFailureRow {
  id: string
  at: Date
  /** "Invitation", "Account email" or the notice's type in words: "Timesheet notice". */
  kind: string
  companyName: string | null
  provider: MailProvider | null
  status: number | null
  failureKind: MailFailureKind
  /** The provider's own words, cleaned. Null where none were kept. */
  words: string | null
  /** "s…@etyme.com". */
  recipient: string | null
}

const INVITED = / invited you to /

/** The kind of notice, in words, from its type and title. Pure. */
export function noticeKindOf(type: string, title: string): string {
  if (type === 'SYSTEM' && INVITED.test(title)) return 'Invitation'
  if (type === ACCOUNT_MAIL) return 'Account email'
  const t = type.toLowerCase().replace(/_/g, ' ')
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} notice`
}

/** The newest email sends that failed, newest first, at most 200. */
export async function recentMailFailures(limit = 50): Promise<MailFailureRow[]> {
  const take = Math.max(1, Math.min(200, Math.floor(limit) || 50))
  const rows = await prisma.notification.findMany({
    where: { channel: 'EMAIL', deliveryState: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, createdAt: true, type: true, title: true, deliveryNote: true, companyId: true, personId: true },
  })
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => Boolean(x)))]
  const personIds = [...new Set(rows.map((r) => r.personId))]
  const [companies, people] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    personIds.length
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, primaryEmail: true } })
      : Promise.resolve([] as { id: string; primaryEmail: string | null }[]),
  ])
  const companyName = new Map(companies.map((c) => [c.id, c.name]))
  const address = new Map(people.map((p) => [p.id, p.primaryEmail]))
  return rows.map((r) => {
    const f = failureFromNote(r.deliveryNote)
    return {
      id: r.id,
      at: r.createdAt,
      kind: noticeKindOf(r.type, r.title),
      companyName: r.companyId ? companyName.get(r.companyId) ?? null : null,
      provider: f.provider,
      status: f.status,
      failureKind: f.kind,
      words: f.words,
      recipient: maskAddress(address.get(r.personId) ?? null),
    }
  })
}
