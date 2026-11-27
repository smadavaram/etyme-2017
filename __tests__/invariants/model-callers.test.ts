import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Record 125, plan C10: every model call goes through the gateway
 * (lib/model-gateway). Two lists name the files that still go round it.
 * Each may only shrink: a file that stops going round comes off the list,
 * and a new file that goes round fails the build.
 */

/** Files outside the gateway that import a provider's SDK or call a provider host. Each owner retires its own (plan step 11). */
const DIRECT_CALLERS: Record<string, string> = {
  'src/app/api/conversations/twin/read.ts': 'CONVERSATION',
  'src/lib/checks/skill-evidence.ts': 'DEMAND',
  'src/lib/consultant-portfolio.ts': 'SUPPLY',
  'src/lib/extract.ts': 'SUPPLY',
  'src/lib/match-engine.ts': 'SUPPLY',
  'src/lib/site-voice.ts': 'MARKET',
}

/** Files outside the gateway that read a model id by role (`modelFor(`). Same rule. */
const READS_A_MODEL_ID: Record<string, string> = {
  'src/app/api/conversations/twin/ask.ts': 'CONVERSATION',
  'src/app/api/imports/sheets/read.ts': 'SUPPLY',
  'src/app/api/settings/site/write.ts': 'MARKET',
  'src/lib/checks/skill-evidence.ts': 'DEMAND',
  'src/lib/consultant-portfolio.ts': 'SUPPLY',
  'src/lib/extract.ts': 'SUPPLY',
  'src/lib/match-engine.ts': 'SUPPLY',
  'src/lib/setup-fill-model.ts': 'CONVERSATION',
  'src/lib/site-voice.ts': 'MARKET',
}

const PROVIDER_CALL = /@anthropic-ai\/sdk|api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis|openrouter\.ai|api\.mistral\.ai|api\.cohere\.(?:ai|com)|api\.groq\.com|api\.together\.xyz/
const READS_ID = /\bmodelFor\(/

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

const root = process.cwd()
const outside = filesUnder(join(root, 'src'))
  .map((p) => relative(root, p))
  .filter((p) => !p.startsWith('src/lib/model-gateway/'))
const holding = (re: RegExp) => outside.filter((p) => re.test(readFileSync(join(root, p), 'utf8'))).sort()

describe('no model call goes round the gateway', () => {
  it("no file outside the gateway imports a model provider's SDK or calls a provider host, and the list of those that still do may only shrink", () => {
    const found = holding(PROVIDER_CALL)
    expect(found.filter((p) => !(p in DIRECT_CALLERS))).toEqual([])
    expect(Object.keys(DIRECT_CALLERS).filter((p) => !found.includes(p))).toEqual([])
  })
  it('no new file reads a model id by role outside the gateway, and the list of those that still do may only shrink', () => {
    const found = holding(READS_ID).filter((p) => p !== 'src/lib/model-ids.ts')
    expect(found.filter((p) => !(p in READS_A_MODEL_ID))).toEqual([])
    expect(Object.keys(READS_A_MODEL_ID).filter((p) => !found.includes(p))).toEqual([])
  })
  it('the gateway holds the only provider SDK import it owns, in its one adapter', () => {
    const inside = filesUnder(join(root, 'src/lib/model-gateway')).map((p) => relative(root, p))
      .filter((p) => PROVIDER_CALL.test(readFileSync(join(root, p), 'utf8')))
    expect(inside).toEqual(['src/lib/model-gateway/adapters/sdk.ts'])
  })
})
