/**
 * The seeded world's setup checklists read what the seed already holds
 * (founder's "Build it" on the setup checklist, 2026-10-28).
 *
 * A seeded Today page must never nag about something the seed already
 * has. So, from the seed's own rows and nothing invented beyond a street:
 *
 *   - every firm on the roster: its legal address, from its own site, or,
 *     for a firm that bills and keeps none (Corvane's plant suppliers, a
 *     firm never on Etyme), from the site it is named at or the firm it
 *     bills; every firm that bills gets payment details where it has none,
 *     so every seeded bill still sends and every seeded payment pays;
 *     its paper sets confirmed per party as the shipped defaults, by its
 *     first seat on the day it was born; its payment details checked,
 *     because every seeded firm that bills was paid long before today;
 *     the legal name its payment details already print; its first seat as
 *     the owner in charge; its sites and its week recorded as set;
 *   - the four client programs (Northbend, Cavanaugh, Talvern, Corvane):
 *     the profile, the people in charge read from the seats that hold
 *     those jobs (the owner, HR, the AP clerk as the billing contact),
 *     the accounts email on their own domain, and Sites and How you work
 *     recorded done by the owner, so each reads every item done but
 *     Integrations, which no seeded client has set up.
 *
 * Tapin, Etyme's own tenant on production, is not seeded: it starts with
 * its checklist mostly to do, like any firm that just signed up.
 *
 * Bulk writes with duplicates skipped: a second seeding writes nothing.
 */

import { prisma as db } from '@/lib/db'
import { defaultRequiredSets } from '@/lib/document-stages/required-sets'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { CORVANE_SLUG } from '@/lib/seed-corvane'

interface Ctx { prefix: string; slugs: readonly string[] }

/** The street the seed gives a firm whose primary site has none. Fictional, like every seeded address. */
function streetFor(i: number): string {
  return `${100 + ((i * 37) % 800)} Commerce Drive`
}

