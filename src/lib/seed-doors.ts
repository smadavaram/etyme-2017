/**
 * What each door on /demo actually opens onto.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * `/demo` had seven doors and every one of them was a company. A
 * consultant — the third side of this marketplace, and the only one who
 * is a person rather than a firm — could be reached only by minting a
 * private, random, throwaway Java developer nobody else could see. So
 * the one population the product exists to serve was the one population
 * the demo could not show against the shared world.
 *
 * Two doors on the page were worse than missing: Aptiva Workforce and
 * Kestrel MSP were seeded with no contracts at all, because the model
 * said an MSP routes work and holds none. CLAUDE.md's correction of
 * 2026-09-17 says an MSP sells and buys like anybody else and can put
 * its own W2 employee on a client's site. Aptiva is built to the
 * correction here; Kestrel stays a pure agent MSP, because both exist.
 *
 * So this seeds the last mile of the world: four people with somewhere
 * to sit and something waiting, and the two firms whose doors led to an
 * empty book. Everything it writes hangs off companies `seed-world`
 * already made, and it runs after `seed-programmes` because two of the
 * four people are placed by it.
 *
 * ── The four people, and why these four ──────────────────────────────
 *
 *   Karthik Menon    aerospace, DO-178C. A systems integrator's own W2 —
 *                    the person with no bench listing anywhere, whom
 *                    nobody's consent is asked about because the
 *                    employment contract already said it.
 *   Helena Marsh     apparel, SAP S/4 finance. On a bench listing
 *                    through a prime, on site at a client who cannot see
 *                    the firm below the one it pays.
 *   Chidi Okafor     medical device, CSV and 21 CFR Part 11. H1B,
 *                    integrator over bench vendor, two hops from the
 *                    client.
 *   Colleen Byrne    an ICU travel nurse, corp to corp through her own
 *                    limited company, on a thirteen-week assignment with
 *                    a state license that runs out inside the month.
 *
 * The fourth is the one that proves the claim CLAUDE.md makes and the
 * seed never did: nothing in the core may assume IT staffing. She works
 * three twelve-hour shifts rather than five eights, she is paid through
 * her own company rather than by a staffing firm, and the document her
 * whole assignment rests on is a license from a state board of nursing.
 * Every one of those was a shape this world had never held.
 *
 * Idempotent by the same rule as everything else here: found before it
 * is made, keyed on things that do not move — a slug, an address, a
 * contract's three parties, a week's first day.
 */

import { prisma as db } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { chaseCredentials } from '@/lib/credential-chase'
import { day } from '@/lib/seed-days'
import type { World } from '@/lib/seed-programmes'

/** "Colleen Byrne" → colleen.byrne@… — accents folded, never dropped into a dot. */
const emailOf = (name: string) =>
  `${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`

/**
 * Five eight-hour days ending `w` weeks ago — the same span the rest of
 * the world uses, so nothing straddles a week somebody else wrote.
 */
function officeWeek(w: number, hours = 40) {
  const start = day(-(w * 7 + 4)),
    end = day(-(w * 7))
  const days: Record<string, number> = {}
  for (let d = 0; d < 5; d++) days[day(-(w * 7 + 4) + d).toISOString().slice(0, 10)] = hours / 5
  return { start, end, days, hours }
}

/**
 * Three twelve-hour shifts, `w` weeks ago.
 *
 * A nurse's week is not five eights, and a demo that files one as five
 * eights is telling a nurse manager that this product has never met a
 * nurse. Thirty-six hours, Monday, Wednesday and Friday.
 */
function nurseWeek(w: number) {
  const start = day(-(w * 7 + 4)),
    end = day(-(w * 7))
  const days: Record<string, number> = {}
  for (const d of [0, 2, 4]) days[day(-(w * 7 + 4) + d).toISOString().slice(0, 10)] = 12
  return { start, end, days, hours: 36 }
}

