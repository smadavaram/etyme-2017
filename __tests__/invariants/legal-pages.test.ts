import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HELD, CENSUS_AGREEMENT, CENSUS_SUMMARY, sectionId } from '@/lib/legal'
import {
  LEGAL_PAGES,
  PRIVACY_NOTICE,
  TERMS_OF_SERVICE,
  DATA_PROCESSING_ADDENDUM,
  NOTICE_CATEGORY,
  NOT_ABOUT_A_PERSON,
  OLD_ANCHORS,
  anchorsOn,
  counselPointsIn,
  sectionOf,
  tableIn,
  wordsOf,
  type LegalKey,
} from '@/lib/legal/documents'
import { inline, parseLegal, toMarkdown } from '@/lib/legal/parse'
import { SCHEDULE, COOLING_DAYS } from '@/lib/retention'
import { domainOf } from '@/lib/domains'
import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'
import { MIN_PASSWORD, FAILURES_ALLOWED, FAILURE_WINDOW_MS, WAIT_MS } from '@/lib/password'
import { SANDBOX_UNUSED_DAYS } from '@/lib/sandbox-expiry'
import { KEPT_DAYS_AFTER_RECEIPT } from '@/lib/census'
import { STAY_CHOICES } from '@/lib/bench-stay'

/**
 * The legal pages say only what is true of the code, and say all of what
 * the founder approved.
 *
 * Since 2026-10-15 the Privacy Notice, the Terms of Service and the DPA
 * are published from the text the founder read and approved ("Publish"),
 * held word for word in `src/lib/legal/` and read into sections by a
 * small parser. So these tests hold three things:
 *
 *   — the page is the approved text, every word of it, and nothing else;
 *   — every claim in it that the code can answer, the code answers the
 *     same way: the services named, the periods kept, what erasure does,
 *     the numbers on sign-in and clean-up;
 *   — the reader can see what is not decided, and can find every section.
 *
 * A privacy notice that misdescribes what a system holds is worse than
 * no notice: it is a written misrepresentation, and the first security
 * review finds it.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const POSTURE = read('docs/security-posture.md')
const POLICY = read('SECURITY.md')
const DOCUMENT = read('src/app/legal/document.tsx')
const PRIVACY = wordsOf(PRIVACY_NOTICE)
const TERMS = wordsOf(TERMS_OF_SERVICE)
const DPA = wordsOf(DATA_PROCESSING_ADDENDUM)
const ALL_WORDS = [PRIVACY, TERMS, DPA].join('\n')

/** The address that does not exist yet, written once so a test can find it. */
const PLACEHOLDER = 'security@etyme.example'

/** Every `src/...` or `docs/...` path a document points at. */
function pathsNamedIn(text: string): string[] {
  const hits = text.match(/(?:src|prisma|docs|__tests__|__integration__)\/[A-Za-z0-9_\-./[\]]+/g) ?? []
  return [...new Set(hits.map((h) => h.replace(/[.,)]+$/, '')))]
}

function exists(p: string): boolean {
  if (existsSync(join(ROOT, p))) return true
  if (p.endsWith('/*')) return existsSync(join(ROOT, p.slice(0, -2)))
  return false
}

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full, keep) : keep(name) ? [full] : []
  })
}

