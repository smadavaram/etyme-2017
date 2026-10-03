import { describe, it, expect } from 'vitest'
import { readJson, statusMeans } from '@/lib/read-response'

/**
 * A consultant whose session ended saw "Failed to execute 'json' on
 * 'Response': Unexpected end of JSON input" where "sign in again" should
 * have been.
 *
 * Every page does `await res.json()` before checking `res.ok`, so the
 * careful message on the next line never runs — `res.json()` throws
 * first on any response with no body, which is what a 401, a 500 and a
 * dropped connection all look like.
 *
 * Every test passed, because every test calls the route handler directly
 * and never has a session to lose. One screenshot found it.
 */

const res = (status: number, body?: string, ok?: boolean) =>
  ({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: async () => body ?? '',
  }) as Response

describe('a failed response says what happened, not how parsing went', () => {
  it('turns an empty 401 into words a person can act on', async () => {
    await expect(readJson(res(401))).rejects.toThrow(/session has ended/i)
  })

  it('never surfaces a JSON parser error, whatever came back', async () => {
    // The actual bug, in one assertion.
    await expect(readJson(res(401))).rejects.not.toThrow(/JSON/i)
    await expect(readJson(res(500, '<html>502 Bad Gateway</html>'))).rejects.not.toThrow(/JSON/i)
  })

  it('prefers the message the server actually sent', async () => {
    const r = res(403, JSON.stringify({ error: { message: 'Only the buyer can approve this.' } }))
    await expect(readJson(r)).rejects.toThrow('Only the buyer can approve this.')
  })

  it('falls back to a sentence when the server sent no message', async () => {
    await expect(readJson(res(403))).rejects.toThrow(/do not have access/i)
  })

  it('does not show the reader an HTML error page or a stack trace', async () => {
    await expect(readJson(res(500, '<html><body>Error: at Object.foo (/app/x.js:1)'))).rejects
      .toThrow(/something went wrong at our end/i)
  })
})

describe('and a body that parses is returned unchanged', () => {
  it('gives back the data on a normal response', async () => {
    const body = await readJson(res(200, JSON.stringify({ data: { benches: 3 } })))
    expect(body).toEqual({ data: { benches: 3 } })
  })

  it('treats a 200 with an empty body as a failure, because it is one', async () => {
    // Letting it through hands the page `undefined` and moves the
    // failure somewhere harder to read.
    await expect(readJson(res(200))).rejects.toThrow(/empty reply/i)
  })
})

describe('the sentences themselves', () => {
  it('tells somebody who lost their session what to do', () => {
    expect(statusMeans(401)).toMatch(/Sign in again/i)
  })

  it('explains a conflict rather than naming it', () => {
    expect(statusMeans(409)).toMatch(/changed this while you had it open/i)
  })

  it('does not blame the reader for a server fault', () => {
    expect(statusMeans(500)).toMatch(/at our end/i)
    expect(statusMeans(503)).not.toMatch(/you/i)
  })
})
