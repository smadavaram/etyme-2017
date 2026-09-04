import Anthropic from '@anthropic-ai/sdk'

/**
 * Giving a company a site that sounds like them.
 *
 * Base44 and its kind generate a website: you describe what you want and
 * get code you then own. It is genuinely good, and it has one failure this
 * product cannot afford — the moment it is generated it starts going out
 * of date. A staffing firm's site says "12 consultants" forever, because
 * nothing is connected to anything.
 *
 * So the split here is deliberate:
 *
 *   **The voice is generated.** Headline, the sentence under it, what each
 *   section is called. Written once from what the company actually is, and
 *   editable afterwards.
 *
 *   **The facts are never generated.** Open positions, who is coming free,
 *   what they place, what insurance they hold — all read live from the
 *   same rows the dashboard reads. They cannot go stale because nothing
 *   copied them.
 *
 * A generated sentence about a company is a claim, and a claim that
 * outlives its truth is worse than a plain page. This way the writing is
 * theirs and the numbers are current, permanently.
 */

export interface SiteFacts {
  name: string
  kind: string
  posture: string | null
  /** What they actually place or hire, most common first. */
  skills: string[]
  locations: string[]
  placements: number
  activeNow: number
  clients: number
  openPositions: number
  comingFree: number
  trainingCourses: number
}

export interface SiteVoice {
  /** One line under the name. Not a slogan — a description. */
  tagline: string
  /** A short paragraph. Two sentences at most. */
  intro: string
  /** What each section is called, in their words rather than ours. */
  headings: Record<string, string>
  /** How it was written, so a generated page is never mistaken for a hand-written one. */
  writtenBy: 'MODEL' | 'RULES'
  /** Said on the settings screen. */
  note: string
}

/** The section names the page uses when nothing has been generated. */
export const DEFAULT_HEADINGS: Record<string, string> = {
  openPositions: 'Open to any supplier',
  reputation: 'What they are like to work with',
  comingFree: 'Coming free',
  skills: 'What they place',
  training: 'Training they run',
  credentials: 'What they hold',
}

export function modelAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

// ── Written from the facts, with no model ─────────────────────────────

/**
 * The fallback, and it has to be good.
 *
 * A fallback that reads like a placeholder tells every company without an
 * API key that they are on the cheap tier. This writes from the same facts
 * the model would use, and for most companies the result is barely
 * distinguishable — because the interesting thing on the page was always
 * the facts.
 */
export function writeFromRules(f: SiteFacts): SiteVoice {
  const where = f.locations.length > 0 ? f.locations[0] : null
  const top = f.skills.slice(0, 3)

  const isBuyer = f.kind === 'CLIENT' || f.kind === 'MSP' || f.kind === 'GSI'

  // ── Tagline ────────────────────────────────────────────────────────
  let tagline: string
  if (isBuyer) {
    tagline = f.openPositions > 0
      ? `${f.openPositions} contract position${f.openPositions === 1 ? '' : 's'} open to suppliers${where ? ` in ${where}` : ''}.`
      : `Works with contract staff${where ? ` in ${where}` : ''}.`
  } else if (top.length > 0) {
    // Naming what they actually place beats any adjective.
    tagline = `${top.slice(0, 2).join(' and ')} people${where ? `, out of ${where}` : ''}.`
  } else {
    tagline = f.posture === 'BENCH'
      ? 'Supplies consultants through other staffing firms.'
      : 'Supplies consultants to clients.'
  }

  // ── Intro ──────────────────────────────────────────────────────────
  const sentences: string[] = []

  if (isBuyer) {
    if (f.clients > 0 || f.activeNow > 0) {
      sentences.push(
        `${f.activeNow} contractor${f.activeNow === 1 ? '' : 's'} working with them right now.`
      )
    }
    sentences.push(
      f.openPositions > 0
        ? 'Everything below is open to any supplier on Etyme, not only the ones already on their panel.'
        : 'They work with suppliers they invite directly.'
    )
  } else {
    if (f.placements > 0) {
      sentences.push(
        `${f.placements} placement${f.placements === 1 ? '' : 's'} across ${f.clients} organisation${f.clients === 1 ? '' : 's'}.`
      )
    }
    if (f.comingFree > 0) {
      sentences.push(
        `${f.comingFree} consultant${f.comingFree === 1 ? '' : 's'} coming free in the next three months.`
      )
    } else if (f.trainingCourses > 0) {
      sentences.push(`${f.trainingCourses} course${f.trainingCourses === 1 ? '' : 's'} open to consultants on their bench.`)
    }
    if (sentences.length === 0) {
      // A new company with nothing yet. Saying so beats an empty flourish.
      sentences.push('New on Etyme. Everything on this page is counted from real work, so it fills in as they go.')
    }
  }

  return {
    tagline,
    intro: sentences.slice(0, 2).join(' '),
    headings: { ...DEFAULT_HEADINGS },
    writtenBy: 'RULES',
    note: 'Written from your own numbers. Add an API key and it can be written properly, or edit any of it yourself.',
  }
}

