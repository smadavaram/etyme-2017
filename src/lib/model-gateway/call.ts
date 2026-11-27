/**
 * `callModel`: the one door every model call goes through (records 125,
 * 123; plan 9c). Never throws, and never gates a release.
 *
 * In order: the skill's registered class and tier; the company's switch and
 * allowance; Lane C refused by paper type then by pattern; the text masked;
 * the models admitted for this tier and class, in register order; each
 * tried with a timeout, the next on failure with the switch recorded; the
 * masked prompt and answer logged; one ledger row per attempt. With no
 * model admitted and keyed the answer is "Not configured": nothing is sent,
 * nothing falls through to a cheaper model, and nothing is blocked.
 *
 * A skill that may escalate has an inline key (lib/skills/inline-keys). An
 * answer that fails it is asked once more on the high tier, among models
 * admitted for the same data class, and recorded with where it came from; a
 * second failure is never passed on: it is a FAIL row and a card for a person.
 *
 * The cost on a row is Etyme's own, from the register's price, and null
 * where none is set. No charge appears here.
 */

import { record, type RecordType, type Usage } from '@/lib/agent-run'
import { modelOnFor, recordModelPrompt, maskForModel, type MaskVocab } from '@/lib/model-boundary'
import { skillOf, type DataClass } from '@/lib/skills/registry'
import { candidatesFor, costMicrosFromPrice, registerFrom, type ModelTier, type RegisteredModel } from './register'
import { laneCRefusal } from './lane-c'
import { sdkAdapter } from './adapters/sdk'
import { inlineKeyFor } from '@/lib/skills/inline-keys'

type Env = Record<string, string | undefined>

export interface AdapterRequest { system?: string; prompt: string; maxTokens: number }
export interface ModelAdapter {
  call(model: RegisteredModel, req: AdapterRequest, env: Env): Promise<{ text: string; usage: Usage | null }>
}

export interface ModelRequest {
  companyId: string
  /** The person on whose authority the call is made; the prompt log hangs on her. */
  personId: string
  skillKey: string
  /** Why it was sent, for the prompt log. */
  purpose: string
  prompt: string
  system?: string
  /** For a paper: its type, so a Lane C paper is refused before its text is looked at. */
  documentType?: string | null
  /** Names the record knows, masked before anything leaves. */
  vocab?: MaskVocab
  record: { recordType: RecordType; recordId: string }
  agentKey?: string | null
  maxTokens?: number
  /** The text the answer's quotes must come from, for a skill whose key checks quotes. */
  source?: string
  /** The tenant's own recorded opt-in (record 96); counts for a tenant's own model only. */
  tenantOptIn?: boolean
}

export interface ModelDeps {
  env?: Env
  adapters?: Record<string, ModelAdapter>
  models?: readonly RegisteredModel[]
  modelOn?: (companyId: string) => Promise<boolean>
  recordRun?: typeof record
  logPrompt?: typeof recordModelPrompt
  timeoutMs?: number
  /** Opens a card for a person when an answer fails its key twice. The caller's agent supplies it. */
  openCard?: (c: { companyId: string; skillKey: string; question: string; proof: string; record: { recordType: RecordType; recordId: string } }) => Promise<void>
}

export type ModelStatus = 'NOT_CONFIGURED' | 'OFF' | 'LANE_C' | 'REFUSED' | 'FAILED' | 'KEY_FAILED'

export type ModelResult =
  | {
      ok: true
      /** Unmasked, for the caller. */
      text: string
      model: string
      tier: ModelTier
      usage: Usage | null
      /** Etyme's own cost in millionths of a dollar; null where no price is set. */
      costMicros: number | null
      fallbackFrom: string | null
      escalatedFrom: ModelTier | null
      runId: string | null
      promptLogged: boolean
    }
  | { ok: false; status: ModelStatus; says: string }

