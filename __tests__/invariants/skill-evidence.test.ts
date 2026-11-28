import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSkillEvidence, SAY, SKILL_CHECK_PURPOSE, type SkillDeps } from '@/lib/checks/skill-evidence'
import type { ModelRequest, ModelResult } from '@/lib/model-gateway/call'
import { NOT_CONFIGURED_SAYS } from '@/lib/model-gateway/call'
import { maskForModel } from '@/lib/model-boundary'

/**
 * The one model question the submission check and the screen both ask,
 * through the one model gateway (record 125): the company's switch, the
 * mask, the prompt log and the ledger are the gateway's, and a question
 * that was not answered is never a pass.
 */

const CV = [
  'Priya Nair — priya.nair@example.com — 555-123-4567',
  'Senior engineer at Brightwater Logistics, paid $98.00/hr.',
  'Built services in Spring Boot and Kafka for six years.',
].join('\n')

const ANSWER = JSON.stringify([
  { skill: 'Spring Boot', found: true, quote: 'Built services in Spring Boot and Kafka for six years.' },
  { skill: 'Kafka', found: true, quote: 'Built services in Spring Boot and Kafka for six years.' },
])

const okResult = (text = ANSWER, over: Partial<Extract<ModelResult, { ok: true }>> = {}): ModelResult => ({
  ok: true, text, model: 'model-a', tier: 'LOW', usage: { input_tokens: 1000, output_tokens: 200 }, costMicros: null,
  fallbackFrom: null, escalatedFrom: null, runId: 'r1', promptLogged: true, ...over,
})

function deps(over: Partial<SkillDeps> = {}) {
  const call = vi.fn(async (_r: ModelRequest, _d?: unknown): Promise<ModelResult> => okResult())
  const d: SkillDeps = { call: call as SkillDeps['call'], heldSays: async () => null, ...over }
  return { d, call }
}

