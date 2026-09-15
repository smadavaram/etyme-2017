import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { canJoin, buttonSays, type Side } from '@/lib/join-companies'

/**
 * GET  /api/suppliers/join — pairs that look like one firm twice
 * POST /api/suppliers/join — fold one into the other
 *
 * Two clients each list Cloudepa Systems. Neither knows the other did,
 * so there are two supplier records with the same domain. That is the
 * right default — a merge that happens silently at sign-in is how a firm
 * loses a year of history — but somebody has to be able to fix it.
 *
 * Proposed, never performed automatically, and the screen says what will
 * move before it moves.
 */

/**
 * The domain a record is really on.
 *
 * A shell carries none: `Company.domain` is globally unique and a pasted
 * address proves nothing, so it lives on the invitation until somebody
 * signs in and claims it. Both are read here, because the whole point of
 * this screen is the pair where one is claimed and one is not.
 */
async function domainsFor(ids: string[]): Promise<Map<string, string | null>> {
  const [companies, invites] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, domain: true } }),
    prisma.supplierInvite.findMany({
      where: { companyId: { in: ids }, domain: { not: null } },
      select: { companyId: true, domain: true },
    }),
  ])

  const out = new Map<string, string | null>()
  for (const c of companies) out.set(c.id, c.domain)
  for (const i of invites) if (!out.get(i.companyId)) out.set(i.companyId, i.domain)
  return out
}

async function sideOf(id: string, callerCompanyIds: Set<string>): Promise<Side | null> {
  const co = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, domain: true, claimedAt: true,
      listedBy: { select: { name: true } },
    },
  })
  if (!co) return null

  const [submissions, contracts, invites, people] = await Promise.all([
    prisma.submission.count({ where: { fromCompanyId: id } }),
    prisma.sellContract.count({ where: { companyId: id } }),
    prisma.requirementInvitation.count({ where: { toCompanyId: id } }),
    prisma.context.count({ where: { companyId: id, revokedAt: null } }),
  ])

  return {
    id: co.id,
    name: co.name,
    domain: co.domain,
    claimedAt: co.claimedAt,
    yours: callerCompanyIds.has(co.id),
    counts: { submissions, contracts, invites, people },
    listedBy: co.listedBy ? [co.listedBy.name] : [],
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Joining supplier records')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  // Only records this client has anything to do with. Somebody else's
  // duplicate suppliers are not this client's to tidy.
  const mine = await prisma.supplierInvite.findMany({
    where: { byId: companyId },
    select: { companyId: true, domain: true, company: { select: { name: true } } },
  })

  const byDomain = new Map<string, Set<string>>()
  for (const i of mine) {
    if (!i.domain) continue
    byDomain.set(i.domain, (byDomain.get(i.domain) ?? new Set()).add(i.companyId))
  }

  // The pair that matters most: a shell this client listed, and the real
  // firm somebody has already signed in to on the same domain.
  const domains = [...byDomain.keys()]
  const claimedElsewhere = domains.length
    ? await prisma.company.findMany({
        where: { domain: { in: domains }, claimedAt: { not: null } },
        select: { id: true, domain: true },
      })
    : []

  for (const c of claimedElsewhere) {
    if (c.domain) byDomain.get(c.domain)?.add(c.id)
  }

  const seats = await prisma.context.findMany({
    where: { personId: caller.person.id, revokedAt: null },
    select: { companyId: true },
  })
  const mySeats = new Set(seats.map((s) => s.companyId).filter((id): id is string => id != null))

  const pairs: any[] = []

  for (const [domain, ids] of byDomain) {
    const list = [...ids]
    if (list.length < 2) continue

    const sides = (await Promise.all(list.map((id) => sideOf(id, mySeats)))).filter(
      (s): s is Side => s != null
    )

    // Domains come from the invitation where the company has none, so
    // the rule sees the same evidence a person would.
    const known = await domainsFor(list)
    for (const s of sides) s.domain = s.domain ?? known.get(s.id) ?? null

    for (let i = 0; i < sides.length - 1; i++) {
      const v = canJoin(sides[i], sides[i + 1])
      pairs.push({
        domain,
        a: sides[i],
        b: sides[i + 1],
        ...v,
        button: buttonSays(v),
      })
    }
  }

  return NextResponse.json({
    data: {
      pairs,
      summary:
        pairs.length === 0
          ? 'No supplier appears twice on your list.'
          : `${pairs.length} ${pairs.length === 1 ? 'firm appears' : 'firms appear'} more than once.`,
    },
  })
}

/**
 * POST — fold one record into the other.
 *
 * Everything that names the folded company is repointed, and the record
 * itself is left in place rather than deleted: a company row with no
 * submissions and no seats is harmless, and deleting it would cascade
 * through history somebody may still need to read.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Joining supplier records')
  if (notStaff) return notStaff

  const body = await request.json().catch(() => ({}))
  const keepId = String(body?.keepId ?? '')
  const foldId = String(body?.foldId ?? '')

  const seats = await prisma.context.findMany({
    where: { personId: caller.person.id, revokedAt: null },
    select: { companyId: true },
  })
  const mySeats = new Set(seats.map((s) => s.companyId).filter((id): id is string => id != null))

  const [keep, fold] = await Promise.all([
    sideOf(keepId, mySeats),
    sideOf(foldId, mySeats),
  ])

  if (!keep || !fold) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'One of those records does not exist.' } },
      { status: 404 }
    )
  }

  const known = await domainsFor([keepId, foldId])
  keep.domain = keep.domain ?? known.get(keepId) ?? null
  fold.domain = fold.domain ?? known.get(foldId) ?? null

  const v = canJoin(keep, fold)

  // Re-checked here and not merely on the screen. A rule enforced only
  // in the browser is a rule.
  if (!v.ok || v.keep?.id !== keepId || v.fold?.id !== foldId) {
    return NextResponse.json(
      { error: { code: 'CANNOT_JOIN', message: v.says } },
      { status: 409 }
    )
  }

  const moved = await prisma.$transaction([
    prisma.submission.updateMany({ where: { fromCompanyId: foldId }, data: { fromCompanyId: keepId } }),
    prisma.sellContract.updateMany({ where: { companyId: foldId }, data: { companyId: keepId } }),
    prisma.requirementInvitation.updateMany({
      where: { toCompanyId: foldId },
      data: { toCompanyId: keepId },
    }),
    prisma.masterAgreement.updateMany({ where: { vendorId: foldId }, data: { vendorId: keepId } }),
    prisma.benchListing.updateMany({ where: { companyId: foldId }, data: { companyId: keepId } }),
    prisma.supplierInvite.updateMany({ where: { companyId: foldId }, data: { companyId: keepId } }),
    // Left in place rather than deleted. An empty company row is
    // harmless; deleting it cascades through history somebody may still
    // need to read.
    prisma.company.update({
      where: { id: foldId },
      data: { name: `${fold.name} (joined into ${keep.name})` },
    }),
  ])

  return NextResponse.json({
    data: {
      keptId: keepId,
      says: `${fold.name} folded into ${keep.name}. ${v.moving.join(', ')} moved.`,
      moved: {
        submissions: moved[0].count,
        contracts: moved[1].count,
        invitations: moved[2].count,
        agreements: moved[3].count,
      },
    },
  })
}
