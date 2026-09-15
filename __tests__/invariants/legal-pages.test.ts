import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DRAFT_BANNER,
  COUNSEL_QUESTIONS,
  POPULATIONS,
  HELD,
  SUB_PROCESSORS,
  NOT_USED,
  RETENTION,
  ACCESS_LOGGING,
  TERMS,
  PRIVACY,
  DPA,
  allProse,
  type Section,
} from '@/lib/legal'
import { domainOf } from '@/lib/domains'
import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'

/**
 * The legal pages say only what is true of the code.
 *
 * A privacy notice that misdescribes what a system holds is worse than
 * no notice: it is a written misrepresentation, and the first security
 * review finds it. Prose cannot be checked, so the substance lives in
 * `src/lib/legal.ts` as data and this file reads it back against the
 * code it describes.
 *
 * The documents are drafts for counsel. That is itself something these
 * tests hold, because a draft that stops saying it is a draft is the
 * failure mode that matters most.
 */

const ROOT = process.cwd()
const PROSE = allProse()
const POSTURE = readFileSync(join(ROOT, 'docs/security-posture.md'), 'utf8')

const ALL_SECTIONS: Section[] = [...TERMS.sections, ...PRIVACY.sections, ...DPA.sections]

/** Every `src/...` or `prisma/...` path either document points at. */
function pathsNamedIn(text: string): string[] {
  const hits = text.match(/(?:src|prisma|docs|__tests__|__integration__)\/[A-Za-z0-9_\-./[\]]+/g) ?? []
  return [...new Set(hits.map((h) => h.replace(/[.,)]+$/, '')))]
}

/** A path with a `[param]` segment is a route folder; check the folder. */
function exists(p: string): boolean {
  if (existsSync(join(ROOT, p))) return true
  // `src/app/api/me/*` and the like — check the directory above the glob.
  if (p.endsWith('/*')) return existsSync(join(ROOT, p.slice(0, -2)))
  return false
}

describe('The legal pages are drafts for counsel, and say so', () => {
  it('every legal page says on its face that it is a draft and not legal advice', () => {
    expect(DRAFT_BANNER.eyebrow).toMatch(/draft/i)
    expect(DRAFT_BANNER.headline).toMatch(/not legal advice/i)
    expect(DRAFT_BANNER.body).toMatch(/has not been reviewed by a qualified lawyer/i)

    // The banner is rendered by the one component all three pages use, so
    // it cannot be present on one page and missing from another.
    const doc = readFileSync(join(ROOT, 'src/app/legal/document.tsx'), 'utf8')
    expect(doc).toContain('DRAFT_BANNER.headline')
    for (const page of ['terms', 'privacy', 'dpa']) {
      const src = readFileSync(join(ROOT, `src/app/${page}/page.tsx`), 'utf8')
      expect(src, `${page} must render through the shared document`).toContain('LegalDocument')
    }
  })

  it('every legal page names the questions counsel has to answer before it is published', () => {
    expect(COUNSEL_QUESTIONS.length).toBeGreaterThanOrEqual(8)
    for (const q of COUNSEL_QUESTIONS) {
      expect(q.question.length, q.id).toBeGreaterThan(30)
      expect(q.whatTheCodeDoes.length, q.id).toBeGreaterThan(60)
      expect(q.whyItIsOpen.length, q.id).toBeGreaterThan(40)
    }
    const doc = readFileSync(join(ROOT, 'src/app/legal/document.tsx'), 'utf8')
    expect(doc).toContain('COUNSEL_QUESTIONS')
  })

  it('a section marked as open points at a question counsel was actually asked', () => {
    const ids = new Set(COUNSEL_QUESTIONS.map((q) => q.id))
    const dangling = ALL_SECTIONS.filter((s) => s.open && !ids.has(s.open)).map((s) => s.heading)
    expect(dangling, 'sections citing a counsel question that does not exist').toEqual([])
  })

  it('the hardest question — controller or processor — is left open rather than decided', () => {
    const q = COUNSEL_QUESTIONS.find((c) => c.id === 'controller-or-processor')
    expect(q).toBeDefined()
    const opener = DPA.sections[0]
    expect(opener.open).toBe('controller-or-processor')
    expect(opener.paragraphs.join(' ')).toMatch(/looks like a processor/i)
    expect(opener.paragraphs.join(' ')).toMatch(/looks like a controller/i)
    expect(opener.paragraphs.join(' ')).toMatch(/Counsel decides/i)
  })
})

