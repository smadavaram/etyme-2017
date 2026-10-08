import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * A reply by email changes somebody's profile — free, not free, yes put
 * me forward. Until 2026-10-08 anybody could post one as any address, so
 * a stranger could take a consultant off the bench or consent for them
 * with one request. Now the email provider's signature is checked over
 * the body exactly as it arrived before anything is read, and with no
 * signing secret configured nothing is accepted at all.
 */

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  lastAsked: vi.fn(),
  send: vi.fn(),
  recordAnswer: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: { consultantProfile: { findFirst: h.findFirst } } }))
vi.mock('@/lib/messages', () => ({ lastAsked: h.lastAsked, send: h.send }))
vi.mock('@/lib/answers', () => ({ recordAnswer: h.recordAnswer }))
vi.mock('@/lib/alerts', () => ({ reportError: h.reportError }))

import { POST } from '@/app/api/texts/inbound/route'
import { verifyInbound, signInbound, reportRefusalNow, readReply, INBOUND_SECRET_ENV } from '@/lib/texts'

const SECRET = 'whsec_' + Buffer.from('a signing secret nobody else holds').toString('base64')
const BODY = JSON.stringify({ From: 'Ravi Patel <ravi.patel@gmail.com>', Body: 'no im on a contract till march' })

function request(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://etyme.example/api/texts/inbound', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function signed(body: string, at = Math.floor(Date.now() / 1000), secret = SECRET): Record<string, string> {
  const id = 'msg_2ZxQ'
  return { 'svix-id': id, 'svix-timestamp': String(at), 'svix-signature': signInbound(secret, id, String(at), body) }
}

function nothingWritten() {
  expect(h.findFirst).not.toHaveBeenCalled()
  expect(h.lastAsked).not.toHaveBeenCalled()
  expect(h.recordAnswer).not.toHaveBeenCalled()
  expect(h.send).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env[INBOUND_SECRET_ENV] = SECRET
  h.findFirst.mockResolvedValue({ id: 'cp1', personId: 'p1', person: { name: 'Ravi Patel' } })
  h.lastAsked.mockResolvedValue({ kind: 'FRESHNESS' })
  h.recordAnswer.mockResolvedValue({ companyId: 'c1', says: 'Thanks, Ravi — marked as on a contract.', needsFollowUp: false })
  h.send.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env[INBOUND_SECRET_ENV]
})

describe('who may post a reply', () => {
  it('an inbound text with no valid signature is refused and writes nothing', async () => {
    const unsigned = await POST(request(BODY, { 'x-forwarded-for': '203.0.113.9' }))
    expect(unsigned.status).toBe(403)
    expect((await unsigned.json()).error.message).toBe('This reply is not signed by the email provider, so nothing was recorded.')

    const forged = await POST(request(BODY, signed(BODY, undefined, 'whsec_' + Buffer.from('a guess').toString('base64'))))
    expect(forged.status).toBe(403)
    expect((await forged.json()).error.code).toBe('BAD_SIGNATURE')
    nothingWritten()
  })

  it('a signature over a different body is refused, so a signed reply cannot be reused to say something else', async () => {
    const other = JSON.stringify({ From: 'ravi.patel@gmail.com', Body: 'yes submit me' })
    const res = await POST(request(other, signed(BODY)))
    expect(res.status).toBe(403)
    nothingWritten()
  })

  it('a signature more than five minutes old is refused as a replay', async () => {
    const res = await POST(request(BODY, signed(BODY, Math.floor(Date.now() / 1000) - 6 * 60)))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('STALE')
    nothingWritten()
  })

  it('an inbound text with a valid signature records the reply', async () => {
    const res = await POST(request(BODY, signed(BODY)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.known).toBe(true)
    expect(json.data.read).toBe(readReply('no im on a contract till march', 'FRESHNESS'))
    expect(h.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'cp1', personId: 'p1', asked: 'FRESHNESS', heard: 'no im on a contract till march' })
    )
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.reportError).not.toHaveBeenCalled()
  })

  it('with no provider token configured every inbound is refused rather than trusted', async () => {
    delete process.env[INBOUND_SECRET_ENV]
    const res = await POST(request(BODY, signed(BODY)))
    expect(res.status).toBe(503)
    expect((await res.json()).error.message).toContain(`${INBOUND_SECRET_ENV} is not set`)
    nothingWritten()
    expect(verifyInbound({ secret: '', id: 'x', timestamp: '1', signature: 'v1,x', body: '', now: new Date() })).toMatchObject({ ok: false, status: 503 })
  })
})

describe('staff hear of a refused reply once an hour per source', () => {
  it('a refusal from one source is reported once in an hour, and again after it', () => {
    const seen = new Map<string, number>()
    const t0 = new Date('2026-10-08T10:00:00Z')
    expect(reportRefusalNow(seen, '203.0.113.9', t0)).toBe(true)
    expect(reportRefusalNow(seen, '203.0.113.9', new Date('2026-10-08T10:59:00Z'))).toBe(false)
    expect(reportRefusalNow(seen, '198.51.100.4', new Date('2026-10-08T10:59:00Z'))).toBe(true)
    expect(reportRefusalNow(seen, '203.0.113.9', new Date('2026-10-08T11:00:00Z'))).toBe(true)
  })

  it('a flood of new sources cannot grow the memory past its cap; once full, a new source is not reported until an hour clears room', () => {
    const seen = new Map<string, number>()
    const t0 = new Date('2026-10-08T10:00:00Z')
    expect(reportRefusalNow(seen, 'a', t0, 2)).toBe(true)
    expect(reportRefusalNow(seen, 'b', t0, 2)).toBe(true)
    expect(reportRefusalNow(seen, 'c', t0, 2)).toBe(false)
    expect(seen.size).toBe(2)
    expect(reportRefusalNow(seen, 'c', new Date('2026-10-08T11:00:00Z'), 2)).toBe(true)
  })

  it('the route reports a refused reply through reportError, and only once for repeated posts from one source', async () => {
    await POST(request(BODY, { 'x-forwarded-for': '192.0.2.77' }))
    await POST(request(BODY, { 'x-forwarded-for': '192.0.2.77' }))
    expect(h.reportError).toHaveBeenCalledTimes(1)
    expect(h.reportError.mock.calls[0][0]).toBe('texts/inbound refused an unsigned reply')
    expect(String(h.reportError.mock.calls[0][1])).toContain('192.0.2.77')
  })
})
