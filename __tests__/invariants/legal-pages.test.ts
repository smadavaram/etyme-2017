import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DRAFT_BANNER,
  COUNSEL_QUESTIONS,
  CROSS_LINKS,
  DEFINITIONS,
  POPULATIONS,
  HELD,
  SUB_PROCESSORS,
  NOT_USED,
  RETENTION,
  ACCESS_LOGGING,
  SUMMARY,
  SUMMARY_ASKS,
  TERMS,
  PRIVACY,
  DPA,
  allProse,
  sectionId,
  sectionsOf,
  type DocKey,
  type Section,
} from '@/lib/legal'
import { SCHEDULE, unscheduledCategories } from '@/lib/retention'
import { keptFor } from '@/app/legal/document'
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
const POLICY = readFileSync(join(ROOT, 'SECURITY.md'), 'utf8')

/** The address that does not exist yet, written once so a test can find it. */
const PLACEHOLDER = 'security@etyme.example'

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

  it('every retention period it states is a rule somebody can look up, and where none can be cited it says so instead of naming one', () => {
    // This test used to hold the opposite sentence — "it states no
    // retention period, because nothing in the system deletes anything
    // on a schedule" — and that was the right test for as long as it was
    // true. The schedule landed on 2026-09-19, so the check is now that
    // every period on the page is citable and every blank is admitted.
    expect(RETENTION.headline).toMatch(/retention schedule/i)
    expect(RETENTION.headline).toMatch(/no legal minimum can be cited/i)

    const retention = PRIVACY.sections.find((s) => s.heading === 'How long we keep it')!
    const text = [...retention.paragraphs, ...(retention.bullets ?? [])].join(' ')

    // A period on this page is a federal rule with a citation behind it.
    for (const rule of ['8 CFR 274a.2', '26 CFR 31.6001-1', '29 CFR 516.5', '29 CFR 1602.14']) {
      expect(SCHEDULE.map((l) => l.basis).join(' '), `${rule} is not cited anywhere in the schedule`).toContain(rule)
    }
    expect(text, 'the page must say that state law runs longer in places').toMatch(/State law is\s*longer in places/i)
    expect(text, 'the page must say where no period can be cited at all').toMatch(/no federal minimum can be cited/i)

    // And the blanks are real blanks in the code, not prose.
    const uncitable = SCHEDULE.filter((l) => l.fate === 'HELD_THEN_DELETED' && l.months === null)
    expect(uncitable.length, 'at least one category is honestly left without a period').toBeGreaterThan(0)

    // Ending somebody's access still deletes nothing, which is a
    // different thing from a retention schedule and is still true.
    const lifecycle = readFileSync(join(ROOT, 'src/lib/account-lifecycle.ts'), 'utf8')
    expect(lifecycle).toMatch(/Nothing here is ever deleted/i)
  })

  it('it says erasure is anonymization and never a row delete, because an invoice that has been paid has to go on footing', () => {
    const text = RETENTION.paragraphs.join(' ')
    expect(text).toMatch(/anonymization and never a row delete/i)
    expect(text).toMatch(/reserved domain that cannot be registered or routed to/i)
    expect(text).toMatch(/statutory minimum beats an erasure request/i)
  })

  it('it says a person can ask for their own data and ask to be forgotten, from their own page', () => {
    const rights = PRIVACY.sections.find((s) => s.heading === 'Your rights, and how they are honored today')!
    const text = rights.paragraphs.join(' ')
    expect(text).toMatch(/ask for everything held about them, or ask to be\s*forgotten, from their own page/i)
    expect(text, 'what stays must be said before the day, not after').toMatch(/said before the day rather than after it/i)
    expect(text, 'a hold holds rather than refuses').toMatch(/held\s*rather than refused/i)
    expect(text, 'the holder’s matter reference never reaches the person').toMatch(/case reference is never shown to the person/i)
  })

  it('it says a breach has a clock and a named owner, and says there is still no severity scale', () => {
    const section = DPA.sections.find((s) => s.heading === 'Breach notification')!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/names the person who owns sending it/i)
    expect(text).toMatch(/deliberately absent: a severity scale/i)
    expect(text, 'an undecided deadline must read as undecided').toMatch(/nobody has decided/i)
    expect(text, 'the runbook is still missing and must still be named').toMatch(/no.{0,40}rehearsed runbook/i)
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

  it('it says plainly which half of return and deletion at the end is not built, and why nobody has decided it', () => {
    const section = DPA.sections.find((s) => s.heading.includes('Return and deletion'))!
    const text = section.paragraphs.join(' ')
    expect(text).toMatch(/What is not built is the export itself/i)
    expect(text, 'the reason has to be the joint records, not a vague gap').toMatch(
      /the other firm records as much as this one/i
    )
    // And the route actually refuses it rather than producing a file.
    const lib = readFileSync(join(ROOT, 'src/lib/data-request.ts'), 'utf8')
    expect(lib).toContain('a company export is not built yet')
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
    expect(POSTURE).toMatch(/No live vulnerability disclosure address/i)
    // Until 2026-09-19 this read "No retention schedule". There is one
    // now, and what the posture has to be plain about is the half that
    // is still missing: no state minimum is implemented, and nothing
    // ages out a person who has simply gone quiet.
    expect(POSTURE).toMatch(/No state minimum is implemented/i)
    expect(POSTURE).toMatch(/No aging-out of a person who has simply gone quiet/i)
    expect(POSTURE).toMatch(/Return and deletion of customer data on termination is half built/i)
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

describe('The security policy tells a researcher what to do, and promises nothing nobody has promised', () => {
  it('it is a real policy and not the GitHub template it was', () => {
    expect(POLICY).not.toMatch(/Use this section to tell people/i)
    expect(POLICY).not.toMatch(/white_check_mark/)
    expect(POLICY).toMatch(/## Reporting a vulnerability/)
    expect(POLICY).toMatch(/## Scope/)
    expect(POLICY).toMatch(/## Coordinated disclosure/)
  })

  it('the reporting address is marked on its face as a placeholder nobody reads', () => {
    expect(POLICY).toContain(PLACEHOLDER)
    // The warning is above the address, not buried under it.
    const banner = POLICY.indexOf('does not exist and nobody reads it')
    const heading = POLICY.indexOf('## Reporting a vulnerability')
    expect(banner, 'the placeholder warning must come before the reporting section').toBeGreaterThan(-1)
    expect(banner).toBeLessThan(heading)
    expect(POLICY).toMatch(/The founder has to set the real address/i)
    // Every mention of it is either inside the banner or flagged beside it.
    expect(POLICY).toMatch(/placeholder; see the banner above/i)
  })

  it('it promises no response time, because nobody has committed to one', () => {
    expect(POLICY).toMatch(/No response-time commitment is made in this document/i)
    expect(
      POLICY,
      'a clock nobody agreed to must not appear'
    ).not.toMatch(/within \d+\s*(hours|business days|days)/i)
    expect(POLICY).toMatch(/would be inventing a commitment nobody has made/i)
  })

  it('it says what is in scope and what is not, and sends the known gaps back to the posture', () => {
    expect(POLICY).toMatch(/### In scope/)
    expect(POLICY).toMatch(/### Out of scope/)
    // The 2017 Rails tree was scoped out here while it sat in the repository
    // unbuilt and undeployed. It was deleted on 2026-09-16, so the carve-out
    // went with it: a policy that scopes out code nobody can find reads as a
    // policy written for a different repository.
    expect(POLICY).not.toMatch(/2017 Rails tree/i)
    expect(existsSync(join(ROOT, 'Gemfile')), 'the Rails tree is back — the carve-out may be needed again').toBe(false)
    // A reporter is pointed at the published gap list rather than rediscovering it.
    expect(POLICY).toMatch(/docs\/security-posture\.md/)
    expect(POLICY).toMatch(/is a welcome nudge but is not a new finding/i)
  })

  it('it offers no bounty, because there is no budget for one', () => {
    expect(POLICY).toMatch(/There is no bug bounty and no payment/i)
    expect(POLICY).not.toMatch(/\$\s?\d/)
  })

  it('it asks for coordinated disclosure and leaves the binding safe harbor to counsel', () => {
    expect(POLICY).toMatch(/give us a reasonable chance to fix it/i)
    expect(POLICY).toMatch(/agree a disclosure date with you rather than impose one/i)
    expect(POLICY).toMatch(/states an intent, not a/i)
    expect(POLICY).toMatch(/warranty/i)
    expect(POLICY).toMatch(/For counsel/i)
  })

  it('the policy and the security posture say the same thing about the address', () => {
    // Both say it exists as a document and that the address in it is not live.
    expect(POSTURE).toContain(PLACEHOLDER)
    expect(POSTURE).toMatch(/visibly marked placeholder/i)
    expect(POSTURE).toMatch(/No live vulnerability disclosure address/i)
    // And the posture no longer describes a template that is gone.
    expect(POSTURE).not.toMatch(/unedited GitHub template/i)
    // Both send a reporter to the same place meanwhile.
    expect(POLICY).toMatch(/use the commercial contact/i)
    expect(POSTURE).toMatch(/commercial contact who sent it to you/i)
  })
})

/**
 * ── Rebuilt on 2026-09-20, for the three people who actually open these ──
 *
 * "Rebuild Etyme home pages, privacy, terms and conditions." Not one
 * fact changed: what changed is that a procurement lead can answer six
 * questions from the first screen, a numbered contents stays on the
 * screen while the body scrolls, and the facts that line up — what is
 * held, and who else touches it — are drawn as tables with the
 * retention line beside each category instead of as run-on bullets a
 * reviewer has to parse.
 *
 * These checks hold the shape of that, because a layout is the easiest
 * thing to lose: the summary box exists on all three pages and every
 * line of it points somewhere real, the three pages still render
 * through one component, and nothing on the page can push a phone
 * sideways.
 */

const DOC_KEYS: DocKey[] = ['terms', 'privacy', 'dpa']
const DOCUMENT = readFileSync(join(ROOT, 'src/app/legal/document.tsx'), 'utf8')
const PAGE_OF: Record<DocKey, string> = {
  terms: '/terms',
  privacy: '/privacy',
  dpa: '/dpa',
}
/** Anchors the shared component draws on every page, section or not. */
const STANDING_ANCHORS = ['asked-first', 'words-used-here', 'for-counsel', 'where-to-go-next']

/** Does `href` point at something that is actually on one of the three pages? */
function resolves(href: string, from: DocKey): string | null {
  const [page, anchor] = href.includes('#') ? href.split('#') : [href, '']
  const key = page === '' ? from : (DOC_KEYS.find((k) => PAGE_OF[k] === page) ?? null)
  if (!key) return `${href} — no such page`
  if (!anchor) return null
  const ids = sectionsOf(key).map((s) => sectionId(s.heading))
  if (ids.includes(anchor) || STANDING_ANCHORS.includes(anchor)) return null
  return `${href} — no section on ${PAGE_OF[key]} has that address`
}

describe('The three pages answer the reader who arrives with six questions', () => {
  it('each legal page opens with what a procurement lead asks first, and every line of it links to the section that answers it', () => {
    for (const key of DOC_KEYS) {
      const lines = SUMMARY[key]
      expect(lines.length, `${key} must answer all six`).toBe(SUMMARY_ASKS.length)
      expect(lines.map((l) => l.ask), `${key} asks the same six, in the same order`).toEqual([
        ...SUMMARY_ASKS,
      ])
      for (const line of lines) {
        expect(line.answer.length, `${key}: "${line.ask}" is answered, not just named`).toBeGreaterThan(60)
        expect(resolves(line.href, key), `${key}: "${line.ask}"`).toBeNull()
      }
    }

    // Two of the six — what happens in a breach, and what is held —
    // are answered on a different page from the one a reader may have
    // landed on, which is the whole reason the box carries links.
    expect(SUMMARY.terms.find((l) => l.ask === 'What you hold')!.href).toContain('/privacy#')
    expect(SUMMARY.privacy.find((l) => l.ask === 'When something goes wrong')!.href).toContain('/dpa#')

    // And it is drawn above the body, not under it.
    expect(DOCUMENT).toContain('SUMMARY[docKey]')
    expect(DOCUMENT).toContain('href={line.href}')
    const box = DOCUMENT.indexOf('summary.map((line)')
    const body = DOCUMENT.indexOf('doc.sections.map((s, i) => (')
    expect(box, 'the six asks are not rendered at all').toBeGreaterThan(-1)
    expect(box, 'the six asks must come before the sections').toBeLessThan(body)
  })

  it('the three legal pages share one document component so they cannot drift apart', () => {
    for (const key of DOC_KEYS) {
      const src = readFileSync(join(ROOT, `src/app${PAGE_OF[key]}/page.tsx`), 'utf8')
      expect(src, `${key} must render through the shared document`).toContain('LegalDocument')
      expect(src).toContain("from '../legal/document'")
      expect(src).toContain(`docKey="${key}"`)
      // No markup of its own: the moment a page draws one panel itself,
      // the three start looking like three documents.
      for (const markup of ['<div', '<section', '<h1', '<table', '<ul', '<p ']) {
        expect(src, `${key} draws ${markup} of its own`).not.toContain(markup)
      }
      expect(src.split('\n').length, `${key} has grown a layout of its own`).toBeLessThan(20)
    }
  })

  it('what is held is a table with a retention line per category, citing the rule or saying none can be cited', () => {
    const held = PRIVACY.sections.find((s) => s.heading === 'What we hold about you')!
    expect(held.table, 'the categories line up in columns, so they are a table').toBe('held')
    expect(DPA.sections.find((s) => s.heading === 'Categories of personal data')!.table).toBe('held')
    expect(DOCUMENT).toContain('keptFor(h.category)')

    // Every category the notice names has a line on the schedule, so no
    // cell is empty and none is filled with a period nobody can defend.
    expect(unscheduledCategories(), 'categories on the page with no retention line').toEqual([])

    for (const h of HELD) {
      const cell = keptFor(h.category)
      expect(cell.period.length, h.category).toBeGreaterThan(8)
      expect(cell.period, `${h.category} must not read as a gap`).not.toMatch(/Not on the schedule/)
      // A cell either cites a rule a reader can look up, or says plainly
      // that none can be cited. There is no third thing it may say.
      const cited = /\d+ CFR \d/.test(cell.cite)
      expect(
        cited || cell.cite === 'No federal minimum can be cited',
        `${h.category} cites "${cell.cite}", which is neither a rule nor an admission`
      ).toBe(true)
    }

    // The four federal floors the schedule stands on reach the page.
    const cites = HELD.map((h) => keptFor(h.category).cite).join(' ')
    for (const rule of ['8 CFR 274a.2', '26 CFR 31.6001-1', '29 CFR 516.5', '29 CFR 1602.14']) {
      expect(cites, `${rule} is on the schedule but reaches no cell on the page`).toContain(rule)
    }
    // And at least one category is honestly left without a period.
    expect(
      HELD.filter((h) => keptFor(h.category).cite === 'No federal minimum can be cited').length
    ).toBeGreaterThan(0)
  })

  it('who else touches the data is a table of who, what it is for and what reaches them', () => {
    expect(PRIVACY.sections.find((s) => s.heading === 'Who else touches the data')!.table).toBe(
      'sub-processors'
    )
    expect(DPA.sections.find((s) => s.heading === 'Sub-processors')!.table).toBe('sub-processors')
    for (const column of ['Who', 'What for', 'What reaches it']) {
      expect(DOCUMENT, `the sub-processor table has no ${column} column`).toContain(
        `label: '${column}'`
      )
    }
    // A service that is not on in every deployment says so on its row,
    // because "we use a model" and "we use a model where one is
    // configured" are different disclosures.
    expect(DOCUMENT).toContain("s.always ? 'Every deployment' : 'Only where configured'")
    expect(SUB_PROCESSORS.some((s) => !s.always)).toBe(true)
  })

  it('the counsel questions are a section a reader can find, not a footnote', () => {
    expect(DOCUMENT).toContain('id="for-counsel"')
    // In the contents, and linked from the banner at the top, so a
    // reader meets the open list before they meet any of the claims.
    expect(DOCUMENT.match(/href="#for-counsel"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    const banner = DOCUMENT.indexOf('DRAFT_BANNER.body')
    const link = DOCUMENT.indexOf('href="#for-counsel"')
    expect(link, 'the count of open questions sits with the draft banner').toBeGreaterThan(banner)
    expect(DOCUMENT).toContain('{COUNSEL_QUESTIONS.length}, listed in full')

    // Each question carries the status it actually has — open — and the
    // sections across all three documents that are waiting on it.
    expect(DOCUMENT).toContain('Open — nobody has answered it')
    expect(DOCUMENT).toContain('waitingOn(q.id)')
    const cited = new Set(
      DOC_KEYS.flatMap((k) => sectionsOf(k).map((s) => s.open).filter(Boolean) as string[])
    )
    expect(cited.size, 'most of the open questions are cited by a section somewhere').toBeGreaterThanOrEqual(6)
  })

  it('the words a reader needs are defined once, at the top, and say nothing the body does not', () => {
    expect(DEFINITIONS.length).toBeGreaterThanOrEqual(5)
    const definitions = DOCUMENT.match(/DEFINITIONS\.map/g) ?? []
    expect(definitions.length, 'a definition list drawn twice is a definition repeated').toBe(1)
    const where = DOCUMENT.indexOf('DEFINITIONS.map')
    expect(where, 'the words are defined after the body they are used in').toBeLessThan(
      DOCUMENT.indexOf('<Block')
    )

    // Each one restates something the documents say in full further
    // down. A definition that says something new is a second, looser
    // document hiding in a glossary.
    const body = [
      ...POPULATIONS.map((p) => `${p.signIn} ${p.channel} ${p.held} ${p.control}`),
      ...[...TERMS.sections, ...PRIVACY.sections, ...DPA.sections].flatMap((s) => [
        ...s.paragraphs,
        ...(s.bullets ?? []),
      ]),
      ...HELD.map((h) => h.examples),
    ].join(' ')
    for (const phrase of [
      'seat belongs to the company that granted it',
      'travels with them',
      'not because it might one day',
      'when it expires',
      'counted once per day',
    ]) {
      expect(DEFINITIONS.map((d) => d.meaning).join(' '), `no definition says "${phrase}"`).toContain(phrase)
      expect(body, `"${phrase}" is defined at the top and said nowhere in the body`).toContain(phrase)
    }
  })

  it('a person reading the privacy notice is sent to their own data page, which asks for no permission', () => {
    const own = CROSS_LINKS.privacy.find((l) => l.href === '/dashboard/my-data')
    expect(own, 'the privacy notice must point at the page where a person acts').toBeDefined()
    expect(existsSync(join(ROOT, 'src/app/dashboard/my-data/page.tsx'))).toBe(true)

    // And the route behind it really does ask for nothing: a permission
    // gate on your own file is a gate the person it protects cannot open.
    const route = readFileSync(join(ROOT, 'src/app/api/me/data/route.ts'), 'utf8')
    expect(route).toMatch(/No permission, on purpose/i)
    expect(route, 'the subject’s own door must not be gated').not.toMatch(/requirePermission|can\(/)

    // The other two pages point at each other and at the fee position,
    // so a reader never has to guess which of the three holds a thing.
    expect(CROSS_LINKS.dpa.map((l) => l.href)).toContain('#breach-notification')
    expect(CROSS_LINKS.dpa.map((l) => l.href)).toContain('#sub-processors')
    expect(CROSS_LINKS.terms.map((l) => l.href)).toContain('#fees')
    for (const key of DOC_KEYS) {
      for (const link of CROSS_LINKS[key]) {
        if (link.href.startsWith('/dashboard')) continue
        expect(resolves(link.href, key), `${key} points at ${link.href}`).toBeNull()
      }
    }
  })

  it('no legal page scrolls sideways at phone width', () => {
    // Measured, not only asserted: Chromium at 390 × 844 reported a
    // scrollWidth of 390 on all three pages on the walk that shipped
    // this. What a test can hold afterwards is the properties that
    // would break it again.

    // 16px gutters and one column at phone width.
    expect(DOCUMENT).toContain('px-4')

    // Every table is drawn only where there is room for columns, and
    // the same rows are drawn as cards below that width.
    const tables = DOCUMENT.match(/<table[^>]*className="([^"]*)"/g) ?? []
    expect(tables.length, 'no table at all — this check has lost its subject').toBeGreaterThan(0)
    for (const t of tables) {
      expect(t, 'a table drawn at phone width pushes the page sideways').toContain('hidden')
      expect(t).toContain('lg:table')
    }
    expect(DOCUMENT, 'the table rows must also exist as cards').toContain('lg:hidden')

    // Nothing is wider than the narrowest phone this has to survive.
    // `max-w-` is a ceiling and cannot force a scrollbar, so it is not
    // what this is looking for — a fixed or minimum width is.
    const fixed = [...DOCUMENT.matchAll(/(?<![\w-])(?:min-)?w-\[(\d+)px\]/g)].map((m) => Number(m[1]))
    for (const px of fixed) expect(px, `a ${px}px element cannot fit a 390px screen`).toBeLessThan(358)

    // A machine path has no space to break at, so it is told to break
    // anywhere. Every place one is drawn carries the wrapping rule.
    expect(DOCUMENT).toContain("const WRAP = 'break-words [overflow-wrap:anywhere]'")
    for (const drawn of ['{h.provenBy}', '{s.provenBy}', '{section.provenBy}']) {
      const at = DOCUMENT.indexOf(drawn)
      expect(at, `${drawn} is not drawn anywhere`).toBeGreaterThan(-1)
      const around = DOCUMENT.slice(Math.max(0, at - 400), at)
      expect(around, `${drawn} is drawn without the wrapping rule`).toContain('${WRAP}')
    }

    // And nothing reaches for a horizontal scroller to hide the problem.
    expect(DOCUMENT).not.toContain('overflow-x-auto')
    expect(DOCUMENT).not.toContain('overflow-scroll-x')
  })
})
