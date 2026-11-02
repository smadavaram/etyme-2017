import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activateBody, ACTIVATE_FIELDS_NOT_SENT } from '@/app/dashboard/contracts/activate-body'
import { startWarningVerdict, type StartWarning } from '@/lib/money/start-warnings'
import { reasonAsked } from '@/lib/award/reason-asked'

/**
 * Every question the start asks, the Activate dialog has a field for.
 *
 * The join demand holds for Place and regulatory for Document requests
 * (the founder's I-9 bug, 2026-11-01): the dialog's fields are filled in,
 * exactly what it posts is built (`activateBody`), and the start's own
 * rule is run on it (`startWarningVerdict`). A refusal naming a field the
 * dialog never offers fails here.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/contracts/[id]/activate/route.ts'), 'utf8')
const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')

const PAPERS: StartWarning = { code: 'DOCUMENTS_WARN', says: 'Priya Raman has no background check on file.' }
const RULE: StartWarning = { code: 'GOVERNANCE_WARN', says: 'This rate is 12% over the band for the job.', detail: { evaluations: [] } }

/** The start's own reading of what the dialog posts. */
const startReads = (warnings: StartWarning[], body: Record<string, unknown>) =>
  startWarningVerdict(warnings, {
    reason: typeof body.overrideReason === 'string' ? body.overrideReason : null,
    answering: Array.isArray(body.answering) ? (body.answering as string[]) : null,
  })

/** What the dialog's box shows, as the page reads the refusal: the question, and the warnings it answers. */
const boxFor = (error: Record<string, unknown>) => {
  const q = reasonAsked(error)
  const shown = Array.isArray(error.warnings) ? (error.warnings as { code: string }[]).map((w) => w.code) : [String(error.code)]
  return { q, shown }
}

describe('every question the start asks, the Activate dialog has a field for', () => {
  it('every field the start reads from its body is one the dialog sends, or is named with why the dialog never needs to', () => {
    const read = new Set([
      ...[...ROUTE.matchAll(/body\??\.([a-zA-Z]+)/g)].map((m) => m[1]),
      ...[...ROUTE.matchAll(/const \{([^}]+)\} = body\b/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(':')[0].trim())),
    ])
    const sendable = new Set(Object.keys(activateBody({ action: 'activate', reason: 'On file Monday.', answering: ['DOCUMENTS_WARN'] })))
    const unoffered = [...read].filter((f) => !sendable.has(f) && !(f in ACTIVATE_FIELDS_NOT_SENT))
    expect(unoffered).toEqual([])
  })

  it('the first press sends the act and nothing the person did not type', () => {
    expect(activateBody({ action: 'activate' })).toEqual({ action: 'activate' })
    expect(activateBody({ action: 'activate', reason: '', answering: ['DOCUMENTS_WARN'] })).toEqual({ action: 'activate' })
  })

  it('a paperwork warning draws the box, and the reason typed in it clears the start’s own rule', () => {
    const first = startReads([PAPERS], activateBody({ action: 'activate' }))
    expect(first.ok).toBe(false)
    const { q, shown } = boxFor(first.ok ? {} : first.error)
    expect(q?.field).toBe('overrideReason')
    const body = activateBody({ action: 'activate', reason: 'The provider confirmed it by phone; the report follows.', answering: shown })
    expect(startReads([PAPERS], body)).toEqual({ ok: true, answered: [PAPERS] })
  })

  it('the paperwork and the client’s rule are asked in one box, and the one reason answers both', () => {
    const first = startReads([PAPERS, RULE], activateBody({ action: 'activate' }))
    expect(first.ok).toBe(false)
    const { q, shown } = boxFor(first.ok ? {} : first.error)
    expect(q?.field).toBe('overrideReason')
    expect(shown).toEqual(['DOCUMENTS_WARN', 'GOVERNANCE_WARN'])
    const v = startReads([PAPERS, RULE], activateBody({ action: 'activate', reason: 'Approved by the VP on the call.', answering: shown }))
    expect(v.ok && v.answered.map((w) => w.code)).toEqual(['DOCUMENTS_WARN', 'GOVERNANCE_WARN'])
  })

  it('a reason typed for the paperwork never answers a rule the person was not shown: the start asks again, and the box shows it', () => {
    const v = startReads([PAPERS, RULE], activateBody({ action: 'activate', reason: 'On file Monday.', answering: ['DOCUMENTS_WARN'] }))
    expect(v.ok).toBe(false)
    const { q, shown } = boxFor(v.ok ? {} : v.error)
    expect(q?.field).toBe('overrideReason')
    expect(shown).toEqual(['GOVERNANCE_WARN'])
  })

  it('the Activate dialog posts what the builder builds, and draws its box from the refusal the start sends', () => {
    expect(PAGE).toMatch(/const payload = activateBody\(\{ action, reason: overrideReasonText, answering \}\)/)
    expect(PAGE).toMatch(/const q = reasonAsked\(body\.error\)\s+if \(q && q\.field === 'overrideReason'\)/)
  })
})
