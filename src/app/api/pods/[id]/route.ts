import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { podReadRefusal, podWriteRefusal, logPodReads } from '@/lib/pods/caller'
import { eligiblePeople, ownPod, readPods, rosterFacts } from '@/lib/pods/read'
import { PRICINGS, isHeadcount, isWholeCents, pricingRule, roleRoom, rosterRule } from '@/lib/pods'

type Ctx = { params: Promise<{ id: string }> }

const fail = (status: number, code: string, message: string, field?: string) =>
  NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })

/** The door every verb passes: seat, plugin, then the permission it needs. */
async function door(request: NextRequest, write: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { res: error }
  const notStaff = staffOnly(caller, 'Project teams')
  if (notStaff) return { res: notStaff }
  const off = await pluginGate(caller, 'PODS')
  if (off) return { res: off }
  const refused = write ? await podWriteRefusal(caller, request.nextUrl.pathname) : await podReadRefusal(caller, request.nextUrl.pathname)
  if (refused) return { res: refused }
  return { caller }
}

const notFound = () => fail(404, 'NOT_FOUND', 'That team is not one of yours.')

/** GET /api/pods/[id]   one team with its roles and members */
export async function GET(request: NextRequest, { params }: Ctx) {
  const d = await door(request, false)
  if (!d.caller) return d.res
  const { caller } = d
  const { id } = await params
  const companyId = caller.company!.id
  const [team] = await readPods(companyId, id)
  if (!team) return notFound()
  logPodReads(caller, team.roles.flatMap((r) => r.members.map((m) => m.personId)), `the people on ${team.name}`)
  return NextResponse.json({ data: { team, people: await eligiblePeople(companyId), mayWrite: hasPermission(caller.permissions, 'requirements.write') } })
}

