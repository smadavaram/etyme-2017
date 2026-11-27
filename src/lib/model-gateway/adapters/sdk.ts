/**
 * The adapter that speaks to a model through its provider's SDK. The only
 * file under the gateway that imports one. A model entered in the register
 * with `adapter: "sdk"` is called here; the client is made from the key the
 * entry names, and a test hands in a fake client instead.
 */
import type { ModelAdapter } from '../call'

export interface SdkClient { messages: { create(args: any): Promise<any> } }

export function sdkAdapter(makeClient?: (apiKey: string) => Promise<SdkClient>): ModelAdapter {
  const make = makeClient ?? (async (apiKey: string) => {
    const { default: Sdk } = await import('@anthropic-ai/sdk')
    return new Sdk({ apiKey }) as unknown as SdkClient
  })
  return {
    async call(model, req, env) {
      const key = model.keyEnv ? env[model.keyEnv]?.trim() : undefined
      if (!key) throw new Error(`${model.label} has no key set.`)
      const client = await make(key)
      const res = await client.messages.create({
        model: model.id,
        max_tokens: req.maxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.prompt }],
      })
      const text = (res.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      return { text, usage: res.usage ?? null }
    },
  }
}
