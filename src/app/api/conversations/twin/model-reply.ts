/**
 * Ask Etyme's free-text question, asked through the one model gateway
 * (records 123, 125; plan step 11). The question and the ledger lines
 * arrive already masked by ask.ts. This file turns the gateway's answer
 * into the reply ask.ts shows, and says out loud when there is none: a
 * model that was asked and did not answer is never silence, and a model
 * that is not set up reads "Not configured". No provider is named here;
 * the label on the prompt log is the register's.
 */

import { callModel, type ModelDeps, type ModelRequest, type ModelResult } from '@/lib/model-gateway/call'
import { registerFrom } from '@/lib/model-gateway/register'
import type { ModelReply } from './ask'

export const FAILED_SAYS = 'The model did not answer; this reply is from the rules.'

/** Where no reply came back: the sentence to show, in place of one. */
export interface ModelMiss { missed: string }

const MAX_TOKENS = 700

export async function askModel(a: {
  companyId: string
  personId: string
  system: string
  question: string
  context: string
  env?: Record<string, string | undefined>
  call?: (r: ModelRequest, d?: ModelDeps) => Promise<ModelResult>
}): Promise<ModelReply | ModelMiss> {
  const env = a.env ?? process.env
  let r: ModelResult
  try {
    r = await (a.call ?? callModel)(
      {
        companyId: a.companyId, personId: a.personId, skillKey: 'ask.answer', purpose: 'ASK_ETYME',
        system: a.system, prompt: `Ledger lines:\n${a.context}\n\nQuestion: ${a.question}`,
        record: { recordType: 'TWIN_LEDGER', recordId: a.companyId }, maxTokens: MAX_TOKENS,
      },
      // Ask Etyme writes the prompt log itself, once, with the mark for a replaced answer (ask.ts).
      { env, logPrompt: async () => ({ ok: true as const, id: 'ask-etyme-logs-it', withheld: false }) },
    )
  } catch {
    return { missed: FAILED_SAYS }
  }
  if (r.ok) {
    const label = registerFrom(env).models.find((m) => m.id === r.model)?.label
    const out = r.usage?.output_tokens ?? null
    return {
      text: r.text.trim(), model: r.model, ...(label ? { provider: label } : {}),
      tokensIn: r.usage?.input_tokens ?? null, tokensOut: out,
      // The adapter does not return why it stopped; an answer that used its whole allowance is taken as cut.
      cut: out !== null && out >= MAX_TOKENS,
    }
  }
  return { missed: r.status === 'FAILED' || r.status === 'KEY_FAILED' ? FAILED_SAYS : r.says }
}
