/**
 * The one model question the submission check and the screen both ask: is
 * each claimed skill in the CV, and on which line.
 *
 * It goes through the same boundary Ask Etyme uses (lib/model-boundary):
 *
 *   - the company's own switch, off until an owner or admin turns it on,
 *     and the allowance behind it (`modelOnFor`); off means the model is
 *     never called and the answer says so in one sentence naming the
 *     setting;
 *   - the CV is masked before it leaves (`maskForModel`): the person's
 *     name, emails, phone numbers, pay. The model's quotes come back with
 *     tokens in them and are put back before they are checked against the
 *     real CV, so a quote is still held to "word for word";
 *   - the prompt and the answer are logged, masked (`recordModelPrompt`).
 *
 * A check that could not ask the model is never a pass. It comes back
 * `unverified`, with the reason, and says nothing was verified. A rules
 * result is never presented as a model result (decision 96).
 *
 * The cost of the call is stamped on the ledger row the loop wrote
 * (`stampModelRun`): lib/loop writes that row without the model or the
 * usage, so a call was costed at nothing and read as "ran and had nothing
 * to say". Once the loop's step result carries model and usage, the stamp
 * goes and the loop writes it.
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { modelFor } from '@/lib/model-ids'
import { costMicrosOf, type Usage } from '@/lib/agent-run'
import {
  maskForModel,
  modelOnFor,
  modelSetUpHere,
  modelSwitchFor,
  recordModelPrompt,
} from '@/lib/model-boundary'
import { evidencePrompt, evidenceCheck, type Evidenced } from '@/lib/checks'
import type { Finding } from '@/lib/loop'

/** The prompt log's purpose for this question. */
export const SKILL_CHECK_PURPOSE = 'SKILL_CHECK'

export const SAY = {
  off:
    'The model is off for your company, so the skills in the CV are unchecked. ' +
    'An owner or admin can turn it on in Settings, under Ask Etyme and the model.',
  heldAfter: ' The skills in the CV are unchecked.',
  noKey: 'No model is set up on this deployment, so the skills in the CV are unchecked.',
  noPerson: 'This was asked by a machine with no person to log it against, so the model was not used and the skills in the CV are unchecked.',
  notLogged: 'The question to the model could not be logged, so its answer was not used and the skills in the CV are unchecked.',
  unreadable: 'The model’s answer could not be read, so the skills in the CV are unchecked.',
} as const

export interface SkillRead {
  /** Null where there was nothing to ask: no claimed skills. */
  finding: Finding | null
  /** Set only where a model was called. */
  model: string | null
  usage: Usage | null
  /** Why nothing was verified; null where the model answered. */
  unverifiedBecause: string | null
}

export interface SkillDeps {
  modelOn: (companyId: string) => Promise<boolean>
  heldSays: (companyId: string) => Promise<string | null>
  keySet: () => boolean
  call: (model: string, prompt: string) => Promise<{ text: string; usage: Usage }>
  record: typeof recordModelPrompt
  modelId: () => string
}

