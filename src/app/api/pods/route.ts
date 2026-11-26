import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { podReadRefusal, podWriteRefusal, logPodReads } from '@/lib/pods/caller'
import { eligiblePeople, readPods, readProjects } from '@/lib/pods/read'
import { PRICINGS, isHeadcount, pricingRule } from '@/lib/pods'

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
  const notStaff = staffOnly(caller, 'Project teams')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'PODS')
  if (off) return off
  const refused = await podReadRefusal(caller, request.nextUrl.pathname)
  if (refused) return refused

  const companyId = caller.company!.id
  const [teams, people, projects] = await Promise.all([readPods(companyId), eligiblePeople(companyId), readProjects(companyId)])
  logPodReads(caller, teams.flatMap((t) => t.roles.flatMap((r) => r.members.map((m) => m.personId))), 'the people on its teams')
  return NextResponse.json({ data: { teams, people, projects, mayWrite: hasPermission(caller.permissions, 'requirements.write') } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Project teams')
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
    return NextResponse.json({ data: { id: pod.id, says: `${name} is created with ${roles.length} ${roles.length === 1 ? 'role' : 'roles'}. Add its members next.` } }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: { code: 'DUPLICATE', message: `You already have a team called ${name}.`, field: 'name' } }, { status: 409 })
    throw e
  }
}
