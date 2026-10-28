/**
 * Everything the setup checklist draws, in one read: the list, and each
 * item's body with its defaults filled and where every answer came from.
 *
 * Split from the route so the integration test reads the same answer the
 * screen does.
 */
import { prisma } from '@/lib/db'
import {
  ITEM_WORDS, itemsFor, sourceWords, savedStamp, bankWords, bankStanding, inviteRoleFor, DUTIES, DUTY_WORDS,
  type ItemKey, type AnswerSource, type Duty,
} from '@/lib/setup-checklist'
import { checklistOf, setupReminderFor } from '@/lib/setup-checklist-state'
import { fromWorkEmail } from '@/lib/setup-fill'
import { defaultRequiredSets, type Party } from '@/lib/document-stages/required-sets'
import { asksPayroll, noPayrollLine, countryName } from '@/lib/setup-steps'
import { skipStops as siteSkipStops, confirmAllWords } from '@/lib/site-rules'
import { verificationRecord } from '@/lib/domains-owned'
import { teamsLinkStanding } from '@/lib/notify/teams-link'

export async function readSetup(companyId: string, reader: { personId: string; email: string }) {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      id: true, name: true, kind: true, domain: true, domainVerified: true, country: true, currency: true, entityType: true, taxId: true,
      legalName: true, dba: true, establishedYear: true, website: true, logoUrl: true, phone: true,
      billingSameAsLegal: true, accountsEmail: true, teamsWebhookUrl: true,
    },
  })
  const [{ checklist, record, facts }, reminder, answers, addresses, sites, inCharge, seats, papers, remit, domains] = await Promise.all([
    checklistOf(companyId),
    setupReminderFor(companyId, { mayRun: true }),
    prisma.setupAnswer.findMany({ where: { companyId } }),
    prisma.companyAddress.findMany({ where: { companyId } }),
    prisma.companyLocation.findMany({
      where: { companyId }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, address: true, city: true, state: true, country: true, timeZone: true, isPrimary: true },
    }),
    prisma.companyInCharge.findMany({ where: { companyId } }),
    prisma.context.findMany({
      where: { companyId, type: 'EMPLOYEE', revokedAt: null },
      select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } } },
      orderBy: { grantedAt: 'asc' },
      take: 200,
    }),
    prisma.documentRequirement.findMany({
      where: { companyId, party: { not: null } },
      select: { party: true, documentTypeKey: true, required: true, waivedReason: true },
    }),
    prisma.remitTo.findFirst({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    prisma.companyDomain.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
  ])

  // Names for every "who": answers, items, the bank, the people in charge.
  const ids = new Set<string>()
  for (const a of answers) if (a.answeredById) ids.add(a.answeredById)
  for (const r of Object.values(record)) if (r?.byId) ids.add(r.byId)
  if (remit?.enteredById) ids.add(remit.enteredById)
  if (remit?.verifiedById) ids.add(remit.verifiedById)
  const people = ids.size ? await prisma.person.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }) : []
  const nameOf = (id: string | null | undefined) => (id ? people.find((p) => p.id === id)?.name ?? null : null)
  const checkedAt = remit?.verifiedByCompanyId
    ? await prisma.company.findUnique({ where: { id: remit.verifiedByCompanyId }, select: { name: true } })
    : null

  const domainFill = fromWorkEmail(reader.email)
  const sources: Record<string, string> = {}
  for (const a of answers) {
    sources[a.field] = sourceWords({ source: a.source as AnswerSource, quote: a.quote, by: nameOf(a.answeredById), at: a.answeredAt, paper: 'W-9' })
  }
  const primary = sites.find((s) => s.isPrimary) ?? sites[0] ?? null
  const legal = addresses.find((a) => a.kind === 'LEGAL') ?? null
  const billing = addresses.find((a) => a.kind === 'BILLING') ?? null
  const plain = (a: typeof legal) => a && { street: a.street ?? '', city: a.city ?? '', state: a.state ?? '', postalCode: a.postalCode ?? '', country: a.country }

  const confirmedParties = new Set(papers.map((p) => p.party as string))
  const sets = defaultRequiredSets(c.kind).map((set) => {
    const mine = papers.filter((p) => p.party === set.party)
    return {
      party: set.party as Party,
      says: set.says,
      confirmed: confirmedParties.has(set.party),
      items: set.items.map((i) => {
        const row = mine.find((m) => m.documentTypeKey === i.key)
        return {
          key: i.key, label: i.label, owedBy: i.owedBy, waivable: i.waivable, stage: i.stage,
          required: row ? row.required : i.required,
          waivedReason: row?.waivedReason ?? null,
        }
      }),
      // A type a company added beyond the shipped set, kept on the list.
      added: mine.filter((m) => !set.items.some((i) => i.key === m.documentTypeKey)).map((m) => m.documentTypeKey),
    }
  })

  const stamps: Partial<Record<ItemKey, string>> = {}
  for (const k of itemsFor(c.kind)) {
    const r = record[k]
    stamps[k] = r ? savedStamp(nameOf(r.byId), r.at) : savedStamp(null, null)
  }

  return {
    company: { id: c.id, name: c.name, kind: c.kind },
    checklist,
    reminder,
    words: Object.fromEntries(itemsFor(c.kind).map((k) => [k, ITEM_WORDS[k]])),
    stamps,
    detail: {
      COMPANY: {
        legalName: c.legalName ?? '',
        signedUpAs: c.name,
        dba: c.dba ?? '',
        entityType: c.entityType ?? '',
        establishedYear: c.establishedYear ? String(c.establishedYear) : '',
        website: c.website ?? '',
        phone: c.phone ?? '',
        taxId: c.taxId ?? '',
        currency: c.currency,
        country: c.country ?? 'US',
        countryName: countryName(c.country ?? 'US'),
        timeZone: primary?.timeZone ?? '',
        domainFill,
        sources,
      },
      ADDRESSES: {
        legal: plain(legal) ?? { street: '', city: '', state: primary?.state ?? '', postalCode: '', country: c.country ?? 'US' },
        billing: plain(billing) ?? { street: '', city: '', state: '', postalCode: '', country: c.country ?? 'US' },
        billingSameAsLegal: c.billingSameAsLegal,
        sites: sites.map((s) => ({ id: s.id, name: s.name, place: [s.city, s.state, s.country].filter(Boolean).join(', '), isPrimary: s.isPrimary })),
        sources,
      },
      SITES: {
        count: sites.length,
        primary: primary?.name ?? null,
        names: sites.slice(0, 12).map((s) => s.name),
        confirmSays: confirmAllWords(sites.length),
        skipSays: siteSkipStops(primary?.name ?? null),
      },
      PEOPLE_IN_CHARGE: {
        duties: (DUTIES as readonly Duty[]).map((duty) => {
          const row = inCharge.find((r) => r.duty === duty)
          const owner = duty === 'OWNER' && !row ? seats[0] : null
          return {
            duty,
            label: DUTY_WORDS[duty],
            personId: row?.personId ?? owner?.personId ?? '',
            name: row?.name ?? '',
            email: row?.email ?? '',
            invitedAt: row?.invitedAt?.toISOString() ?? null,
            inviteRole: inviteRoleFor(duty, c.kind),
          }
        }),
        seats: seats.map((s) => ({ personId: s.personId, name: s.person.name, role: s.role?.name ?? null })),
        accountsEmail: c.accountsEmail ?? (domainFill ? `accounts@${domainFill.domain}` : ''),
        accountsEmailGuessed: !c.accountsEmail && !!domainFill,
      },
      HOW_YOU_WORK: { asksPayroll: asksPayroll(c.kind), noPayrollLine: noPayrollLine(c.kind) },
      PAPERS: { sets },
      BANK: remit
        ? {
            bankName: remit.bankName ?? '',
            accountName: remit.accountName ?? remit.legalName,
            last4: remit.accountLast4 ?? '',
            routingLast4: remit.routingLast4 ?? '',
            shows: bankWords({ bankName: remit.bankName, accountName: remit.accountName ?? remit.legalName, last4: remit.accountLast4 }),
            standing: bankStanding({ verifiedAt: remit.verifiedAt, verifiedBy: nameOf(remit.verifiedById), verifiedAtFirm: checkedAt?.name ?? null }),
            enteredBy: nameOf(remit.enteredById),
          }
        : { bankName: '', accountName: c.legalName ?? c.name, last4: '', routingLast4: '', shows: null, standing: bankStanding({ verifiedAt: null }), enteredBy: null },
      COMPANIES: { count: facts.counterparties, href: c.kind === 'CLIENT' ? '/dashboard/suppliers' : '/dashboard/companies' },
      TEAM: { seats: seats.length },
      DOMAIN: {
        suggested: domainFill?.domain ?? (c.domain && !/\.(example|invalid|local|test)$/.test(c.domain) ? c.domain : ''),
        claims: [
          ...(c.domain && !domains.some((d) => d.domain === c.domain) ? [{ id: null as string | null, domain: c.domain, verified: c.domainVerified, record: null }] : []),
          ...domains.map((d) => ({
            id: d.id as string | null,
            domain: d.domain,
            verified: !!d.verifiedAt,
            record: !d.verifiedAt && d.proofToken ? verificationRecord(d.domain, d.proofToken) : null,
          })),
        ],
      },
      INTEGRATIONS: { teams: teamsLinkStanding(c.teamsWebhookUrl) },
    },
  }
}
