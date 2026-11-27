import { describe, it, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({ roleName: 'Owner' as string }))
vi.mock('@/lib/db', () => ({
  prisma: {
    role: { findFirst: async () => ({ name: state.roleName }) },
    company: { findUnique: async () => ({ pluginsOn: ['TRAIN_TO_BENCH', 'PODS'], name: 'Corvane Packaging', ownerProofRequiredAt: null, ownerVerifiedAt: null }) },
  },
}))
vi.mock('@/lib/access-log', () => ({ accessActor: () => ({}), recordRefusal: async () => {} }))

import { pluginGate } from '@/lib/plugin-gate'
import { pluginsOfferedTo, notOfferedSays } from '@/lib/plugins'

const WORDS = /train|cohort|course|trainee/i
const caller = (kind: string) => ({ company: { id: 'c1', name: 'Corvane Packaging', kind }, context: { roleId: 'r1' } }) as any

describe('a client is never offered a supplier-only module', () => {
  it('a client company is offered neither Train to bench, Project teams, Website and content, nor Outreach', () => {
    expect(pluginsOfferedTo('CLIENT').map((p) => p.key)).toEqual([])
  })
  it('a supplier company is offered all five plugins', () => {
    expect(pluginsOfferedTo('VENDOR').map((p) => p.key)).toEqual(['TRAIN_TO_BENCH', 'PODS', 'WEBSITE', 'OUTREACH', 'PUBLIC_SECTOR'])
  })
  it('the sentence a client reads for a module that is not offered says nothing about training', () => {
    expect(notOfferedSays()).toBe('That is not offered for your company.')
    expect(notOfferedSays()).not.toMatch(WORDS)
  })
  it('a client seat opening the Training route reads a neutral sentence with none of the training words', async () => {
    const res = await pluginGate(caller('CLIENT'), 'TRAIN_TO_BENCH')
    expect(res?.status).toBe(403)
    const body = await res!.json()
    expect(body.error.message).not.toMatch(WORDS)
    expect(body.error.message).not.toMatch(/Train to bench/)
    expect(body.error.href).toBeUndefined()
  })
  it('a supplier seat with the plugin on still passes the gate', async () => {
    expect(await pluginGate(caller('VENDOR'), 'TRAIN_TO_BENCH')).toBeNull()
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a client Owner’s Settings shows no plugin switch', () => {
  it('the plugins route lists only what the company’s kind is offered and refuses a switch in the neutral sentence', () => {
    const src = read('src/app/api/settings/plugins/route.ts')
    expect(src).toContain('pluginsOfferedTo(kind)')
    expect(src).toContain("code: 'NOT_OFFERED', message: notOfferedSays()")
  })
  it('the panel draws nothing where there is no plugin to offer, so a client Owner reads no Train to bench switch', () => {
    expect(read('src/components/settings/plugins-panel.tsx')).toContain('data.plugins.length === 0) return null')
  })
  it('the Training page shows the route’s sentence alone when the door refuses', () => {
    expect(read('src/app/dashboard/training/page.tsx')).toContain('<RefusedState says={refused} />')
  })
})
