import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSkillEvidence, SAY, SKILL_CHECK_PURPOSE, type SkillDeps } from '@/lib/checks/skill-evidence'

/**
 * The one model question the submission check and the screen both ask,
 * through the boundary Ask Etyme uses: the company's switch and allowance,
 * a masked CV, the prompt logged, and never a pass when it was not asked.
 */

const CV = [
  'Priya Nair — priya.nair@example.com — 555-123-4567',
  'Senior engineer at Brightwater Logistics, paid $98.00/hr.',
  'Built services in Spring Boot and Kafka for six years.',
].join('\n')

function deps(over: Partial<SkillDeps> = {}) {
  const call = vi.fn(async (_m: string, prompt: string) => ({
    text: JSON.stringify([
      { skill: 'Spring Boot', found: true, quote: 'Built services in Spring Boot and Kafka for six years.' },
      { skill: 'Kafka', found: true, quote: 'Built services in Spring Boot and Kafka for six years.' },
    ]),
    usage: { input_tokens: 1000, output_tokens: 200 },
    // keeps the prompt visible to the test
    prompt,
  }))
  const record = vi.fn(async () => ({ ok: true as const, id: 'p1', withheld: false }))
  const d: SkillDeps = {
    modelOn: async () => true,
    heldSays: async () => null,
    keySet: () => true,
    call,
    record,
    modelId: () => 'claude-sonnet-5-5',
    ...over,
  }
  return { d, call, record }
}