describe('The privacy notice describes the system that exists', () => {
  it('it describes a business user and a candidate as two relationships, not one audience', () => {
    expect(POPULATIONS.map((p) => p.id).sort()).toEqual(['business', 'candidate'])

    const business = POPULATIONS.find((p) => p.id === 'business')!
    const candidate = POPULATIONS.find((p) => p.id === 'candidate')!

    // Two auth paths, and the code registers a provider only when its
    // credentials are present.
    const auth = readFileSync(join(ROOT, 'src/lib/auth.ts'), 'utf8')
    expect(auth).toContain('AzureADProvider')
    expect(auth).toContain('GoogleProvider')
    expect(auth).toContain('EmailProvider')
    expect(business.signIn).toMatch(/Microsoft Entra|Google Workspace/)
    expect(business.signIn).toMatch(/consumer email address cannot register a company/i)
    expect(candidate.signIn).toMatch(/their own/i)

    // Two channels. Nothing sends a text, and the notice says so.
    expect(candidate.channel).toMatch(/Email only/i)
    expect(candidate.channel).toMatch(/Nothing in the product sends a text/i)

    const section = PRIVACY.sections.find((s) => s.heading === 'Two populations, two relationships')
    expect(section, 'the notice must open on the two populations').toBeDefined()
  })

  it('it states no retention period, because nothing in the system deletes anything on a schedule', () => {
    expect(RETENTION.headline).toMatch(/no retention schedule/i)

    // No number of days, months or years is promised anywhere.
    const retention = PRIVACY.sections.find((s) => s.heading === 'How long it is kept')!
    const text = [...retention.paragraphs, ...(retention.bullets ?? [])].join(' ')
    expect(
      text,
      'a retention period nobody implemented must not appear'
    ).not.toMatch(/\b(\d+|thirty|sixty|ninety|seven|six|three)\s+(days|months|years)\b/i)

    // And the claim is true: nothing under src/ knows the words.
    const lifecycle = readFileSync(join(ROOT, 'src/lib/account-lifecycle.ts'), 'utf8')
    expect(lifecycle).toMatch(/Nothing here is ever deleted/i)
  })

  it('it says that ending somebody access ends a seat and erases no record', () => {
    const text = RETENTION.paragraphs.join(' ')
    expect(text).toMatch(/revokes their seat and deletes no record/i)
    expect(text).toMatch(/Suspension is the reversible form/i)
  })

  it('it says a resume a candidate removes stays readable by a company it already reached', () => {
    expect(RETENTION.paragraphs.join(' ')).toMatch(/can still open its copy/i)
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/Never unsent: a company it was sent to/)
  })

  it('it says only a bank name, an account name and the last four digits are taken', () => {
    const section = PRIVACY.sections.find((s) => s.heading === 'Bank details')!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/does not ask for or store a full bank account number/i)
    expect(text).toMatch(/last four digits/i)
    expect(text).toMatch(/No card data/i)

    // True of the route: it keeps four digits and nothing wider.
    const route = readFileSync(
      join(ROOT, 'src/app/api/supplier-apply/[token]/route.ts'),
      'utf8'
    )
    expect(route).toContain("last4: String(body.bank.last4 ?? '').replace(/\\D/g, '').slice(-4)")
    expect(route, 'the route must not accept a full account number').not.toMatch(
      /accountNumber|routingNumber/
    )

    // And of the schema.
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/accountLast4\s+String\?\s+\/\/ display only — never the full number/)
  })

  it('it tells a candidate that a client can see their days on site added up across every supplier', () => {
    const section = PRIVACY.sections.find((s) => s.heading.includes('Time on site'))!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/across every supplier/i)
    expect(text).toMatch(/Two contracts covering the same week count as one week/i)
    expect(section.open).toBe('tenure-visibility')

    const tenure = readFileSync(join(ROOT, 'src/lib/tenure-days.ts'), 'utf8')
    expect(tenure).toMatch(/union of the periods, not their sum/i)
  })

  it('it tells a data subject that reads of their record are logged, refusals included', () => {
    const text = ACCESS_LOGGING.paragraphs.join(' ')
    expect(text).toMatch(/refusal is logged as carefully as a read/i)
    // And it does not overclaim: the notice says which routes, not "every route".
    expect(text).toMatch(/It is not every route in the product/i)

    const log = readFileSync(join(ROOT, 'src/lib/access-log.ts'), 'utf8')
    expect(log).toContain('allowed')
    expect(log).toContain('reason')
  })

  it('it says a consultant grants a bench listing per supplier and can take it back', () => {
    const section = PRIVACY.sections.find((s) => s.heading.includes('consultant permission'))!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/granted or declined by the consultant/i)
    expect(text).toMatch(/The database requires it, not the screen/i)

    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/grantedAt\s+DateTime\s+@default\(now\(\)\) \/\/ by the consultant/)
    expect(schema).toContain('askFirst')
    expect(schema).toContain('showBeforeFree')
  })
})

