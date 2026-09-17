/**
 * Everything between an advert and a person leaving again.
 *
 * ── What opened empty ────────────────────────────────────────────────
 *
 * Demand opens a thread and supply answers it — the 2017 rule the demand
 * side still wants — and there was no thread anywhere to open. No
 * consultant had a CV on file, so a submission carried a person and no
 * paper. Nobody was held at a client, nobody was blocked anywhere, and
 * the list that stops a duplicate submission was empty. Matching had no
 * score to show. Training had no course. And nobody was rolling off, so
 * the rolloff console — a whole screen in the BRD — was blank.
 *
 * ── Two rules this file is bound by ──────────────────────────────────
 *
 * **A match score is never a bare number.** Every row here comes out of
 * `runMatchEngine`, which carries factors, basis, confidence and unknowns
 * or does not write a row at all. Seeding a score by hand would seed the
 * exact bug CLAUDE.md names.
 *
 * **Nothing merges silently.** A lead that is certainly the same seat
 * collapses onto it; a lead that is probably the same seat gets its own
 * opening and a question for a person, which is the same rule identity
 * resolution follows for people.
 */

import { prisma as db } from '@/lib/db'
import { day, at } from '@/lib/seed-days'
import { runMatchEngine } from '@/lib/match-engine'

export interface SeedContext {
  firmBySlug: Map<string, { id: string }>
  seatBySlug: Map<string, { personId: string; email: string }>
  domain: string
  prefix: string
}

export interface Pipeline {
  resumes: number
  threads: number
  openings: number
  matches: number
  enrollments: number
  rolloffs: number
}

