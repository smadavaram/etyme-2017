import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { seatUnits } from '@/lib/account-walls'
import { seatTrail } from '@/lib/program-seat'
import { seatMayRead, seatScope } from '@/lib/walls'
import { logBulkAccess } from '@/lib/access-log'
import { supplierCoverGate, standingOf, coverLabel, licenseGate, nameCredential, COVER_THAT_STOPS_WORK, type HeldCredential } from '@/lib/document-stages'
import { credentialKeys, credentialDetail } from '@/lib/contract-clearance'
import { labelFor } from '@/lib/document-type'
import { requirementsFor } from '@/lib/document-requirements'
import {
  outstandingItems,
  heldFromDocInstances,
  humanKey,
  type HeldKeyRecord,
  type OutstandingItem,
} from '@/lib/document-request'
// etyme-architect, 2026-09-17. A cross-domain edit in etyme-regulatory's
// file, on the precedent of c126c1c4 and f901e914: a sub-vendor's name is
// the prime's to keep unless the client's agreement with the prime says
// otherwise, and one rule landing in three routes at once is a rule, not
// three changes. Nothing else in this file was touched — the standing of
// every firm travels exactly as it did, because that exposure is the
// client's own and no NDA moves it.
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'

/**
 * GET /api/compliance
 *
 * Client governance compliance overview — Addendum E §E.6.
 *
 * Surfaces:
 * - Active governance policies and rules (BLOCK vs WARN)
 * - Recent governance evaluations with outcomes
 * - Verification status for contractors and vendors
 * - Compliance health score
 *
 * "Every cleared requisition records the basis on which it cleared.
 *  An auto-cleared requisition is not an unreviewed one — it is one
 *  where the review was executed by rule and recorded."
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl

  // Entitlement-checked: the caller is either this client, a program
  // office in a seat the client granted, or a vendor with a real
  // placement there. An unverified ?clientCompanyId= is a 403.
  const { client: clientCompany, seat, error: clientError } = await resolveClientCompany(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  // ── What a seated office may read here ──────────────────────────────
  //
  // This page is the client's own rules and who is failing them, which
  // is `governance.read` at a CLIENT — the program manager, the
  // approvers, HR, procurement and the compliance officer all hold it,
  // and the AP clerk does not. Asked against the seat's role, so what
  // the office may read is exactly what the desk the client chose may
  // read, and narrows the day the client narrows it.
  if (seat) {
    const verdict = seatMayRead(seat, 'governance.read', 'the compliance page')
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: verdict.says } },
        { status: 403 }
      )
    }
  }

  // A seat narrowed to one business unit reaches that unit and
  // everything under it. Null for every reader who is not in a narrowed
  // seat, which is every reader there was before.
  const units = await seatUnits(seat ?? null)

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Active governance policies with rules
  const policies = await prisma.governancePolicy.findMany({
    where: { companyId: clientCompany.id, isActive: true },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: { ruleType: 'asc' },
      },
    },
  })

  // Get evaluation counts per rule
  const ruleIds = policies.flatMap(p => p.rules.map(r => r.id))
  const evalCounts = await prisma.governanceEvaluation.groupBy({
    by: ['ruleId'],
    where: { ruleId: { in: ruleIds } },
    _count: true,
  })
  const evalCountMap = new Map(evalCounts.map(ec => [ec.ruleId, ec._count]))

  // Recent evaluations (last 90 days)
  const evaluations = await prisma.governanceEvaluation.findMany({
    where: {
      rule: { policy: { companyId: clientCompany.id } },
      evaluatedAt: { gte: ninetyDaysAgo },
    },
    include: {
      rule: {
        select: { ruleType: true, enforcementMode: true, description: true },
      },
    },
    orderBy: { evaluatedAt: 'desc' },
  })

  // ── Every placement this company is answerable for ─────────────────
  //
  // Two halves, and until 2026-09-21 only the first was asked.
  //
  //   the ones at its own sites  — `endClientFilter`: whoever is working
  //   here, through however many rungs. This is a client's whole answer
  //   and it was written as if a client were the only reader.
  //
  //   the ones it pays for       — `clientCompanyId`: the firms below it
  //   on a chain and the people they have here.
  //
  // The second half is what a prime's own page is. Until demand's F6 fix
  // a supplier calling this route with no `?clientCompanyId=` resolved
  // to somebody else's company; now it resolves to its own, and its own
  // page came back nearly empty — `endClientFilter(Computer Systems)`
  // asks "who works at Computer Systems' site", and CloudEPA's people
  // work at Auralis's. The one thing a prime genuinely needs from a
  // compliance page — is my sub-vendor's cover current, and are the
  // people it has on my client's site cleared — was the one thing it
  // could not read. `__integration__/full-spine.test.ts` named the gap
  // rather than papering over it.
  //
  // Deliberately NOT a third half. A supplier's own sell contracts —
  // the people it has placed — are not added here, because those rows
  // carry its customers' names and this page is about the firms and the
  // people a company is answerable for, not about its book of business.
  // A vendor at the bottom of a chain, which buys from nobody, still
  // reads an empty page, and that is the honest answer rather than a
  // list of its own clients wearing a compliance heading.
  //
  // `endClientFilter`'s second branch — clientCompanyId AND a null end
  // client — is subsumed by the second clause below, so the union is
  // two terms rather than three.
  //
  // Spelled inside the `where` rather than lifted into a named object,
  // and that is not a style choice: `__tests__/invariants/
  // client-facing-names.test.ts` reads every query in `src/` looking for
  // the ones scoped to a client's whole site, because those are the ones
  // that must ask `lib/chain-names` whose name they may print. It finds
  // them by seeing `endClientFilter(` inside the read. Hiding this one
  // behind a variable took the compliance page off that sweep — the page
  // still read every rung, and the check that says so went quiet, which
  // is the worse of the two failures.
  const activeContracts = await prisma.sellContract.findMany({
    where: {
      OR: [
        ...endClientFilter(clientCompany.id).OR,
        { clientCompanyId: clientCompany.id },
      ],
      ...seatScope(units),
      state: { in: ['IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION', 'VERIFIED'] },
    },
    select: {
      id: true,
      personId: true,
      companyId: true,
      person: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
    },
  })

  const contractPersonIds = [...new Set(activeContracts.map(c => c.personId))]
  const vendorCompanyIds = [...new Set(activeContracts.map(c => c.companyId))]

  // ── Whose name this reader may read ─────────────────────────────────
  //
  // Every rung of a chain names the client as the site the work happens
  // at, so "every firm with somebody on site" returned the prime's
  // sub-vendor too — a firm the client has no contract with and was never
  // told about. The standing stays; the name is the prime's to keep.
  //
  // Only the client's own seats are masked. A supplier reading this page
  // about a client it places at is looking at its own supply chain, and
  // the term this reads is the client's agreement, not theirs.
  const viewerIsClient = caller.company?.id === clientCompany.id
  const disclosureTerms = viewerIsClient
    ? await prisma.masterAgreement.findMany({
        where: { clientId: clientCompany.id },
        select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
      })
    : []

  const seenNames = viewerIsClient
    ? namesForClient(
        activeContracts.map(c => ({
          id: c.id,
          personId: c.personId,
          companyId: c.companyId,
          companyName: c.company.name,
          clientCompanyId: c.clientCompany.id,
        })),
        clientCompany.id,
        (primeCompanyId: string) =>
          mayNameSubVendors(disclosureTerms, clientCompany.id, primeCompanyId)
      )
    : new Map<string, SeenName>()

  /** What this reader may call a firm on a row. */
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId,
      name: trueName,
      masked: false,
      through: null,
      phrase: trueName,
      says: trueName,
    }

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  //
  // Under a seat the row names the seat: which firm read this, at which
  // of the client's own desks, granted by whom. `Compliance view at
  // Cavanaugh Glassworks` was true and named nobody.
  logBulkAccess(contractPersonIds, {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: seat ? 'PROGRAM_READ' : 'COMPLIANCE_CHECK',
    reason: seat
      ? seatTrail(seat, 'Compliance page read')
      : `Compliance view at ${clientCompany.name}`,
  })

  // Person-level verifications
  const personVerifications = contractPersonIds.length > 0
    ? await prisma.verification.findMany({
        where: { personId: { in: contractPersonIds } },
        include: { person: { select: { id: true, name: true } } },
        orderBy: { type: 'asc' },
      })
    : []

  // Company-level verifications (vendor insurance etc.)
  const companyVerifications = vendorCompanyIds.length > 0
    ? await prisma.verification.findMany({
        where: { companyId: { in: vendorCompanyIds } },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { type: 'asc' },
      })
    : []

  // Group verifications by person
  //
  // A license carries its computed standing, for the same reason every
  // certificate below does: a stored status is a claim about a past
  // moment and standing is what is true today. The 2017 build showed the
  // stored one, so a registration that lapsed in March still read CLEAR
  // in July. Where the two disagree the computed one is what the screen
  // shows, and the screen says which.
  const practiceKeys = credentialKeys()
  const personVerifMap = new Map<string, { name: string; checks: any[]; license: any | null }>()
  for (const v of personVerifications) {
    if (!v.personId || !v.person) continue
    const existing = personVerifMap.get(v.personId)
    const detail = credentialDetail(v as any)
    const isLicense = practiceKeys.includes(v.type)
    const named = isLicense
      ? nameCredential({ label: labelFor(v.type), type: v.type, number: detail.number, state: detail.state })
      : null
    const computed = isLicense
      ? standingOf(
          { key: v.type, label: named!, issuedAt: v.issuedAt, validFrom: v.validFrom, expiresAt: v.expiresAt, verifiedAt: v.verifiedAt },
          // No month count and it expires anyway: a license with no date
          // against it is the fourth state, not a permanent one.
          { key: v.type, label: named!, validMonths: null, expires: true },
          now
        )
      : null
    const check = {
      type: v.type,
      status: v.status,
      provider: v.provider,
      issuedAt: v.issuedAt?.toISOString() ?? null,
      // When it starts counting, not only when it stops. A document filed
      // ahead of the day its cover begins is on file and holds nothing.
      validFrom: (v.validFrom ?? v.issuedAt)?.toISOString() ?? null,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      named,
      licenseState: detail.state,
      licenseNumber: detail.number,
      standing: computed?.standing ?? null,
      says: computed?.says ?? null,
      // True where a lapse here stops the work rather than starting a
      // conversation about it.
      stopsWork: isLicense,
    }
    if (existing) {
      existing.checks.push(check)
    } else {
      personVerifMap.set(v.personId, { name: v.person.name, checks: [check], license: null })
    }
  }

  // Whether each person may practice today — the same function the
  // activation refusal calls, so the desk that reads the screen and the
  // button that refuses the start cannot drift apart.
  for (const [personId, data] of personVerifMap) {
    const theirs = personVerifications.filter((v) => v.personId === personId && practiceKeys.includes(v.type))
    if (theirs.length === 0) continue
    data.license = licenseGate({
      personName: data.name,
      credentials: theirs.map((v): HeldCredential => {
        const detail = credentialDetail(v as any)
        return {
          type: v.type,
          label: labelFor(v.type),
          status: v.status,
          issuedAt: v.issuedAt,
          validFrom: v.validFrom,
          expiresAt: v.expiresAt,
          verifiedAt: v.verifiedAt,
          number: detail.number,
          state: detail.state,
          issuer: v.provider,
        }
      }),
      keys: practiceKeys,
      on: now,
    })
  }

  // Group verifications by company
  //
  // A stored status is a claim about a past moment; standing is what is
  // true today. The 2017 build showed the stored one, so a certificate
  // that lapsed in March still read green in July because nothing swept
  // the column. Every certificate here carries its computed standing
  // alongside the status, and where the two disagree the computed one is
  // what the screen shows.
  const companyVerifMap = new Map<string, { name: string; checks: any[] }>()

  // Every vendor with somebody on site, whether or not they have ever
  // filed a certificate. Building this map from the verification rows
  // alone meant a vendor who had given us nothing did not appear at all —
  // so the one supplier with no insurance on file was the one supplier
  // the compliance screen never mentioned.
  for (const c of activeContracts) {
    if (!companyVerifMap.has(c.companyId)) {
      companyVerifMap.set(c.companyId, { name: c.company.name, checks: [] })
    }
  }

  // The firm's standing, which is its cover AND its standing to trade.
  // Until 2026-09-21 this said `startsWith('INSURANCE_')`, so a supplier
  // whose certificate of good standing had lapsed — the state that
  // registered it saying it may not contract there — showed a green
  // compliance row, because the one document beside insurance in
  // CLAUDE.md's own table was the one this page never looked at.
  const firmStanding = (type: string): boolean =>
    type.startsWith('INSURANCE_') || (COVER_THAT_STOPS_WORK as readonly string[]).includes(type)

  for (const v of companyVerifications) {
    if (!v.companyId || !v.company) continue
    const existing = companyVerifMap.get(v.companyId)
    const isCover = firmStanding(v.type)
    const computed = isCover
      ? standingOf(
          { key: v.type, label: coverLabel(v.type), issuedAt: v.issuedAt, validFrom: v.validFrom, expiresAt: v.expiresAt, verifiedAt: v.verifiedAt },
          { key: v.type, label: coverLabel(v.type), validMonths: 12 },
          now
        )
      : null
    const check = {
      type: v.type,
      status: v.status,
      provider: v.provider,
      issuedAt: v.issuedAt?.toISOString() ?? null,
      validFrom: (v.validFrom ?? v.issuedAt)?.toISOString() ?? null,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      standing: computed?.standing ?? null,
      says: computed?.says ?? null,
    }
    if (existing) {
      existing.checks.push(check)
    } else {
      companyVerifMap.set(v.companyId, { name: v.company.name, checks: [check] })
    }
  }

  // Whether each supplier could put anybody forward today.
  //
  // The same function the submission path calls, so the screen and the
  // refusal cannot drift apart — a compliance page that says one thing
  // while the submit button says another is worse than no page.
  //
  // No `requiredTypes` here on purpose, even though a line's own set can
  // now carry one. This page is a firm-level answer — one row per
  // supplier, not one per placement — and a client's orders may require
  // different cover of the same firm on different lines. Reading one
  // line's set onto the firm's row would print a requirement the other
  // lines never made. What this row does say, since 2026-09-21, is
  // whether the standing the firm HAS is in date, good standing
  // included: a lapse is a fact about the firm and needs nobody's order
  // to be true.
  const coverByCompany = new Map<string, { outcome: string; says: string; fix: string | null }>()
  for (const [companyId, data] of companyVerifMap) {
    const rows = companyVerifications.filter(
      v => v.companyId === companyId && firmStanding(v.type)
    )
    const gate = supplierCoverGate({
      // The sentence a client reads about a lapse names the firm it can
      // call about it, not a firm it has never heard of.
      supplierName: shown(companyId, data.name).phrase,
      clientName: clientCompany.name,
      certificates: rows.map(v => ({
        type: v.type,
        status: v.status,
        issuedAt: v.issuedAt,
        // The floor. Without it this page called a policy beginning in
        // October current in September, while activation refused the same
        // certificate — one screen contradicting another about the law.
        validFrom: v.validFrom,
        expiresAt: v.expiresAt,
        verifiedAt: v.verifiedAt,
      })),
      on: now,
    })
    coverByCompany.set(companyId, { outcome: gate.outcome, says: gate.says, fix: gate.fix })
  }

  // What this firm owes, on the lines it is paid on.
  const owes = await whatThisFirmOwes(clientCompany.id, now)

  // Compute compliance health
  const allVerifications = [...personVerifications, ...companyVerifications]
  const totalChecks = allVerifications.length
  const clear = allVerifications.filter(v => v.status === 'CLEAR').length
  const pending = allVerifications.filter(v => v.status === 'PENDING' || v.status === 'IN_PROGRESS').length
  const flagged = allVerifications.filter(v => v.status === 'FLAGGED' || v.status === 'FAILED' || v.status === 'CONDITIONAL').length
  const expired = allVerifications.filter(v => v.status === 'EXPIRED').length

  // Evaluation summary
  const evalTotal = evaluations.length
  const evalPass = evaluations.filter(e => e.outcome === 'PASS').length
  const evalWarn = evaluations.filter(e => e.outcome === 'WARN').length
  const evalBlock = evaluations.filter(e => e.outcome === 'BLOCK').length
  const evalOverridden = evaluations.filter(e => e.overriddenBy !== null).length

  return NextResponse.json({
    data: {
      client: { id: clientCompany.id, name: clientCompany.name },
      policies: policies.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        rules: p.rules.map(r => ({
          id: r.id,
          ruleType: r.ruleType,
          enforcementMode: r.enforcementMode,
          description: r.description,
          parameters: r.parameters,
          evaluationCount: evalCountMap.get(r.id) ?? 0,
        })),
      })),
      recentEvaluations: evaluations.map(e => ({
        id: e.id,
        ruleType: e.rule.ruleType,
        enforcementMode: e.rule.enforcementMode,
        ruleDescription: e.rule.description,
        triggerPoint: e.triggerPoint,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        outcome: e.outcome,
        reason: e.reason,
        overriddenBy: e.overriddenBy,
        overrideNote: e.overrideNote,
        evaluatedAt: e.evaluatedAt.toISOString(),
      })),
      verifications: {
        persons: Array.from(personVerifMap.entries()).map(([personId, data]) => ({
          personId,
          name: data.name,
          checks: data.checks,
          // Whether this person may practice today, in a sentence. Null
          // where they hold no license at all, which is most people and
          // is a real answer rather than a gap.
          license: data.license,
        })),
        // ── Not folded, and that is deliberate ──
        //
        // `firmsOnARow` folds a withheld sub-vendor into the prime it
        // comes through, because a list of firms beside one person read
        // "Computer Systems, Supplied through Computer Systems" — one
        // firm apparently entered twice. This list is not that list: it
        // is one row per firm, each carrying its own cover verdict and
        // its own standing. Folding two rows into one would take a
        // sub-vendor's lapsed insurance off the page, and the standing
        // of whoever employs somebody on this client's site is the
        // client's own exposure — the name is withheld, never the
        // standing. A person's firms are folded on the tenure ledger,
        // where the cell is a list of names and nothing else.
        companies: Array.from(companyVerifMap.entries()).map(([companyId, data]) => ({
          companyId,
          name: shown(companyId, data.name).name,
          /** True where the name above is who it comes through, not the firm. */
          nameWithheld: shown(companyId, data.name).masked,
          suppliedThrough: shown(companyId, data.name).through,
          checks: data.checks,
          // BLOCK here means this supplier cannot submit anybody today.
          cover: coverByCompany.get(companyId) ?? null,
        })),
      },
      // Suppliers who cannot put anybody forward right now. Lifted out of
      // the list because a lapse buried in a table of forty vendors is a
      // lapse nobody sees.
      lapsed: Array.from(companyVerifMap.entries())
        .map(([companyId, data]) => ({
          companyId,
          name: shown(companyId, data.name).name,
          nameWithheld: shown(companyId, data.name).masked,
          suppliedThrough: shown(companyId, data.name).through,
          ...coverByCompany.get(companyId)!,
        }))
        .filter(c => c.outcome === 'BLOCK'),
      health: {
        totalChecks,
        clear,
        pending,
        flagged,
        expired,
        // ── A rate over no checks is not a hundred percent ──
        //
        // Wrenfield Technical opened its own compliance page on
        // 2026-09-21 and read CLEAR RATE 100% over TOTAL CHECKS 0, while
        // owing its customer an agreement and its contractor an
        // induction. A percentage of an empty set is not good news, it
        // is the absence of news, and the page that most invites a false
        // green is the one that had one. Null, and the screen says
        // "nothing on file".
        clearPercentage: totalChecks > 0 ? Math.round((clear / totalChecks) * 100) : null,
      },
      // What this firm owes on the lines it is paid on, read through the
      // one door — so a supplier's own page and its customer's dashboard
      // name the same documents.
      owes,
      evaluationSummary: {
        total: evalTotal,
        pass: evalPass,
        warn: evalWarn,
        block: evalBlock,
        overridden: evalOverridden,
      },
    },
  })
}