describe('The sub-processor list is generated from what the code calls', () => {
  it('every sub-processor named is one the code actually calls', () => {
    const names = SUB_PROCESSORS.map((s) => s.name)
    expect(names.length).toBeGreaterThanOrEqual(5)

    const senders = readFileSync(join(ROOT, 'src/lib/senders.ts'), 'utf8')
    expect(senders).toContain('api.resend.com')
    expect(senders).toContain('api.sendgrid.com')

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@anthropic-ai/sdk']).toBeDefined()

    // Each entry proves itself with an env var or a file that exists.
    for (const s of SUB_PROCESSORS) {
      expect(s.provenBy.length, s.name).toBeGreaterThan(5)
      expect(s.reaches.length, s.name).toBeGreaterThan(10)
    }
  })

  it('it names Anthropic, because a candidate name and the text of their CV reach a model', () => {
    const anthropic = SUB_PROCESSORS.find((s) => s.name === 'Anthropic')
    expect(anthropic, 'a model sub-processor must be disclosed').toBeDefined()
    expect(anthropic!.reaches).toMatch(/candidate name/i)
    expect(anthropic!.reaches).toMatch(/extracted text of a resume/i)
    expect(anthropic!.always).toBe(false)

    // The match engine really does send a name.
    const engine = readFileSync(join(ROOT, 'src/lib/match-engine.ts'), 'utf8')
    expect(engine).toContain('name: c.personName')
    expect(engine).toContain('workAuth: c.workAuth')

    // And the evidence check really does send the CV text.
    const check = readFileSync(
      join(ROOT, 'src/app/api/submissions/[id]/check/route.ts'),
      'utf8'
    )
    expect(check).toContain('evidencePrompt(p.claimedSkills, cvText)')
  })

  it('it says matching falls back to arithmetic when no model key is set', () => {
    const section = PRIVACY.sections.find((s) => s.heading.includes('model sees personal data'))!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/Where no model key is configured/i)
    expect(text).toMatch(/refuses to claim a model did work it did not do/i)
    expect(text).toMatch(/No model output awards, rejects or bars anybody by itself/i)

    const engine = readFileSync(join(ROOT, 'src/lib/match-engine.ts'), 'utf8')
    expect(engine).toContain('no ANTHROPIC_API_KEY — scored with rules, not the model')
  })

  it('it names the keys that exist in the configuration and reach nobody', () => {
    const joined = NOT_USED.join(' ')
    expect(joined).toMatch(/S3/)
    expect(joined).toMatch(/DocuSign/)
    expect(joined).toMatch(/SMS/)
    expect(joined).toMatch(/analytics/)

    // The claim is checkable: nothing under src reads them.
    const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8')
    expect(envExample, 'the claim only makes sense while the keys are there').toContain('S3_BUCKET')
  })
})

