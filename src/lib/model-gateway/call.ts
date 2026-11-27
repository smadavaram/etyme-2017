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
 * The cost on a row is Etyme's own, from the register's price, and null
 * where none is set. No charge appears here.
 */

import { record, type RecordType, type Usage } from '@/lib/agent-run'
import { modelOnFor, recordModelPrompt, maskForModel, type MaskVocab } from '@/lib/model-boundary'
import { skillOf, type DataClass } from '@/lib/skills/registry'
import { candidatesFor, costMicrosFromPrice, registerFrom, type ModelTier, type RegisteredModel } from './register'
import { laneCRefusal } from './lane-c'
import { sdkAdapter } from './adapters/sdk'

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
}

export type ModelStatus = 'NOT_CONFIGURED' | 'OFF' | 'LANE_C' | 'REFUSED' | 'FAILED'

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
  let firstFailed: string | null = null
  let lastWhy = ''
  for (const m of candidates) {
    const adapter = adapters[m.adapter]
    const t0 = Date.now()
    try {
      if (!adapter) throw new Error(`No adapter named ${m.adapter}.`)
      const out = await withTimeout(adapter.call(m, { system, prompt: maskedPrompt, maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS }, env), timeoutMs)
      const text = mask.unmask(out.text)
      const logged = await (deps.logPrompt ?? recordModelPrompt)({
        companyId: req.companyId, personId: req.personId, provider: m.label, model: m.id,
        maskedPrompt, maskedAnswer: out.text, tokensIn: out.usage?.input_tokens ?? null, tokensOut: out.usage?.output_tokens ?? null,
        purpose: req.purpose, realValues: mask.realValues(),
      })
      const costMicros = costMicrosFromPrice(m.price, out.usage ?? {})
      const runId = await recordRun(row({
        verdict: 'PASS', tier: m.tier, model: m.id, usage: out.usage ?? null, ms: Date.now() - t0,
        byTenantModel: m.byTenant === true, fallbackFrom: firstFailed,
        failReason: costMicros === null ? 'Price not set.' : null,
      }))
      return {
        ok: true, text, model: m.id, tier: m.tier, usage: out.usage ?? null, costMicros,
        fallbackFrom: firstFailed, escalatedFrom: null, runId, promptLogged: logged.ok,
      }
    } catch (e) {
      lastWhy = String((e as Error)?.message ?? e).slice(0, 200)
      await recordRun(row({
        model: m.id, tier: m.tier, ms: Date.now() - t0, byTenantModel: m.byTenant === true,
        fallbackFrom: firstFailed, failReason: `${m.label} failed: ${lastWhy}`,
      }))
      firstFailed ??= m.id
    }
  }
  return { ok: false, status: 'FAILED', says: `Every model for this step failed (${lastWhy}). Nothing was sent on.` }
}