// ── Written by the model ──────────────────────────────────────────────

const SYSTEM = `You write the words on a company's own page, for a contract staffing platform.

You are given facts about the company. Write:

- tagline: one line that goes under their name. A description, not a slogan.
  Never "empowering", "leading", "trusted partner", "solutions". Say what
  they actually do and for whom.
- intro: at most two short sentences. Concrete. If they have done little,
  say so plainly rather than reaching.
- headings: what to call each section of their page, in their own register.
  Keep them short and plain. You may keep the defaults where they already fit.

Rules that matter more than style:

- Invent nothing. Every claim must follow from a fact you were given. No
  years in business, no client names, no awards, no team size.
- No superlatives and no adjectives that cannot be checked. "Fast", "expert"
  and "trusted" are all unverifiable and read as filler.
- If the numbers are small, do not dress them up. A company with two
  placements should read as a company with two placements.
- British or American spelling — follow whatever the company name suggests,
  and default to British.

Return only JSON: {"tagline":"...","intro":"...","headings":{"key":"..."}}`

export async function writeWithModel(f: SiteFacts): Promise<SiteVoice | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const client = new Anthropic({ apiKey: key })

  const prompt = `Company: ${f.name}
What they are: ${f.kind}${f.posture ? ` (${f.posture})` : ''}
Where: ${f.locations.join(', ') || 'not stated'}
What they place or hire: ${f.skills.slice(0, 10).join(', ') || 'not stated yet'}

Placements to date: ${f.placements}
Working right now: ${f.activeNow}
Organisations worked with: ${f.clients}
Positions open to any supplier: ${f.openPositions}
Consultants coming free within three months: ${f.comingFree}
Training courses they run: ${f.trainingCourses}

Section keys you may rename: ${Object.keys(DEFAULT_HEADINGS).join(', ')}
Current names: ${JSON.stringify(DEFAULT_HEADINGS)}`

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const parsed = parseVoice(text)
    if (!parsed) return null

    return {
      tagline: parsed.tagline,
      intro: parsed.intro,
      // Only keys the page actually renders. A heading for a section that
      // does not exist is dead weight nobody would ever notice was wrong.
      headings: { ...DEFAULT_HEADINGS, ...pickKnown(parsed.headings) },
      writtenBy: 'MODEL',
      note: 'Written for you from your own numbers. Edit any of it — nothing here is locked.',
    }
  } catch {
    // Falls back rather than failing. A company should never be left
    // without a page because a third party was slow.
    return null
  }
}

function pickKnown(h: Record<string, string> | undefined): Record<string, string> {
  if (!h) return {}
  const out: Record<string, string> = {}
  for (const k of Object.keys(DEFAULT_HEADINGS)) {
    const v = h[k]
    if (typeof v === 'string' && v.trim() && v.length <= 60) out[k] = v.trim()
  }
  return out
}

export function parseVoice(text: string): { tagline: string; intro: string; headings?: Record<string, string> } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return null

  try {
    const p = JSON.parse(candidate.slice(start, end + 1))
    if (typeof p?.tagline !== 'string' || typeof p?.intro !== 'string') return null
    // A tagline that runs to a paragraph is not a tagline.
    if (p.tagline.length > 160 || p.intro.length > 400) return null
    return p
  } catch {
    return null
  }
}

/**
 * Write a company's voice, however it can be written.
 *
 * Never returns nothing. A company without a page because a key was
 * missing or an API was slow is worse than a plainly-written one.
 */
export async function writeVoice(f: SiteFacts): Promise<SiteVoice> {
  return (await writeWithModel(f)) ?? writeFromRules(f)
}

// ── Checking what somebody typed ──────────────────────────────────────

export interface EditVerdict {
  ok: boolean
  reason: string
}

/**
 * What a company may put on their own page.
 *
 * Almost anything — it is their page. The two limits are length, because a
 * tagline that is a paragraph breaks the layout for everybody, and the
 * platform's own name, because a company writing "Verified by Etyme" into
 * their tagline is borrowing a claim we did not make.
 */
export function checkEdit(field: 'tagline' | 'intro', value: string): EditVerdict {
  const v = value.trim()
  const max = field === 'tagline' ? 160 : 400

  if (!v) return { ok: false, reason: 'Say something, or leave it as it was.' }
  if (v.length > max) {
    return { ok: false, reason: `Too long — ${max} characters at most, and it reads better well under that.` }
  }
  if (/\betyme\b.{0,20}\b(verified|approved|certified|endorsed|recommend)/i.test(v) ||
      /\b(verified|approved|certified|endorsed)\b.{0,20}\betyme\b/i.test(v)) {
    return {
      ok: false,
      reason: 'That reads as though Etyme vouched for you, and we have not. Say what you do instead.',
    }
  }
  return { ok: true, reason: 'Saved.' }
}
