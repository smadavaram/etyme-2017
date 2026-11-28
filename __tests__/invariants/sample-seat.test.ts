import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import {
  SAMPLE_COOKIE, SAMPLE_COOKIE_VALUE, SAMPLE_REFUSAL, SAMPLE_DOORS, EMBED_STEPS, DEFAULT_EMBED_STEP,
  embedStep, sampleMay, sampleRefusalBody, isSampleCookie,
} from '@/lib/sample-seat'

/**
 * The shared sample seat's rules, with no database (founder, 2026-10-14):
 * the frame only this site may show, the cookie it hands the browser, and
 * the one sentence every write is refused with.
 */

function hit(path: string, cookie?: string) {
  return middleware(new NextRequest(`https://etyme2040.vercel.app${path}`, cookie ? { headers: { cookie } } : {}))
}

describe('the frame on the home page', () => {
  it('the embed can be framed by this site and by no other origin', async () => {
    for (const step of EMBED_STEPS) {
      const res = await hit(`/embed/demo/${step}`)
      expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    }
    const first = await hit('/embed/demo')
    expect(first.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
  })

  it('the frame hands the browser the sample cookie for the frame and its API calls only, never for the app proper', async () => {
    const res = await hit('/embed/demo/approve')
    const set = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
    const sample = set.filter((c) => c.startsWith(`${SAMPLE_COOKIE}=`))
    expect(sample.map((c) => /Path=([^;]+)/.exec(c)?.[1]).sort()).toEqual(['/api', '/embed'])
    for (const c of sample) {
      expect(c).toContain(`${SAMPLE_COOKIE}=${SAMPLE_COOKIE_VALUE}`)
      expect(c).toContain('HttpOnly')
      expect(c).toContain('SameSite=Lax')
      expect(c).toContain('Secure')
    }
    const app = await hit('/dashboard/program')
    expect(app.headers.get('set-cookie') ?? '').not.toContain(SAMPLE_COOKIE)
    expect(app.headers.get('content-security-policy')).toBeNull()
  })

  it('a browser that already holds the sample cookie is not handed it again', async () => {
    const res = await hit('/embed/demo/pay', `${SAMPLE_COOKIE}=${SAMPLE_COOKIE_VALUE}`)
    expect(res.headers.get('set-cookie') ?? '').not.toContain(SAMPLE_COOKIE)
  })

  it('the frame has five screens and opens on the program dashboard', () => {
    expect([...EMBED_STEPS]).toEqual(['overview', 'source', 'submit', 'approve', 'pay'])
    expect(DEFAULT_EMBED_STEP).toBe('overview')
    expect(embedStep('approve')).toBe('approve')
    expect(embedStep('payroll')).toBeNull()
    expect(embedStep(undefined)).toBeNull()
  })
})

describe('the sample seat reads and never writes', () => {
  it('a read is allowed and every other method is a write', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(sampleMay(m)).toBe(true)
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(sampleMay(m)).toBe(false)
  })

  it('a caller with no method to read is refused, so the seat fails closed', () => {
    expect(sampleMay(undefined)).toBe(false)
    expect(sampleMay('')).toBe(false)
  })

  it('a refused write says, in one plain sentence, that this is a sample and offers its own demo and sign-up', () => {
    expect(SAMPLE_REFUSAL.split(/(?<=[.!?])\s/).length).toBe(1)
    expect(SAMPLE_REFUSAL.split(/\s+/).length).toBeLessThanOrEqual(25)
    expect(SAMPLE_REFUSAL).toMatch(/sample/)
    expect(SAMPLE_DOORS.map((d) => d.label)).toEqual(['Open your own demo', 'Sign up'])
    const body = sampleRefusalBody()
    expect(body.error).toEqual({ code: 'SAMPLE_READ_ONLY', message: SAMPLE_REFUSAL, actions: [...SAMPLE_DOORS] })
  })

  it('only the sample cookie’s own value is the sample', () => {
    expect(isSampleCookie(SAMPLE_COOKIE_VALUE)).toBe(true)
    for (const v of ['', 'true', '1', 'northbend', null, undefined]) expect(isSampleCookie(v as any)).toBe(false)
  })

  it('the read-only flag is set in one place in the code, the sample door, and read off no header or body', () => {
    const setters = globSync('src/**/*.ts').filter((f) => /readOnly:\s*true/.test(readFileSync(f, 'utf8')))
    expect(setters).toEqual(['src/lib/api-context.ts'])
    const ctx = readFileSync('src/lib/api-context.ts', 'utf8')
    expect(ctx.match(/readOnly:\s*true/g)).toHaveLength(1)
    // The flag is never read off the wire.
    for (const f of globSync('src/**/*.{ts,tsx}')) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/headers\.get\(['"]x-[a-z-]*(read-?only|sample)/i)
      expect(src, f).not.toMatch(/body\??\.(readOnly|sample)\b/)
    }
  })
})