// ── What this firm owes ───────────────────────────────────────────────
//
// Found by a release walk on 2026-09-21. Wrenfield Technical's own
// compliance page read "CLEAR RATE 100% · TOTAL CHECKS 0 · No governance
// policies configured" while Cavanaugh Glassworks' dashboard said
// Wrenfield owed it a master agreement and Wrenfield's contractor owed a
// hot floor induction. Nothing was wrong with either number; the page
// was answering a different question from the one its reader had.
//
// A firm's own compliance page answers the reader's question: what is
// outstanding on the lines I am paid on. Read through
// `lib/document-requirements`, the same door the refusal at activation
// reads, so the list here and the block there are the same items.

/** One thing this firm owes, and to whom. */
interface Owed {
  /** The line it is outstanding on, so the reader can open its set. */
  lineId: string
  key: string
  label: string
  /** WORKER · SUPPLIER · CUSTOMER · US. */
  owedBy: string
  /** The firm or person that owes it, where the line names one. */
  owedByName: string | null
  /** The customer who asked, where the line names one. */
  toName: string | null
  /** The person the line is for, where it is for one. */
  aboutName: string | null
  stopsWork: boolean
  state: string
  word: string
  asked: string
  waivedSays: string | null
}

/** A check that actually came back. Anything still running holds nothing. */
const CAME_BACK = ['CLEAR', 'CONDITIONAL']

