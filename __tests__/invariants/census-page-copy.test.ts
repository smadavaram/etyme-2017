import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CENSUS_COPY,
  NOTHING_YET,
  acceptedKinds,
  currentStep,
  deletionPromise,
  everySentence,
  headlines,
  kindsSentence,
  limitsSentence,
  offered,
  promises,
  stepsSoFar,
} from '@/lib/census-copy'
import {
  ACCEPTED,
  AGREEMENT_VERSION,
  assignmentSays,
  KEPT_DAYS_AFTER_RECEIPT,
  MAX_CENSUS_BYTES,
  MAX_FILES,
  MAX_FILE_BYTES,
  checkWorkEmail,
  deletionSentence,
  mb,
  queueSays,
} from '@/lib/census'
import { CENSUS_AGREEMENT } from '@/lib/legal'
import { TEMPLATE_CSV } from '@/lib/census-import'
import {
  check,
  gridsWithoutBreakpoint,
  headlinesFrom,
  longSentences,
  priceClaims,
  withoutVerb,
} from '@/lib/positioning'

/**
 * `/census` is the first thing a client does with Etyme, and it is
 * written before they are a customer. Everything that made the home page
 * worth a test applies here twice over: nobody has signed in, four
 * people at the client have to say yes before a file moves, and the
 * page is making promises about somebody's data that the software has
 * to keep.
 *
 * What this checks is not whether the writing is good. It is that the
 * page cannot say a limit the upload route does not enforce, cannot
 * promise a deletion the sweep does not run, cannot invent a price or a
 * deadline, and cannot offer a button for a step nobody has reached.
 */

const root = process.cwd()
const PAGE = readFileSync(join(root, 'src/app/census/page.tsx'), 'utf8')
const FLOW = readFileSync(join(root, 'src/app/census/flow.tsx'), 'utf8')
const COPY = readFileSync(join(root, 'src/lib/census-copy.ts'), 'utf8')

/**
 * The flow with its comments stripped, which is what a visitor could
 * ever see. A comment explaining why a staff-only sentence is withheld
 * has to be free to name it.
 */
const FLOW_CODE = FLOW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Everything a visitor reads, as one block. */
const all = everySentence().join(' ')