export async function seedPipeline(ctx: SeedContext): Promise<Pipeline> {
  const out: Pipeline = { resumes: 0, threads: 0, openings: 0, matches: 0, enrollments: 0, rolloffs: 0 }

  // ── 1. A CV on file ─────────────────────────────────────────────────
  //
  // Held by the firm that markets them, which is the ordinary case — a
  // recruiter usually has the CV before the consultant has an account.
  // The text is what a reader would actually see; it is extracted here
  // rather than left null, because null means "could not be read" and
  // that is a different fact.
  const consultants = await db.consultantProfile.findMany({
    select: {
      id: true, personId: true, skills: true, location: true, workAuth: true,
      person: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  })
  for (const c of consultants) {
    if (await db.resume.findFirst({ where: { personId: c.personId, deletedAt: null } })) continue
    const listing = await db.benchListing.findFirst({
      where: { consultantId: c.id, state: 'GRANTED' },
      select: { companyId: true },
      orderBy: { grantedAt: 'desc' },
    })
    const headline = c.skills[0] ?? 'Consultant'
    const text =
      `${c.person.name}\n${headline}${c.location ? ` — ${c.location}` : ''}\n\n` +
      `Skills: ${c.skills.join(', ')}\n` +
      `Work authorization: ${c.workAuth ?? 'not stated'}\n\n` +
      `Experience\n` +
      `Contract assignments delivering ${c.skills.slice(0, 2).join(' and ')} work for enterprise clients.\n`
    const label = `${headline} ${day(0).getUTCFullYear()}`
    const fileName = `${c.person.name.toLowerCase().replace(/[^a-z]+/g, '-')}-cv.pdf`
    await db.resume.create({
      data: {
        personId: c.personId, label, fileName,
        contentType: 'application/pdf',
        sizeBytes: Buffer.byteLength(text),
        storage: 'DB', bytes: Buffer.from(text, 'utf8'),
        textExtract: text,
        uploadedByCompanyId: listing?.companyId ?? null,
        // While this is the current one. The unique on (personId,
        // currentKey) is what stops two versions both claiming to be it.
        currentKey: c.personId,
        createdAt: day(-60),
      },
    })
    out.resumes++
  }

  // ── 2. Held at a client, with the person's own yes recorded ─────────
  //
  // The hold is a claim against other vendors. The consent is the
  // consultant saying yes, and they are different facts — holding
  // somebody who never agreed is the blind submission that makes
  // consultants stop answering the phone.
  const live = await db.submission.findMany({
    where: { status: { in: ['SHORTLISTED', 'SUBMITTED'] } },
    select: {
      id: true, personId: true, fromCompanyId: true, requirementId: true, submittedAt: true,
      requirement: { select: { companyId: true, endClientCompanyId: true } },
    },
    orderBy: { id: 'asc' },
  })
  for (const s of live) {
    const clientId = s.requirement.endClientCompanyId ?? s.requirement.companyId
    if (await db.representation.findFirst({ where: { personId: s.personId, holdKey: clientId } })) continue
    await db.representation.create({
      data: {
        personId: s.personId, companyId: s.fromCompanyId,
        clientCompanyId: clientId, requirementId: s.requirementId,
        state: 'HELD',
        takenAt: s.submittedAt ?? day(-14),
        consentAskedAt: s.submittedAt ?? day(-15),
        consentedAt: s.submittedAt ?? day(-14),
        consentVia: 'EMAIL',
        expiresAt: day(21),
        holdKey: clientId,
      },
    })
  }

  // ── 3. The two kinds of "no" ────────────────────────────────────────
  //
  // A consultant's own note to themselves — never leaves their screen —
  // and a company's block, which keeps the row on the register and out of
  // every list except its own.
  const marked = consultants[2]
  const formerEmployer = ctx.firmBySlug.get('meridian-bank')
  if (marked && formerEmployer) {
    if (!(await db.doNotSubmit.findFirst({ where: { personId: marked.personId, companyId: formerEmployer.id } }))) {
      await db.doNotSubmit.create({
        data: {
          personId: marked.personId, companyId: formerEmployer.id,
          note: 'I worked there as a permanent employee until last year. Not going back through an agency.',
          createdAt: day(-40),
        },
      })
    }
  }
  const nike = ctx.firmBySlug.get('nike')
  const blockedFirm = ctx.firmBySlug.get('arcadia')
  const hiring = await db.person.findUnique({
    where: { primaryEmail: `${ctx.prefix}nike-hiring@${ctx.domain}` }, select: { id: true },
  })
  if (nike && blockedFirm && hiring) {
    if (!(await db.blacklist.findFirst({ where: { companyId: nike.id, targetType: 'COMPANY', targetId: blockedFirm.id } }))) {
      await db.blacklist.create({
        data: {
          companyId: nike.id, targetType: 'COMPANY', targetId: blockedFirm.id,
          reason: 'Submitted the same consultant through two of their own recruiters and argued about which one owned the fee. Not again.',
          blockedById: hiring.id,
          blockedAt: day(-75),
        },
      })
    }
  }

  // ── 4. Demand opens, supply answers ─────────────────────────────────
  //
  // One thread per role per counterparty, opened by the client, answered
  // by the supplier. A firm not on the deal sees nothing; the client's
  // own discussion never leaves the client.
  const openRoles = await db.requirement.findMany({
    where: {
      status: 'OPEN',
      company: { slug: { startsWith: ctx.prefix }, kind: 'CLIENT' },
    },
    select: { id: true, title: true, companyId: true },
    orderBy: { createdAt: 'asc' },
    take: 3,
  })
  for (const role of openRoles) {
    // Whoever actually put somebody in front of them for this role. A
    // thread with a firm that is not on the deal is one `lib/threads`
    // would have refused to open.
    const sub = await db.submission.findFirst({
      where: { requirementId: role.id },
      select: { fromCompanyId: true, person: { select: { name: true } } },
      orderBy: { submittedAt: 'asc' },
    })
    if (!sub) continue
    const existing = await db.conversation.findFirst({
      where: { companyId: role.companyId, withCompanyId: sub.fromCompanyId, topic: 'REQUIREMENT', topicId: role.id },
    })
    if (existing) continue

    const clientSeat = await db.context.findFirst({
      where: { companyId: role.companyId, type: 'EMPLOYEE' },
      select: { person: { select: { id: true, name: true } } },
      orderBy: { grantedAt: 'asc' },
    })
    const supplierSeat = await db.context.findFirst({
      where: { companyId: sub.fromCompanyId, type: 'EMPLOYEE' },
      select: { person: { select: { id: true, name: true } } },
      orderBy: { grantedAt: 'asc' },
    })
    if (!clientSeat || !supplierSeat) continue

    const thread = await db.conversation.create({
      data: {
        companyId: role.companyId, withCompanyId: sub.fromCompanyId,
        topic: 'REQUIREMENT', topicId: role.id,
        title: role.title,
        participants: [
          { personId: clientSeat.person.id, name: clientSeat.person.name, companyId: role.companyId, joinedAt: at(-11, 15).toISOString() },
          { personId: supplierSeat.person.id, name: supplierSeat.person.name, companyId: sub.fromCompanyId, joinedAt: at(-11, 16).toISOString() },
        ] as never,
        createdAt: at(-11, 15),
        updatedAt: at(-10, 9),
      },
      select: { id: true },
    })
    out.threads++
    for (const m of [
      {
        by: clientSeat.person.id, on: -11, hour: 15,
        body: `Can ${sub.person.name} start inside three weeks, and is the rate you sent inclusive of expenses?`,
      },
      {
        by: supplierSeat.person.id, on: -11, hour: 17,
        body: 'Three weeks is fine — they give two weeks notice. The rate is all-in apart from travel to site, which we would bill at cost with receipts.',
      },
      {
        by: clientSeat.person.id, on: -10, hour: 9,
        body: 'Understood. Travel at cost is fine. I will put them through to a second round this week.',
      },
    ]) {
      await db.message.create({
        data: {
          conversationId: thread.id, authorId: m.by, body: m.body,
          type: 'TEXT', createdAt: at(m.on, m.hour),
        },
      })
    }
  }

  // ── 5. Seats a bench vendor is chasing ──────────────────────────────
  //
  // Openings are private: two vendors chasing the same seat each have
  // their own row, because neither can see the other's pipeline. Most
  // demand is blind, so the client's name is usually absent and what can
  // honestly be said instead is carried in `inferredClient`.
  const chasers: { slug: string; seats: { title: string; skills: string[]; loc: string; inferred: string; status: string; lastSeen: number; adverts: { source: string; postedBy: string; rate: number | null; strength: string | null; because: string[] }[] }[] }[] = [
    {
      slug: 'cloudepa',
      seats: [
        {
          title: 'SAP FICO consultant', skills: ['SAP FICO', 'S/4HANA'], loc: 'San Jose, CA',
          inferred: 'a health system, Bay Area', status: 'LIVE', lastSeen: -2,
          adverts: [
            { source: 'DICE', postedBy: 'Confidential', rate: 13_000, strength: 'SAME', because: ['same title', 'same city', 'rate within $5/hr'] },
            { source: 'EMAIL', postedBy: 'Computer Systems Inc', rate: 12_800, strength: 'SAME', because: ['same title', 'same city'] },
          ],
        },
        {
          title: 'Epic Beaker analyst', skills: ['Epic', 'Beaker'], loc: 'Madison, WI',
          inferred: 'a hospital group, Wisconsin', status: 'LIVE', lastSeen: -1,
          adverts: [
            { source: 'LINKEDIN', postedBy: 'Confidential', rate: 12_400, strength: null, because: [] },
          ],
        },
        {
          // Nobody has advertised it in seven weeks. The COLD job ages a
          // seat at forty-five days, and until now it had nothing to age.
          title: 'Oracle Retail consultant', skills: ['Oracle Retail', 'PL/SQL'], loc: 'Columbus, OH',
          inferred: 'a national retailer, Midwest', status: 'LIVE', lastSeen: -49,
          adverts: [
            { source: 'VMS', postedBy: 'Brightmoor Staffing', rate: 12_000, strength: 'LIKELY', because: ['same skills', 'city 40 miles apart'] },
          ],
        },
      ],
    },
  ]
  for (const c of chasers) {
    const firm = ctx.firmBySlug.get(c.slug)
    if (!firm) continue
    for (const seat of c.seats) {
      const existing = await db.opening.findFirst({
        where: { companyId: firm.id, title: seat.title }, select: { id: true },
      })
      const opening =
        existing ??
        (await db.opening.create({
          data: {
            companyId: firm.id, title: seat.title, skills: seat.skills, location: seat.loc,
            // Blind. The name arrives at interview, on the first day, or
            // never — and saying so honestly is the point of the column.
            clientCompanyId: null, inferredClient: seat.inferred,
            headcount: 1, status: seat.status,
            firstSeen: day(seat.lastSeen - 20), lastSeen: day(seat.lastSeen),
          },
          select: { id: true },
        }))
      if (!existing) out.openings++
      for (const ad of seat.adverts) {
        const already = await db.lead.findFirst({
          where: { companyId: firm.id, title: seat.title, source: ad.source }, select: { id: true },
        })
        if (already) continue
        await db.lead.create({
          data: {
            companyId: firm.id, source: ad.source, postedBy: ad.postedBy,
            title: seat.title, skills: seat.skills, location: seat.loc,
            rateCents: ad.rate,
            text: `${seat.title}, ${seat.loc}. 12 months, extendable. ${seat.skills.join(', ')}.`,
            seenAt: day(seat.lastSeen),
            // SAME collapses onto the seat. LIKELY gets its own and waits
            // for a person — nothing merges silently.
            openingId: ad.strength === 'LIKELY' ? null : opening.id,
            likeOpeningId: ad.strength === 'LIKELY' ? opening.id : null,
            matchStrength: ad.strength,
            matchBecause: ad.because,
          },
        })
      }
    }
  }

  // ── 6. Matching, with its reasons ───────────────────────────────────
  //
  // A bench vendor's own record of the seat it is working, so its own
  // bench can be scored against it — which is what the engine is for:
  // "do we have anybody, before we go looking outside". The pool is the
  // requirement owner's own bench and nobody else's.
  //
  // Every score comes from `runMatchEngine`. A bare number is a bug, and
  // the only way to be sure is never to write one by hand.
  const benchFirms = ['cloudepa', 'sahasra', 'nimbus']
  for (const slug of benchFirms) {
    const firm = ctx.firmBySlug.get(slug)
    if (!firm) continue
    const bench = await db.benchListing.findFirst({
      where: { companyId: firm.id, state: 'GRANTED' },
      select: { consultant: { select: { skills: true, location: true } } },
    })
    if (!bench) continue
    const title = `${bench.consultant.skills[0] ?? 'Consultant'} — seat being worked`
    const req =
      (await db.requirement.findFirst({ where: { companyId: firm.id, title }, select: { id: true } })) ??
      (await db.requirement.create({
        data: {
          companyId: firm.id, title,
          skills: bench.consultant.skills, location: bench.consultant.location,
          // What it will pay somebody, which is not what anybody pays it.
          billMin: 8_000, billMax: 11_000, months: 12, headcount: 1,
          status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'NETWORK',
          neededBy: day(30), createdAt: day(-7),
        },
        select: { id: true },
      }))
    try {
      const { matches } = await runMatchEngine(req.id, { limit: 10 })
      out.matches += matches.length
    } catch {
      // A requirement with nothing to match against is not an error worth
      // stopping a seed for.
    }
  }

  // ── 7. Training, which is the thesis ────────────────────────────────
  //
  // BRD line 49: automate the commodity work so recruiters become human
  // capital developers — mentoring, coaching, upgrading consultants for
  // AI-era roles. That is a course and somebody enrolled on it, and there
  // were none of either.
  const school = ctx.firmBySlug.get('computer-systems')
  if (school) {
    const courses: { title: string; description: string; category: string; duration: number; isPublic: boolean }[] = [
      {
        title: 'Working with AI coding assistants', category: 'AI_UPSKILLING', duration: 12, isPublic: true,
        description: 'For consultants whose delivery work is changing. What to hand over, what to check, and how to say what you did.',
      },
      {
        title: 'S/4HANA migration: what actually changes', category: 'TECH', duration: 20, isPublic: false,
        description: 'For FICO consultants moving off ECC. Universal journal, new asset accounting, and the conversions that go wrong.',
      },
      {
        title: 'Client-site conduct and confidentiality', category: 'COMPLIANCE', duration: 2, isPublic: false,
        description: 'Annual. What you may take off site, what you may say about a client, and who to tell when something goes wrong.',
      },
    ]
    const made: { id: string; title: string }[] = []
    for (const c of courses) {
      const existing = await db.course.findFirst({ where: { companyId: school.id, title: c.title }, select: { id: true, title: true } })
      made.push(
        existing ??
          (await db.course.create({
            data: {
              companyId: school.id, title: c.title, description: c.description,
              category: c.category, duration: c.duration, price: null,
              isPublic: c.isPublic, createdAt: day(-120),
            },
            select: { id: true, title: true },
          }))
      )
    }
    const learners = consultants.slice(0, 6)
    const states: { status: string; enrolled: number; completed?: number; score?: number }[] = [
      { status: 'COMPLETED', enrolled: -90, completed: -70, score: 92 },
      { status: 'COMPLETED', enrolled: -88, completed: -62, score: 74 },
      { status: 'IN_PROGRESS', enrolled: -30 },
      { status: 'ENROLLED', enrolled: -6 },
      { status: 'DROPPED', enrolled: -75 },
      { status: 'IN_PROGRESS', enrolled: -21 },
    ]
    for (const [i, learner] of learners.entries()) {
      const course = made[i % made.length]
      const s = states[i]
      if (!course || !s) continue
      if (await db.enrollment.findFirst({ where: { courseId: course.id, personId: learner.personId } })) continue
      await db.enrollment.create({
        data: {
          courseId: course.id, personId: learner.personId, status: s.status,
          enrolledAt: day(s.enrolled),
          completedAt: s.completed == null ? null : day(s.completed),
          score: s.score ?? null,
          certificateUrl: s.score == null ? null : `/files/certificates/${course.id}-${learner.personId}.pdf`,
        },
      })
      out.enrollments++
    }
  }

  // ── 8. Rolling off ──────────────────────────────────────────────────
  //
  // The same rows `cron/rolloff-scan` writes, for the placements that end
  // inside its eight-week window — so the console opens on the work it
  // was built for rather than on nothing. Anything ending later is left
  // for the job itself to find.
  const ending = await db.sellContract.findMany({
    where: {
      state: 'IN_PROGRESS',
      endDate: { gte: day(0), lte: day(56) },
      rolloff: null,
      company: { slug: { startsWith: ctx.prefix } },
    },
    select: {
      id: true, personId: true, endDate: true,
      person: { select: { name: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
    },
    orderBy: { endDate: 'asc' },
  })
  for (const [i, c] of ending.entries()) {
    if (!c.endDate) continue
    await db.rolloffEvent.create({
      data: {
        sellContractId: c.id,
        triggeredAt: day(-3),
        endDate: c.endDate,
        notified: {
          vendor: { companyId: c.company.id, name: c.company.name, at: day(-3).toISOString() },
          client: { companyId: c.clientCompany.id, name: c.clientCompany.name, at: null },
          consultant: { personId: c.personId, name: c.person.name, at: null },
        } as never,
        checklist: {
          knowledgeTransfer: i === 0,
          accessRevoked: false,
          equipmentReturned: false,
          exitInterview: false,
          finalTimesheet: false,
        } as never,
      },
    })
    out.rolloffs++
  }

  return out
}
