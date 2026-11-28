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
 *     that left and the words that came back are logged by the model
 *     gateway (`callModel`) as SITE_PAGE, under the register's label. Where no usable answer came back,
 *     the rules write the page and the log says so.
 *
 * Split from the route so a unit test holds it with the switch, the
 * writer and the log handed in.
 */
import { modelOnFor } from '@/lib/model-boundary'
import { modelAvailable, writeFromRules, writeWithModel, DEFAULT_HEADINGS, type SiteDoor, type SiteFacts, type SiteVoice } from '@/lib/site-voice'

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
  /** Goes through the model gateway, which writes the prompt log under the register's label. */
  model(facts: SiteFacts, who: SiteDoor): Promise<SiteVoice | null>
  rules(facts: SiteFacts): SiteVoice
}

export const liveDeps: WriteDeps = {
  modelOn: modelOnFor,
  writerSetUp: modelAvailable,
  model: writeWithModel,
  rules: writeFromRules,
}

/** What leaves for the model, as the log keeps it: the facts the writer is handed, each on its own line. Pure. */
export function factsThatLeave(f: SiteFacts): string {
  const lines = [
    `Company: ${f.name}`,
    `What they are: ${f.kind}${f.posture ? ` (${f.posture})` : ''}`,
    `Where: ${f.locations.join(', ') || 'not stated'}`,
    `What they place or hire: ${f.skills.slice(0, 10).join(', ') || 'not stated yet'}`,
    `Placements to date: ${f.placements}`,
    `Working right now: ${f.activeNow}`,
    `Organizations worked with: ${f.clients}`,
    `Positions open to any supplier: ${f.openPositions}`,
    `Consultants coming free within three months: ${f.comingFree}`,
    // Said only where the one reader says the firm's courses are shown.
    ...(f.coursesShown === false ? [] : [`Training courses they run: ${f.trainingCourses}`]),
    `Section keys you may rename: ${Object.keys(DEFAULT_HEADINGS).join(', ')}`,
  ]
  return lines.join('\n')
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

  // The gateway logs the prompt and the answer, whether or not the answer could be used.
  const voice = await deps.model(a.facts, { companyId: a.companyId, personId: a.personId }).catch(() => null)
  if (!voice) return { ...deps.rules(a.facts), note: SITE_SAY.noUsableAnswer, asked: true }
  return { ...voice, asked: true }
}
