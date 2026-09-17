import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { logBulkAccess } from '@/lib/access-log'
import { supplierCoverGate, standingOf, coverLabel, licenseGate, nameCredential, type HeldCredential } from '@/lib/document-stages'
import { credentialKeys, credentialDetail } from '@/lib/contract-clearance'
import { labelFor } from '@/lib/document-type'
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

  // Entitlement-checked: the caller is either this client, or a vendor
  // with a real placement there. An unverified ?clientCompanyId= is a 403.
  const { client: clientCompany, error: clientError } = await resolveClientCompany(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

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

  // Find active contractors and vendors at this end client
  // Uses endClientFilter to include contracts where the paying customer differs
  const activeContracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
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
  logBulkAccess(contractPersonIds, {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'COMPLIANCE_CHECK',
    reason: `Compliance view at ${clientCompany.name}`,
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

  for (const v of companyVerifications) {
    if (!v.companyId || !v.company) continue
    const existing = companyVerifMap.get(v.companyId)
    const isCover = v.type.startsWith('INSURANCE_')
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
  // No `requiredTypes` yet: nothing in the data model carries a client's
  // own list of mandatory cover, so the two defaults apply and a missing
  // certificate chases rather than blocks. Noted rather than invented.
  const coverByCompany = new Map<string, { outcome: string; says: string; fix: string | null }>()
  for (const [companyId, data] of companyVerifMap) {
    const rows = companyVerifications.filter(
      v => v.companyId === companyId && v.type.startsWith('INSURANCE_')
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
        clearPercentage: totalChecks > 0 ? Math.round((clear / totalChecks) * 100) : 100,
      },
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