/**
 * PATCH /api/pods/[id]   { name?, description?, pricing?, sprintPriceCents?, sprintWeeks?, archived?, role?: { id, headcount?, rateCents? } }
 * Rename, set the price, archive or restore, or change one role. Archiving hides and never deletes.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const d = await door(request, true)
  if (!d.caller) return d.res
  const companyId = d.caller.company!.id
  const { id } = await params
  const pod = await ownPod(companyId, id)
  if (!pod) return notFound()
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  const said: string[] = []

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
    if (!name) return fail(422, 'VALIDATION', 'Give the team a name.', 'name')
    data.name = name
    said.push(`renamed to ${name}`)
  }
  if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null

  const roles = await prisma.podRole.findMany({ where: { podId: id }, select: { id: true, title: true, rateCents: true } })
  const roleIn = body.role && typeof body.role === 'object' ? body.role : null
  let roleData: Record<string, unknown> | null = null
  if (roleIn) {
    const r = roles.find((x) => x.id === roleIn.id)
    if (!r) return fail(404, 'NOT_FOUND', 'That role is not on this team.')
    roleData = {}
    if (roleIn.headcount !== undefined) {
      if (!isHeadcount(roleIn.headcount)) return fail(422, 'VALIDATION', `The role ${r.title} needs a headcount of one or more people.`, 'headcount')
      const filled = await prisma.podMember.count({ where: { podRoleId: r.id } })
      if (roleIn.headcount < filled) return fail(409, 'ROLE_FILLED', `${r.title} already has ${filled} members. Remove one before lowering the headcount.`, 'headcount')
      roleData.headcount = roleIn.headcount
    }
    if (roleIn.rateCents !== undefined) {
      if (roleIn.rateCents !== null && !isWholeCents(roleIn.rateCents)) return fail(422, 'VALIDATION', `The role ${r.title} needs a rate, in whole cents, above zero.`, 'rateCents')
      roleData.rateCents = roleIn.rateCents
    }
    said.push(`${r.title} changed`)
  }

  const touchesPrice = ['pricing', 'sprintPriceCents', 'sprintWeeks'].some((k) => body[k] !== undefined) || (roleData && 'rateCents' in roleData)
  if (touchesPrice) {
    const pricing = body.pricing !== undefined ? String(body.pricing) : pod.pricing
    if (!(PRICINGS as readonly string[]).includes(pricing)) return fail(422, 'VALIDATION', 'Choose a sprint price or a rate card.', 'pricing')
    const sprintPriceCents = body.sprintPriceCents !== undefined ? body.sprintPriceCents : pod.sprintPriceCents
    const sprintWeeks = body.sprintWeeks !== undefined ? body.sprintWeeks : pod.sprintWeeks
    const rolesAfter = roles.map((r) => ({ title: r.title, rateCents: roleData && roleIn.id === r.id && 'rateCents' in roleData ? (roleData.rateCents as number | null) : r.rateCents }))
    const bad = pricingRule({ pricing, sprintPriceCents, sprintWeeks, roles: rolesAfter })
    if (bad) return fail(422, 'VALIDATION', bad, 'pricing')
    data.pricing = pricing
    data.sprintPriceCents = pricing === 'SPRINT_PRICE' ? sprintPriceCents : null
    data.sprintWeeks = pricing === 'SPRINT_PRICE' ? sprintWeeks : null
    said.push('price set')
  }
  if (body.archived !== undefined) {
    data.archivedAt = body.archived === true ? new Date() : null
    said.push(body.archived === true ? 'archived, with everything kept' : 'restored')
  }
  if (said.length === 0 && !('description' in data)) return fail(422, 'VALIDATION', 'Nothing to change: say a name, a price, a role or archived.')

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.pod.update({ where: { id }, data })
      if (roleData && roleIn && Object.keys(roleData).length) await tx.podRole.update({ where: { id: roleIn.id }, data: roleData })
      // A move to a rate card clears nothing; a move to a sprint price keeps each role's rate for a return.
    })
  } catch (e: any) {
    if (e?.code === 'P2002') return fail(409, 'DUPLICATE', `You already have a team called ${String(data.name)}.`, 'name')
    throw e
  }
  return NextResponse.json({ data: { id, says: `${pod.name} ${said.join(', ') || 'updated'}.` } })
}

/**
 * POST /api/pods/[id]
 *   { kind: 'role', title, headcount?, rateCents? }   add a role
 *   { kind: 'member', roleId, personId }              put somebody on a role
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const d = await door(request, true)
  if (!d.caller) return d.res
  const companyId = d.caller.company!.id
  const { id } = await params
  const pod = await ownPod(companyId, id)
  if (!pod) return notFound()
  const body = await request.json().catch(() => ({}))

  if (body.kind === 'role') {
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
    if (!title) return fail(422, 'VALIDATION', 'Give the role a title.', 'title')
    const headcount = body.headcount === undefined ? 1 : body.headcount
    if (!isHeadcount(headcount)) return fail(422, 'VALIDATION', `The role ${title} needs a headcount of one or more people.`, 'headcount')
    const rateCents = body.rateCents ?? null
    if (pod.pricing === 'RATE_CARD' && !isWholeCents(rateCents)) return fail(422, 'VALIDATION', `The role ${title} needs a rate, in whole cents, above zero.`, 'rateCents')
    const last = await prisma.podRole.aggregate({ where: { podId: id }, _max: { sortOrder: true } })
    const role = await prisma.podRole.create({
      data: { podId: id, title, headcount, rateCents: pod.pricing === 'RATE_CARD' ? rateCents : null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    })
    return NextResponse.json({ data: { id: role.id, says: `${title} is added to ${pod.name}.` } }, { status: 201 })
  }

  if (body.kind === 'member') {
    if (pod.archivedAt) return fail(409, 'ARCHIVED', `${pod.name} is archived. Restore it before adding anybody.`)
    const roleId = typeof body.roleId === 'string' ? body.roleId : ''
    const personId = typeof body.personId === 'string' ? body.personId : ''
    if (!roleId || !personId) return fail(422, 'VALIDATION', 'Say which role, and who.')
    const role = await prisma.podRole.findFirst({ where: { id: roleId, podId: id }, select: { id: true, title: true, headcount: true, _count: { select: { members: true } } } })
    if (!role) return fail(404, 'NOT_FOUND', 'That role is not on this team.')
    const facts = await rosterFacts(companyId, personId)
    if (!facts) return fail(403, 'NOT_YOURS', 'That person is not on your bench and does not work for you, so she cannot join a team.')
    const verdict = rosterRule(facts)
    if (!verdict.ok) return fail(403, 'NOT_ON_YOUR_BOOKS', verdict.says, 'personId')
    const already = await prisma.podMember.findUnique({ where: { podRoleId_personId: { podRoleId: roleId, personId } }, select: { id: true } })
    if (already) return NextResponse.json({ data: { id: already.id, says: `${facts.name} is already the ${role.title}.` } })
    const full = roleRoom(role, role._count.members)
    if (full) return fail(409, 'ROLE_FULL', full)
    try {
      const m = await prisma.podMember.create({ data: { podRoleId: roleId, personId }, select: { id: true } })
      return NextResponse.json({ data: { id: m.id, says: `${facts.name} is on ${pod.name} as ${role.title}.${verdict.kind === 'EMPLOYEE' ? ' She works for you, so she is told, not asked.' : ''}` } }, { status: 201 })
    } catch (e: any) {
      if (e?.code === 'P2002') return fail(409, 'DUPLICATE', `${facts.name} is already the ${role.title}.`)
      throw e
    }
  }
  return fail(422, 'VALIDATION', 'Say whether you are adding a role or a member.', 'kind')
}

/**
 * DELETE /api/pods/[id]?memberId=…  take somebody off a role
 * DELETE /api/pods/[id]?roleId=…    remove a role that has nobody on it
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const d = await door(request, true)
  if (!d.caller) return d.res
  const companyId = d.caller.company!.id
  const { id } = await params
  const pod = await ownPod(companyId, id)
  if (!pod) return notFound()
  const memberId = request.nextUrl.searchParams.get('memberId')
  const roleId = request.nextUrl.searchParams.get('roleId')

  if (memberId) {
    const m = await prisma.podMember.findFirst({ where: { id: memberId, podRole: { podId: id } }, select: { id: true, person: { select: { name: true } }, podRole: { select: { title: true } } } })
    if (!m) return fail(404, 'NOT_FOUND', 'That member is not on this team.')
    await prisma.podMember.delete({ where: { id: m.id } })
    return NextResponse.json({ data: { says: `${m.person.name} is off ${pod.name}.` } })
  }
  if (roleId) {
    const r = await prisma.podRole.findFirst({ where: { id: roleId, podId: id }, select: { id: true, title: true, _count: { select: { members: true } } } })
    if (!r) return fail(404, 'NOT_FOUND', 'That role is not on this team.')
    if (r._count.members > 0) return fail(409, 'ROLE_FILLED', `${r.title} still has ${r._count.members} ${r._count.members === 1 ? 'member' : 'members'}. Take them off first.`)
    await prisma.podRole.delete({ where: { id: r.id } })
    return NextResponse.json({ data: { says: `${r.title} is removed from ${pod.name}.` } })
  }
  return fail(422, 'VALIDATION', 'Say which member or which role to remove.')
}