/** Route files under src/app/api, and those that write an access-log row through lib/access-log. */
function apiRouteFiles(): string[] {
  return walk(join(ROOT, 'src/app/api'), (n) => n === 'route.ts')
}
function routeFilesLoggingThroughTheLib(): number {
  return apiRouteFiles().filter((f) =>
    /\b(?:logAccess|logBulkAccess|recordAccess|recordRefusal)\(/.test(readFileSync(f, 'utf8'))
  ).length
}

/** The first column of a table: the names it lists. */
const namesIn = (rows: Record<string, string>[], column: string) => rows.map((r) => r[column])

describe('The three legal pages are the text the founder approved, published whole', () => {
  it('each page is the approved text word for word: written back out, it is the text it was read from', () => {
    for (const page of LEGAL_PAGES) {
      expect(toMarkdown(page), `${page.href} lost or changed a character`).toBe(page.source)
      expect(page.sections.length, page.href).toBeGreaterThan(5)
    }
    expect(PRIVACY_NOTICE.title).toBe('Privacy Notice')
    expect(TERMS_OF_SERVICE.title).toBe('Terms of Service')
    expect(DATA_PROCESSING_ADDENDUM.title).toBe('Data Processing Addendum')
    expect(PRIVACY_NOTICE.sections).toHaveLength(17)
    expect(TERMS_OF_SERVICE.sections).toHaveLength(20)
  })

  it('a line the reader would see differently from how it was written stops the build instead of dropping a word', () => {
    expect(() => inline('An open [bracket that never closes')).toThrow(/Unclosed \[/)
    expect(() => inline('A **strong run that never ends')).toThrow(/Unclosed \*\*/)
    expect(() => parseLegal('> **Notice:** draft\n\n# T\n\n## 1. A\n\n| a | b |\n|---|---|\n| only one |\n')).toThrow(
      /1 cells under 2 headings/
    )
    expect(() => parseLegal('# No notice\n')).toThrow(/draft notice/)
  })

  it('every legal page says on its face, above its title, that it is a draft not yet reviewed by counsel', () => {
    for (const page of LEGAL_PAGES) {
      const notice = page.notice.map((r) => r.text).join('')
      expect(notice, page.href).toMatch(/This document is a draft and has not yet been reviewed by legal counsel/)
      expect(notice, page.href).toMatch(/Text in square brackets marks a point counsel must decide/)
    }
    const notice = DOCUMENT.indexOf('<Runs line={doc.notice} />')
    expect(notice, 'the notice is not drawn').toBeGreaterThan(-1)
    expect(notice, 'the notice must come before the title').toBeLessThan(DOCUMENT.indexOf('{doc.title}'))
  })

  it('every point counsel has not decided is drawn as marked text, so a reader sees what is undecided', () => {
    for (const page of LEGAL_PAGES) {
      const points = counselPointsIn(page)
      // Every bracket in the approved text is one marked run, whole.
      const brackets = (page.source.match(/\[/g) ?? []).length
      expect(points.length, page.href).toBe(brackets)
      expect(points.length, `${page.href} has no open point — this check has lost its subject`).toBeGreaterThan(5)
      for (const p of points) expect(p, page.href).toMatch(/^\[[^\]]+\]$/)
    }
    // The notice's own "square brackets" is a word, not a point.
    expect(PRIVACY_NOTICE.notice.some((r) => r.counsel)).toBe(false)
    // And the renderer draws a counsel run as a mark on a light wash.
    expect(DOCUMENT).toMatch(/if \(r\.counsel\)[\s\S]{0,120}<mark[\s\S]{0,80}bg-etyme-attention-wash/)
  })

  it('every section is open: nothing is folded, summarized or kept behind a click', () => {
    for (const fold of ['<details', '<summary', 'aria-expanded', 'useState', 'line-clamp', 'SUMMARY']) {
      expect(DOCUMENT, `the legal page draws ${fold}`).not.toContain(fold)
    }
    expect(DOCUMENT).toContain('doc.sections.map((s) => (')
    expect(DOCUMENT).toContain('s.blocks.map((b, i) => (')
    for (const page of LEGAL_PAGES) {
      for (const s of page.sections) expect(s.blocks.length, `${page.href} ${s.heading} is empty`).toBeGreaterThan(0)
    }
  })

  it('each page has a contents list of its sections, and every entry lands on a section that exists', () => {
    expect(DOCUMENT).toContain('aria-label="Contents"')
    expect(DOCUMENT).toContain('href={`#${s.id}`}')
    expect(DOCUMENT).toContain('id={s.id}')
    for (const page of LEGAL_PAGES) {
      const ids = page.sections.map((s) => s.id)
      expect(new Set(ids).size, `${page.href} has two sections at one address`).toBe(ids.length)
      for (const id of anchorsOn(page.key)) expect(id, page.href).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
    // Readable, from the heading.
    expect(anchorsOn('privacy')).toContain('10-how-long-we-keep-information')
    expect(anchorsOn('dpa')).toContain('4-6-personal-data-breaches')
    expect(anchorsOn('dpa')).toContain('annex-a-sub-processors')
    expect(new Set(anchorsOn('dpa')).size).toBe(anchorsOn('dpa').length)
  })

  it('a link written before the text was published still lands on the section that says the same thing', () => {
    expect(DOCUMENT).toContain('<Aliases docKey={docKey} id={s.id} />')
    expect(DOCUMENT).toContain('<Aliases docKey={docKey} id={block.id} />')
    for (const key of Object.keys(OLD_ANCHORS) as LegalKey[]) {
      const live = anchorsOn(key)
      for (const [from, to] of Object.entries(OLD_ANCHORS[key])) {
        expect(live, `/${key}#${from} points at ${to}, which is not on the page`).toContain(to)
        expect(live, `/${key}#${from} is also a live address`).not.toContain(from)
      }
    }
    expect(OLD_ANCHORS.dpa['breach-notification']).toBe('4-6-personal-data-breaches')
    expect(OLD_ANCHORS.privacy['how-long-we-keep-it']).toBe('10-how-long-we-keep-information')
    expect(OLD_ANCHORS.terms.fees).toBe('9-fees')

    // And every link in the product to a section of these pages lands.
    const links = walk(join(ROOT, 'src'), (n) => /\.(tsx?|md)$/.test(n)).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\/(privacy|terms|dpa)#([a-z0-9-]+)/g)].map((m) => ({
        f,
        key: m[1] as LegalKey,
        id: m[2],
      }))
    )
    for (const l of links) {
      const lands = anchorsOn(l.key).includes(l.id) || l.id in OLD_ANCHORS[l.key]
      expect(lands, `${l.f} links /${l.key}#${l.id}, which is on no page`).toBe(true)
    }
  })

  it('a table scrolls sideways inside its own box on a phone, never the page, and its figures line up', () => {
    expect(DOCUMENT).toContain('px-4')
    expect(DOCUMENT).toMatch(/className="overflow-x-auto[^"]*"[\s\S]{0,40}<table className="[^"]*tabular-nums/)
    // The text column is about seventy characters.
    expect(DOCUMENT).toContain("const MEASURE = 'max-w-[70ch]'")
    // Nothing fixed is wider than the narrowest phone.
    const fixed = [...DOCUMENT.matchAll(/(?<![\w-])(?:min-)?w-\[(\d+)px\]/g)].map((m) => Number(m[1]))
    for (const px of fixed) expect(px, `a ${px}px element cannot fit a 390px screen`).toBeLessThan(358)
  })

  it('the three legal pages share one document component and the shared header and footer, so they cannot drift apart', () => {
    for (const key of ['privacy', 'terms', 'dpa'] as LegalKey[]) {
      const src = read(`src/app/${key}/page.tsx`)
      expect(src).toContain("from '../legal/document'")
      expect(src).toContain(`<LegalDocument docKey="${key}" />`)
      for (const markup of ['<div', '<section', '<h1', '<table', '<ul', '<p ']) {
        expect(src, `${key} draws ${markup} of its own`).not.toContain(markup)
      }
    }
    expect(DOCUMENT).toContain('<SiteHeader />')
    expect(DOCUMENT).toContain('<SiteFooter />')
    // The row of links between the three.
    expect(DOCUMENT).toContain('aria-label="Legal documents"')
    expect(LEGAL_PAGES.map((p) => p.href)).toEqual(['/privacy', '/terms', '/dpa'])
  })

  it('the census agreement keeps its own page and every word of it', () => {
    const page = read('src/app/legal/census-agreement/page.tsx')
    expect(page).toContain('<CensusAgreementDocument doc={CENSUS_AGREEMENT} />')
    expect(CENSUS_AGREEMENT.sections.map((s) => s.heading)).toEqual([
      'What we receive',
      'Who at Etyme can see it',
      'Where it sits',
      'We never approach your suppliers or your contractors',
      'The day we delete it',
      'What happens if you start a program',
    ])
    const ids = CENSUS_AGREEMENT.sections.map((s) => sectionId(s.heading))
    for (const line of CENSUS_SUMMARY) expect(ids, line.ask).toContain(line.href.slice(1))
    const census = read('src/app/legal/census-document.tsx')
    expect(census).toContain('DRAFT_BANNER.headline')
    expect(census).toContain('<SiteFooter />')
  })
})

