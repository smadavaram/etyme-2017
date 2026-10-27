import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import { findFirm } from '@/lib/company-create'
import { domainOfEmail, isConsumerDomain, isPlatformDomain } from '@/lib/company-domains'
import type { EarlierApplication, FirmRecord } from '@/lib/supplier-link'

/**
 * Who the firm on a link is, on the record, and what it sent other
 * clients — the reads behind `applyPrefill` in lib/supplier-link.
 *
 * ── Which firm ───────────────────────────────────────────────────────
 *
 * The firm the request already points at, else whatever `findFirm` in
 * lib/company-create answers for the contact's domain and the firm's
 * name — the one door every sign-up and approval asks.
 *
 * ── Signed in at the firm ────────────────────────────────────────────
 *
 * A person whose session is seated at that firm. The client's own desk
 * holds this link too, so anything the firm sent another client is read
 * for that person only (see lib/supplier-link).
 */

type Row = { id: string; companyId: string; name: string; domain: string | null; contactEmail: string | null; supplierCompanyId: string | null
  /** The client's world: a demo client's link finds only demo firms. */
  isDemo?: boolean }

/** The firm's domain as the link knows it, or null where it is nobody's. */
export function firmDomain(row: Pick<Row, 'domain' | 'contactEmail'>): string | null {
  const d = (row.contactEmail ? domainOfEmail(row.contactEmail) : null) ?? row.domain?.trim().toLowerCase() ?? null
  if (!d || isConsumerDomain(d) || isPlatformDomain(d)) return null
  return d
}

/** Whoever is signed in, lowercased, or null. Never throws: the page has no sign-in of its own. */
export async function sessionEmail(): Promise<string | null> {
  try {
    return (await getSessionEmail())?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/**
 * The firm on the link: the one the request points at; else a seated
 * firm on the contact's own domain; else, for a firm with no domain of
 * its own (a password sign-up), the firm the signed-in person sits at
 * where the link was sent to that person or names that firm.
 */
export async function firmOnRecord(row: Row, email: string | null): Promise<{ id: string; record: FirmRecord } | null> {
  const domain = firmDomain(row)
  const select = { id: true, name: true, domain: true } as const
  // The architect's one door for "is this firm on Etyme" (lib/company-create).
  const onEtyme = row.supplierCompanyId
    ? null
    : await findFirm({ emailDomain: domain, name: row.name, isDemo: row.isDemo ?? false })
  const firmId = row.supplierCompanyId ?? (onEtyme && onEtyme.id !== row.companyId ? onEtyme.id : null)
  let firm = firmId ? await prisma.company.findUnique({ where: { id: firmId }, select }) : null
  if (!firm && email) {
    firm = await prisma.company.findFirst({
      where: {
        id: { not: row.companyId },
        contexts: { some: { revokedAt: null, person: { primaryEmail: email } } },
        ...(row.contactEmail?.toLowerCase() === email ? {} : { name: { equals: row.name, mode: 'insensitive' as const } }),
      },
      select,
    })
  }
  if (!firm) return null
  const [site, remit] = await Promise.all([
    prisma.companyLocation.findFirst({
      where: { companyId: firm.id, isRemote: false },
      orderBy: [{ isPrimary: 'desc' }],
      select: { address: true, city: true, state: true },
    }),
    prisma.remitTo.findFirst({
      where: { companyId: firm.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { legalName: true, addressLines: true, bankName: true, accountLast4: true },
    }),
  ])
  const siteAddress = site ? [site.address, site.city, site.state].filter(Boolean).join(', ') : ''
  return {
    id: firm.id,
    record: {
      name: firm.name,
      legalName: remit?.legalName ?? null,
      address: remit?.addressLines?.length ? remit.addressLines.join(', ') : siteAddress || null,
      website: firm.domain ? `https://${firm.domain}` : null,
      bank: remit?.bankName && remit.accountLast4
        ? { bankName: remit.bankName, accountName: remit.legalName, last4: remit.accountLast4 }
        : null,
    },
  }
}

/** True where whoever is signed in holds a seat at this firm. Never throws. */
export async function signedInAt(firmId: string | null, email: string | null): Promise<boolean> {
  if (!firmId || !email) return false
  try {
    const seat = await prisma.context.findFirst({
      where: { companyId: firmId, revokedAt: null, person: { primaryEmail: email } },
      select: { id: true },
    })
    return !!seat
  } catch {
    return false
  }
}

/** What this firm sent other clients through their links. Read only for a person signed in at the firm. */
export async function earlierApplications(row: Row, firmId: string, email: string | null): Promise<EarlierApplication[]> {
  const domain = firmDomain(row)
  const others = await prisma.supplierRequest.findMany({
    where: {
      id: { not: row.id },
      companyId: { not: row.companyId },
      OR: [
        { supplierCompanyId: firmId },
        ...(domain ? [{ contactEmail: { endsWith: `@${domain}`, mode: 'insensitive' as const } }] : []),
        ...(email ? [{ contactEmail: { equals: email, mode: 'insensitive' as const } }] : []),
      ],
    },
    select: { id: true, application: true, company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const out: EarlierApplication[] = []
  for (const o of others) {
    const a = (o.application ?? null) as Record<string, any> | null
    if (!a?.submittedAt) continue
    out.push({
      requestId: o.id,
      clientName: o.company.name,
      at: String(a.submittedAt),
      docs: Array.isArray(a.docs)
        ? a.docs.filter((d: any) => typeof d?.key === 'string').map((d: any) => ({ key: d.key, fileName: String(d.fileName ?? ''), fileUrl: d.fileUrl ?? null, at: d.at ?? null }))
        : [],
      references: Array.isArray(a.references) ? a.references : [],
      bank: a.bank?.last4 ? a.bank : null,
    })
  }
  return out
}

/** The id of the paper behind a file address this codebase wrote (`/api/documents/<id>/file`). */
export function paperIdOf(fileUrl: string | null | undefined): string | null {
  const m = /^\/api\/documents\/([^/]+)\/file$/.exec(fileUrl ?? '')
  return m ? m[1] : null
}
