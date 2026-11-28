import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Record 123, ruling b: the site content editor is open only where the site renders. */

type Row = Record<string, any>
const h = vi.hoisted(() => ({ pluginsOn: [] as string[], siteLiveAt: new Date('2026-10-29T00:00:00Z') as Date | null, ownerOff: 0 }))

vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({
    error: null,
    caller: { company: { id: 'c1', name: 'Northwind', kind: 'VENDOR' }, context: { roleId: 'r1' }, person: { id: 'p1', name: 'Pat' }, permissions: ['settings.manage'] },
  }),
  realPersonId: () => 'p1',
}))
vi.mock('@/lib/seat', () => ({ staffOnly: () => null }))
vi.mock('@/lib/permissions', () => ({ hasPermission: () => true, askTheDesk: () => 'ask' }))
vi.mock('@/lib/access-log', () => ({ accessActor: () => ({}), recordRefusal: async () => {} }))
vi.mock('@/app/api/settings/site/write', () => ({ modelWritesFor: async () => ({ yes: false, says: 'off' }), writePage: async () => ({}) }))
vi.mock('@/lib/db', () => ({
  prisma: {
    role: { findFirst: async () => ({ name: 'Owner' }) },
    company: {
      findUnique: async () => ({ pluginsOn: h.pluginsOn, siteLiveAt: h.siteLiveAt }),
      findUniqueOrThrow: async () => ({ slug: 'northwind', siteTagline: null, siteIntro: null, siteHeadings: null, siteWrittenBy: null, siteWrittenAt: null, name: 'Northwind', kind: 'VENDOR', supplierPosture: 'BENCH', locations: [], pluginsOn: h.pluginsOn, coursesHiddenOnStorefront: false }),
      update: async () => ({}),
    },
    pluginSwitch: { count: async () => h.ownerOff },
    sellContract: { count: async () => 0, findMany: async () => [] },
    consultantProfile: { findMany: async () => [] },
    requirement: { count: async () => 0 },
    course: { count: async () => 0 },
  },
}))

import { GET, POST, PATCH } from '@/app/api/settings/site/route'
const req = (method: string) => new NextRequest('http://x/api/settings/site', { method, ...(method === 'GET' ? {} : { body: '{}' }) })

beforeEach(() => { h.pluginsOn = []; h.siteLiveAt = new Date('2026-10-29T00:00:00Z'); h.ownerOff = 0 })

describe('the site editor follows whether the site renders', () => {
  it('the site editor is refused while Website and content is off', async () => {
    h.siteLiveAt = new Date('2026-11-28T00:00:00Z')
    for (const fn of [GET, POST, PATCH]) {
      const res = await fn(req(fn.name))
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('PLUGIN_OFF')
    }
  })
  it('the editor is open while Website and content is on', async () => {
    h.siteLiveAt = null
    h.pluginsOn = ['WEBSITE']
    expect((await GET(req('GET'))).status).toBe(200)
  })
  it('a grandfathered site keeps its content editor', async () => {
    expect((await GET(req('GET'))).status).toBe(200)
  })
  it('a grandfathered site loses its editor once its Owner has switched Website off', async () => {
    h.ownerOff = 1
    expect((await GET(req('GET'))).status).toBe(403)
  })
})
