/**
 * Writing a firm's public page: by the model only where the firm turned
 * the model on, and every prompt and answer logged (CLAUDE.md, "The model
 * boundary, and the four weeks": per company, off by default, every prompt
 * and answer on the record).
 *
 * Found by market, 2026-11-01: the page writer called the model whenever
 * the deployment had a key, with no per-company switch and no log, the
 * same breach c6f202d52 closed for the import reader. What it sends is
 * the firm's public facts only (its name, kind, places, skills and
 * counts; no person, no rate, no pay), so nothing is masked; it is still
 * the firm's to switch on, and what left is still a query.
 *
 *   - The switch off, or no writer set up on this deployment: the page is
 *     written from the fixed templates (`writeFromRules`), nothing is
 *     sent, and the note says why in a sentence naming where the switch is.
 *   - The switch on: the model writes it from the facts, and the facts
 *     that left and the words that came back are logged through
 *     `recordModelPrompt` as SITE_PAGE. Where no usable answer came back,
 *     the rules write the page and the log says so.
 *
 * Split from the route so a unit test holds it with the switch, the
 * writer and the log handed in.
 */
import { modelOnFor, recordModelPrompt, type PromptToRecord } from '@/lib/model-boundary'
import { modelFor } from '@/lib/model-ids'
import { modelAvailable, writeFromRules, writeWithModel, DEFAULT_HEADINGS, type SiteFacts, type SiteVoice } from '@/lib/site-voice'

/** What lib/site-voice sends to. Logged beside each prompt; kept in step with lib/site-voice by hand. */
export const SITE_MODEL = modelFor('READ')
/** The prompt log's purpose for a firm's public page. */
export const SITE_PURPOSE = 'SITE_PAGE'

export const SITE_SAY = {
  modelOff:
    'Written from your numbers by rule. Your company has not turned the model on, so nothing was sent to it. An Owner or Admin can turn it on in Settings, under Ask Etyme.',
  writerNotSetUp:
    'Written from your numbers by rule. The writer is not set up on this deployment yet, so nothing was sent to it. Everything on it is still true.',
  noUsableAnswer:
    'Written from your numbers by rule. The model was asked and its answer could not be used, so the same facts were written by rule.',
  /** Logged as the answer where none could be used. */
  answerNotUsed: '[no usable answer came back, so the page was written by rule from the same facts]',
} as const

export interface WriteDeps {
  modelOn(companyId: string): Promise<boolean>
  writerSetUp(): boolean
  model(facts: SiteFacts): Promise<SiteVoice | null>
  rules(facts: SiteFacts): SiteVoice
  record(p: PromptToRecord): Promise<unknown>
}

export const liveDeps: WriteDeps = {
  modelOn: modelOnFor,
  writerSetUp: modelAvailable,
  model: writeWithModel,
  rules: writeFromRules,
  record: recordModelPrompt,
}

/** What leaves for the model, as the log keeps it: the facts the writer is handed, each on its own line. Pure. */
export function factsThatLeave(f: SiteFacts): string {
  return [
    `Company: ${f.name}`,
    `What they are: ${f.kind}${f.posture ? ` (${f.posture})` : ''}`,
    `Where: ${f.locations.join(', ') || 'not stated'}`,
    `What they place or hire: ${f.skills.slice(0, 10).join(', ') || 'not stated yet'}`,
    `Placements to date: ${f.placements}`,
    `Working right now: ${f.activeNow}`,
    `Organizations worked with: ${f.clients}`,
    `Positions open to any supplier: ${f.openPositions}`,
    `Consultants coming free within three months: ${f.comingFree}`,
    `Training courses they run: ${f.trainingCourses}`,
    `Section keys you may rename: ${Object.keys(DEFAULT_HEADINGS).join(', ')}`,
  ].join('\n')
}

export type WrittenPage = SiteVoice & {
  /** True only where the model was asked: the switch was on and a writer was set up. */
  asked: boolean
}

/** Whether this company's page may be written by the model now, and if not, the sentence that says why. */
export async function modelWritesFor(companyId: string, deps: Pick<WriteDeps, 'modelOn' | 'writerSetUp'> = liveDeps): Promise<{ yes: boolean; says: string | null }> {
  if (!(await deps.modelOn(companyId))) return { yes: false, says: SITE_SAY.modelOff }
  if (!deps.writerSetUp()) return { yes: false, says: SITE_SAY.writerNotSetUp }
  return { yes: true, says: null }
}

export async function writePage(
  a: { companyId: string; personId: string; facts: SiteFacts },
  deps: WriteDeps = liveDeps,
): Promise<WrittenPage> {
  const may = await modelWritesFor(a.companyId, deps)
  if (!may.yes) return { ...deps.rules(a.facts), note: may.says!, asked: false }

  const voice = await deps.model(a.facts).catch(() => null)
  // Logged whether or not the answer could be used: the facts left either way.
  await deps.record({
    companyId: a.companyId,
    personId: a.personId,
    provider: 'anthropic',
    model: SITE_MODEL,
    purpose: SITE_PURPOSE,
    maskedPrompt: `Public page: ${a.facts.name}\n---\n${factsThatLeave(a.facts)}`,
    maskedAnswer: voice
      ? JSON.stringify({ tagline: voice.tagline, intro: voice.intro, headings: voice.headings })
      : SITE_SAY.answerNotUsed,
  })
  if (!voice) return { ...deps.rules(a.facts), note: SITE_SAY.noUsableAnswer, asked: true }
  return { ...voice, asked: true }
}
