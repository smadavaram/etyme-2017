import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { mayReadCut } from '@/lib/money/profit-cut'
import { marginReachFor, sellLinesInReach } from '@/lib/money/margin-reach'
import { pluginGate } from '@/lib/plugin-gate'
import { podReadRefusal, podWriteRefusal, logPodReads, podStaffOnly } from '@/lib/pods/caller'
import { eligiblePeople, readOffers, readPods, readProjects } from '@/lib/pods/read'
import { dealingsWithSides } from '@/app/api/companies/dealings'
import { PRICINGS, isHeadcount, pricingRule, teamCreatedSays } from '@/lib/pods'

/**
 * GET  /api/pods   the firm's project teams, their roles and members, and who may be put on one
 * POST /api/pods   { name, description?, pricing, sprintPriceCents?, sprintWeeks?, roles?: [{ title, headcount?, rateCents? }] }
 *
 * A plugin (record 120): while it is off every verb refuses in one sentence.
 * "Pod" is the machine name; the screen says team.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = podStaffOnly(caller)
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const companyId = caller.company!.id

  // A seat that reads margin and not jobs (Finance) opens the page over the projects only:
  // no team, no member, no client name, and only the projects its reach covers.
  if (!hasPermission(caller.permissions, 'requirements.read')) {
    const mayMargin = hasPermission(caller.permissions, 'margin.read') || hasPermission(caller.permissions, 'pnl.read')
    const refusedHere = mayMargin ? null : await podReadRefusal(caller, request.nextUrl.pathname)
    if (refusedHere) return refusedHere
    const clientSays = mayReadCut({ kind: caller.company?.kind })
    if (clientSays) {
      await recordRefusal([{ companyId }], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: `Refused a sold team's projects: ${clientSays}` })
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: clientSays } }, { status: 403 })
    }
    const reach = await marginReachFor(caller)
    const lines = await sellLinesInReach(companyId, reach, caller.person.id)
    const projects = (await readProjects(companyId, lines)).map(({ clientName: _client, ...p }) => p)
    return NextResponse.json({ data: { view: 'PROJECTS', projects, mayWrite: false } })
  }

  const [teams, people, projects, offers, dealings] = await Promise.all([readPods(companyId), eligiblePeople(companyId), readProjects(companyId), readOffers(companyId), dealingsWithSides(caller, false)])
  // The firms a team may be offered to: the ones this firm works with, never one it reached by its own writing alone.
  const open = [...dealings.ids].filter((id) => !dealings.ownSideOnly.has(id) && id !== companyId)
  const clients = open.length ? await prisma.company.findMany({ where: { id: { in: open } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }) : []
  logPodReads(caller, teams.flatMap((t) => t.roles.flatMap((r) => r.members.map((m) => m.personId))), 'the people on its teams')
  return NextResponse.json({ data: { view: 'TEAMS', teams, people, projects, offers, clients, mayWrite: hasPermission(caller.permissions, 'requirements.write') } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = podStaffOnly(caller)
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const refused = await podWriteRefusal(caller, request.nextUrl.pathname)
  if (refused) return refused

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  if (!name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give the team a name.', field: 'name' } }, { status: 422 })
  const pricing = typeof body.pricing === 'string' ? body.pricing : ''
  if (!(PRICINGS as readonly string[]).includes(pricing)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Choose a sprint price or a rate card.', field: 'pricing' } }, { status: 422 })
  }
  const rolesIn: any[] = Array.isArray(body.roles) ? body.roles : []
  const roles = rolesIn.map((r, i) => ({
    title: typeof r?.title === 'string' ? r.title.trim().slice(0, 120) : '',
    headcount: r?.headcount === undefined ? 1 : r.headcount,
    rateCents: r?.rateCents ?? null,
    sortOrder: i,
  }))
  for (const r of roles) {
    if (!r.title) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give every role a title.', field: 'roles' } }, { status: 422 })
    if (!isHeadcount(r.headcount)) return NextResponse.json({ error: { code: 'VALIDATION', message: `The role ${r.title} needs a headcount of one or more people.`, field: 'roles' } }, { status: 422 })
  }
  const sprintPriceCents = body.sprintPriceCents ?? null
  const sprintWeeks = body.sprintWeeks ?? null
  const bad = pricingRule({ pricing, sprintPriceCents, sprintWeeks, roles })
  if (bad) return NextResponse.json({ error: { code: 'VALIDATION', message: bad, field: 'pricing' } }, { status: 422 })

  try {
    const pod = await prisma.pod.create({
      data: {
        companyId, name, pricing,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null,
        sprintPriceCents: pricing === 'SPRINT_PRICE' ? sprintPriceCents : null,
        sprintWeeks: pricing === 'SPRINT_PRICE' ? sprintWeeks : null,
        roles: { create: roles.map((r) => ({ title: r.title, headcount: r.headcount, rateCents: pricing === 'RATE_CARD' ? r.rateCents : null, sortOrder: r.sortOrder })) },
      },
      select: { id: true },
    })
    return NextResponse.json({ data: { id: pod.id, says: teamCreatedSays(name, roles.length) } }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: { code: 'DUPLICATE', message: `You already have a team called ${name}.`, field: 'name' } }, { status: 409 })
    throw e
  }
}