export async function seedDoors(w: World): Promise<{ people: number; placements: number }> {
  const { firmBySlug, seatBySlug } = w
  const co = (slug: string) => firmBySlug.get(slug)!
  const seat = (slug: string) => seatBySlug.get(slug)!.personId

  async function person(name: string) {
    const primaryEmail = emailOf(name)
    return db.person.upsert({
      where: { primaryEmail },
      update: { name },
      create: { name, primaryEmail },
    })
  }

  async function trade(a: string, b: string, relationship: string) {
    const A = co(a).id,
      B = co(b).id
    if (await db.counterparty.findFirst({ where: { companyId: A, otherCompanyId: B, relationship } })) return
    await db.counterparty.create({ data: { companyId: A, otherCompanyId: B, relationship } })
  }

  /** The paper two firms trade under, and the project this one is part of. */
  async function agreement(sellerSlug: string, buyerSlug: string, title: string) {
    const vendorId = co(sellerSlug).id,
      clientId = co(buyerSlug).id
    const msa =
      (await db.masterAgreement.findFirst({ where: { vendorId, clientId } })) ??
      (await db.masterAgreement.create({
        data: { vendorId, clientId, paymentTerms: 45, currency: 'USD', signedAt: day(-400) },
      }))
    const eng =
      (await db.engagement.findFirst({ where: { msaId: msa.id, title } })) ??
      (await db.engagement.create({ data: { msaId: msa.id, title, invoiceCycle: 'MONTHLY' } }))
    return { msa, eng }
  }

  /**
   * One person, one client, one supplier — the sell leg and the buy leg
   * under it, and the requirement and submission that put them there.
   *
   * `buyFrom` is null where the seller employs them (a W2 leg, and no
   * purchase order: you do not raise a PO to your own employee) and the
   * consultant's own company where the trade is corp to corp.
   */
  async function place(spec: {
    personId: string
    sellerSlug: string
    clientSlug: string
    /** The company the seller buys from, or null where it employs them. */
    buyFromId: string | null
    contractType: 'W2' | 'C2C'
    role: string
    skills: string[]
    loc: string
    billRate: number
    payRate: number
    start: Date
    end: Date
    state: 'IN_PROGRESS' | 'ENDED'
    /** BENCH · INTERNAL — computed from ownership, never typed in. */
    kind: 'INTERNAL' | 'BENCH' | 'NETWORK'
  }) {
    const seller = co(spec.sellerSlug),
      client = co(spec.clientSlug)
    await trade(spec.sellerSlug, spec.clientSlug, 'CLIENT')
    await trade(spec.clientSlug, spec.sellerSlug, 'SUPPLIER')

    const requirement =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: spec.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id,
          title: spec.role,
          skills: spec.skills,
          location: spec.loc,
          billMin: spec.billRate - 1200,
          billMax: spec.billRate + 600,
          months: 12,
          headcount: 1,
          status: spec.state === 'ENDED' ? 'CLOSED' : 'FILLED',
          approvalState: 'AUTO_APPROVED',
          source: 'MANUAL',
          neededBy: spec.start,
          hoursPerWeek: 40,
        },
      }))

    let sell = await db.sellContract.findFirst({
      where: { companyId: seller.id, personId: spec.personId, clientCompanyId: client.id, requirementId: requirement.id },
    })
    if (!sell) {
      const { msa, eng } = await agreement(spec.sellerSlug, spec.clientSlug, spec.role)
      sell = await db.sellContract.create({
        data: {
          companyId: seller.id,
          clientCompanyId: client.id,
          endClientCompanyId: client.id,
          personId: spec.personId,
          requirementId: requirement.id,
          engagementId: eng.id,
          msaId: msa.id,
          billRate: spec.billRate,
          billCurrency: 'USD',
          paymentTerms: 45,
          state: spec.state,
          startDate: spec.start,
          endDate: spec.end,
        },
      })
      const buy = await db.buyContract.create({
        data: {
          companyId: seller.id,
          vendorCompanyId: spec.buyFromId,
          payCurrency: 'USD',
          contractType: spec.contractType,
          state: spec.state,
          startDate: spec.start,
          endDate: spec.end,
          // No purchase order on either of these legs. A PO raised to
          // your own employee is a contradiction, and the consultant's
          // own company is paid against the contract's rate.
          purchaseOrderId: null,
        },
      })
      await db.buyContractCandidate.create({
        data: {
          buyContractId: buy.id,
          personId: spec.personId,
          payRate: spec.payRate,
          payCurrency: 'USD',
          startDate: spec.start,
          endDate: spec.end,
        },
      })
      await db.contractLink.create({
        data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: spec.start, effectiveTo: spec.end },
      })
      if (spec.state !== 'ENDED') await writeCyclesFor(db, { sell, buy, packId: 'US_IT' })
    }

    if (!(await db.submission.findFirst({ where: { requirementId: requirement.id, personId: spec.personId } }))) {
      await db.submission.create({
        data: {
          requirementId: requirement.id,
          personId: spec.personId,
          fromCompanyId: seller.id,
          toCompanyId: client.id,
          kind: spec.kind,
          rate: spec.billRate,
          status: 'PLACED',
          checkState: 'SENT',
          submittedAt: new Date(spec.start.getTime() - 21 * 86_400_000),
          decidedAt: new Date(spec.start.getTime() - 6 * 86_400_000),
        },
      })
    }

    return { sell, requirement }
  }

  /** A week of hours, and who has signed it. */
  async function hours(input: {
    sellContractId: string
    personId: string
    week: { start: Date; end: Date; days: Record<string, number>; hours: number }
    /** SIGNED · CLIENT_ONLY (the employer has not accepted) · FILED (nobody has). */
    standing: 'SIGNED' | 'CLIENT_ONLY' | 'FILED'
    clientById: string
    employerById: string
  }) {
    const { week } = input
    if (await db.timesheet.findFirst({ where: { sellContractId: input.sellContractId, periodStart: week.start } })) return
    await db.timesheet.create({
      data: {
        sellContractId: input.sellContractId,
        personId: input.personId,
        periodStart: week.start,
        periodEnd: week.end,
        days: week.days,
        totalHours: week.hours,
        // A week is APPROVED only when both sides have signed it. One
        // signature is a week still waiting on somebody, and the status
        // has to say so or a desk reads "done" about its own queue.
        status: input.standing === 'SIGNED' ? 'APPROVED' : 'SUBMITTED',
        submittedAt: week.end,
        ...(input.standing === 'FILED'
          ? {}
          : {
              clientApprovedAt: new Date(week.end.getTime() + 2 * 86_400_000),
              clientApprovedById: input.clientById,
            }),
        ...(input.standing === 'SIGNED'
          ? {
              approvedAt: new Date(week.end.getTime() + 2 * 86_400_000),
              approvedById: input.clientById,
              employerAcceptedAt: new Date(week.end.getTime() + 3 * 86_400_000),
              employerAcceptedById: input.employerById,
            }
          : {}),
      },
    })
  }

  /** A document this company has asked that person for, and not had back. */
  async function asked(input: {
    companySlug: string
    name: string
    needsSignature: boolean
    audience: string
    personId: string
    sentDaysAgo: number
  }) {
    const company = co(input.companySlug)
    const template =
      (await db.docTemplate.findFirst({ where: { companyId: company.id, name: input.name } })) ??
      (await db.docTemplate.create({
        data: {
          companyId: company.id,
          name: input.name,
          audience: input.audience,
          needsSignature: input.needsSignature,
        },
      }))
    if (
      await db.docInstance.findFirst({
        where: { templateId: template.id, subjectType: 'PERSON', subjectId: input.personId },
      })
    )
      return
    await db.docInstance.create({
      data: {
        templateId: template.id,
        subjectType: 'PERSON',
        subjectId: input.personId,
        // SENT, not PENDING: the person has been asked and can answer it
        // from their own page. PENDING is the company's business and
        // never reaches them.
        status: 'SENT',
        sentAt: day(-input.sentDaysAgo),
      },
    })
  }

  /**
   * A bill from the firm below, received and not yet settled.
   *
   * Every prime and integrator in this world bought somebody from a
   * bench vendor and every one of those legs was paid the moment it was
   * written, so a supplier's own buy side — the half of its book where
   * it is the customer — opened on nothing at all. One bill, on the leg
   * that already exists, against the contract it belongs to.
   */
  async function billFromBelow(payerSlug: string, vendorSlug: string, number: string) {
    const payer = co(payerSlug),
      vendor = co(vendorSlug)
    if (await db.vendorBill.findFirst({ where: { companyId: payer.id, number } })) return
    const buy = await db.buyContract.findFirst({
      where: { companyId: payer.id, vendorCompanyId: vendor.id, state: 'IN_PROGRESS' },
      include: { candidates: { select: { payRate: true } } },
    })
    if (!buy) return
    const rate = buy.candidates[0]?.payRate ?? 0
    if (!rate) return
    await db.vendorBill.create({
      data: {
        companyId: payer.id,
        vendorCompanyId: vendor.id,
        number,
        buyContractId: buy.id,
        periodStart: day(-32),
        periodEnd: day(-4),
        currency: 'USD',
        // Four weeks at the rate on the leg. Nothing invented: the rate
        // is the one the contract below already says.
        totalCents: rate * 160,
        receivedAt: day(-5),
        dueAt: day(25),
        status: 'RECEIVED',
      },
    })
  }

  let people = 0
  let placements = 0

  // ── The travel nurse, paid through her own company ───────────────────
  //
  // Thirteen weeks in an ICU, corp to corp. Harlow Health pays Halcyon
  // Talent; Halcyon buys from Byrne Critical Care LLC, which is hers.
  // `ConsultantProfile.ownCompanyId` has been on the schema since it was
  // written and nothing has ever set it, so the rule it exists for — the
  // consultant's own company carries the liability cover, not the
  // staffing firm — had never been true of any row in this world.
  const nurseCorp = await db.company.upsert({
    where: { slug: w.prefix + 'byrne-critical-care' },
    update: { name: 'Byrne Critical Care LLC', kind: 'CONSULTANT_CORP' },
    create: {
      slug: w.prefix + 'byrne-critical-care',
      name: 'Byrne Critical Care LLC',
      kind: 'CONSULTANT_CORP',
      currency: 'USD',
      defaultPaymentTerms: 30,
      createdAt: day(0),
      isDemo: false,
    },
  })
  const nurse = await person('Colleen Byrne')
  people++
  const nurseProfile =
    (await db.consultantProfile.findFirst({ where: { personId: nurse.id } })) ??
    (await db.consultantProfile.create({
      data: {
        personId: nurse.id,
        headline: 'ICU travel nurse — thirteen-week assignments',
        skills: ['ICU nursing', 'ACLS', 'Epic', 'Ventilator management'],
        location: 'Madison, WI',
        workAuth: 'USC',
        visibility: 'VERIFIED',
        availableFrom: day(-60),
      },
    }))
  if (nurseProfile.ownCompanyId !== nurseCorp.id) {
    await db.consultantProfile.update({ where: { id: nurseProfile.id }, data: { ownCompanyId: nurseCorp.id } })
  }
  // The listing that makes her submittable at all, and the seat that
  // lets her sign in as herself.
  if (!(await db.benchListing.findFirst({ where: { consultantId: nurseProfile.id, companyId: co('halcyon').id } }))) {
    await db.benchListing.create({
      data: {
        consultantId: nurseProfile.id,
        companyId: co('halcyon').id,
        tier: 'RETAINED',
        state: 'GRANTED',
        rateMin: 9000,
        rateMax: 11000,
        invitedAt: day(-64),
        respondedAt: day(-62),
        grantedAt: day(-62),
      },
    })
  }
  if (!(await db.context.findFirst({ where: { personId: nurse.id, companyId: co('halcyon').id } }))) {
    await db.context.create({
      data: {
        personId: nurse.id,
        companyId: co('halcyon').id,
        type: 'CONSULTANT',
        side: 'SELL',
        grantReason: 'On the bench — corp to corp through her own company',
      },
    })
  }

  const nurseJob = await place({
    personId: nurse.id,
    sellerSlug: 'halcyon',
    clientSlug: 'harlow-health',
    buyFromId: nurseCorp.id,
    contractType: 'C2C',
    role: 'ICU travel nurse — 13 weeks',
    skills: ['ICU nursing', 'ACLS', 'Epic'],
    loc: 'Madison, WI',
    billRate: 11_400,
    payRate: 9_200,
    start: day(-42),
    end: day(49),
    state: 'IN_PROGRESS',
    kind: 'BENCH',
  })
  placements++
  for (const [week, standing] of [
    [nurseWeek(4), 'SIGNED'],
    [nurseWeek(3), 'SIGNED'],
    [nurseWeek(2), 'SIGNED'],
    [nurseWeek(1), 'CLIENT_ONLY'],
  ] as const) {
    await hours({
      sellContractId: nurseJob.sell.id,
      personId: nurse.id,
      week,
      standing,
      clientById: seat('harlow-health'),
      employerById: seat('halcyon'),
    })
  }

  // Her license, and the renewal. The license is the whole assignment:
  // it runs out in twenty-four days, which is inside the thirteen weeks,
  // and the compliance page reads the date the same way it reads a
  // certificate of insurance.
  if (!(await db.verification.findFirst({ where: { personId: nurse.id, type: 'PROFESSIONAL_LICENSE' } }))) {
    await db.verification.create({
      data: {
        personId: nurse.id,
        type: 'PROFESSIONAL_LICENSE',
        status: 'CLEAR',
        provider: 'Wisconsin Board of Nursing',
        issuedAt: day(-706),
        validFrom: day(-706),
        expiresAt: day(24),
        uploadedById: seat('halcyon'),
        verifiedById: seat('halcyon'),
        verifiedAt: day(-60),
        result: { outcome: 'CLEAR', license: 'RN 154-882', state: 'WI' },
      },
    })
  }
  if (!(await db.verification.findFirst({ where: { personId: nurse.id, type: 'I9_EVERIFY' } }))) {
    await db.verification.create({
      data: {
        personId: nurse.id,
        type: 'I9_EVERIFY',
        status: 'CLEAR',
        provider: 'E-Verify',
        issuedAt: day(-60),
        uploadedById: seat('halcyon'),
        verifiedById: seat('halcyon'),
        verifiedAt: day(-59),
        result: { outcome: 'CLEAR' },
      },
    })
  }
  // The cover on her own company, which is the point of `ownCompanyId`:
  // on corp to corp the consultant's company carries it, not the agency.
  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    if (await db.verification.findFirst({ where: { companyId: nurseCorp.id, type } })) continue
    await db.verification.create({
      data: {
        companyId: nurseCorp.id,
        type,
        status: 'CLEAR',
        provider: 'Cincinnati Insurance',
        issuedAt: day(-200),
        validFrom: day(-200),
        expiresAt: day(165),
        uploadedById: seat('halcyon'),
        verifiedById: seat('halcyon'),
        verifiedAt: day(-199),
        result: { outcome: 'CLEAR' },
      },
    })
  }
  // The renewal ask is not written here. It used to be — a DocInstance
  // typed into the seed so her seat had something to show — and that is
  // the seed describing what the product ought to do rather than what it
  // does. The nightly chase raises it now (`lib/credential-chase`, run at
  // the end of this file), so what a visitor reads on her door is a
  // packet the product itself raised, with its automation log beside it.

  // ── Karthik Menon, between projects ──────────────────────────────────
  //
  // A GSI's own W2. His page was empty, because the only thing the world
  // said about him was that Teleworld employs him — and a person seat
  // that opens on nothing is the emptiest kind of demo. So the project
  // he has just come off is on the record: three months at Corveldt on
  // avionics software assurance, ended three weeks ago, four weeks of
  // hours signed by both sides.
  //
  // Deliberately not the open DO-178C seat. That one is Teleworld's to
  // submit him for from its own desk, and submitting him here would take
  // the one thing the integrator door exists to demonstrate and do it
  // before the visitor arrives.
  const karthik = await db.person.findUnique({ where: { primaryEmail: emailOf('Karthik Menon') } })
  if (karthik) {
    people++
    const past = await place({
      personId: karthik.id,
      sellerSlug: 'teleworld',
      clientSlug: 'corveldt',
      buyFromId: null,
      contractType: 'W2',
      role: 'Avionics software assurance engineer',
      skills: ['DO-178C', 'LDRA', 'Embedded C'],
      loc: 'Wichita, KS',
      billRate: 13_600,
      payRate: 8_900,
      start: day(-300),
      end: day(-21),
      state: 'ENDED',
      // Its own employee, so there is no bench listing and nobody's
      // consent to ask. The kind is computed from ownership everywhere
      // else; this is what that looks like on the record.
      kind: 'INTERNAL',
    })
    placements++
    for (const back of [7, 6, 5, 4]) {
      await hours({
        sellContractId: past.sell.id,
        personId: karthik.id,
        week: officeWeek(back),
        standing: 'SIGNED',
        clientById: seat('corveldt'),
        employerById: seat('teleworld'),
      })
    }
  }

  // ── Chidi Okafor's paperwork ─────────────────────────────────────────
  //
  // Placed at Talvern Medical by seed-programmes, everything on file, and
  // so his own page had nothing on it to do. A device maker asks a
  // validation engineer for a site attestation every year; this is that,
  // asked four days ago and not yet signed.
  const chidi = await db.person.findUnique({ where: { primaryEmail: emailOf('Chidi Okafor') } })
  if (chidi) {
    people++
    await asked({
      companySlug: 'terumo-bct',
      name: 'Site access and data integrity attestation',
      needsSignature: true,
      audience: 'CANDIDATE',
      personId: chidi.id,
      sentDaysAgo: 4,
    })
  }

  // Helena Marsh needs nothing added: seed-programmes already leaves her
  // a week filed and unsigned, two hundred days on site at Northbend
  // Athletic against an eighteen-month cap, and a bench listing through
  // the firm below the prime that bills the client. Counted here because
  // the door names her.
  if (await db.person.findUnique({ where: { primaryEmail: emailOf('Helena Marsh') } })) people++

  // ── Aptiva Workforce, an MSP that sells and buys ─────────────────────
  //
  // It ran Harlow Health's program and held no contract of any kind,
  // because the model behind the seed said an MSP routes work and takes
  // no rate. That is one kind of MSP. The correction of 2026-09-17 says
  // the ordinary kind sells to its client and buys below — including
  // from itself, when the person on the seat is its own employee.
  //
  // So: a sell contract to Harlow Health, and Ruben Ortega, Aptiva's own
  // W2 vendor management analyst, under it on a buy leg with no purchase
  // order. Two weeks signed by both sides and nobody has invoiced them —
  // that is the sell side's queue. One week Harlow Health has signed and
  // Aptiva has not accepted — that is the buy side's.
  const ruben = await person('Ruben Ortega')
  people++
  const analystRole =
    (await db.role.findFirst({ where: { companyId: co('aptiva').id, name: 'Program Analyst' } })) ??
    (await db.role.create({
      data: {
        companyId: co('aptiva').id,
        name: 'Program Analyst',
        isDefault: false,
        // Reads the work he is on and files his own week. Nothing else.
        permissions: ['assignments.read', 'timesheets.read'],
      },
    }))
  if (!(await db.context.findFirst({ where: { personId: ruben.id, companyId: co('aptiva').id } }))) {
    await db.context.create({
      data: {
        personId: ruben.id,
        companyId: co('aptiva').id,
        roleId: analystRole.id,
        type: 'EMPLOYEE',
        grantReason: 'Program office — vendor management practice',
      },
    })
  }
  // Cover, or the submission door refuses the firm one screen before any
  // of this is reachable.
  for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
    if (await db.verification.findFirst({ where: { companyId: co('aptiva').id, type } })) continue
    await db.verification.create({
      data: {
        companyId: co('aptiva').id,
        type,
        status: 'CLEAR',
        provider: 'Hartford',
        issuedAt: day(-300),
        validFrom: day(-300),
        expiresAt: day(200),
        uploadedById: seat('aptiva'),
        verifiedById: seat('aptiva'),
        verifiedAt: day(-299),
        result: { outcome: 'CLEAR' },
      },
    })
  }
  if (!(await db.verification.findFirst({ where: { personId: ruben.id, type: 'I9_EVERIFY' } }))) {
    await db.verification.create({
      data: {
        personId: ruben.id,
        type: 'I9_EVERIFY',
        status: 'CLEAR',
        provider: 'E-Verify',
        issuedAt: day(-64),
        uploadedById: seat('aptiva'),
        verifiedById: seat('aptiva'),
        verifiedAt: day(-63),
        result: { outcome: 'CLEAR' },
      },
    })
  }
  const aptivaJob = await place({
    personId: ruben.id,
    sellerSlug: 'aptiva',
    clientSlug: 'harlow-health',
    buyFromId: null,
    contractType: 'W2',
    role: 'Vendor management analyst',
    skills: ['Vendor management', 'VMS', 'Spend reporting'],
    loc: 'Madison, WI',
    billRate: 9_800,
    payRate: 6_900,
    start: day(-60),
    end: day(305),
    state: 'IN_PROGRESS',
    kind: 'INTERNAL',
  })
  placements++
  for (const [back, standing] of [
    [3, 'SIGNED'],
    [2, 'SIGNED'],
    [1, 'CLIENT_ONLY'],
  ] as const) {
    await hours({
      sellContractId: aptivaJob.sell.id,
      personId: ruben.id,
      week: officeWeek(back),
      standing,
      clientById: seat('harlow-health'),
      employerById: seat('aptiva'),
    })
  }

  // ── CloudEPA's own consultant, mid-chain ─────────────────────────────
  //
  // The sub-vendor's sell side already has something waiting: Ifeoma
  // Balogun is shortlisted with the prime above it, with a screen in the
  // diary. Its buy side had nothing, and a bench vendor's buy side is
  // exactly this — the paperwork it is chasing its own consultant for
  // before anybody can start her.
  // ── The buy side of the two firms that sit in the middle ─────────────
  //
  // A prime and an integrator each buy a consultant from a bench vendor
  // below them, and until now that leg's money was written already paid.
  // One bill apiece, unsettled, so the desk that sells also has
  // something to answer as a customer.
  await billFromBelow('computer-systems', 'cloudepa', 'CE-2026-0418')
  await billFromBelow('teleworld', 'nimbus', 'NT-2026-1190')

  const ifeoma = await db.person.findUnique({ where: { primaryEmail: emailOf('Ifeoma Balogun') } })
  if (ifeoma) {
    await asked({
      companySlug: 'cloudepa',
      name: 'I-9, with the document it is completed from',
      needsSignature: true,
      audience: 'CANDIDATE',
      personId: ifeoma.id,
      sentDaysAgo: 6,
    })
  }

  // ── The nightly chase, run once over the world it just made ─────────
  //
  // Colleen Byrne's license runs out inside her assignment, so the watch
  // asks her for the renewal — the same call `api/cron/watch` makes every
  // night, against the same rows. Idempotent by the packet it looks for
  // before it writes one, so seeding twice asks nobody twice.
  await chaseCredentials(day(0))

  return { people, placements }
}