const ask = (d: SkillDeps) =>
  readSkillEvidence(
    { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', claimed: ['Spring Boot', 'Kafka'], cvText: CV },
    d
  )

describe('the model question behind the submission check and the screen', () => {
  it('the submission check does not call the model while the company’s switch is off', async () => {
    const { d, call, record } = deps({ modelOn: async () => false })
    const r = await ask(d)
    expect(call).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    expect(r.model).toBeNull()
    expect(r.finding?.unverified).toBe(true)
  })

  it('with the switch off the answer is one sentence that names the setting', async () => {
    const { d } = deps({ modelOn: async () => false })
    const r = await ask(d)
    expect(r.finding?.reason).toBe(SAY.off)
    expect(SAY.off).toContain('Settings')
    expect(SAY.off).toContain('Ask Etyme and the model')
    expect(SAY.off.match(/\./g)?.length).toBe(2)
  })

  it('with the switch on and the allowance used, the check says so and does not call the model', async () => {
    const { d, call } = deps({
      modelOn: async () => false,
      heldSays: async () => 'Your company has used its month.',
    })
    const r = await ask(d)
    expect(call).not.toHaveBeenCalled()
    expect(r.finding?.reason).toContain('Your company has used its month.')
    expect(r.finding?.unverified).toBe(true)
  })

  it('with no key the check says it is unverified and never passes', async () => {
    const { d, call } = deps({ keySet: () => false })
    const r = await ask(d)
    expect(call).not.toHaveBeenCalled()
    expect(r.finding).toMatchObject({ checker: 'MODEL', unverified: true })
    expect(r.finding?.reason).toBe(SAY.noKey)
    expect(r.unverifiedBecause).toBe(SAY.noKey)
  })

  it('a machine caller with no person to log against does not reach the model', async () => {
    const { d, call } = deps()
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: null, personName: 'Priya Nair', claimed: ['Kafka'], cvText: CV },
      d
    )
    expect(call).not.toHaveBeenCalled()
    expect(r.finding?.unverified).toBe(true)
  })

  it('the CV is masked before it leaves: no name, email, phone or pay reaches the model', async () => {
    const { d, call } = deps()
    await ask(d)
    const sent = call.mock.calls[0][1]
    for (const real of ['Priya Nair', 'priya.nair@example.com', '555-123-4567', '$98.00/hr']) {
      expect(sent).not.toContain(real)
    }
  })

  it('a claimed skill is never masked as if it were a person’s name', async () => {
    const { d, call } = deps()
    await ask(d)
    expect(call.mock.calls[0][1]).toContain('Built services in Spring Boot and Kafka for six years.')
  })

  it('the prompt and the answer are logged, masked, with the purpose and the tokens', async () => {
    const { d, record } = deps()
    await ask(d)
    expect(record).toHaveBeenCalledTimes(1)
    const row = (record.mock.calls[0] as any[])[0]
    expect(row).toMatchObject({
      companyId: 'c1', personId: 'p1', provider: 'anthropic', model: 'claude-sonnet-5-5',
      purpose: SKILL_CHECK_PURPOSE, tokensIn: 1000, tokensOut: 200,
    })
    expect(row.maskedPrompt).not.toContain('Priya Nair')
    expect(row.realValues).toContain('Priya Nair')
  })

  it('a quote the model gives with a token in it is put back and held to the real CV word for word', async () => {
    const { d } = deps({
      call: async (_m, prompt) => {
        const token = prompt.match(/PERSON_\d+/)?.[0] ?? 'PERSON_1'
        return {
          text: JSON.stringify([{ skill: 'Kafka', found: true, quote: `${token} — ${prompt.match(/EMAIL_\d+/)?.[0]}` }]),
          usage: { input_tokens: 10, output_tokens: 5 },
        }
      },
    })
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', claimed: ['Kafka'], cvText: CV },
      d
    )
    // The put-back quote is "Priya Nair — priya.nair@example.com", which is in the CV.
    expect(r.finding?.verdict).toBe('PASS')
    expect(r.finding?.evidence).toContain('Priya Nair')
  })

  it('a model that invents a quote is discounted and the skill fails', async () => {
    const { d } = deps({
      call: async () => ({
        text: JSON.stringify([{ skill: 'Kafka', found: true, quote: 'Ran Kafka clusters at planet scale.' }]),
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', claimed: ['Kafka'], cvText: CV },
      d
    )
    expect(r.finding?.verdict).toBe('FAIL')
  })

  it('the call returns the model id and the usage so the cost is not costed at the fallback rate', async () => {
    const { d } = deps()
    const r = await ask(d)
    expect(r.model).toBe('claude-sonnet-5-5')
    expect(r.usage).toMatchObject({ input_tokens: 1000, output_tokens: 200 })
    expect(r.finding?.verdict).toBe('PASS')
  })

  it('an answer that is not a list is unverified, not a failure of the candidate, and still carries its cost', async () => {
    const { d } = deps({ call: async () => ({ text: 'Sorry, I cannot.', usage: { input_tokens: 7, output_tokens: 3 } }) })
    const r = await ask(d)
    expect(r.finding).toMatchObject({ verdict: 'PASS', unverified: true })
    expect(r.usage?.input_tokens).toBe(7)
  })

  it('if the log cannot be written the answer is not used', async () => {
    const { d } = deps({ record: async () => ({ ok: false as const }) })
    const r = await ask(d)
    expect(r.finding?.unverified).toBe(true)
    expect(r.finding?.reason).toBe(SAY.notLogged)
  })

  it('nothing is asked when no skills are claimed', async () => {
    const { d, call } = deps()
    const r = await readSkillEvidence(
      { companyId: 'c1', personId: 'p1', personName: 'Priya Nair', claimed: [], cvText: CV },
      d
    )
    expect(r.finding).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })
})

describe('the two routes use the boundary and never call a provider themselves', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  for (const p of ['src/app/api/submissions/[id]/check/route.ts', 'src/app/api/requirements/[id]/screen/route.ts']) {
    it(`${p.split('/api/')[1]} calls no provider directly and stamps the model and cost on its ledger row`, () => {
      const src = read(p)
      expect(src).not.toContain('@anthropic-ai/sdk')
      expect(src).not.toContain('process.env.ANTHROPIC_API_KEY')
      expect(src).toContain('readSkillEvidence(')
      expect(src).toContain('stampModelRun(')
    })
  }
})