export const liveDeps: SkillDeps = {
  modelOn: modelOnFor,
  heldSays: async (companyId) => (await modelSwitchFor(companyId)).heldSays,
  keySet: () => modelSetUpHere(),
  call: async (model, prompt) => {
    const response = await new Anthropic().messages.create({
      model,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content.find((b) => b.type === 'text')
    return { text: text && text.type === 'text' ? text.text : '', usage: response.usage as Usage }
  },
  record: recordModelPrompt,
  modelId: () => modelFor('CHECK'),
}

const CODE = 'SKILLS_EVIDENCED'

export function unverifiedSkills(reason: string): Finding {
  return { code: CODE, checker: 'MODEL', verdict: 'PASS', unverified: true, reason }
}

function said(why: string, model: string | null = null, usage: Usage | null = null): SkillRead {
  return { finding: unverifiedSkills(why), model, usage, unverifiedBecause: why }
}

/** Keep each claimed skill out of the mask: "Spring Boot" is not a person. */
function shieldSkills(text: string, claimed: string[]): { text: string; restore: (s: string) => string } {
  const held: string[] = []
  let out = text
  for (const skill of claimed) {
    const s = skill.trim()
    if (s.length < 2) continue
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')
    out = out.replace(re, (m) => `SKILL_TERM_${held.push(m)}`)
  }
  return {
    text: out,
    restore: (s) => s.replace(/SKILL_TERM_(\d+)/g, (m, n) => held[Number(n) - 1] ?? m),
  }
}

export async function readSkillEvidence(
  input: {
    companyId: string
    /** The person who pressed it; null for a machine caller. */
    personId: string | null
    personName: string
    claimed: string[]
    cvText: string
  },
  deps: SkillDeps = liveDeps
): Promise<SkillRead> {
  const { companyId, claimed, cvText } = input
  if (claimed.length === 0) return { finding: null, model: null, usage: null, unverifiedBecause: null }

  if (!(await deps.modelOn(companyId))) {
    const held = await deps.heldSays(companyId).catch(() => null)
    return said(held ? `${held}${SAY.heldAfter}` : SAY.off)
  }
  if (!deps.keySet()) return said(SAY.noKey)
  if (!input.personId) return said(SAY.noPerson)

  const shield = shieldSkills(cvText, claimed)
  const mask = maskForModel(shield.text, { people: [input.personName] })
  const maskedCv = shield.restore(mask.masked)
  const prompt = evidencePrompt(claimed, maskedCv)

  const model = deps.modelId()
  const { text, usage } = await deps.call(model, prompt)

  // Logged before anything is put back: the log holds the masked text only.
  const logged = await deps.record({
    companyId,
    personId: input.personId,
    provider: 'anthropic',
    model,
    maskedPrompt: prompt,
    maskedAnswer: text,
    tokensIn: usage.input_tokens ?? null,
    tokensOut: usage.output_tokens ?? null,
    purpose: SKILL_CHECK_PURPOSE,
    realValues: mask.realValues(),
  })
  if (!logged.ok) return said(SAY.notLogged, model, usage)

  const json = text.match(/\[[\s\S]*\]/)
  let answers: Evidenced[]
  try {
    answers = json ? JSON.parse(json[0]) : null
    if (!Array.isArray(answers)) throw new Error('not a list')
  } catch {
    return said(SAY.unreadable, model, usage)
  }

  // The quotes come back with tokens in them; the real CV is the judge.
  const real = answers.map((a) => ({ ...a, quote: typeof a.quote === 'string' ? mask.unmask(a.quote) : null }))
  return { finding: evidenceCheck(claimed, real, cvText), model, usage, unverifiedBecause: null }
}

/**
 * Put the model, the usage and the cost on the ledger row the loop wrote
 * for the model step, and say on it when nothing was verified. Never throws.
 */
export async function stampModelRun(run: {
  companyId: string
  agent: string
  recordId: string
  attempt: number
  read: SkillRead | null
}): Promise<void> {
  if (!run.read) return
  const { model, usage, unverifiedBecause } = run.read
  try {
    await prisma.agentRun.updateMany({
      where: { companyId: run.companyId, agent: run.agent, recordType: 'SUBMISSION', recordId: run.recordId, attempt: run.attempt },
      data: {
        ...(model
          ? {
              model,
              inputTokens: usage?.input_tokens ?? null,
              outputTokens: usage?.output_tokens ?? null,
              cacheReadTokens: usage?.cache_read_input_tokens ?? null,
              cacheWriteTokens: usage?.cache_creation_input_tokens ?? null,
              costMicros: usage ? costMicrosOf(model, usage) : null,
            }
          : {}),
        ...(unverifiedBecause ? { failReason: `Unverified: ${unverifiedBecause}`.slice(0, 300) } : {}),
      },
    })
  } catch (err) {
    console.error('skill-evidence: could not stamp the run', err)
  }
}
