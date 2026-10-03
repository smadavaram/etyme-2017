import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { saveForm, UNREACHABLE } from '@/lib/form-save'

/**
 * A small form that is refused says why, in the route's own words, and
 * can be saved again. Found by a browser walk of the placement page as
 * Brightmoor: an empty reason on the cut-week setting was refused by the
 * route with a sentence nobody saw, and Save stayed disabled for good.
 */

/** The form's own state, as the two setters the component hands in move it. */
function form() {
  const s = { busy: false, error: null as string | null, busyWas: [] as boolean[] }
  return {
    s,
    setBusy: (b: boolean) => { s.busy = b; s.busyWas.push(b) },
    setError: (e: string | null) => { s.error = e },
  }
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const REFUSAL =
  "Say why Rosa Delgado should keep the week's overtime when fewer hours are accepted — what was agreed with them."

describe('saving a small form', () => {
  it('a refusal from the server is shown under the form in its own words and the form can be saved again', async () => {
    const f = form()
    const first = await saveForm({
      send: async () => reply(422, { error: { code: 'VALIDATION', message: REFUSAL, field: 'reason' } }),
      setBusy: f.setBusy, setError: f.setError, fallback: 'The choice could not be saved.',
    })
    expect(first).toBeNull()
    expect(f.s.error).toBe(REFUSAL)
    // Save is enabled again: busy went up for the request and came down.
    expect(f.s.busy).toBe(false)
    expect(f.s.busyWas).toEqual([true, false])

    const second = await saveForm({
      send: async () => reply(200, { data: { rule: 'KEEP_WEEK_OVERTIME', says: 'Kept.' } }),
      setBusy: f.setBusy, setError: f.setError, fallback: 'The choice could not be saved.',
    })
    expect(second).toEqual({ data: { rule: 'KEEP_WEEK_OVERTIME', says: 'Kept.' } })
    expect(f.s.error).toBeNull()
    expect(f.s.busy).toBe(false)
  })

  it("a request that never reaches the server says so in a sentence, not in the browser's words", async () => {
    const f = form()
    const r = await saveForm({
      send: async () => { throw new TypeError('Failed to fetch') },
      setBusy: f.setBusy, setError: f.setError, fallback: 'The choice could not be saved.',
    })
    expect(r).toBeNull()
    expect(f.s.error).toBe(UNREACHABLE)
    expect(f.s.busy).toBe(false)
  })

  it('a refusal with no sentence of its own is said in plain words for its status', async () => {
    const f = form()
    await saveForm({
      send: async () => new Response('', { status: 403 }),
      setBusy: f.setBusy, setError: f.setError, fallback: 'The choice could not be saved.',
    })
    expect(f.s.error).toBe('You do not have access to this.')
    expect(f.s.busy).toBe(false)
  })
})

/**
 * The shape of the bug, wherever it is written: a busy flag raised,
 * `readJson` awaited outside any `try`, and the flag lowered on a line
 * after it — which a refusal skips, because `readJson` throws on one.
 */
function screens(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) screens(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

function stuckForms(file: string): string[] {
  const L = readFileSync(file, 'utf8').split('\n')
  const found: string[] = []
  L.forEach((line, i) => {
    if (!/\bawait readJson\b/.test(line)) return
    let start = -1
    for (let j = i - 1; j >= Math.max(0, i - 120); j--) {
      if (/async function|async\s*\([^)]*\)\s*=>|async\s+\w+\s*=>/.test(L[j])) { start = j; break }
    }
    if (start < 0) return
    const before = L.slice(start, i).join('\n')
    if (/\btry\s*\{/.test(before)) return
    const raised = [...before.matchAll(/\b(set[A-Z]\w*)\((?!false\)|null\)|''\)|""\))/g)].map((m) => m[1])
    const after = L.slice(i, i + 20).join('\n')
    for (const s of new Set(raised)) {
      if (new RegExp(`\\b${s}\\((false|null|''|"")\\)`).test(after)) found.push(`${file}:${i + 1} ${s}`)
    }
  })
  return found
}

describe('no screen strands a form on a refusal', () => {
  it('no screen lowers its busy flag only on the line after readJson, where a refusal would never reach it', () => {
    const files = [...screens(join(process.cwd(), 'src/app')), ...screens(join(process.cwd(), 'src/components'))]
    const stuck = files.flatMap(stuckForms).map((s) => s.replace(process.cwd() + '/', ''))
    expect(stuck).toEqual([])
  })
})