describe('What the three documents say is what the code does', () => {
  it('every service named as receiving personal data is one the code calls, and every outside service the code calls is named', () => {
    const privacy = namesIn(tableIn(PRIVACY_NOTICE, '6.'), 'Service provider')
    const annex = namesIn(tableIn(DATA_PROCESSING_ADDENDUM, 'Annex A'), 'Sub-processor')
    expect(annex, 'the DPA and the notice must list the same services').toEqual(privacy)

    const evidence: Record<string, () => void> = {
      'Managed database host [to be named]': () => expect(read('prisma/schema.prisma')).toContain('env("DATABASE_URL")'),
      Vercel: () => expect(existsSync(join(ROOT, 'vercel.json'))).toBe(true),
      'Anthropic (where set up)': () => {
        const pkg = JSON.parse(read('package.json'))
        expect(pkg.dependencies['@anthropic-ai/sdk']).toBeDefined()
      },
      'Resend or SendGrid (where set up)': () => {
        const senders = read('src/lib/senders.ts')
        expect(senders).toContain('api.resend.com')
        expect(senders).toContain('api.sendgrid.com')
      },
      'Mail server for sign-in links (where set up) [to be named]': () =>
        expect(read('src/lib/auth.ts')).toContain('server: process.env.EMAIL_SERVER'),
      'Microsoft and Google (where set up)': () => {
        const auth = read('src/lib/auth.ts')
        expect(auth).toContain('AzureADProvider')
        expect(auth).toContain('GoogleProvider')
      },
      'Microsoft Teams (where set up)': () => {
        expect(read('prisma/schema.prisma')).toMatch(/teamsWebhookUrl\s+String\?/)
        expect(read('src/lib/teams/connector.ts')).toContain('botframework')
      },
    }
    expect(privacy.sort()).toEqual(Object.keys(evidence).sort())
    for (const name of privacy) evidence[name]()

    // The other way round: every outside address the code calls belongs to a named service.
    const owner: [RegExp, string][] = [
      [/api\.resend\.com|api\.sendgrid\.com/, 'Resend or SendGrid'],
      [/botframework\.com/, 'Microsoft Teams'],
      [/login\.microsoftonline\.com/, 'Microsoft'],
      [/etyme\.com/, 'Etyme'],
    ]
    const hosts = new Set(
      walk(join(ROOT, 'src'), (n) => /\.tsx?$/.test(n)).flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          // A comment that cites an address calls nothing.
          .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
          .flatMap((line) => [...line.matchAll(/https:\/\/([a-z0-9.-]+\.(?:com|net|io|ai|co|app|dev))\b/g)].map((m) => m[1]))
      )
    )
    const unnamed = [...hosts].filter(
      (h) => !h.endsWith('.example') && !owner.some(([re]) => re.test(h)) && !/^(?:www\.)?(?:linkedin|github)\.com$/.test(h)
    )
    expect(unnamed, 'an outside address the code calls that no named service covers').toEqual([])
  })

  it('Microsoft Teams is disclosed as receiving notices and approval requests, which may name a person', () => {
    for (const doc of [PRIVACY_NOTICE, DATA_PROCESSING_ADDENDUM]) {
      const rows = doc === PRIVACY_NOTICE ? tableIn(doc, '6.') : tableIn(doc, 'Annex A')
      const teams = rows.find((r) => Object.values(r)[0].startsWith('Microsoft Teams'))!
      expect(teams, doc.title).toBeDefined()
      expect(Object.values(teams).join(' ')).toMatch(/notices and approval requests/)
      expect(Object.values(teams).join(' ')).toMatch(/may include a person's name/)
    }
    expect(PRIVACY).toMatch(/the emails and Microsoft Teams messages it sends/)
    expect(TERMS).toMatch(/the emails and Microsoft Teams messages it sends/)
  })

  it('the typed-question use of the resume-reading service is disclosed: off until a company turns it on, masked before it leaves, and logged', () => {
    const anthropic = tableIn(PRIVACY_NOTICE, '6.').find((r) => r['Service provider'].startsWith('Anthropic'))!
    expect(anthropic.Purpose).toMatch(/check a resume against the skills claimed/)
    expect(anthropic.Purpose).toMatch(/answer a typed question about a company's own data where that company has turned this on/)
    expect(anthropic['What it receives']).toMatch(/For a typed question: the question and related entries, with names of people and companies, rates, pay and amounts replaced by placeholders before sending/)
    expect(PRIVACY).toMatch(/The question feature is off for each company until someone at that company with authority turns it on\. Each question sent and each answer received is logged/)
    expect(DPA).toMatch(/The typed-question feature is off for each Customer until someone at that Customer with authority turns it on/)
    expect(TERMS).toMatch(/answer typed questions about a Customer's own data if that Customer has turned this on/)

    // Off unless set, recorded with who, and every text kept masked.
    expect(read('prisma/schema.prisma')).toMatch(/askEtymeModelOn\s+Boolean\s+@default\(false\)/)
    const boundary = read('src/lib/model-boundary.ts')
    expect(boundary).toContain('return row?.askEtymeModelOn === true')
    expect(boundary).toContain('export async function recordModelPrompt')
    expect(existsSync(join(ROOT, 'src/app/api/conversations/twin/mask.ts'))).toBe(true)
  })

  it('matching sends a person’s name to the outside service, and without a key it uses fixed rules and the resume check does not run', () => {
    expect(PRIVACY).toMatch(/For matching: a Worker's name, skills, headline, location, work authorization type, minimum rate and date available/)
    expect(PRIVACY).toMatch(/If no Anthropic key is set, matching uses fixed rules and says so, and the resume check does not run/)
    expect(PRIVACY).toMatch(/For an import: up to 60,000 characters of the file/)

    const engine = read('src/lib/match-engine.ts')
    expect(engine).toContain('name: c.personName')
    expect(engine).toContain('workAuth: c.workAuth')
    expect(engine).toContain('no ANTHROPIC_API_KEY — scored with rules, not the model')
    expect(read('src/app/api/submissions/[id]/check/route.ts')).toContain('evidencePrompt(p.claimedSkills, cvText)')
    expect(read('src/lib/extract.ts')).toContain('source.length > 60_000')
  })

  it('it uses no analytics, advertising or session-recording package, and the visit count is first-party with no name or cookie', () => {
    const pkg = JSON.parse(read('package.json'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const tracking = deps.filter((d) =>
      /analytics|segment|mixpanel|posthog|amplitude|hotjar|fullstory|logrocket|heap|gtag|google-tag|clarity|plausible|datadog-rum|smartlook|mouseflow|sentry\/replay/i.test(d)
    )
    expect(tracking, 'a tracking package the notice says is not used').toEqual([])
    expect(PRIVACY).toMatch(/We do not use any advertising, analytics or session-recording service/)
    expect(PRIVACY).toMatch(/We set no third-party cookies/)

    const count = read('src/lib/public-site/count.ts')
    expect(count).toContain('sessionStorage')
    expect(count).not.toMatch(/document\.cookie/)
    expect(PRIVACY).toMatch(/The public website count records no name, email address, IP address, browser details or cookie/)
  })

  it('every category the schedule knows is in the notice’s list of what is collected, and nothing about a person is left off', () => {
    const collected = namesIn(tableIn(PRIVACY_NOTICE, '3.'), 'Category')
    const mapped = collected.filter((c) => !(NOT_ABOUT_A_PERSON as readonly string[]).includes(c))
    expect(mapped.map((c) => NOTICE_CATEGORY[c]).sort(), 'a row with no category behind it').toEqual(
      HELD.map((h) => h.category).sort()
    )
    expect(Object.keys(NOTICE_CATEGORY).sort()).toEqual(mapped.sort())
  })

  it('every retention period and every fate on erasure the notice states is the one the nightly sweep uses', () => {
    const rows = tableIn(PRIVACY_NOTICE, '10.')
    expect(rows.map((r) => NOTICE_CATEGORY[r.Category]).sort()).toEqual(HELD.map((h) => h.category).sort())
    for (const row of rows) {
      const line = SCHEDULE.find((l) => l.category === NOTICE_CATEGORY[row.Category])!
      expect(line, row.Category).toBeDefined()
      const fate = row['When you ask to be forgotten']
      const period = row['Period kept']
      const where = `${row.Category}: "${fate}" / "${period}"`

      switch (line.fate) {
        case 'DELETED':
          expect(fate, where).toMatch(/^Deleted/)
          break
        case 'KEPT_ANONYMIZED':
          expect(fate, where).toMatch(/names? removed/)
          break
        case 'KEPT_IN_FULL':
          expect(fate, where).toMatch(/^Kept/)
          expect(fate, where).not.toMatch(/removed|deleted/i)
          break
        case 'HELD_THEN_DELETED':
          // A period nobody can cite deletes nothing, so it reads "Kept".
          if (line.months === null && line.anchor !== 'I9') expect(fate, where).toBe('Kept')
          else expect(fate, where).toBe('Kept until the period ends, then deleted')
          break
      }

      if (line.anchor === 'I9') {
        expect(period, where).toMatch(/^I-9: the later of 3 years after hire or 1 year after employment ends/)
      } else if (line.months && line.months > 0) {
        expect(period, where).toContain(`${line.months / 12} year`)
      } else if (line.category === 'A contractor census') {
        expect(period, where).toBe(`${KEPT_DAYS_AFTER_RECEIPT} days for files`)
      } else {
        expect(period, where).toMatch(/^Not set/)
      }
    }
    expect(PRIVACY).toMatch(/Every period below is a minimum set by US federal law\. Some states require longer/)
    // Ending access still deletes nothing.
    expect(read('src/lib/account-lifecycle.ts')).toMatch(/Nothing here is ever deleted/i)
    expect(PRIVACY).toMatch(/Ending a Business User's access deletes no records/)
  })

  it('erasure is described as it runs: fourteen days to change your mind, five things deleted, the name replaced, shared records kept', () => {
    expect(COOLING_DAYS).toBe(14)
    expect(PRIVACY).toMatch(/We wait 14 days, so you can change your mind/)
    expect(DPA).toMatch(/An erasure waits 14 days so the person can withdraw it/)

    const deleted = SCHEDULE.filter((l) => l.fate === 'DELETED').map((l) => l.category).sort()
    expect(deleted).toEqual(['A consultant’s own profile', 'Bars and preferences', 'Conversations with Ask Etyme', 'Identity and sign-in', 'Resumes'])
    expect(PRIVACY).toMatch(
      /On day 14, your sign-in methods, Worker profile, unsent resumes, saved Ask Etyme conversations, and any bars or favorites set against your name are deleted/
    )

    const erasure = read('src/lib/erasure.ts')
    expect(erasure).toContain("name: 'Erased person'")
    expect(erasure).toContain('@erased.invalid')
    expect(PRIVACY).toMatch(/Your name is replaced with "Erased person" and your email with an address that cannot receive mail/)

    // A resume already sent keeps its entry and loses its file and its text.
    expect(erasure).toContain("data: { bytes: null, url: null, textExtract: null, fileName: 'erased', label: 'Erased' }")
    expect(PRIVACY).toMatch(/If sent to a company, the entry stays but the file and its text are removed/)
    // Removing a resume is a different thing, and the company keeps its copy.
    expect(read('prisma/schema.prisma')).toMatch(/Never unsent: a company it was sent to/)
    expect(PRIVACY).toMatch(/a company it was already sent to can still open its copy/)
  })

  it('a sign-in session, the password rules and the clean-ups are stated as the code sets them', () => {
    expect(read('src/lib/auth.ts')).toContain('maxAge: 30 * 24 * 60 * 60')
    expect(PRIVACY).toMatch(/It lasts up to 30 days unless you sign out/)
    expect(TERMS).toMatch(/A sign-in session lasts up to 30 days/)

    expect([MIN_PASSWORD, FAILURES_ALLOWED, FAILURE_WINDOW_MS, WAIT_MS]).toEqual([12, 5, 15 * 60 * 1000, 60 * 1000])
    expect(DPA).toMatch(/Passwords must be at least 12 characters\. After five failed attempts in 15 minutes for one email or one network address, sign-in pauses for one minute/)
    expect(PRIVACY).toMatch(/After five failed tries in 15 minutes, sign-in pauses for a minute/)

    expect(SANDBOX_UNUSED_DAYS).toBe(30)
    expect(PRIVACY).toMatch(/Demo accounts that nobody uses for 30 days are deleted automatically/)
    expect(KEPT_DAYS_AFTER_RECEIPT).toBe(45)
    expect(PRIVACY).toMatch(/Files deleted 45 days after they arrive/)
  })

  it('it says only a bank name, an account name and the last four digits are taken', () => {
    expect(PRIVACY).toMatch(/We never ask for or store a full bank account number or routing number/)
    expect(PRIVACY).toMatch(/We hold no payment card data/)
    const route = read('src/app/api/supplier-apply/[token]/route.ts')
    expect(route).toContain("last4: String(body.bank.last4 ?? '').replace(/\\D/g, '').slice(-4)")
    expect(route, 'the route must not accept a full account number').not.toMatch(/accountNumber|routingNumber/)
    expect(read('prisma/schema.prisma')).toMatch(/accountLast4\s+String\?\s+\/\/ display only — never the full number/)
  })

  it('a worker’s permission is per supplier and theirs to withdraw, and a supplier’s own employee is the one exception, told rather than asked', () => {
    expect(TERMS).toMatch(/You grant or decline permission to each Supplier separately\. You can withdraw it/)
    expect(TERMS).toMatch(/A Supplier putting forward its own employee does not need that permission, but the employee is told/)
    const schema = read('prisma/schema.prisma')
    expect(schema).toContain('askFirst')
    expect(schema).toContain('showBeforeFree')
    expect(read('src/app/api/submissions/kind.ts')).toContain('INTERNAL')
    expect(Math.min(...STAY_CHOICES)).toBe(5)
    expect(Math.max(...STAY_CHOICES)).toBe(500)
    expect(TERMS).toMatch(/You choose how long a permission lasts, from 5 days to 500 days or until you cancel it/)
    expect(TERMS).toMatch(/Only you may file your hours/)
  })

  it('time on site is added up across every supplier and counts each day once', () => {
    expect(PRIVACY).toMatch(/The total days a Worker has worked at a Client, added up across every Supplier, counting each day once/)
    expect(read('src/lib/tenure-days.ts')).toMatch(/union of the periods, not their sum/i)
  })

  it('reads of a named person are logged, refusals included, and the notice does not claim every page', () => {
    expect(PRIVACY).toMatch(/Refused attempts are logged too/)
    expect(PRIVACY).toMatch(/It does not cover every page/)
    expect(DPA).toMatch(/Refused attempts are logged before the refusal is sent/)
    const log = read('src/lib/access-log.ts')
    expect(log).toContain('allowed')
    expect(log).toContain('export async function recordRefusal')
  })

  it('the security measures the DPA lists are the ones the code implements', () => {
    expect(DPA).toMatch(/Stored only as a hash, compared in constant time, and never shown again after creation/)
    expect(DPA).toMatch(/Outgoing notifications to other systems\*?\*? are signed/)
    expect(DPA).toMatch(/If no secret is set, every scheduled call is refused/)
    const accounts = read('src/lib/service-accounts.ts')
    expect(accounts).toContain("createHash('sha256')")
    expect(accounts).toContain('timingSafeEqual')
    expect(accounts).toContain('createHmac')
    expect(read('src/lib/cron-auth.ts')).toContain('if (!secret) return')
    // And it offers no report it does not have.
    expect(DPA).toMatch(/Etyme does not have a SOC 2 report, an ISO 27001 certificate, or an independent penetration test report/)
    // The company export is refused in words, as the DPA says.
    expect(read('src/lib/data-request.ts')).toContain('a company export is not built yet')
    expect(DPA).toMatch(/Etyme does not yet offer an automatic export of a Customer's data/)
  })

  it('the services named in configuration that nothing calls are said not to be used', () => {
    expect(PRIVACY).toMatch(/We do not use file storage, e-signature or text-message services, even though some configuration files mention them/)
    expect(read('.env.example')).toContain('S3_BUCKET')
    const reads = walk(join(ROOT, 'src'), (n) => /\.tsx?$/.test(n)).filter((f) =>
      /process\.env\.(S3_|AWS_|DOCUSIGN|TWILIO)/.test(readFileSync(f, 'utf8'))
    )
    expect(reads, 'a file reads a key the notice says nothing uses').toEqual([])
  })
})

describe('Nothing on a legal page contradicts what Etyme says it is', () => {
  it('no legal page states a price, because the price is not set', () => {
    expect(ALL_WORDS).not.toMatch(/\$\s?\d/)
    expect(ALL_WORDS).not.toMatch(/per (seat|user|month|year)/i)
    expect(TERMS).toMatch(/The Services are free while they are being tested\. No price has been set/)
  })

  it('no legal page claims Etyme places anybody or decides whether a person may work', () => {
    expect(TERMS).toMatch(/Not a staffing agency\. Etyme does not employ Workers, place them, run a pool of available workers/)
    expect(TERMS).toMatch(/does not issue a "cleared to work" result/)
    expect(PRIVACY).toMatch(/Etyme is not a staffing agency/)
    expect(read('src/lib/attestation.ts')).toMatch(/export function overallVerdict\(\): never/)
  })

  it('no legal page leads with AI or uses its words', () => {
    expect(ALL_WORDS).not.toMatch(/\bAI\b|artificial intelligence|machine learning|\bLLMs?\b|\bmodels?\b/i)
    expect(ALL_WORDS).toMatch(/An outside service that reads text/)
  })

  it('the words are the trade’s and American: never desk or program office, never a British spelling', () => {
    expect(ALL_WORDS).not.toMatch(/\bdesks?\b/i)
    expect(ALL_WORDS).not.toMatch(/program(me)? office/i)
    expect(ALL_WORDS).not.toMatch(/programme|organis|authoris|licence|favour|behaviour|centre|anonymis|honour|colour/i)
  })

  it('every file the three pages and their renderer belong to is in the regulatory domain, because a wrong one is a legal exposure', () => {
    for (const p of [
      'src/lib/legal.ts',
      'src/lib/legal/documents.ts',
      'src/lib/legal/parse.ts',
      'src/lib/legal/privacy-text.ts',
      'src/lib/legal/terms-text.ts',
      'src/lib/legal/dpa-text.ts',
      'src/app/legal/document.tsx',
      'src/app/legal/census-document.tsx',
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
    // Corrected 2026-10-15: the password door does slow failed tries, so
    // the absence is of rate limiting everywhere else, and it says which.
    expect(POSTURE).toMatch(/No rate limiting, no WAF rule and no bot protection in the application,\s+except the password sign-in limit/)
    expect(POSTURE).toMatch(/No disaster recovery plan/i)
  })

  it('it names every deletion that runs on a schedule, not only the demo clean-up, as the privacy notice does', () => {
    expect(POSTURE).not.toMatch(/The only scheduled deletion in the product is demo workspaces/)
    expect(POSTURE).toMatch(/Three things are deleted on a schedule, and nothing else/)
    expect(POSTURE).toContain('`src/app/api/cron/retention/route.ts`')
    expect(read('src/app/api/cron/retention/route.ts')).toContain('runRetentionSweep(new Date())')
    expect(read('src/lib/data-request.ts')).toContain('await runCensusSweep(now)')
    expect(POSTURE).toContain(`demo workspaces nobody used for ${SANDBOX_UNUSED_DAYS} days`)
    expect(POSTURE).toContain(`promised, ${KEPT_DAYS_AFTER_RECEIPT} days after they arrive`)
  })

  it('it says password sign-in slows failed tries, with the numbers the code uses', () => {
    expect(POSTURE).toContain(
      `| Email and password sign-in | Built — argon2id hash, at least ${MIN_PASSWORD} characters, five failed tries in 15 minutes and the door waits a minute`
    )
    expect(FAILURES_ALLOWED).toBe(5)
    expect(read('src/lib/password.ts')).toContain('argon2.argon2id')
  })

  it('it does not call anything planned that nobody has committed to', () => {
    const planned = POSTURE.split('## 15. Planned')[1].split('## 16.')[0]
    expect(planned).toMatch(/absent with no committed date/i)
    // Two committed items, and no roadmap invented around them.
    expect(planned).not.toMatch(/Q[1-4]\s?20\d\d/)
    expect(planned).not.toMatch(/\broadmap\b(?! here)/i)
  })

  it('it states the access-log coverage honestly rather than as every route, and both counts are the ones in the tree today', () => {
    // Counted, not pinned, the same way as the privacy notice: a builder who
    // moves a route onto lib/access-log changes the number here as well.
    const logging = routeFilesLoggingThroughTheLib()
    const routes = apiRouteFiles().length
    const said = /(\d+) route files write an access-log row\s+through `src\/lib\/access-log\.ts`, out of (\d+) API route files/.exec(POSTURE)
    expect(said, 'docs/security-posture.md no longer states the coverage in the form this test reads').not.toBeNull()
    expect(
      [Number(said![1]), Number(said![2])],
      `docs/security-posture.md says ${said![1]} of ${said![2]} route files log a read; the tree has ` +
        `${logging} of ${routes}. Change both numbers in section 4 and in the summary of what is not done.`
    ).toEqual([logging, routes])
    expect(POSTURE).toContain(`Access logging covers ${logging} route files of ${routes} (section 4).`)
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
    expect(rules.length).toBe(unprompted.length - 3)
    expect(
      unprompted.filter((k) => ACTIONS[k].basis !== 'RULE').sort(),
      'every unprompted action is a plain rule except proactive matching and the twin’s two recorded acts, as section 7 says'
    ).toEqual(['PROACTIVE_MATCH', 'TWIN_DREW_UP', 'TWIN_TOLD'])
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

