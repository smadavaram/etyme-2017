/**
 * The one model question the submission check and the screen both ask: is
 * each claimed skill in the CV, and on which line.
 *
 * It goes through the one model gateway (record 125, lib/model-gateway) as
 * the `skills.evidence` skill, and the gateway does what used to be done
 * here: the company's switch and allowance, the mask, the prompt log, the
 * ledger row with the model, usage and cost (null where no price is set),
 * and the one retry on the high tier when a quote is not in the CV. This
 * file keeps what is the check's own:
 *
 *   - the person's name goes to the mask, and each claimed skill is kept
 *     out of it: "Spring Boot" is not a person;
 *   - the quotes that come back are held to the real CV, word for word;
 *   - a check that could not ask the model is never a pass. It comes back
 *     `unverified`, with the reason, and says nothing was verified. A rules
 *     result is never presented as a model result (decision 96).
 *
 * "Not configured" is a sentence, never a gate and never a silent failure.
 */
import { prisma } from '@/lib/db'
import { modelSwitchFor } from '@/lib/model-boundary'
import { callModel, type ModelDeps, type ModelRequest, type ModelResult } from '@/lib/model-gateway/call'
import type { Usage } from '@/lib/agent-run'
import { evidencePrompt, evidenceCheck, type Evidenced } from '@/lib/checks'
import type { Finding } from '@/lib/loop'

/** The prompt log's purpose for this question. */
export const SKILL_CHECK_PURPOSE = 'SKILL_CHECK'

export const SAY = {
  off:
    'The model is off for your company, so the skills in the CV are unchecked. ' +
    'An owner or admin can turn it on in Settings, under Ask Etyme and the model.',
  heldAfter: ' The skills in the CV are unchecked.',
  noKey: 'Not configured: no model is set up for this kind of data, so the skills in the CV are unchecked.',
  noPerson: 'This was asked by a machine with no person to log it against, so the model was not used and the skills in the CV are unchecked.',
  notLogged: 'The question to the model could not be logged, so its answer was not used and the skills in the CV are unchecked.',
  unreadable: 'The model’s answer could not be read, so the skills in the CV are unchecked.',
  failed: 'The model did not give a usable answer, so the skills in the CV are unchecked and a person needs to look.',
  laneC: ' Nothing was sent, and the skills in the CV are unchecked.',
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
  /** The gateway; a test hands in its own. */
  call: (req: ModelRequest, deps?: ModelDeps) => Promise<ModelResult>
  /** Why the company's model is held, in a sentence, where the allowance is used; null otherwise. */
  heldSays: (companyId: string) => Promise<string | null>
  /** The gateway's own dependencies (adapters, register, switch, ledger), for a test. */
  gateway?: ModelDeps
}

export const liveDeps: SkillDeps = {
  call: callModel,
  heldSays: async (companyId) => (await modelSwitchFor(companyId)).heldSays,
}

const CODE = 'SKILLS_EVIDENCED'

export function unverifiedSkills(reason: string): Finding {
  return { code: CODE, checker: 'MODEL', verdict: 'PASS', unverified: true, reason }
}

function said(why: string, model: string | null = null, usage: Usage | null = null): SkillRead {
  return { finding: unverifiedSkills(why), model, usage, unverifiedBecause: why }
}

export async function readSkillEvidence(
  input: {
    companyId: string
    /** The person who pressed it; null for a machine caller. */
    personId: string | null
    personName: string
    /** The submission the check is about, for the ledger row. */
    recordId: string
    claimed: string[]
    cvText: string
  },
  deps: SkillDeps = liveDeps
): Promise<SkillRead> {
  const { companyId, claimed, cvText } = input
  if (claimed.length === 0) return { finding: null, model: null, usage: null, unverifiedBecause: null }
  if (!input.personId) return said(SAY.noPerson)

  let got: ModelResult
  try {
    got = await deps.call(
      {
        companyId,
        personId: input.personId,
        skillKey: 'skills.evidence',
        purpose: SKILL_CHECK_PURPOSE,
        prompt: evidencePrompt(claimed, cvText),
        vocab: { people: [input.personName], keep: claimed },
        source: cvText,
        record: { recordType: 'SUBMISSION', recordId: input.recordId },
        maxTokens: 4000,
      },
      deps.gateway
    )
  } catch {
    return said(SAY.failed)
  }

  if (!got.ok) {
    switch (got.status) {
      case 'OFF': {
        const held = await deps.heldSays(companyId).catch(() => null)
        return said(held ? `${held}${SAY.heldAfter}` : SAY.off)
      }
      case 'NOT_CONFIGURED': return said(SAY.noKey)
      case 'LANE_C': return said(`${got.says}${SAY.laneC}`)
      case 'REFUSED': return said(got.says)
      default: return said(SAY.failed)
    }
  }

  const { model, usage } = got
  if (!got.promptLogged) return said(SAY.notLogged, model, usage)

  const json = got.text.match(/\[[\s\S]*\]/)
  let answers: Evidenced[]
  try {
    answers = json ? JSON.parse(json[0]) : null
    if (!Array.isArray(answers)) throw new Error('not a list')
  } catch {
    return said(SAY.unreadable, model, usage)
  }

  // The gateway put the real values back; the real CV is the judge.
  return { finding: evidenceCheck(claimed, answers, cvText), model, usage, unverifiedBecause: null }
}

/**
 * Say on the ledger row the loop wrote for this step that nothing was
 * verified, and why. The model, usage and cost are on the gateway's own row
 * and are never written twice. Never throws.
 */
export async function noteUnverified(run: {
  companyId: string
  agent: string
  recordId: string
  attempt: number
  read: SkillRead | null
}): Promise<void> {
  if (!run.read?.unverifiedBecause) return
  try {
    await prisma.agentRun.updateMany({
      where: { companyId: run.companyId, agent: run.agent, skillKey: null, recordType: 'SUBMISSION', recordId: run.recordId, attempt: run.attempt },
      data: { failReason: `Unverified: ${run.read.unverifiedBecause}`.slice(0, 300) },
    })
  } catch (err) {
    console.error('skill-evidence: could not note the run', err)
  }
}
