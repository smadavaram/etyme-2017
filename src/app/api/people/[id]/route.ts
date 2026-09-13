import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { endClientFilter } from '@/lib/resolve-end-client'
import { chainTop } from '@/lib/chain-top'
import { daysOnSite, monthsOf } from '@/lib/tenure-days'
import { logAccess } from '@/lib/access-log'

/**
 * GET /api/people/[id] — one person, as this client knows them
 *
 * Everything the register holds on one human, on one page: where they
 * are today, their time here across every supplier against the cap,
 * every submission and what each firm asked for them, the interviews,
 * the paperwork, and who can put them forward. Only for somebody who
 * has been put in front of this company — and the read leaves a trail.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The register')
  if (notStaff) return notStaff
  const companyId = caller.company!.id
  const now = new Date()

  const [subs, everyRung] = await Promise.all([
    prisma.submission.findMany({
      where: { toCompanyId: companyId, personId: id },
      select: {
        id: true, rate: true, submittedAt: true, status: true, screenState: true, requirementId: true,
        fromCompany: { select: { id: true, name: true } },
        requirement: { select: { title: true } },
        interviews: { select: { id: true, round: true, state: true, scheduledAt: true }, orderBy: { round: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.sellContract.findMany({
      where: { ...endClientFilter(companyId), personId: id, state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED', 'DRAFT', 'VERIFIED', 'PENDING_VERIFICATION'] } },
      select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, startDate: true, endDate: true, billRate: true, company: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
    }),
  ])

  if (subs.length === 0 && everyRung.length === 0) {
    logAccess({ subjectId: id, actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'PROFILE_VIEW', allowed: false, reason: 'Not on this company’s register' })
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That person has not been put in front of you, so there is nothing here to read.' } }, { status: 404 })
  }
  logAccess({ subjectId: id, actorPersonId: caller.person.id, actorCompanyId: companyId, action: 'PROFILE_VIEW', reason: `Register at ${caller.company!.name}` })

  const [person, profile, favorite, block, tenureRule, breakRule, papers, listings] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } }),
    prisma.consultantProfile.findUnique({ where: { personId: id }, select: { id: true, headline: true, skills: true, location: true, workAuth: true } }),
    prisma.favorite.findFirst({ where: { companyId, targetType: 'PERSON', targetId: id }, select: { id: true } }),
    prisma.blacklist.findFirst({ where: { companyId, targetType: 'PERSON', targetId: id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { reason: true, blockedAt: true } }),
    prisma.governanceRule.findFirst({ where: { policy: { companyId, isActive: true }, ruleType: 'TENURE_CAP', isActive: true }, select: { parameters: true } }),
    prisma.governanceRule.findFirst({ where: { policy: { companyId, isActive: true }, ruleType: 'BREAK_IN_SERVICE', isActive: true }, select: { parameters: true } }),
    prisma.verification.findMany({ where: { personId: id }, select: { type: true, status: true, expiresAt: true, verifiedAt: true }, orderBy: { type: 'asc' } }),
    prisma.benchListing.findMany({ where: { consultant: { personId: id }, state: 'GRANTED' }, select: { company: { select: { id: true, name: true } } } }),
  ])

  // ── Time here, across every supplier, against the cap ──────────────
  const served = everyRung.filter((c) => ['IN_PROGRESS', 'ENDED', 'PAUSED'].includes(c.state))
  const days = daysOnSite(served, now)
  const months = monthsOf(days)
  const capMonths: number | null = (tenureRule?.parameters as any)?.maxMonths ?? null
  const breakDays: number | null = (breakRule?.parameters as any)?.breakDays ?? null
  const onSite = served.some((c) => c.state === 'IN_PROGRESS')
  const lastEnd = served.filter((c) => c.endDate && c.endDate <= now).map((c) => c.endDate!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  let status: 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE' = 'OK'
  let eligibleDate: string | null = null
  if (capMonths) {
    const pct = months / capMonths
    if (pct < 0.75) status = 'OK'
    else if (pct < 1) status = 'WARNING'
    else if (onSite) status = 'BREAK_REQUIRED'
    else if (breakDays && lastEnd) {
      const since = Math.ceil((now.getTime() - lastEnd.getTime()) / 86_400_000)
      if (since < breakDays) { status = 'IN_BREAK'; eligibleDate = new Date(lastEnd.getTime() + breakDays * 86_400_000).toISOString().slice(0, 10) }
      else status = 'ELIGIBLE'
    } else status = 'ELIGIBLE'
  }

  // ── The contracts this client pays, one per engagement ─────────────
  const engagements = chainTop(everyRung).map((c) => ({
    contractId: c.id, supplier: c.company, state: c.state,
    startDate: c.startDate.toISOString(), endDate: c.endDate?.toISOString() ?? null,
    rateCents: c.clientCompanyId === companyId ? c.billRate : null,
  }))

  const rates = subs.map((s) => s.rate).filter((r): r is number => r != null)
  const submissions = subs.map((s) => ({
    id: s.id, supplier: s.fromCompany, role: s.requirement.title, requirementId: s.requirementId,
    rateCents: s.rate, at: s.submittedAt.toISOString(), status: s.status,
    cleared: s.screenState === 'READY' ? true : s.screenState === 'NEEDS_FIX' ? false : null,
    interviews: s.interviews.map((i) => ({ id: i.id, round: i.round, state: i.state, at: i.scheduledAt?.toISOString() ?? null })),
  }))

  // Who can put them forward: a firm holding their consent on its bench,
  // else whoever last submitted them here.
  const represented = new Map<string, { id: string; name: string; how: 'bench' | 'submitted' }>()
  for (const l of listings) represented.set(l.company.id, { ...l.company, how: 'bench' })
  for (const s of subs) if (!represented.has(s.fromCompany.id)) represented.set(s.fromCompany.id, { ...s.fromCompany, how: 'submitted' })

  // The roles they could be asked for: published, and not one they are
  // already on — that one is read in Submissions.
  const published = await prisma.requirement.findMany({
    where: { status: 'OPEN', OR: [{ companyId }, { msa: { clientId: companyId } }] },
    select: { id: true, title: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  // The asks this company made for them, newest first, each a link
  // back to the thread it sits on.
  const askRows = await prisma.message.findMany({
    where: { type: 'ASK', conversation: { companyId }, metadata: { path: ['personId'], equals: id } },
    select: { id: true, createdAt: true, metadata: true, conversationId: true, authorId: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const askers = await prisma.person.findMany({ where: { id: { in: [...new Set(askRows.map((m) => m.authorId))] } }, select: { id: true, name: true } })
  const askerName = new Map(askers.map((a) => [a.id, a.name]))
  const asks = askRows.map((m) => {
    const md = (m.metadata ?? {}) as Record<string, string>
    return { id: m.id, at: m.createdAt.toISOString(), by: askerName.get(m.authorId) ?? 'somebody', supplier: md.supplierName ?? '', role: md.roleTitle ?? '', requirementId: md.requirementId ?? null, conversationId: m.conversationId }
  })

  const on = new Set(subs.map((s) => s.requirementId))
  const openRequirements = published.filter((r) => !on.has(r.id))
  const alreadyOn = published.filter((r) => on.has(r.id)).map((r) => r.title)

  const supplierWord = represented.size === 0 ? 'no supplier can put them forward yet' : `${[...represented.values()].map((r) => r.name).join(' and ')} can put them forward`
  const says = block
    ? `${person.name} is blocked here: ${block.reason}`
    : onSite
      ? `${person.name} is on site now, ${months} months into a ${capMonths ? `${capMonths}-month` : ''} cap across every supplier.`
      : status === 'IN_BREAK'
        ? `${person.name} is in a break in service and can come back on ${eligibleDate}.`
        : `${person.name} is not on site. ${months > 0 ? `${months} months here before, across every supplier; ` : ''}${supplierWord}.`

  return NextResponse.json({
    data: {
      person: { id: person.id, name: person.name, headline: profile?.headline ?? null, skills: profile?.skills ?? [], location: profile?.location ?? null, workAuth: profile?.workAuth ?? null },
      favorite: favorite != null,
      blocked: block ? { reason: block.reason, at: block.blockedAt.toISOString() } : null,
      onSite,
      says,
      tenure: { months, capMonths, headroomMonths: capMonths ? Math.max(0, capMonths - months) : null, status, eligibleDate },
      engagements,
      submissions,
      spread: rates.length >= 2 ? { lowCents: Math.min(...rates), highCents: Math.max(...rates) } : null,
      paperwork: papers.map((p) => ({ type: p.type, status: p.status, expiresAt: p.expiresAt?.toISOString() ?? null, verifiedAt: p.verifiedAt?.toISOString() ?? null })),
      representedBy: [...represented.values()],
      openRequirements,
      alreadyOn,
      asks,
    },
  })
}