export async function seedSetupChecklists(ctx: Ctx): Promise<{ addresses: number; papers: number; checked: number; clients: number; remits: number }> {
  const firms = await db.company.findMany({
    where: { slug: { in: [...ctx.slugs] } },
    select: {
      id: true, name: true, slug: true, kind: true, domain: true, country: true, createdAt: true,
      locations: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }], select: { address: true, city: true, state: true, country: true, isPrimary: true }, take: 1 },
      contexts: {
        where: { type: 'EMPLOYEE', revokedAt: null },
        orderBy: { grantedAt: 'asc' },
        select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } } },
      },
    },
    orderBy: { slug: 'asc' },
  })

  // ── Who bills: a firm with an agreement as the vendor, an order it
  //    received, a line it sells, or an invoice it sent somebody ────────
  const ids = firms.map((f) => f.id)
  const billers = new Set((await db.company.findMany({
    where: {
      id: { in: ids },
      OR: [
        { msasAsVendor: { some: {} } }, { ordersReceived: { some: {} } },
        { sellContractsOut: { some: {} } }, { billsIssued: { some: {} } },
      ],
    },
    select: { id: true },
  })).map((c) => c.id))

  // ── Where each firm is: its own site; else, for a firm that bills and
  //    keeps no site of its own (Corvane's plant suppliers, a firm never
  //    on Etyme), the site it is named at, then where the firm it bills is ─
  type Place = { address: string | null; city: string | null; state: string | null; country: string | null }
  const placeOf = new Map<string, Place>()
  for (const f of firms) if (f.locations[0]?.city) placeOf.set(f.id, f.locations[0])
  const homeless = [...billers].filter((id) => !placeOf.has(id))
  if (homeless.length) {
    const named = await db.siteSupplier.findMany({
      where: { supplierCompanyId: { in: homeless } },
      select: { supplierCompanyId: true, location: { select: { city: true, state: true, country: true } } },
      orderBy: { namedAt: 'asc' },
    })
    for (const n of named) if (!placeOf.has(n.supplierCompanyId) && n.location.city) placeOf.set(n.supplierCompanyId, { ...n.location, address: null })
    const stillHomeless = homeless.filter((id) => !placeOf.has(id))
    if (stillHomeless.length) {
      const payers = await db.vendorBill.findMany({
        where: { vendorCompanyId: { in: stillHomeless } },
        select: { vendorCompanyId: true, company: { select: { locations: { where: { isPrimary: true }, select: { city: true, state: true, country: true }, take: 1 } } } },
      })
      const clients = await db.masterAgreement.findMany({
        where: { vendorId: { in: stillHomeless } },
        select: { vendorId: true, client: { select: { locations: { where: { isPrimary: true }, select: { city: true, state: true, country: true }, take: 1 } } } },
      })
      for (const p of [...payers.map((x) => ({ id: x.vendorCompanyId, loc: x.company.locations[0] })), ...clients.map((x) => ({ id: x.vendorId, loc: x.client.locations[0] }))]) {
        if (!placeOf.has(p.id) && p.loc?.city) placeOf.set(p.id, { ...p.loc, address: null })
      }
    }
  }

  // ── Every firm: its legal address ──────────────────────────────────
  const addresses = await db.companyAddress.createMany({
    data: firms
      .filter((f) => placeOf.get(f.id)?.city)
      .map((f, i) => {
        const site = placeOf.get(f.id)!
        return {
          companyId: f.id, kind: 'LEGAL' as const,
          street: site.address ?? streetFor(i), city: site.city, state: site.state, country: site.country ?? f.country ?? 'US',
          recordedById: f.contexts[0]?.personId ?? null, recordedAt: f.createdAt,
        }
      }),
    skipDuplicates: true,
  })

  // ── Every firm that bills: payment details, where it has none ──────
  const haveRemit = new Set((await db.remitTo.findMany({ where: { companyId: { in: [...billers] } }, select: { companyId: true } })).map((r) => r.companyId))
  const remitsMade = await db.remitTo.createMany({
    data: firms.filter((f) => billers.has(f.id) && !haveRemit.has(f.id)).map((f) => {
      const site = placeOf.get(f.id)
      return {
        companyId: f.id, legalName: f.name, accountName: f.name, isDefault: true, paymentMethod: 'ACH',
        country: site?.country ?? f.country ?? 'US',
        addressLines: site?.city ? [[site.city, site.state].filter(Boolean).join(', ')] : [],
        bankName: 'Bellrock Bank', accountLast4: f.id.replace(/\D/g, '').slice(-4).padStart(4, '0'), routingLast4: '0021',
        enteredById: f.contexts[0]?.personId ?? null, enteredAt: f.createdAt,
      }
    }),
  })

  // ── Every firm: its paper sets, the shipped defaults, confirmed ────
  const papers = await confirmPaperSets(firms)

  // ── Every firm that bills: its payment details were checked ────────
  const checked = await db.remitTo.updateMany({
    where: { companyId: { in: firms.map((f) => f.id) }, verifiedAt: null },
    data: { verifiedAt: firms[0]?.createdAt ?? new Date() },
  })

  // ── Every firm: the legal name its payment details already carry, its
  //    owner in charge, and its sites and week as the seed set them ─────
  const remits = await db.remitTo.findMany({
    where: { companyId: { in: firms.map((f) => f.id) }, isDefault: true },
    select: { companyId: true, legalName: true },
  })
  for (const r of remits) {
    await db.company.updateMany({ where: { id: r.companyId, legalName: null }, data: { legalName: r.legalName } })
  }
  await db.companyInCharge.createMany({
    data: firms.filter((f) => f.contexts[0]).map((f) => ({
      companyId: f.id, duty: 'OWNER' as const, personId: f.contexts[0].personId, name: f.contexts[0].person.name,
      email: f.contexts[0].person.primaryEmail, recordedById: f.contexts[0].personId, recordedAt: f.createdAt,
    })),
    skipDuplicates: true,
  })
  await db.setupItem.createMany({
    data: firms.filter((f) => f.contexts[0]).flatMap((f) =>
      (f.kind === 'CONSULTANT_CORP' || !f.locations[0] ? (['HOW_YOU_WORK'] as const) : (['SITES', 'HOW_YOU_WORK'] as const)).map((item) => ({
        companyId: f.id, item, outcome: 'DONE' as const, answeredById: f.contexts[0].personId, answeredAt: f.createdAt,
      })),
    ),
    skipDuplicates: true,
  })

  // ── The four client programs ───────────────────────────────────────
  const clientSlugs = new Set([...PROGRAMMES.map((p) => ctx.prefix + p.client), ctx.prefix + CORVANE_SLUG])
  const clients = firms.filter((f) => clientSlugs.has(f.slug))
  const holder = (f: (typeof firms)[number], roles: string[]) => f.contexts.find((c) => c.role && roles.includes(c.role.name)) ?? null
  for (const f of clients) {
    const owner = holder(f, ['Owner']) ?? f.contexts[0] ?? null
    const domain = f.domain ?? `${f.slug}.example`
    await db.company.updateMany({
      where: { id: f.id, legalName: null },
      data: {
        legalName: `${f.name}, Inc.`, entityType: 'Corporation', establishedYear: 1998,
        website: `https://${domain}`, phone: '+1 555 010 0100', accountsEmail: `accounts@${domain}`,
      },
    })
    const inCharge = ([['OWNER', owner], ['HR', holder(f, ['HR Partner', 'HR'])], ['BILLING_CONTACT', holder(f, ['AP Clerk', 'Finance'])]] as const)
      .filter(([, c]) => c)
      .map(([duty, c]) => ({
        companyId: f.id, duty, personId: c!.personId, name: c!.person.name, email: c!.person.primaryEmail,
        recordedById: owner?.personId ?? null, recordedAt: f.createdAt,
      }))
    await db.companyInCharge.createMany({ data: inCharge, skipDuplicates: true })
    await db.setupItem.createMany({
      data: (['COMPANY', 'SITES', 'HOW_YOU_WORK'] as const).map((item) => ({
        companyId: f.id, item, outcome: 'DONE' as const, answeredById: owner?.personId ?? null, answeredAt: f.createdAt,
      })),
      skipDuplicates: true,
    })
  }

  return { addresses: addresses.count, papers: papers.count, checked: checked.count, clients: clients.length, remits: remitsMade.count }
}

/**
 * A seeded firm's paper sets, the shipped defaults, confirmed. Also called
 * by the doors step just before the seed's own nightly chase runs, so the
 * chase finds the sets of the firms it asks for already confirmed and
 * asks as it always did. Duplicates skipped: a second call writes nothing.
 */
export async function confirmPaperSets(firms: readonly { id: string; kind: string }[]): Promise<{ count: number }> {
  return db.documentRequirement.createMany({
    data: firms.flatMap((f) =>
      defaultRequiredSets(f.kind).flatMap((set) =>
        set.items.map((i) => ({
          companyId: f.id, party: set.party, documentTypeKey: i.key, required: i.required, owedBy: i.owedBy,
        })),
      ),
    ),
    skipDuplicates: true,
  })
}
