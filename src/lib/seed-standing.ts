/**
 * Standing: who a firm is, where it sits, and what it can prove.
 *
 * ── Why these rows and not others ────────────────────────────────────
 *
 * CLAUDE.md: *"In contracting and staffing these are not filing; they are
 * business continuity. A lapsed certificate stops a supplier working, an
 * expired work authorization stops a person working, and neither fails
 * loudly on its own."*
 *
 * The world seed proved a person clear and a supplier covered, and then
 * stopped. Nothing recorded the file behind a verification, which is the
 * I-9 problem exactly — a form on file with nothing behind it is not
 * held. Nothing recorded which edition of a form somebody signed, which
 * is the finding in an audit. No visa had ever been filed, so the whole
 * petition lifecycle had no row to walk. And no firm had an address, a
 * legal entity, a remit-to or a named contact, so an order had nowhere to
 * ship to and an invoice nowhere to be paid.
 *
 * Every row below is derived from something the world already contains:
 * the locations come off the placements, the legal entities off the firms
 * that employ, the signatures off agreements that already carried a
 * signed date, the petitions off the consultants whose profile already
 * said H-1B.
 *
 * ── What is deliberately NOT here ────────────────────────────────────
 *
 * The shipped document types. `lib/document-type` is explicit that a firm
 * which has changed nothing has no rows and still gets the whole list —
 * so seeding all twenty defaults as rows would contradict the design it
 * is meant to demonstrate. What is seeded is what a company actually
 * writes: the types it added that nobody shipped, and the editions of a
 * form it keeps track of.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { EVENT_FOR } from '@/lib/visa-petition'

export interface SeedContext {
  firmBySlug: Map<string, { id: string }>
  seatBySlug: Map<string, { personId: string; email: string }>
  domain: string
  prefix: string
}

export interface Standing {
  locations: number
  petitions: number
  backings: number
  documentTypes: number
  checks: number
}

/** "San Jose, CA" → { city, state }. Anything else stays whole. */
function splitPlace(loc: string): { city: string; state: string | null } {
  const bits = loc.split(',').map((s) => s.trim()).filter(Boolean)
  if (bits.length >= 2) return { city: bits[0], state: bits[1] }
  return { city: loc.trim(), state: null }
}