export const NOT_CONFIGURED_SAYS =
  'Not configured: no model is set up for this kind of data, so nothing was sent. The rules answer.'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 1024

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No answer within ${Math.round(ms / 1000)} seconds.`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })

export async function callModel(req: ModelRequest, deps: ModelDeps = {}): Promise<ModelResult> {
  const env = deps.env ?? process.env
  const recordRun = deps.recordRun ?? record
  const adapters = deps.adapters ?? { sdk: sdkAdapter() }
  const started = Date.now()
  const skill = skillOf(req.skillKey)
  if (!skill) return { ok: false, status: 'REFUSED', says: `${req.skillKey} is not a registered skill, so no model was asked.` }
  if (skill.tier === 'RULES') return { ok: false, status: 'REFUSED', says: `${skill.name} is a rules skill and may not call a model.` }
  const startTier: ModelTier = skill.tier
  const dataClass: DataClass = skill.dataClass
  const row = (extra: Parameters<typeof record>[0] extends infer R ? Partial<R> : never) => ({
    companyId: req.companyId, agent: skill.key, skillKey: skill.key, agentKey: req.agentKey ?? null,
    recordType: req.record.recordType, recordId: req.record.recordId, ms: Date.now() - started,
    verdict: 'ERROR' as const, tier: startTier, ...extra,
  })

  const on = await (deps.modelOn ?? modelOnFor)(req.companyId).catch(() => false)
  if (!on) return { ok: false, status: 'OFF', says: 'The model is not on for this company, so nothing was sent.' }

  const refusal = laneCRefusal({ documentType: req.documentType, texts: [req.prompt, req.system ?? ''] })
  if (refusal.refused) {
    await recordRun(row({ failReason: `Lane C · not sent. ${refusal.says}` }))
    return { ok: false, status: 'LANE_C', says: refusal.says }
  }

  const mask = maskForModel(req.prompt, req.vocab)
  const sysMask = req.system ? maskForModel(req.system, req.vocab) : null
  const maskedPrompt = mask.masked
  const system = sysMask?.masked

  const register = deps.models ? { models: [...deps.models] } : registerFrom(env)
  const candidates = candidatesFor(startTier, dataClass, env, { models: register.models, tenantOptIn: req.tenantOptIn })
  if (candidates.length === 0) {
    await recordRun(row({ failReason: 'Not configured: no admitted model with a key for this tier and kind of data.' }))
    return { ok: false, status: 'NOT_CONFIGURED', says: NOT_CONFIGURED_SAYS }
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const key = skill.mayEscalate ? inlineKeyFor(skill.key) : null

  type Got = { m: RegisteredModel; text: string; usage: Usage | null; ms: number; fallbackFrom: string | null; logged: boolean }
  /** Ask each admitted model of one tier in order; the first answer wins. Every failure is a ledger row. */
  async function askTier(models: RegisteredModel[], escalatedFrom: ModelTier | null): Promise<{ got: Got } | { why: string }> {
    let firstFailed: string | null = null
    let why = ''
    for (const m of models) {
      const adapter = adapters[m.adapter]
      const t0 = Date.now()
      try {
        if (!adapter) throw new Error(`No adapter named ${m.adapter}.`)
        const out = await withTimeout(adapter.call(m, { system, prompt: maskedPrompt, maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS }, env), timeoutMs)
        const logged = await (deps.logPrompt ?? recordModelPrompt)({
          companyId: req.companyId, personId: req.personId, provider: m.label, model: m.id,
          maskedPrompt, maskedAnswer: out.text, tokensIn: out.usage?.input_tokens ?? null, tokensOut: out.usage?.output_tokens ?? null,
          purpose: req.purpose, realValues: mask.realValues(),
        })
        return { got: { m, text: mask.unmask(out.text), usage: out.usage ?? null, ms: Date.now() - t0, fallbackFrom: firstFailed, logged: logged.ok } }
      } catch (e) {
        why = String((e as Error)?.message ?? e).slice(0, 200)
        await recordRun(row({
          model: m.id, tier: m.tier, ms: Date.now() - t0, byTenantModel: m.byTenant === true,
          fallbackFrom: firstFailed, escalatedFrom, failReason: `${m.label} failed: ${why}`,
        }))
        firstFailed ??= m.id
      }
    }
    return { why }
  }

  /** The row for an answer that came back, graded by the inline key where there is one. */
  async function settle(g: Got, escalatedFrom: ModelTier | null): Promise<{ result: ModelResult & { ok: true }; keyFailed: string | null }> {
    const verdict = key ? key(g.text, { source: req.source }) : null
    const costMicros = costMicrosFromPrice(g.m.price, g.usage ?? {})
    const runId = await recordRun(row({
      verdict: verdict && !verdict.ok ? 'FAIL' : 'PASS', tier: g.m.tier, model: g.m.id, usage: g.usage, ms: g.ms,
      byTenantModel: g.m.byTenant === true, fallbackFrom: g.fallbackFrom, escalatedFrom,
      failReason: verdict && !verdict.ok ? `Failed its check: ${verdict.reason}` : costMicros === null ? 'Price not set.' : null,
    }))
    return {
      keyFailed: verdict && !verdict.ok ? verdict.reason : null,
      result: {
        ok: true, text: g.text, model: g.m.id, tier: g.m.tier, usage: g.usage, costMicros,
        fallbackFrom: g.fallbackFrom, escalatedFrom, runId, promptLogged: g.logged,
      },
    }
  }

  const first = await askTier(candidates, null)
  if (!('got' in first)) {
    return { ok: false, status: 'FAILED', says: `Every model for this step failed (${first.why}). Nothing was sent on.` }
  }
  const a = await settle(first.got, null)
  if (a.keyFailed === null) return a.result

  // The answer failed its key. Once, on the high tier, only where the skill allows it and only to a
  // model admitted for the same data class; a second failure goes to a person and never passes.
  const needsPerson = async (why: string): Promise<ModelResult> => {
    const says = `${why} A person needs to look at this.`
    await deps.openCard?.({ companyId: req.companyId, skillKey: skill.key, question: `${skill.name}: a person needs to look at this answer.`, proof: says, record: req.record })
    return { ok: false, status: 'KEY_FAILED', says }
  }
  if (!(skill.mayEscalate && startTier === 'LOW')) return needsPerson(`The answer failed its check (${a.keyFailed}).`)
  const high = candidatesFor('HIGH', dataClass, env, { models: register.models, tenantOptIn: req.tenantOptIn })
  if (high.length === 0) return needsPerson(`The answer failed its check (${a.keyFailed}) and no high-tier model is set up for this kind of data.`)
  const second = await askTier(high, 'LOW')
  if (!('got' in second)) return needsPerson(`The answer failed its check (${a.keyFailed}) and the high tier did not answer (${second.why}).`)
  const b = await settle(second.got, 'LOW')
  return b.keyFailed === null ? b.result : needsPerson(`The answer failed its check on both tiers (${b.keyFailed}).`)
}