const ask = (d: SkillDeps) =>
  readSkillEvidence(
    { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', recordId: 's1', claimed: ['Spring Boot', 'Kafka'], cvText: CV },
    d
  )
const refused = (status: Extract<ModelResult, { ok: false }>['status'], says = 'x'): ModelResult => ({ ok: false, status, says })

describe('the model question behind the submission check and the screen', () => {
  it('the question goes to the gateway as the skills.evidence skill, from the person who pressed it, with the CV as the source of every quote', async () => {
    const { d, call } = deps()
    await ask(d)
    expect(call.mock.calls[0][0]).toMatchObject({
      skillKey: 'skills.evidence', companyId: 'c1', personId: 'p1', purpose: SKILL_CHECK_PURPOSE,
      source: CV, record: { recordType: 'SUBMISSION', recordId: 's1' },
    })
  })

  it('with the company’s switch off the check says so in one sentence that names the setting, and is never a pass', async () => {
    const { d } = deps({ call: (async () => refused('OFF')) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding).toMatchObject({ checker: 'MODEL', unverified: true, reason: SAY.off })
    expect(SAY.off).toContain('Settings')
    expect(SAY.off).toContain('Ask Etyme and the model')
    expect(SAY.off.match(/\./g)?.length).toBe(2)
    expect(r.model).toBeNull()
  })

  it('with the switch on and the allowance used, the check says so', async () => {
    const { d } = deps({ call: (async () => refused('OFF')) as SkillDeps['call'], heldSays: async () => 'Your company has used its month.' })
    const r = await ask(d)
    expect(r.finding?.reason).toContain('Your company has used its month.')
    expect(r.finding?.unverified).toBe(true)
  })

  it('with no model set up the check says Not configured, is unverified, and never passes', async () => {
    const { d } = deps({ call: (async () => refused('NOT_CONFIGURED', NOT_CONFIGURED_SAYS)) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding).toMatchObject({ checker: 'MODEL', unverified: true })
    expect(r.finding?.reason).toBe(SAY.noKey)
    expect(SAY.noKey).toMatch(/^Not configured/)
    expect(r.unverifiedBecause).toBe(SAY.noKey)
  })

  it('a CV the gateway refuses as a Lane C paper is unverified and says nothing was sent', async () => {
    const { d } = deps({ call: (async () => refused('LANE_C', 'This looks like an I-9.')) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding?.unverified).toBe(true)
    expect(r.finding?.reason).toContain('This looks like an I-9.')
  })

  it('a model that failed, or whose answer failed its check twice, leaves the skills unchecked for a person', async () => {
    for (const status of ['FAILED', 'KEY_FAILED'] as const) {
      const { d } = deps({ call: (async () => refused(status)) as SkillDeps['call'] })
      const r = await ask(d)
      expect(r.finding).toMatchObject({ unverified: true })
      expect(r.finding?.reason).toBe(SAY.failed)
    }
  })

  it('a gateway call that throws is said, never turned into a pass or a crash', async () => {
    const { d } = deps({ call: (async () => { throw new Error('socket hang up') }) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding).toMatchObject({ unverified: true, reason: SAY.failed })
  })

  it('a machine caller with no person to log against does not reach the model', async () => {
    const { d, call } = deps()
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: null, personName: 'Priya Nair', recordId: 's1', claimed: ['Kafka'], cvText: CV },
      d
    )
    expect(call).not.toHaveBeenCalled()
    expect(r.finding?.unverified).toBe(true)
  })

  it('the name goes to the gateway to be masked, and a claimed skill is kept out of the mask', async () => {
    const { d, call } = deps()
    await ask(d)
    expect(call.mock.calls[0][0].vocab).toEqual({ people: ['Priya Nair'], keep: ['Spring Boot', 'Kafka'] })
  })

  it('a claimed skill is never masked as if it were a person’s name, and the person’s name still is', () => {
    const m = maskForModel('Priya Nair built services in Spring Boot and Kafka.', { people: ['Priya Nair'], keep: ['Spring Boot', 'Kafka'] })
    expect(m.masked).toContain('Spring Boot and Kafka')
    expect(m.masked).not.toContain('Priya')
  })

  it('a quote the gateway gives back is held to the real CV word for word, and a true one passes', async () => {
    const { d } = deps()
    const r = await ask(d)
    expect(r.finding?.verdict).toBe('PASS')
    expect(r.finding?.unverified).toBeFalsy()
  })

  it('a model that invents a quote is discounted and the skill fails', async () => {
    const { d } = deps({
      call: (async () => okResult(JSON.stringify([{ skill: 'Kafka', found: true, quote: 'Ran Kafka clusters at planet scale.' }]))) as SkillDeps['call'],
    })
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', recordId: 's1', claimed: ['Kafka'], cvText: CV },
      d
    )
    expect(r.finding?.verdict).toBe('FAIL')
  })

  it('the call returns the model id and the usage the gateway reported', async () => {
    const { d } = deps()
    const r = await ask(d)
    expect(r.model).toBe('model-a')
    expect(r.usage).toMatchObject({ input_tokens: 1000, output_tokens: 200 })
  })

  it('an answer that is not a list is unverified, not a failure of the candidate, and still carries its usage', async () => {
    const { d } = deps({ call: (async () => okResult('Sorry, I cannot.', { usage: { input_tokens: 7, output_tokens: 3 } })) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding).toMatchObject({ verdict: 'PASS', unverified: true })
    expect(r.usage?.input_tokens).toBe(7)
  })

  it('if the gateway could not log the prompt the answer is not used', async () => {
    const { d } = deps({ call: (async () => okResult(ANSWER, { promptLogged: false })) as SkillDeps['call'] })
    const r = await ask(d)
    expect(r.finding?.unverified).toBe(true)
    expect(r.finding?.reason).toBe(SAY.notLogged)
  })

  it('nothing is asked when no skills are claimed', async () => {
    const { d, call } = deps()
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', recordId: 's1', claimed: [], cvText: CV },
      d
    )
    expect(r.finding).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })

  it('the skill check file imports no model provider and reads no provider key or model id', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/checks/skill-evidence.ts'), 'utf8')
    expect(src).not.toMatch(/@anthropic-ai\/sdk|ANTHROPIC_API_KEY|modelFor\(|provider: 'anthropic'/)
  })
})

describe('the two routes use the boundary and never call a provider themselves', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  for (const p of ['src/app/api/submissions/[id]/check/route.ts', 'src/app/api/requirements/[id]/screen/route.ts']) {
    it(`${p.split('/api/')[1]} calls no provider directly and leaves the model and cost to the gateway's ledger row`, () => {
      const src = read(p)
      expect(src).not.toContain('@anthropic-ai/sdk')
      expect(src).not.toContain('process.env.ANTHROPIC_API_KEY')
      expect(src).toContain('readSkillEvidence(')
      expect(src).toContain('noteUnverified(')
      expect(src).not.toContain('stampModelRun(')
    })
  }
})
