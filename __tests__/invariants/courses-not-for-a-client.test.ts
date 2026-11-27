import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'

/**
 * Record 120 and 56: a client never reads "training". The courses
 * setting is drawn only for a company offered Train to bench.
 */
type Row = Record<string, any>
const h = vi.hoisted(() => ({
  kind: 'CLIENT' as string,
  updates: [] as Row[],
}))

vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({
    error: null,
    caller: { company: { id: 'c1', name: 'Corvane', kind: h.kind }, context: { roleId: 'r1' }, person: { id: 'p1', name: 'Pat' }, permissions: ['settings.manage'] },
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
    role: { findFirst: async () => ({ name: 'Owner' }) },
    company: {
      findUniqueOrThrow: async () => ({ slug: 'corvane', siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null, siteWrittenAt: null, name: 'Corvane', kind: h.kind, supplierPosture: null, locations: [], pluginsOn: [], coursesHiddenOnStorefront: false }),
      update: async (a: Row) => { h.updates.push(a.data); return {} },
    },
    sellContract: { count: async () => 0, findMany: async () => [] },
    consultantProfile: { findMany: async () => [] },
    requirement: { count: async () => 0 },
    course: { count: async () => 0 },
  },
}))

import { GET, PATCH } from '@/app/api/settings/site/route'

const patch = (body: Row) => PATCH(new NextRequest('http://x/api/settings/site', { method: 'PATCH', body: JSON.stringify(body) }))
const get = () => GET(new NextRequest('http://x/api/settings/site'))

beforeEach(() => { h.kind = 'CLIENT'; h.updates = [] })

describe('a client is never offered courses on its public page', () => {
  it('a client Owner cannot change the courses setting and is told it is not offered', async () => {
    const res = await patch({ coursesHiddenOnStorefront: true })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('That is not offered for your company.')
    expect(h.updates).toEqual([])
  })

  it('the site settings a client reads carry no courses fields', async () => {
    const data = (await (await get()).json()).data
    expect(data.coursesOffered).toBe(false)
    expect('coursesHidden' in data).toBe(false)
    expect('canHideCourses' in data).toBe(false)
    expect('coursesShown' in data).toBe(false)
  })

  it('a supplier Owner still reads and changes the courses setting', async () => {
    h.kind = 'VENDOR'
    const data = (await (await get()).json()).data
    expect(data.coursesOffered).toBe(true)
    expect(data.canHideCourses).toBe(true)
    expect((await patch({ coursesHiddenOnStorefront: true })).status).toBe(200)
  })

  it('the courses panel draws nothing when the route says courses are not offered', () => {
    const src = readFileSync('src/components/settings/courses-on-page-panel.tsx', 'utf8')
    expect(src).toMatch(/coursesOffered === false\) return null/)
  })
})
