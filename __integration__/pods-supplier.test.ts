import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { PATCH as switchPlugin } from '@/app/api/settings/plugins/route'
import { GET as teamsGet, POST as teamsPost } from '@/app/api/pods/route'
import { GET as teamGet, PATCH as teamPatch, POST as teamPost, DELETE as teamDelete } from '@/app/api/pods/[id]/route'

/**
 * Project teams, the supplier's side, at one firm: the Owner switches the
 * plugin on, builds a team of three roles, puts the firm's own employee and
 * a person on its consented bench on it, is refused a stranger with the
 * reason named, then switches the plugin off (every route refuses and every
 * row stays) and on again (everything is back).
 */

const OWNER = 'pods-owner@firm.example'
const RECRUITER = 'pods-recruiter@firm.example'
const EMPLOYEE = 'pods-employee@firm.example'
const BENCHED = 'pods-benched@seed.etyme.invalid'
const STRANGER = 'pods-stranger@seed.etyme.invalid'
const ASKED = 'pods-asked@seed.etyme.invalid'
const s: Record<string, string> = {}
const one = async (fn: any, method: string, id: string, body?: unknown, qs = '') =>
  json(await fn(req(method, `/api/pods/${id}${qs}`, body), { params: Promise.resolve({ id }) }))
// Turning Project teams on is refused for real callers (record 120, ruling 3); the fixture writes the flag.
const switchTo = async (on: boolean) => {
  if (on) {
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['PODS'] } })
    return { status: 200, body: {} as any }
  }
  as(OWNER); return json(await switchPlugin(req('PATCH', '/api/settings/plugins', { plugin: 'PODS', on })))
}
const rows = async () => ({
  pods: await prisma.pod.count({ where: { companyId: s.firm } }),
  roles: await prisma.podRole.count({ where: { pod: { companyId: s.firm } } }),
  members: await prisma.podMember.count({ where: { podRole: { pod: { companyId: s.firm } } } }),
})