export async function seedStanding(ctx: SeedContext): Promise<Standing> {
  const out: Standing = { locations: 0, petitions: 0, backings: 0, documentTypes: 0, checks: 0 }

  const firms = await db.company.findMany({
    where: { slug: { startsWith: ctx.prefix } },
    select: { id: true, slug: true, name: true, kind: true, currency: true },
  })

  // ── 1. Where a firm actually sits ───────────────────────────────────
  //
  // Read off the work rather than typed in: a client's site is where its
  // own requisitions are, and a supplier's is where it has people. A firm
  // with neither gets nothing, because inventing an address for it would
  // be inventing the one fact on this row.
  for (const f of firms) {
    if (await db.companyLocation.findFirst({ where: { companyId: f.id, isPrimary: true } })) continue
    const own = await db.requirement.findFirst({
      where: { companyId: f.id, location: { not: null } },
      select: { location: true }, orderBy: { createdAt: 'asc' },
    })
    const placed = own
      ? null
      : await db.sellContract.findFirst({
          where: { companyId: f.id, requirement: { location: { not: null } } },
          select: { requirement: { select: { location: true } } },
          orderBy: { startDate: 'asc' },
        })
    const loc = own?.location ?? placed?.requirement?.location ?? null
    if (!loc) continue
    const { city, state } = splitPlace(loc)
    await db.companyLocation.create({
      data: {
        companyId: f.id,
        name: f.kind === 'CLIENT' ? `${city} site` : `${city} office`,
        city, state, country: 'US', isPrimary: true,
      },
    })
    out.locations++
  }

  // ── 2. The entity that signs, bills and employs ─────────────────────
  //
  // Payroll runs through a legal entity, not through a brand. Only for
  // the firms that employ somebody on a W2 leg — a firm that buys
  // everybody corp-to-corp has no payroll to run through one, and giving
  // it an entity anyway would be a row nothing produced.
  const employers = await db.buyContract.findMany({
    where: { contractType: 'W2', company: { slug: { startsWith: ctx.prefix } } },
    select: { id: true, companyId: true, entityId: true },
    orderBy: { id: 'asc' },
  })
  const entityOf = new Map<string, string>()
  for (const leg of employers) {
    let entityId = entityOf.get(leg.companyId) ?? null
    if (!entityId) {
      const firm = firms.find((f) => f.id === leg.companyId)
      if (!firm) continue
      const existing = await db.legalEntity.findFirst({
        where: { companyId: firm.id }, select: { id: true },
      })
      entityId =
        existing?.id ??
        (await db.legalEntity.create({
          data: { companyId: firm.id, name: `${firm.name} LLC`, country: 'US', currency: firm.currency ?? 'USD' },
          select: { id: true },
        })).id
      entityOf.set(leg.companyId, entityId)
    }
    if (!leg.entityId) {
      await db.buyContract.update({ where: { id: leg.id }, data: { entityId } })
    }
  }

  // ── 3. Where a supplier is actually paid ────────────────────────────
  //
  // The entity on the invoice, which is not always the trading name, and
  // four digits of the account — never the number itself, which is the
  // rule the supplier's own application link already follows.
  for (const f of firms) {
    if (f.kind === 'CLIENT') continue
    const bills = await db.sellContract.count({ where: { companyId: f.id } })
    if (bills === 0) continue
    if (await db.remitTo.findFirst({ where: { companyId: f.id } })) continue
    const site = await db.companyLocation.findFirst({
      where: { companyId: f.id, isPrimary: true },
      select: { city: true, state: true },
    })
    await db.remitTo.create({
      data: {
        companyId: f.id,
        legalName: `${f.name} LLC`,
        addressLines: site ? [`${site.city}${site.state ? `, ${site.state}` : ''}`] : [],
        country: 'US',
        paymentMethod: 'ACH',
        bankName: 'Bellrock Bank',
        accountLast4: f.id.replace(/\D/g, '').slice(-4).padStart(4, '0'),
        routingLast4: '0021',
        isDefault: true,
      },
    })
  }
  // Onto the invoices the firm issued, so a client's AP desk reads where
  // to send the money rather than having to ask.
  const remits = await db.remitTo.findMany({ where: { isDefault: true }, select: { id: true, companyId: true } })
  for (const r of remits) {
    const unmarked = await db.invoiceLine.findMany({
      where: { sellContract: { companyId: r.companyId }, invoice: { remitToId: null } },
      select: { invoiceId: true },
      distinct: ['invoiceId'],
    })
    for (const l of unmarked) {
      await db.invoice.update({ where: { id: l.invoiceId }, data: { remitToId: r.id } })
    }
  }

  // ── 4. Both signatures on an agreement ──────────────────────────────
  //
  // An MSA is not executed until both firms have signed and the date that
  // counts is the later of the two. Every agreement in this world carried
  // a `signedAt` and no signature behind it, which is an execution date
  // nobody can stand behind.
  //
  // Not on the three client programs, and that is a product choice rather
  // than a convenience. Those are the desks the founder walks, and their
  // agreements are the ones a program office is shown executing — an
  // agreement that arrives already countersigned is one nobody can be
  // shown countersigning. `__integration__/agreement-lifecycle.test.ts`
  // walks exactly that on one of them, from recording the term through
  // both signatures to tearing it up.
  const PROGRAM_CLIENTS = ['nike', 'corning', 'terumo-bct'].map((s) => ctx.prefix + s)
  const msas = await db.masterAgreement.findMany({
    where: {
      signedAt: { not: null },
      vendor: { slug: { startsWith: ctx.prefix } },
      client: { slug: { notIn: PROGRAM_CLIENTS } },
    },
    select: {
      id: true, signedAt: true,
      vendor: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' },
  })
  const ATTESTATION =
    'I have the executed copy of this agreement in front of me and the details above are what it says.'
  for (const m of msas) {
    for (const [party, firm, offsetDays] of [
      ['VENDOR', m.vendor, 0],
      // The counter-signature, two days later. The date that matters is
      // the later of the two, which is only a distinction worth making
      // where the two are actually different.
      ['CLIENT', m.client, 2],
    ] as const) {
      if (await db.agreementSignature.findFirst({ where: { agreementId: m.id, party } })) continue
      const seat = await db.context.findFirst({
        where: { companyId: firm.id, type: 'EMPLOYEE' },
        select: { person: { select: { id: true, name: true, primaryEmail: true } } },
        orderBy: { grantedAt: 'asc' },
      })
      if (!seat) continue
      await db.agreementSignature.create({
        data: {
          agreementId: m.id, party,
          signerName: seat.person.name,
          signerTitle: party === 'VENDOR' ? 'Managing Director' : 'VP, Procurement',
          signerEmail: seat.person.primaryEmail,
          signedAt: new Date(m.signedAt!.getTime() + offsetDays * 86_400_000),
          method: 'ELECTRONIC',
          attestedById: seat.person.id,
          attestedAt: new Date(m.signedAt!.getTime() + offsetDays * 86_400_000),
          attestation: ATTESTATION,
        },
      })
    }
  }

  // ── 5. Who to call, and about what ──────────────────────────────────
  //
  // Derived from the seats that already exist at the counterparty, and
  // linked to the real person by `personId` — so the rolodex entry and
  // the account are one record rather than two that drift.
  const counterparties = await db.counterparty.findMany({
    where: {
      company: { slug: { startsWith: ctx.prefix } },
      otherCompany: { slug: { startsWith: ctx.prefix } },
    },
    select: {
      companyId: true, otherCompanyId: true, relationship: true,
      otherCompany: { select: { kind: true } },
    },
    orderBy: { id: 'asc' },
  })
  for (const cp of counterparties) {
    const seat = await db.context.findFirst({
      where: { companyId: cp.otherCompanyId, type: 'EMPLOYEE' },
      select: { person: { select: { id: true, name: true, primaryEmail: true } }, role: { select: { name: true } } },
      orderBy: { grantedAt: 'asc' },
    })
    if (!seat) continue
    const existing = await db.companyContact.findFirst({
      where: { companyId: cp.companyId, atCompanyId: cp.otherCompanyId, email: seat.person.primaryEmail },
    })
    if (existing) continue
    const mine = await db.context.findFirst({
      where: { companyId: cp.companyId, type: 'EMPLOYEE' },
      select: { personId: true }, orderBy: { grantedAt: 'asc' },
    })
    await db.companyContact.create({
      data: {
        companyId: cp.companyId, atCompanyId: cp.otherCompanyId,
        name: seat.person.name, email: seat.person.primaryEmail,
        title: seat.role?.name ?? null,
        kind:
          cp.relationship === 'CLIENT'
            ? 'HIRING_MANAGER'
            : cp.relationship === 'SUPPLIER'
              ? 'DELIVERY'
              : cp.otherCompany.kind === 'MSP'
                ? 'PROCUREMENT'
                : 'OTHER',
        personId: seat.person.id,
        createdById: mine?.personId ?? null,
        createdAt: day(-200),
      },
    })
  }

  // ── 6. What a supplier will carry, and what it gives for early cash ─
  const topSuppliers = await db.sellContract.groupBy({
    by: ['companyId', 'clientCompanyId'],
    where: { state: 'IN_PROGRESS', company: { slug: { startsWith: ctx.prefix } } },
    _count: { _all: true },
    orderBy: { _count: { companyId: 'desc' } },
    take: 4,
  })
  for (const s of topSuppliers) {
    if (await db.customerCreditLimit.findFirst({
      where: { companyId: s.companyId, clientCompanyId: s.clientCompanyId },
    })) continue
    const seat = await db.context.findFirst({
      where: { companyId: s.companyId, type: 'EMPLOYEE' },
      select: { personId: true }, orderBy: { grantedAt: 'asc' },
    })
    await db.customerCreditLimit.create({
      data: {
        companyId: s.companyId, clientCompanyId: s.clientCompanyId,
        limitCents: 750_000_00, currency: 'USD',
        basis: 'Two years of payment history inside terms, and a D&B rating we have seen. Reviewed every six months.',
        reviewBy: day(120),
        setById: seat?.personId ?? null,
        setAt: day(-180),
      },
    })
  }
  // Two rungs on one agreement. Net zero is real and carries the best
  // rate precisely because it is the hardest to hit.
  const forDiscount = msas[0]
  if (forDiscount) {
    for (const [withinDays, bps, note] of [
      [10, 200, 'Two per cent for settlement inside ten days. Agreed at the 2024 renewal.'],
      [0, 300, 'Three per cent for same-day settlement. Rarely taken and worth offering.'],
    ] as const) {
      if (await db.earlyPaymentDiscount.findFirst({ where: { msaId: forDiscount.id, withinDays } })) continue
      await db.earlyPaymentDiscount.create({
        data: { msaId: forDiscount.id, withinDays, discountBps: bps, note },
      })
    }
  }

  // ── 7. The file behind a verification ───────────────────────────────
  //
  // A verification with no document behind it is somebody's word for it.
  // The hash is what stops the same file being stored twice.
  const verifications = await db.verification.findMany({
    where: { status: 'CLEAR' },
    select: {
      id: true, type: true, personId: true, companyId: true, issuedAt: true,
      person: { select: { name: true } }, company: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  })
  for (const v of verifications) {
    if (await db.verificationDoc.findFirst({ where: { verificationId: v.id } })) continue
    const who = (v.person?.name ?? v.company?.name ?? 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const name = `${who}-${v.type.toLowerCase().replace(/_/g, '-')}.pdf`
    await db.verificationDoc.create({
      data: {
        verificationId: v.id,
        fileName: name,
        fileUrl: `/files/verifications/${v.id}/${name}`,
        // A stable stand-in for the real SHA-256, derived from the row so
        // a second seeding produces the same hash rather than a second
        // copy of the same file.
        fileHash: `seed:${v.id}`,
        uploadedAt: v.issuedAt ?? day(-90),
      },
    })
  }

  // ── 8. An I-9 with something behind it ──────────────────────────────
  //
  // An I-9 is a form, not evidence: it is completed FROM a passport, a
  // green card or a visa. Until now every seeded person had a clear I-9
  // and nothing behind it, which is the exact shape the paperwork section
  // of CLAUDE.md names as not held.
  const i9s = await db.verification.findMany({
    where: { type: 'I9_EVERIFY', personId: { not: null } },
    select: {
      id: true, personId: true, uploadedById: true, verifiedById: true, issuedAt: true,
      person: { select: { name: true, consultant: { select: { workAuth: true } } } },
    },
    orderBy: { id: 'asc' },
  })
  for (const [i, form] of i9s.entries()) {
    if (!form.personId) continue
    if (await db.documentBacking.findFirst({ where: { formId: form.id } })) continue
    const auth = form.person?.consultant?.workAuth ?? 'USC'
    const kind: 'PASSPORT' | 'GREEN_CARD' | 'VISA' =
      auth === 'GC' ? 'GREEN_CARD' : auth === 'H1B' ? 'VISA' : 'PASSPORT'
    const evidence =
      (await db.verification.findFirst({ where: { personId: form.personId, type: kind }, select: { id: true } })) ??
      (await db.verification.create({
        data: {
          personId: form.personId, type: kind, status: 'CLEAR',
          provider: kind === 'PASSPORT' ? 'US Department of State' : 'USCIS',
          issuedAt: day(-800),
          // A passport runs out; a green card usually does; the point is
          // that the evidence has its own clock and the form does not.
          expiresAt: kind === 'GREEN_CARD' ? day(1400) : day(900),
          uploadedById: form.uploadedById,
          verifiedById: form.verifiedById, verifiedAt: form.issuedAt ?? day(-90),
          result: { outcome: 'CLEAR' },
        },
        select: { id: true },
      }))
    await db.documentBacking.create({
      data: {
        formId: form.id, evidenceId: evidence.id, satisfiedKey: kind,
        recordedById: form.verifiedById,
        recordedAt: form.issuedAt ?? day(-90),
      },
    })
    out.backings++
    // Which edition of the form was signed. One person on an edition the
    // government retired, because that is the finding an auditor writes
    // down and a screen that can never show it is a screen nobody trusts.
    await db.verification.update({
      where: { id: form.id },
      data: { formEdition: i === 0 ? '10/21/2019' : '08/01/2023' },
    })
  }

  // ── 9. The types a company added, and the editions of a form ────────
  //
  // Not the shipped defaults: a firm that has changed nothing has no rows
  // and still gets the whole list. These are the two things a company
  // actually writes — a type nobody shipped, and the editions of a form
  // it is tracking.
  const ownTypes: { slug: string; key: string; label: string; hint: string; purpose: string; shape: string; months: number | null; blocks: boolean; suppliedBy: string }[] = [
    {
      slug: 'terumo-bct', key: 'STERILE_FIELD_TRAINING', label: 'Sterile field training',
      hint: 'Our own two-day course. Anybody going into a clean room needs it and it lapses after two years.',
      purpose: 'COMPLIANCE', shape: 'START_AND_END', months: 24, blocks: true, suppliedBy: 'CANDIDATE',
    },
    {
      slug: 'corning', key: 'HOT_FLOOR_INDUCTION', label: 'Hot floor induction',
      hint: 'Site safety induction for the furnace floor. Annual, and site-specific — another plant’s does not count.',
      purpose: 'COMPLIANCE', shape: 'START_AND_END', months: 12, blocks: true, suppliedBy: 'EMPLOYEE',
    },
    {
      slug: 'nike', key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking',
      hint: 'Unreleased product lines. Signed once, before the first day on site.',
      purpose: 'AGREEMENT', shape: 'NONE', months: null, blocks: false, suppliedBy: 'CANDIDATE',
    },
  ]
  for (const t of ownTypes) {
    const firm = ctx.firmBySlug.get(t.slug)
    if (!firm) continue
    if (await db.documentType.findFirst({ where: { companyId: firm.id, key: t.key } })) continue
    const seat = ctx.seatBySlug.get(t.slug)
    await db.documentType.create({
      data: {
        companyId: firm.id, key: t.key, label: t.label, hint: t.hint,
        purpose: t.purpose, validityShape: t.shape, validMonths: t.months,
        reissued: false, backedByAnyOf: [], requiresBacking: false,
        signedBy: t.purpose === 'AGREEMENT' ? 'ONE_PARTY' : 'NOBODY',
        suppliedBy: t.suppliedBy, blocks: t.blocks,
        // Nobody shipped this one. It is the company's own.
        builtIn: false,
        createdById: seat?.personId ?? null,
        createdAt: day(-150),
      },
    })
    out.documentTypes++
  }
  // The I-9, recorded by the programs that track which edition is
  // current. The values are the shipped ones — what is company data here
  // is the editions hanging off it.
  for (const slug of ['nike', 'corning', 'terumo-bct']) {
    const firm = ctx.firmBySlug.get(slug)
    if (!firm) continue
    const existing = await db.documentType.findFirst({ where: { companyId: firm.id, key: 'I9_EVERIFY' }, select: { id: true } })
    const type =
      existing ??
      (await db.documentType.create({
        data: {
          companyId: firm.id, key: 'I9_EVERIFY', label: 'I-9 and E-Verify',
          hint: 'Federal work authorization. Nobody may start without it.',
          purpose: 'COMPLIANCE', validityShape: 'END_ONLY', validMonths: null,
          reissued: true,
          backedByAnyOf: ['PASSPORT', 'GREEN_CARD', 'VISA', 'DRIVERS_LICENSE', 'RIGHT_TO_WORK', 'WORK_PERMIT'],
          requiresBacking: true, signedBy: 'BOTH_PARTIES', suppliedBy: 'EMPLOYEE', blocks: true,
          builtIn: true,
          createdById: ctx.seatBySlug.get(slug)?.personId ?? null,
          createdAt: day(-150),
        },
        select: { id: true },
      }))
    if (!existing) out.documentTypes++
    for (const e of [
      { edition: '10/21/2019', from: -2200, retired: -700, source: 'Federal Register notice, 31 July 2023' },
      { edition: '08/01/2023', from: -700, retired: null, source: 'Federal Register notice, 31 July 2023' },
    ]) {
      if (await db.documentEdition.findFirst({ where: { documentTypeId: type.id, edition: e.edition } })) continue
      await db.documentEdition.create({
        data: {
          documentTypeId: type.id, edition: e.edition,
          effectiveFrom: day(e.from),
          retiredAt: e.retired == null ? null : day(e.retired),
          source: e.source,
          recordedById: ctx.seatBySlug.get(slug)?.personId ?? null,
          recordedAt: day(-150),
        },
      })
    }
  }

  // ── 10. The visa lifecycle, walked ──────────────────────────────────
  //
  // Filed, evidence asked for, evidence sent, approved with the date it
  // runs out, stamped, working on it. Only for the consultants whose
  // profile already says H-1B — the fact the petition is about is already
  // in the world, and this is its paperwork.
  const onH1B = await db.consultantProfile.findMany({
    where: { workAuth: 'H1B' },
    select: { personId: true, location: true, person: { select: { name: true } } },
    orderBy: { id: 'asc' },
    take: 8,
  })
  for (const [i, c] of onH1B.entries()) {
    if (await db.visaPetition.findFirst({ where: { personId: c.personId, type: 'H1B' } })) continue
    // One of them runs out inside the assignment, so the nightly watch
    // has something to move and the compliance desk has something to do.
    const runsOutIn = i === 0 ? 40 : 300 + i * 90
    const filedOn = -520 - i * 10
    const petition = await db.visaPetition.create({
      data: {
        personId: c.personId, type: 'H1B', country: 'US', status: 'ACTIVE',
        filedAt: day(filedOn), approvedAt: day(filedOn + 120), expiresAt: day(runsOutIn),
        worksiteAddress: c.location,
        transferOk: true,
      },
      select: { id: true },
    })
    out.petitions++
    // The evidence request only on some of them, because an RFE on every
    // petition would read as the normal case and it is not.
    const rfe = i % 3 === 0
    const trail: { move: keyof typeof EVENT_FOR | null; type: string; on: number; notes: string }[] = [
      { move: null, type: 'FILED', on: filedOn, notes: 'Filed with premium processing.' },
      { move: null, type: 'RECEIVED', on: filedOn + 3, notes: 'Receipt notice issued.' },
      ...(rfe
        ? [
            { move: 'RFE' as const, type: EVENT_FOR.RFE, on: filedOn + 45, notes: 'Evidence requested on the specialty occupation.' },
            { move: 'RFE_ANSWERED' as const, type: EVENT_FOR.RFE_ANSWERED, on: filedOn + 68, notes: 'Client letter and degree evaluation sent.' },
          ]
        : []),
      { move: 'APPROVED' as const, type: EVENT_FOR.APPROVED, on: filedOn + 120, notes: 'Approved to the date on the I-797.' },
      { move: 'STAMPED' as const, type: EVENT_FOR.STAMPED, on: filedOn + 165, notes: 'Stamped at the consulate.' },
      { move: 'ACTIVE' as const, type: EVENT_FOR.ACTIVE, on: filedOn + 180, notes: 'Working on it.' },
    ]
    for (const e of trail) {
      await db.visaEvent.create({
        data: { petitionId: petition.id, eventType: e.type, occurredAt: day(e.on), notes: e.notes },
      })
    }
    for (const d of [
      { docType: 'LCA', file: 'lca-certified.pdf', on: filedOn - 20, expires: runsOutIn },
      { docType: 'I797', file: 'i797-approval-notice.pdf', on: filedOn + 120, expires: runsOutIn },
      { docType: 'VISA_STAMP', file: 'visa-stamp.jpg', on: filedOn + 165, expires: runsOutIn },
    ]) {
      await db.visaDocument.create({
        data: {
          petitionId: petition.id, docType: d.docType,
          fileName: d.file,
          fileUrl: `/files/visas/${petition.id}/${d.file}`,
          expiresAt: day(d.expires),
          uploadedAt: day(d.on),
        },
      })
    }
  }

  // ── 11. What was checked, and what it read to decide ────────────────
  //
  // A check that does not say what to fix sends people back to email, so
  // every row carries the sentence and the evidence it was decided on.
  // One of them fails, and one machine check has been looked at by a
  // person — which is the only thing that improves an agent.
  const subs = await db.submission.findMany({
    where: { toCompany: { slug: { startsWith: ctx.prefix } }, status: { in: ['PLACED', 'SHORTLISTED'] } },
    select: {
      id: true, rate: true, toCompanyId: true, personId: true,
      requirement: { select: { billMin: true, billMax: true, title: true } },
      person: { select: { name: true, consultant: { select: { workAuth: true, skills: true } } } },
    },
    orderBy: { id: 'asc' },
    take: 12,
  })
  for (const [i, s] of subs.entries()) {
    if (await db.check.findFirst({ where: { recordType: 'Submission', recordId: s.id } })) continue
    const band = s.requirement
    const inRange = band?.billMax == null || s.rate <= band.billMax
    const auth = s.person?.consultant?.workAuth ?? null
    const rows: { code: string; verdict: string; reason: string; evidence: string; checker: string }[] = [
      {
        code: 'RATE_IN_RANGE', checker: 'RULE',
        verdict: inRange ? 'PASS' : 'FAIL',
        reason: inRange
          ? `Asked $${(s.rate / 100).toFixed(2)} an hour, inside the band on the role.`
          : `Asked $${(s.rate / 100).toFixed(2)} an hour, above the $${((band?.billMax ?? 0) / 100).toFixed(2)} ceiling on the role.`,
        evidence: `rate ${s.rate} against band ${band?.billMin ?? '—'}–${band?.billMax ?? '—'}`,
      },
      {
        code: 'WORK_AUTH', checker: 'RULE',
        verdict: auth ? 'PASS' : 'FAIL',
        reason: auth
          ? `Work authorization on file: ${auth}.`
          : 'No work authorization recorded. Get it on file before this goes to the client.',
        evidence: `consultant profile workAuth=${auth ?? 'null'}`,
      },
      {
        code: 'SKILLS_EVIDENCED', checker: 'MODEL',
        verdict: 'PASS',
        reason: `The CV evidences the skills the role asks for.`,
        evidence: (s.person?.consultant?.skills ?? []).slice(0, 3).join(', ') || 'skills on profile',
      },
    ]
    for (const r of rows) {
      await db.check.create({
        data: {
          companyId: s.toCompanyId, recordType: 'Submission', recordId: s.id,
          checker: r.checker, code: r.code, verdict: r.verdict,
          reason: r.reason, evidence: r.evidence,
          // One machine check looked at by a person, and one where they
          // disagreed — the disagreement is the useful row.
          ...(i === 0 && r.checker === 'MODEL'
            ? {
                checkedById: ctx.seatBySlug.get('computer-systems')?.personId ?? null,
                agreed: false,
                disagreedNote: 'The Epic experience is Ambulatory, not Beaker. The CV does not evidence what the role asks for.',
              }
            : {}),
          at: day(-100 + i),
        },
      })
      out.checks++
    }
  }

  return out
}