async function whatThisFirmOwes(companyId: string, on: Date): Promise<Owed[]> {
  // The lines this firm bills from. A buy line's supplier items are what
  // somebody owes THIS firm, which is the suppliers table above, not this
  // list — the reader is asking what is outstanding on them.
  const lines = await prisma.sellContract.findMany({
    where: { companyId, state: { notIn: ['ENDED', 'CANCELLED'] } },
    select: {
      id: true,
      personId: true,
      person: { select: { name: true } },
      clientCompanyId: true,
      clientCompany: { select: { name: true } },
    },
    take: 60,
  })
  if (lines.length === 0) return []

  const personIds = [...new Set(lines.map((l) => l.personId).filter((v): v is string => !!v))]
  const clientIds = [...new Set(lines.map((l) => l.clientCompanyId).filter((v): v is string => !!v))]

  const [checks, papers, agreements] = await Promise.all([
    prisma.verification.findMany({
      where: {
        OR: [
          { companyId },
          ...(personIds.length ? [{ personId: { in: personIds } }] : []),
        ],
      },
      select: {
        type: true, status: true, personId: true, companyId: true,
        issuedAt: true, validFrom: true, expiresAt: true,
      },
    }),
    prisma.docInstance.findMany({
      where: { sellContractId: { in: lines.map((l) => l.id) } },
      select: {
        id: true, status: true, validFrom: true, expiresAt: true, signedAt: true,
        countersignedAt: true, sellContractId: true, template: { select: { name: true } },
      },
    }),
    clientIds.length
      ? prisma.masterAgreement.findMany({
          where: { vendorId: companyId, clientId: { in: clientIds } },
          select: { clientId: true, status: true, effectiveDate: true, signedAt: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ])

  const asHeld = (v: (typeof checks)[number]): HeldKeyRecord => ({
    key: v.type,
    validFrom: v.validFrom ?? v.issuedAt ?? null,
    expiresAt: v.expiresAt ?? null,
    accepted: CAME_BACK.includes(v.status),
  })
  const firmHeld = checks.filter((v) => v.companyId === companyId && !v.personId).map(asHeld)

  const out: Owed[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const set = await requirementsFor({ sellContractId: line.id })
    if (!set) continue

    const held: HeldKeyRecord[] = [
      ...firmHeld,
      ...checks.filter((v) => v.personId && v.personId === line.personId).map(asHeld),
      ...heldFromDocInstances(
        papers.filter((d) => d.sellContractId === line.id),
        set.items.map((i) => ({ key: i.key, label: i.label }))
      ),
      // An MSA is its own row with its own term, never a `DocInstance`,
      // so a set that asks for one is answered from there rather than
      // reported missing forever.
      ...agreements
        .filter((a) => a.clientId === line.clientCompanyId && ['ACTIVE', 'EXPIRING'].includes(a.status))
        .map((a) => ({
          key: 'MSA',
          validFrom: a.effectiveDate ?? a.signedAt ?? null,
          expiresAt: a.expiresAt ?? null,
          accepted: true,
        })),
    ]

    const items: OutstandingItem[] = outstandingItems({
      items: set.items,
      held,
      // On a sell line SUPPLIER and US are both this firm, and WORKER is
      // the person it placed. The customer's own paperwork is on the
      // same set and is not this firm's to chase.
      owedBy: ['SUPPLIER', 'US', 'WORKER'],
      on,
    })

    for (const item of items) {
      // One document per customer per person. Six consultants at one
      // client wanting one agreement is one row, not six.
      const id = `${item.key}:${line.clientCompanyId ?? ''}:${item.owedBy === 'WORKER' ? (line.personId ?? '') : ''}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        lineId: line.id,
        key: item.key,
        label: item.label === item.key ? humanKey(item.key) : item.label,
        owedBy: item.owedBy,
        owedByName: item.owedByName,
        toName: line.clientCompany?.name ?? null,
        aboutName: item.owedBy === 'WORKER' ? (line.person?.name ?? null) : null,
        stopsWork: item.stopsWork,
        state: item.state,
        word: item.word,
        asked: item.asked,
        waivedSays: item.waivedSays,
      })
    }
  }

  return out.sort(
    (a, b) => Number(b.stopsWork) - Number(a.stopsWork) || a.label.localeCompare(b.label)
  )
}