describe('The census page says what the software does, in the software’s own words', () => {

  it('the census page prints the file kinds, limits and the deletion promise from lib/census, never its own copy', () => {
    // The kinds are the accepted list de-duplicated, so a type added to
    // ACCEPTED shows up on the page without anybody editing a sentence.
    expect(acceptedKinds()).toEqual(['CSV', 'PDF', 'XLSX', 'DOCX'])
    for (const label of new Set(Object.values(ACCEPTED))) {
      const word = { CSV: 'CSV', PDF: 'PDF', XLSX: 'Excel', DOCX: 'Word' }[label]!
      expect(kindsSentence()).toContain(word)
    }

    // The limits are formatted by the same function the refusals are
    // formatted by, so "5.0 MB" on the page and "5.0 MB" in a refusal
    // are one number formatted once.
    expect(limitsSentence()).toContain(mb(MAX_FILE_BYTES))
    expect(limitsSentence()).toContain(mb(MAX_CENSUS_BYTES))
    expect(limitsSentence()).toContain(String(MAX_FILES))

    // The deletion promise counts from the constant the nightly sweep
    // counts from, and the page's "nothing has arrived yet" line is
    // lib/census's own sentence rather than a second wording of it.
    expect(deletionPromise()[0]).toContain(`${KEPT_DAYS_AFTER_RECEIPT} days`)
    expect(deletionPromise()).toContain(deletionSentence(null))

    // And nothing anywhere on the page writes one of these down by
    // hand. A page carrying its own "5 MB" is the failure this whole
    // arrangement exists to stop.
    const source = `${PAGE}\n${FLOW}\n${COPY.slice(COPY.indexOf('export const CENSUS_COPY'))}`
    for (const hardcoded of [/\b5\s?MB\b/i, /five megabytes/i, /\b50\s?MB\b/i, /forty-five days/i, /\b20 files\b/i]) {
      expect(source, `${hardcoded} is written on the page instead of read from lib/census`)
        .not.toMatch(hardcoded)
    }
  })

  it('the page names no price and no model', () => {
    // No price, because none is settled: the home page says the
    // decision and changing it is the founder's alone.
    const found = priceClaims(all)
    expect(found, found.join('; ')).toEqual([])
    expect(all).not.toMatch(/\$\s?\d/)

    // Never lead with AI, and here never mention it: a census is read
    // by a named person, and the agreement says no model decides
    // anything about the client's workforce. A page claiming otherwise
    // would be selling the least defensible thing in the product.
    for (const word of [/\bAI\b/, /\bA\.I\.\b/i, /artificial intelligence/i, /\bLLM\b/i, /\bGPT/i,
      /machine learning/i, /\bmodel\b/i, /\balgorithm/i]) {
      expect(all, `${word} is on the census page`).not.toMatch(word)
    }
  })

  it('every headline is a sentence with a verb', () => {
    // A headline with no verb is a slogan, and a slogan is a claim
    // nobody can agree or disagree with. No exceptions are passed: the
    // one the home page allows is its hero, and this page has none.
    const slogans = withoutVerb(headlines())
    expect(slogans, slogans.join('; ')).toEqual([])

    // And the headlines typed straight into the two page files, which
    // is where a slogan gets added later.
    const literal = [...headlinesFrom(PAGE), ...headlinesFrom(FLOW)]
    expect(withoutVerb(literal), literal.join('; ')).toEqual([])
  })

  it('no sentence is over 30 words', () => {
    // Thirty is the refusal line, not the target. The reader is a
    // program manager who may be reading English as a second language
    // and reads it once.
    // Measured one line at a time: a heading has no full stop on it,
    // so joining the page into one block would read a heading and the
    // line under it as a single forty-word sentence that nobody wrote.
    for (const line of everySentence()) {
      const long = longSentences(line)
      expect(long, long.join(' // ')).toEqual([])
    }
  })

  it('the agreement link points at the legal document', () => {
    expect(CENSUS_COPY.promise.agreementHref).toBe('/legal/census-agreement')
    expect(PAGE).toContain('/legal/census-agreement')
    // The edition is named, because which edition somebody accepted is
    // the finding in an audit, and it is the one lib/census writes to
    // the row rather than a number typed on a page.
    expect(CENSUS_COPY.promise.version).toBe(AGREEMENT_VERSION)
    expect(CENSUS_COPY.promise.versionSays).toContain(AGREEMENT_VERSION)
    // The flow links to the href the request route hands back, so a
    // document that moves moves the link with it.
    expect(FLOW).toContain('agreement?.href')
  })

  it('the form asks for a work email and shows the route’s refusal sentence', () => {
    expect(CENSUS_COPY.form.emailLabel.toLowerCase()).toContain('work email')

    // The sentence under the field is checkWorkEmail's, which is what
    // POST /api/census/request refuses with. A person typing a personal
    // address reads one wording, whichever side says it.
    expect(FLOW).toContain('checkWorkEmail')
    expect(FLOW).toContain('setEmailSays(email.says)')
    const personal = checkWorkEmail('sam@gmail.com')
    expect(personal.ok).toBe(false)
    expect(personal.says).toContain('sam@gmail.com')
    expect(personal.says).toContain('personal address')
    // A work address on a reserved demo domain passes, which is what
    // the walk through this page uses.
    expect(checkWorkEmail('program@northbend.example').ok).toBe(true)
  })

  it('a step not yet reached is not offered as a button', () => {
    // Nothing asked for yet: one button, and it is the form's.
    expect(currentStep(NOTHING_YET)).toBe('ASK')
    expect(offered(NOTHING_YET).map((s) => s.key)).toEqual(['ASK'])
    expect(stepsSoFar(NOTHING_YET).map((s) => s.key)).toEqual(['ASK'])

    // Asked for, not agreed: the upload step does not exist on the
    // page at all — not greyed, not disabled. The token it needs has
    // not been minted, so a button offering it would be a lie.
    const asked = { ...NOTHING_YET, requestId: 'census-1' }
    expect(currentStep(asked)).toBe('AGREE')
    expect(offered(asked).map((s) => s.key)).toEqual(['AGREE'])
    expect(stepsSoFar(asked).map((s) => s.key)).not.toContain('UPLOAD')

    // Agreed, nothing sent: the link exists, so sending is offered.
    const agreed = { ...asked, uploadToken: 'abc' }
    expect(currentStep(agreed)).toBe('UPLOAD')
    expect(offered(agreed).map((s) => s.key)).toEqual(['UPLOAD'])
    expect(stepsSoFar(agreed).map((s) => s.key)).not.toContain('DONE')

    // Files received: nothing more to press, and the last step says so
    // rather than offering an action that does not exist.
    const done = { ...agreed, receiptSays: 'Received, 1 file, 166 bytes.' }
    expect(currentStep(done)).toBe('DONE')
    expect(offered(done)).toEqual([])
    expect(stepsSoFar(done).map((s) => s.key)).toEqual(['ASK', 'AGREE', 'UPLOAD', 'DONE'])

    // Every button in the flow is drawn inside its step's own branch,
    // so the state machine above is the only thing deciding.
    expect(FLOW).toContain('step.key === \'ASK\' && step.button')
    expect(FLOW).toContain('step.key === \'AGREE\' && step.button')
    expect(FLOW).toContain('step.key === \'UPLOAD\' && step.button')
  })

  it('a deployment with nobody assigned tells the client a person picks it up, not which variable to set', () => {
    // `assignmentSays(null)` is a true sentence written for staff: it
    // names the environment variable to set. A client reading it learns
    // that the promise of a named person is unconfigured, so the page
    // shows the name where there is one and its own line where there
    // is not.
    expect(assignmentSays(null)).toContain('ETYME_STAFF_EMAILS')
    expect(FLOW_CODE).not.toContain('ETYME_STAFF_EMAILS')
    expect(FLOW).toContain('json.data.assignedTo.length > 0')
    expect(FLOW).toContain('The person who picks it up writes to you by name.')
    // With somebody assigned it is the route's own sentence, naming them.
    expect(assignmentSays('rae@etyme.com')).toContain('rae@etyme.com')
  })

  it('the page says what a client gets before it asks them for anything', () => {
    // Order matters on a page read by a committee: what you get, what
    // you send, what happens to the file, and only then the form.
    const at = (id: string) => PAGE.indexOf(id)
    expect(at('what-you-get')).toBeGreaterThan(-1)
    expect(at('what-you-get')).toBeLessThan(at('what-you-send'))
    expect(at('what-you-send')).toBeLessThan(at('what-we-promise'))
    expect(at('what-we-promise')).toBeLessThan(at('<CensusFlow />'))
  })

  it('the page reads as the category it is, and never leads with one module', () => {
    // The same four rules the home page is held to, run against this
    // page's own words: category first, no module describing itself, no
    // AI in the hero, horizontal, neutral, nobody real named.
    const hero = [CENSUS_COPY.eyebrow, CENSUS_COPY.headline, CENSUS_COPY.standfirst]
    const findings = check({ hero, body: everySentence() })
    expect(findings.map((f) => `${f.rule}: ${f.says}`), findings.map((f) => f.rule).join('; ')).toEqual([])
    expect(CENSUS_COPY.headline.toLowerCase()).toContain('contractors')
  })

  it('the six promises are the agreement’s own six headings, in the agreement’s order', () => {
    // The page does not write its own version of what we promise. It
    // prints the agreement's headings and a sentence out of each
    // section, so a promise cannot drift from the document it links to.
    expect(promises().map((p) => p.heading)).toEqual(CENSUS_AGREEMENT.sections.map((s) => s.heading))
    expect(promises()).toHaveLength(6)
    for (const promise of promises()) {
      const section = CENSUS_AGREEMENT.sections.find((s) => s.heading === promise.heading)!
      expect(section.paragraphs.join(' ')).toContain(promise.says)
      expect(promise.says).toMatch(/[.!?]$/)
    }
    // The three a procurement lead reads first are legible on the page
    // rather than only behind the link.
    const said = promises().map((p) => p.says).join(' ')
    expect(said).toContain('One named person.')
    expect(said).toContain(`${KEPT_DAYS_AFTER_RECEIPT === 45 ? 'Forty-five' : KEPT_DAYS_AFTER_RECEIPT} days after your files arrive.`)
    expect(said).toContain('Etyme runs no bench and places nobody')
  })

  it('the template the page offers is the file the importer parses', () => {
    // A download button that hands somebody a different shape of file
    // from the one the importer reads is twenty wasted minutes and an
    // email asking for it again.
    expect(CENSUS_COPY.send.optionA.href).toBe('/census-template.csv')
    const served = readFileSync(join(root, 'public/census-template.csv'), 'utf8')
    expect(served).toBe(TEMPLATE_CSV)
    // And the template asks for no names, which is the whole reason it
    // is offered before the invoices.
    expect(CENSUS_COPY.send.optionA.names).toContain('No names')
    expect(served.toLowerCase()).not.toContain('name,')
    // "Open it in Excel, fill it, save as CSV" — the sentence the
    // correction in the brief asks for, because there is no spreadsheet
    // library and none is added for this.
    expect(CENSUS_COPY.send.optionA.how).toContain('Excel')
    expect(CENSUS_COPY.send.optionA.how).toContain('CSV')
  })

  it('the page says the census is the first step whether they take the software, the service, or nothing', () => {
    // A client weighing this has to know it commits them to nothing.
    // The two labels are the founder's own, because a buyer knows them.
    expect(CENSUS_COPY.get.firstStep).toContain('VMS software')
    expect(CENSUS_COPY.get.firstStep).toContain('MSP provider')
    expect(CENSUS_COPY.get.firstStep).toContain('do nothing')
    expect(CENSUS_COPY.get.free).toContain('no account')
  })

  it('the only scarcity sentence on the page is the queue position lib/census computes', () => {
    // No countdown, no "limited places", no deadline nobody set. The
    // one true scarcity is that a small number of these run well at
    // once, and queueSays is where that sentence lives.
    for (const urgency of [/limited/i, /only \d+ (?:places|spots|slots)/i, /hurry/i, /act now/i,
      /before it is too late/i, /offer ends/i, /last chance/i, /\bdeadline\b/i]) {
      expect(all, `${urgency} is urgency this page invented`).not.toMatch(urgency)
    }
    // The queue sentence is printed from the request route's answer
    // rather than written here, so it can only ever say what is true.
    expect(FLOW).toContain('queueSays')
    expect(COPY).not.toContain('censuses ahead')
    expect(queueSays(1)).toContain('Yours is next')
  })

  it('every grid on the page stacks on a phone', () => {
    // The founder reads this on a phone. An unprefixed column count
    // applies from zero up, which is a layout that never stacks.
    expect(gridsWithoutBreakpoint(PAGE)).toEqual([])
    expect(gridsWithoutBreakpoint(FLOW)).toEqual([])
    // 16px gutters on every band, which is px-4 at the small end.
    expect(PAGE).toContain('px-4')
  })
})
