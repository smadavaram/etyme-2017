import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ pluginsOn: [] as string[], refusals: 0 }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({
    caller: { person: { id: 'p1' }, company: { id: 'c1', name: 'Quillbrook Staffing', kind: 'VENDOR' }, context: { roleId: 'r1', type: 'EMPLOYEE' }, permissions: ['requirements.read', 'requirements.write'] },
  }),
}))
vi.mock('@/lib/seat', () => ({ staffOnly: () => null }))
vi.mock('@/lib/access-log', () => ({
  accessActor: () => ({ actorPersonId: 'p1', actorCompanyId: 'c1' }),
  recordRefusal: async () => { state.refusals++; return 1 },
  logBulkAccess: () => {},
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findUnique: async () => ({ pluginsOn: state.pluginsOn }) },
    role: { findFirst: async () => ({ name: 'Owner' }) },
  },
}))

import * as list from '@/app/api/pods/route'
import * as one from '@/app/api/pods/[id]/route'
import * as offer from '@/app/api/pods/[id]/offer/route'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const call = (fn: any, method: string) =>
  fn(new NextRequest(`http://localhost/api/pods/x`, { method, ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}', headers: { 'content-type': 'application/json' } }) }), { params: Promise.resolve({ id: 'x' }) })

const verbs: [string, any, string][] = [
  ['GET /api/pods', list.GET, 'GET'], ['POST /api/pods', list.POST, 'POST'],
  ['GET /api/pods/[id]', one.GET, 'GET'], ['PATCH /api/pods/[id]', one.PATCH, 'PATCH'],
  ['POST /api/pods/[id]', one.POST, 'POST'], ['POST /api/pods/[id]/offer', offer.POST, 'POST'], ['DELETE /api/pods/[id]', one.DELETE, 'DELETE'],
]

describe('project teams while the plugin is off', () => {
  for (const [name, fn, method] of verbs) {
    it(`${name} refuses in one sentence naming Project teams, and the refusal is logged`, async () => {
      state.pluginsOn = []
      const before = state.refusals
      const res = await call(fn, method)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('PLUGIN_OFF')
      expect(body.error.message).toBe('Project teams is off for Quillbrook Staffing. The Owner turns it on in Settings.')
      expect(state.refusals).toBe(before + 1)
    })
  }

  it('a plugin that is on for another tenant’s other module does not open project teams', async () => {
    state.pluginsOn = ['TRAIN_TO_BENCH']
    const res = await call(list.GET, 'GET')
    expect(res.status).toBe(403)
  })

  it('every route file under /api/pods runs the seat check, then the plugin gate, then its permission check, in that order', () => {
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : f === 'route.ts' && files.push(p) } }
    walk(join(process.cwd(), 'src/app/api/pods'))
    expect(files.length).toBeGreaterThanOrEqual(2)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const a = src.indexOf('staffOnly(caller'), b = src.indexOf("pluginGate(caller, 'PODS')"), c = src.search(/pod(Read|Write)Refusal\(/)
      expect(a, f).toBeGreaterThan(-1)
      expect(b, f).toBeGreaterThan(a)
      expect(c, f).toBeGreaterThan(b)
    }
  })
})

describe('the Project teams page while the plugin is off', () => {
  const page = read('src/app/dashboard/pods/page.tsx')
  it('draws only the route’s sentence, before anything else is drawn', () => {
    const refusedAt = page.indexOf('if (refused) return <RefusedState says={refused} />')
    expect(refusedAt).toBeGreaterThan(-1)
    expect(refusedAt).toBeLessThan(page.indexOf('<h1>'))
  })
  it('never says pod on the screen', () => {
    // The addresses are machine names and stay; everything else a person could read must not say it.
    const shown = page.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\/(api|dashboard)\/pods/g, '')
    expect(shown.match(/\bpods?\b/gi) ?? []).toEqual([])
  })
})
