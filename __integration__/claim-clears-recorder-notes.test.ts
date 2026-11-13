import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'

/**
 * A company claimed through a link was another firm's record of it. What
 * that firm typed about it (a website, a kind of entity) is that firm's
 * note, never the claimed company's own answer (review, 2026-11-13).
 */

let clientId = ''

beforeAll(async () => {
  await freshWorld()
  clientId = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-corning' }, select: { id: true } })).id
}, 600_000)

describe('a claimed company starts with its own answers', () => {
  it('a company claimed through a link keeps nothing the firm that recorded it typed about its website or kind of entity', async () => {
    const shell = await prisma.company.create({
      data: {
        name: 'Larkspur Field Services', slug: 'larkspur-field-claim', kind: 'VENDOR', currency: 'USD', listedById: clientId,
        website: 'larkspur-noted.example', entityType: 'LLC, I think',
      },
    })
    const email = 'owner@larkspur-field.example'
    const invite = await prisma.supplierInvite.create({
      data: { companyId: shell.id, byId: clientId, email, contactName: 'Ada Lark', token: `tok-larkspur-${shell.id}` },
    })
    await prisma.person.create({ data: { name: 'Ada Lark', primaryEmail: email } })
    as(email)
    const { POST: claim } = await import('@/app/api/claim/[token]/route')
    const r = await json(await claim(req('POST', `/api/claim/${invite.token}`), { params: Promise.resolve({ token: invite.token }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: shell.id }, select: { claimedAt: true, website: true, entityType: true, name: true } })
    expect(after.claimedAt).not.toBeNull()
    expect(after).toMatchObject({ website: null, entityType: null, name: 'Larkspur Field Services' })
  })
})