describe('a supplier builds a project team, from the plugin switched on to a switch off and back', () => {
  beforeAll(async () => {
    await resetDatabase()
    const firm = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'quillbrook-pods', kind: 'VENDOR', currency: 'USD' } })
    s.firm = firm.id
    const owner = await prisma.role.create({ data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const recruiter = await prisma.role.create({ data: { companyId: firm.id, name: 'Recruiter', permissions: ['requirements.read', 'consultants.read'], isDefault: false } })
    for (const [email, name, roleId] of [[OWNER, 'Mira Osei', owner.id], [RECRUITER, 'Quentin Reedmarsh', recruiter.id], [EMPLOYEE, 'Ada Quillfeather', recruiter.id]] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: firm.id, roleId } })
    }
    for (const [email, name, state] of [[BENCHED, 'Bram Oakhollow', 'GRANTED'], [ASKED, 'Dara Pinecroft', 'INVITED']] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      const profile = await prisma.consultantProfile.create({ data: { personId: p.id, skills: ['Python'], location: 'Boise, ID', visibility: 'VERIFIED', workAuth: 'USC' }, select: { id: true } })
      await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: firm.id, tier: 'RETAINED', state } })
    }
    const stranger = await prisma.person.create({ data: { name: 'Cleo Marshwick', primaryEmail: STRANGER } })
    s[STRANGER] = stranger.id
  }, 240_000)

  it('the plugin is off by default, so the list and the create both refuse in one sentence', async () => {
    as(OWNER)
    const r = await json(await teamsGet(req('GET', '/api/pods')))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Project teams is off for Quillbrook Staffing. The Owner turns it on in Settings.')
    const c = await json(await teamsPost(req('POST', '/api/pods', { name: 'x', pricing: 'SPRINT_PRICE', sprintPriceCents: 100, sprintWeeks: 1 })))
    expect(c.status).toBe(403)
    expect(await rows()).toEqual({ pods: 0, roles: 0, members: 0 })
  })

  it('the Owner switches project teams on', async () => {
    const r = await switchTo(true)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.company.findUniqueOrThrow({ where: { id: s.firm }, select: { pluginsOn: true } })
    expect(row.pluginsOn).toContain('PODS')
  })

  it('a team with three roles and a sprint price is built', async () => {
    as(OWNER)
    const r = await json(await teamsPost(req('POST', '/api/pods', {
      name: 'Data platform sprint team', pricing: 'SPRINT_PRICE', sprintPriceCents: 4800000, sprintWeeks: 6,
      roles: [{ title: 'Tech lead' }, { title: 'Data engineer', headcount: 2 }, { title: 'Analyst' }],
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.pod = r.body.data.id
    const pod = await prisma.pod.findUniqueOrThrow({ where: { id: s.pod }, include: { roles: { orderBy: { sortOrder: 'asc' } } } })
    expect(pod).toMatchObject({ companyId: s.firm, pricing: 'SPRINT_PRICE', sprintPriceCents: 4800000, sprintWeeks: 6 })
    expect(pod.roles.map((x) => [x.title, x.headcount])).toEqual([['Tech lead', 1], ['Data engineer', 2], ['Analyst', 1]])
    s.lead = pod.roles[0].id; s.eng = pod.roles[1].id; s.analyst = pod.roles[2].id
  })

  it('a sprint price without its weeks is refused with the missing part named', async () => {
    as(OWNER)
    const r = await json(await teamsPost(req('POST', '/api/pods', { name: 'Half priced', pricing: 'SPRINT_PRICE', sprintPriceCents: 100 })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('A sprint price needs the number of weeks, one or more.')
  })

  it('a rate card with a role that has no rate is refused, naming the role', async () => {
    as(OWNER)
    const r = await json(await teamsPost(req('POST', '/api/pods', { name: 'Hourly', pricing: 'RATE_CARD', roles: [{ title: 'Lead', rateCents: 9000 }, { title: 'Tester' }] })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('The role Tester needs a rate, in whole cents, above zero.')
  })

  it('the firm’s own employee is put on a role, and is told rather than asked', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.lead, personId: s[EMPLOYEE] })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('she is told, not asked')
  })

  it('a person on the firm’s consented bench is put on a role, as a reference to the same person', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.eng, personId: s[BENCHED] })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const m = await prisma.podMember.findFirstOrThrow({ where: { podRoleId: s.eng } })
    expect(m.personId).toBe(s[BENCHED])
    expect(await prisma.person.count({ where: { primaryEmail: BENCHED } })).toBe(1)
  })

  it('a stranger is refused, and the reason is named', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.analyst, personId: s[STRANGER] })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That person is not on your bench and does not work for you.')
    expect(JSON.stringify(r.body)).not.toContain('Cleo')
    expect(await prisma.podMember.count({ where: { personId: s[STRANGER] } })).toBe(0)
  })

  it('somebody asked onto the bench who has not said yes is refused', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.analyst, personId: s[ASKED] })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Dara Pinecroft has not said yes to your bench yet, so she cannot join a team.')
  })

  it('somebody who took her listing back is refused', async () => {
    await prisma.benchListing.updateMany({ where: { consultant: { personId: s[BENCHED] } }, data: { revokedAt: new Date() } })
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.analyst, personId: s[BENCHED] })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('took her bench listing back')
    await prisma.benchListing.updateMany({ where: { consultant: { personId: s[BENCHED] } }, data: { revokedAt: null } })
  })

  it('a full role refuses another member and says to raise the headcount', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.lead, personId: s[BENCHED] })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('The role Tech lead is full: 1 person already. Raise its headcount first.')
  })

  it('the same person on the same role twice is one row', async () => {
    as(OWNER)
    const r = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.eng, personId: s[BENCHED] })
    expect(r.status).toBe(200)
    expect(await prisma.podMember.count({ where: { podRoleId: s.eng } })).toBe(1)
  })

  it('reading the team shows roles, headcount and members, and writes a read row for each person on it', async () => {
    as(OWNER)
    const r = await one(teamGet, 'GET', s.pod)
    expect(r.status).toBe(200)
    expect(r.body.data.team.headcount).toBe(4)
    expect(r.body.data.team.filled).toBe(2)
    expect(r.body.data.people.map((p: any) => p.name)).toEqual(['Ada Quillfeather', 'Bram Oakhollow', 'Mira Osei', 'Quentin Reedmarsh'])
    await new Promise((res) => setTimeout(res, 300))
    expect(await prisma.accessLog.count({ where: { subjectId: { in: [s[EMPLOYEE], s[BENCHED]] }, actorPersonId: s[OWNER] } })).toBeGreaterThanOrEqual(2)
  })

  it('a seat that reads jobs but does not write them reads the team and is refused every change, with the refusal logged', async () => {
    as(RECRUITER)
    const read = await json(await teamsGet(req('GET', '/api/pods')))
    expect(read.status).toBe(200)
    expect(read.body.data.mayWrite).toBe(false)
    const w = await one(teamPost, 'POST', s.pod, { kind: 'role', title: 'Tester' })
    expect(w.status).toBe(403)
    expect(w.body.error.message).toBe('Building a project team is for whoever writes jobs at Quillbrook Staffing.')
    expect(await prisma.accessLog.count({ where: { actorPersonId: s[RECRUITER], allowed: false } })).toBeGreaterThanOrEqual(1)
  })

  it('a member is taken off, a role with somebody on it cannot be removed, and a rename and an archive keep every row', async () => {
    as(OWNER)
    const role = await one(teamPost, 'POST', s.pod, { kind: 'role', title: 'Tester' })
    expect(role.status).toBe(201)
    const gone = await one(teamDelete, 'DELETE', s.pod, undefined, `?roleId=${s.lead}`)
    expect(gone.status).toBe(409)
    expect(gone.body.error.message).toBe('Tech lead still has 1 member. Take them off first.')
    const clear = await one(teamDelete, 'DELETE', s.pod, undefined, `?roleId=${role.body.data.id}`)
    expect(clear.status).toBe(200)
    const ren = await one(teamPatch, 'PATCH', s.pod, { name: 'Data platform team' })
    expect(ren.status).toBe(200)
    const arch = await one(teamPatch, 'PATCH', s.pod, { archived: true })
    expect(arch.body.data.says).toContain('archived, with everything kept')
    expect((await prisma.pod.findUniqueOrThrow({ where: { id: s.pod } })).archivedAt).not.toBeNull()
    expect((await rows()).members).toBe(2)
    const blocked = await one(teamPost, 'POST', s.pod, { kind: 'member', roleId: s.analyst, personId: s[EMPLOYEE] })
    expect(blocked.status).toBe(409)
    await one(teamPatch, 'PATCH', s.pod, { archived: false })
  })

  it('switching project teams off refuses every route and keeps every row', async () => {
    const before = await rows()
    expect(before).toEqual({ pods: 1, roles: 3, members: 2 })
    expect((await switchTo(false)).status).toBe(200)
    as(OWNER)
    const calls = [
      await json(await teamsGet(req('GET', '/api/pods'))),
      await json(await teamsPost(req('POST', '/api/pods', { name: 'Late', pricing: 'SPRINT_PRICE', sprintPriceCents: 1, sprintWeeks: 1 }))),
      await one(teamGet, 'GET', s.pod),
      await one(teamPatch, 'PATCH', s.pod, { name: 'Nope' }),
      await one(teamPost, 'POST', s.pod, { kind: 'role', title: 'Nope' }),
      await one(teamDelete, 'DELETE', s.pod, undefined, `?roleId=${s.analyst}`),
    ]
    for (const c of calls) {
      expect(c.status).toBe(403)
      expect(c.body.error.code).toBe('PLUGIN_OFF')
    }
    expect(await rows()).toEqual(before)
  })

  it('switching it back on restores the team, its roles and its members exactly', async () => {
    expect((await switchTo(true)).status).toBe(200)
    as(OWNER)
    const r = await json(await teamsGet(req('GET', '/api/pods')))
    expect(r.status).toBe(200)
    const t = r.body.data.teams[0]
    expect(t.name).toBe('Data platform team')
    expect(t.roles.map((x: any) => [x.title, x.members.map((m: any) => m.name)])).toEqual([
      ['Tech lead', ['Ada Quillfeather']], ['Data engineer', ['Bram Oakhollow']], ['Analyst', []],
    ])
  })
})
