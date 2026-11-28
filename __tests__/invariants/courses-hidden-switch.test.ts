import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * "Hide courses on our public page": the Owner's switch on the site
 * settings, and what the settings count says while courses are off.
 */

type Row = Record<string, any>
const h = vi.hoisted(() => ({
  role: 'Owner' as string,
  company: { slug: 'northwind', siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null, siteWrittenAt: null, name: 'Northwind', kind: 'VENDOR', supplierPosture: 'BENCH', locations: [], pluginsOn: [] as string[], coursesHiddenOnStorefront: false } as Row,
  courseCount: 3,
  updates: [] as Row[],
}))

vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({
    error: null,
    caller: { company: { id: 'c1', name: 'Northwind', kind: 'VENDOR' }, context: { roleId: 'r1' }, person: { id: 'p1', name: 'Pat' }, permissions: ['settings.manage'] },
  }),
  realPersonId: () => 'p1',
}))
vi.mock('@/lib/plugin-gate', () => ({ pluginGate: async () => null }))
vi.mock('@/lib/seat', () => ({ staffOnly: () => null }))
vi.mock('@/lib/permissions', () => ({ hasPermission: () => true, askTheDesk: () => 'ask' }))
vi.mock('@/app/api/settings/site/write', () => ({
  modelWritesFor: async () => ({ yes: false, says: 'off' }), writePage: async () => ({}),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    role: { findFirst: async () => ({ name: h.role }) },
    company: {
      findUniqueOrThrow: async () => h.company,
      update: async (a: Row) => { h.updates.push(a.data); h.company = { ...h.company, ...a.data }; return h.company },
    },
    sellContract: { count: async () => 0, findMany: async () => [] },
    consultantProfile: { findMany: async () => [] },
    requirement: { count: async () => 0 },
    course: { count: async () => h.courseCount },
  },
}))

import { GET, PATCH } from '@/app/api/settings/site/route'

const patch = (body: Row) => PATCH(new NextRequest('http://x/api/settings/site', { method: 'PATCH', body: JSON.stringify(body) }))
const get = () => GET(new NextRequest('http://x/api/settings/site'))

beforeEach(() => {
  h.role = 'Owner'
  h.company = { ...h.company, pluginsOn: [], coursesHiddenOnStorefront: false }
  h.courseCount = 3
  h.updates = []
})

describe('hiding courses on the public page', () => {
  it('an Owner hides courses on the public page and the setting is written', async () => {
    const res = await patch({ coursesHiddenOnStorefront: true })
    expect(res.status).toBe(200)
    expect(h.updates).toEqual([{ coursesHiddenOnStorefront: true }])
  })

  it('an Admin reads the setting and cannot change it', async () => {
    h.role = 'Admin'
    const res = await patch({ coursesHiddenOnStorefront: true })
    expect(res.status).toBe(403)
    expect(h.updates).toEqual([])
    const read = (await (await get()).json()).data
    expect(read.coursesHidden).toBe(false)
    expect(read.canHideCourses).toBe(false)
  })
})

describe('the course count on the site settings', () => {
  it('the settings count no course while the plugin is off', async () => {
    const data = (await (await get()).json()).data
    expect(data.basedOn.trainingCourses).toBe(0)
  })
  it('the settings count a firm’s courses while the plugin is on and they are not hidden', async () => {
    h.company = { ...h.company, pluginsOn: ['TRAIN_TO_BENCH'] }
    expect((await (await get()).json()).data.basedOn.trainingCourses).toBe(3)
  })
  it('the settings count no course for a firm that hides them, even with the plugin on', async () => {
    h.company = { ...h.company, pluginsOn: ['TRAIN_TO_BENCH'], coursesHiddenOnStorefront: true }
    expect((await (await get()).json()).data.basedOn.trainingCourses).toBe(0)
  })
})