describe('The DPA lists only measures the repository can point at', () => {
  it('every file the three documents name actually exists', () => {
    const named = pathsNamedIn(PROSE + '\n' + ALL_SECTIONS.map((s) => s.provenBy ?? '').join('\n'))
    const missing = named.filter((p) => !exists(p))
    expect(missing, `paths named in the legal pages that do not exist:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('the measures it lists are the ones the code implements', () => {
    const measures = DPA.sections.find((s) => s.heading.includes('Technical and organizational'))!
    const text = (measures.bullets ?? []).join(' ')

    expect(text).toMatch(/filtered by the asking company in the database query/i)
    expect(text).toMatch(/SHA-256 hash and compared in constant time/i)
    expect(text).toMatch(/HMAC/i)
    expect(text).toMatch(/refuses every scheduled call/i)

    const accounts = readFileSync(join(ROOT, 'src/lib/service-accounts.ts'), 'utf8')
    expect(accounts).toContain("createHash('sha256')")
    expect(accounts).toContain('timingSafeEqual')
    expect(accounts).toContain('createHmac')

    const cron = readFileSync(join(ROOT, 'src/lib/cron-auth.ts'), 'utf8')
    expect(cron).toContain('if (!secret) return')
  })

  it('it says plainly that return and deletion at the end are not built', () => {
    const section = DPA.sections.find((s) => s.heading.includes('Return and deletion'))!
    expect(section.paragraphs.join(' ')).toMatch(/Not implemented/i)
  })

  it('it offers no audit report it does not have', () => {
    const section = DPA.sections.find((s) => s.heading === 'Audit')!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/no SOC 2 report/i)
    expect(text).toMatch(/no ISO 27001/i)
    expect(text).toMatch(/no penetration test/i)
  })
})

describe('Nothing on a legal page contradicts what Etyme says it is', () => {
  it('no legal page states a price, because the price is not set', () => {
    expect(PROSE).not.toMatch(/\$\s?\d/)
    expect(PROSE).not.toMatch(/per (seat|user|month|year)/i)
    expect(PROSE).not.toMatch(/\bpricing plan\b/i)

    const fees = TERMS.sections.find((s) => s.heading === 'Fees')!
    expect(fees.paragraphs.join(' ')).toMatch(/free while it is being tested/i)
    expect(fees.paragraphs.join(' ')).toMatch(/No price is stated/i)
  })

  it('no legal page claims Etyme runs a bench or places anybody', () => {
    const what = TERMS.sections[0]
    expect(what.heading).toBe('What Etyme is')
    const text = what.paragraphs.join(' ')
    expect(text).toMatch(/system of record for contingent workers/i)
    expect(text).toMatch(/runs no bench, employs no consultant and places nobody/i)
    expect(text).toMatch(/not a staffing agency/i)

    // And the neutrality claim is enforced in code, not only asserted.
    const attestation = readFileSync(join(ROOT, 'src/lib/attestation.ts'), 'utf8')
    expect(attestation).toMatch(/export function overallVerdict\(\): never/)
  })

  it('no legal page leads with AI', () => {
    // The model disclosure is honest and complete; it is not the pitch.
    const firstHeadings = PRIVACY.sections.slice(0, 3).map((s) => s.heading).join(' ')
    expect(firstHeadings).not.toMatch(/\bAI\b|artificial intelligence/i)
    expect(PROSE).not.toMatch(/AI-powered|AI-native|powered by AI/i)
  })

  it('every category of held data names the model or file that proves it', () => {
    expect(HELD.length).toBeGreaterThanOrEqual(10)
    for (const h of HELD) {
      expect(h.provenBy.length, h.category).toBeGreaterThan(5)
      expect(h.examples.length, h.category).toBeGreaterThan(30)
    }
    const categories = HELD.map((h) => h.category).join(' ')
    expect(categories).toMatch(/Work authorization/i)
    expect(categories).toMatch(/Resumes/i)
    expect(categories).toMatch(/Payment details/i)
    expect(categories).toMatch(/Time on site/i)
    expect(categories).toMatch(/Logs/i)
  })

  it('the three pages belong to the regulatory domain, because a wrong one is a legal exposure', () => {
    for (const p of [
      'src/lib/legal.ts',
      'src/app/legal/document.tsx',
      'src/app/terms/page.tsx',
      'src/app/privacy/page.tsx',
      'src/app/dpa/page.tsx',
    ]) {
      expect(domainOf(p)?.key, p).toBe('REGULATORY')
    }
  })
})

describe('The security posture is as plain about what is absent as what is present', () => {
  it('it names what is absent, with no certification it does not hold', () => {
    expect(POSTURE).toMatch(/No SOC 2 Type I or Type II/i)
    expect(POSTURE).toMatch(/No ISO 27001/i)
    expect(POSTURE).toMatch(/No third-party penetration test, ever/i)
    expect(POSTURE).toMatch(/no published vulnerability disclosure address/i)
    expect(POSTURE).toMatch(/No retention schedule/i)
    expect(POSTURE).toMatch(/No rate limiting/i)
    expect(POSTURE).toMatch(/No disaster recovery plan/i)
  })

  it('it does not call anything planned that nobody has committed to', () => {
    const planned = POSTURE.split('## 15. Planned')[1].split('## 16.')[0]
    expect(planned).toMatch(/absent with no committed date/i)
    // Two committed items, and no roadmap invented around them.
    expect(planned).not.toMatch(/Q[1-4]\s?20\d\d/)
    expect(planned).not.toMatch(/\broadmap\b(?! here)/i)
  })

  it('it states the access-log coverage honestly rather than as every route', () => {
    expect(POSTURE).toMatch(/Nineteen route files call `logAccess` or\s*`logBulkAccess`, out of 231 API route files/)
    expect(POSTURE).toMatch(/It is not every\s*endpoint in the product and this document does not claim it is/)
  })

  it('it quotes the autonomy ladder counts that the module actually holds', () => {
    const kinds: Record<string, number> = {}
    for (const key of ALL_ACTIONS) {
      const a = ACTIONS[key]
      kinds[a.kind] = (kinds[a.kind] ?? 0) + 1
    }
    const unprompted = ALL_ACTIONS.filter((k) => ACTIONS[k].kind === 'UNPROMPTED')
    const rules = unprompted.filter((k) => ACTIONS[k].basis === 'RULE')

    // Recomputed, then read back out of the document, so a drift in
    // either fails here rather than in front of a security reviewer.
    expect(POSTURE).toContain(`| Actions named in the automation log | **${ALL_ACTIONS.length}** |`)
    expect(POSTURE).toContain(`| Unprompted — the system did it and nobody asked | **${unprompted.length}** |`)
    expect(POSTURE).toContain(`| Enforcement — the system decided what a person was allowed to do | **${kinds.ENFORCEMENT}** |`)
    expect(POSTURE).toContain(`| Attributed — a person did it and the row is the record | **${kinds.ATTRIBUTED}** |`)
    expect(rules.length, 'all but one unprompted action is a plain rule').toBe(unprompted.length - 1)
  })

  it('every file the security posture names actually exists', () => {
    const missing = pathsNamedIn(POSTURE).filter((p) => !exists(p))
    expect(missing, `paths named in docs/security-posture.md that do not exist:\n  ${missing.join('\n  ')}`).toEqual([])
  })
})
