/**
 * The words on `/census`, as data, and the order the four steps happen in.
 *
 * ── Why the copy is not in the page ──────────────────────────────────
 *
 * Two reasons, and the second is the one that matters.
 *
 * The page is a client component with a form in it, so its words would
 * otherwise be scattered through JSX where a test can only find them by
 * reading the source with a regular expression. That is how
 * `lib/positioning` reads the home page, and it works, and it is crude.
 *
 * The second reason: **almost nothing on this page is ours to write.**
 * The file kinds, the size limits, the deletion promise, the queue
 * sentence and the refusal for a personal address are all decided in
 * `lib/census`, which is `etyme-regulatory`'s. A marketing page that
 * restates a limit in its own words is a page that will eventually
 * promise five files when the software takes twenty. So the limits here
 * are built from the constants, the sentences are the functions'
 * returns, and the six promises are the agreement's own headings read
 * out of `lib/legal`. What is left — the headlines, the five things a
 * client gets, the two options — is the only writing on the page.
 *
 * ── The rule every sentence here is written to ───────────────────────
 *
 * Every sentence is an outcome, a benefit or a method. No metaphors,
 * nothing over thirty words, and a headline is a sentence with a verb
 * in it rather than a slogan. `__tests__/invariants/census-page-copy.test.ts`
 * checks all three against `lib/positioning`'s own helpers, which is
 * the same bar the home page is held to.
 *
 * ── What is deliberately absent ──────────────────────────────────────
 *
 * No price, because none is settled. No model, because the census is
 * read by a person and saying otherwise would be a claim the software
 * does not make. No countdown, no "limited places", no invented
 * deadline: the only true scarcity is that a small number of these run
 * well at once, and `queueSays` is the sentence that says it.
 *
 * Owned by etyme-market (`lib/census-copy` in `lib/domains.ts`).
 */

import {
  ACCEPTED,
  AGREEMENT_VERSION,
  KEPT_DAYS_AFTER_RECEIPT,
  MAX_CENSUS_BYTES,
  MAX_FILES,
  MAX_FILE_BYTES,
  deletionSentence,
  mb,
} from '@/lib/census'
import { CENSUS_AGREEMENT } from '@/lib/legal'

// ── What the software says, printed rather than restated ──────────────

/**
 * The kinds of file we can open, in a phrase, built from the list the
 * upload route checks against.
 *
 * `ACCEPTED` maps eight MIME types onto four labels, so the labels are
 * de-duplicated in the order they appear. A type added there appears
 * here without anybody editing a sentence.
 */
export function acceptedKinds(): string[] {
  const seen: string[] = []
  for (const label of Object.values(ACCEPTED)) {
    if (!seen.includes(label)) seen.push(label)
  }
  return seen
}

/** "We take a CSV, a PDF, an Excel file or a Word file." */
export function kindsSentence(): string {
  const article: Record<string, string> = {
    CSV: 'a CSV',
    PDF: 'a PDF',
    XLSX: 'an Excel file',
    DOCX: 'a Word file',
  }
  const kinds = acceptedKinds().map((k) => article[k] ?? `a ${k} file`)
  const last = kinds[kinds.length - 1]
  return `We take ${kinds.slice(0, -1).join(', ')} or ${last}.`
}

/**
 * The three limits, in the same words the refusal uses.
 *
 * `mb` is the formatter the upload route's refusals are built from, so
 * a client reading "5.0 MB" here and "5.0 MB" in a refusal is reading
 * one number formatted once.
 */
export function limitsSentence(): string {
  return (
    `One file goes up to ${mb(MAX_FILE_BYTES)}, the whole census up to ` +
    `${mb(MAX_CENSUS_BYTES)}, and up to ${MAX_FILES} files in total.`
  )
}

/**
 * What the page says about deletion before anything has been sent.
 *
 * Two sentences, and neither is computed here. The first counts days
 * from the constant the sweep counts from. The second is
 * `deletionSentence(null)`, which is the software's own answer when
 * nothing has arrived — the page has no date to show because there is
 * no date yet, and saying so is more honest than showing today plus
 * forty-five.
 */
export function deletionPromise(): string[] {
  return [
    `We delete your files ${KEPT_DAYS_AFTER_RECEIPT} days after they arrive.`,
    'You are given the exact date when we confirm receipt, and it does not move.',
    deletionSentence(null),
  ]
}

// ── The six promises, in the agreement's own words ────────────────────

/**
 * Which sentence of the agreement stands for each of its six headings.
 *
 * A paragraph index and a sentence index, because the promise is not
 * always the first sentence — "We never approach your suppliers" opens
 * by saying what a census contains, and states why we have nothing to
 * gain by going near them third. So the page points at a sentence
 * rather than writing a shorter one of its own, and the agreement stays
 * the only place the wording lives.
 *
 * Each pick is also under thirty words, which is the page's rule and
 * not the agreement's: a legal document may run long and a line on a
 * marketing page read by a busy person may not. Where the agreement's
 * own sentence is longer, the pick moves to the one beside it rather
 * than the page trimming somebody else's wording.
 *
 * If a section is rewritten and its sentences move, this picks a
 * different sentence rather than an invented one, and the test that
 * reads the six headings fails the moment a heading changes.
 */
const PROMISE_SENTENCE: { paragraph: number; sentence: number }[] = [
  { paragraph: 0, sentence: 0 }, // What we receive
  { paragraph: 0, sentence: 0 }, // Who at Etyme can see it
  { paragraph: 1, sentence: 1 }, // Where it sits
  { paragraph: 0, sentence: 2 }, // We never approach your suppliers
  { paragraph: 0, sentence: 0 }, // The day we delete it
  { paragraph: 0, sentence: 1 }, // What happens if you start a program
]

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

export interface AgreementPromise {
  heading: string
  says: string
}

/**
 * The six things a procurement lead asks, each in one line, read out of
 * the agreement they link to.
 */
export function promises(): AgreementPromise[] {
  return CENSUS_AGREEMENT.sections.map((section, i) => {
    const pick = PROMISE_SENTENCE[i] ?? { paragraph: 0, sentence: 0 }
    const paragraph = section.paragraphs[pick.paragraph] ?? section.paragraphs[0] ?? ''
    const says = sentencesOf(paragraph)[pick.sentence] ?? sentencesOf(paragraph)[0] ?? ''
    return { heading: section.heading, says }
  })
}

// ── The page ──────────────────────────────────────────────────────────

export interface Line {
  label: string
  says: string
}

export const CENSUS_COPY = {
  eyebrow: 'Contractor census',

  /**
   * The headline. Category first: a visitor knows this is about
   * contractors and the suppliers behind them before anything else.
   */
  headline: 'Find out how many contractors are on your sites, across every supplier',

  standfirst:
    'You send what you already hold. A named person at Etyme reads it and sends back one ' +
    'page, inside five working days. It is free and you create no account.',

  get: {
    heading: 'You get one page inside five working days',
    lines: [
      {
        label: 'Contractors on your sites, by supplier',
        says: 'One number for the program, and the same number split by the firm supplying each person.',
      },
      {
        label: 'Spend this quarter, by supplier',
        says: 'What each supplier bills you this quarter, and the share of the total it holds.',
      },
      {
        label: 'Same skill, different price',
        says: 'Where two suppliers fill one role, the lowest rate, the highest rate and the gap between them.',
      },
      {
        label: 'Longest on site, counting every supplier',
        says: 'Days on your sites added up across every firm that supplied the same person.',
      },
      {
        label: 'What we could not see',
        says: 'Every gap in what you sent: rows with no end date, hours nobody recorded, suppliers with no rate.',
      },
    ] as Line[],
    free: 'The census costs nothing and you create no account. A named person at Etyme runs it.',
    firstStep:
      'This is the first step whether you then take Etyme as VMS software, take Etyme as ' +
      'your MSP provider, or do nothing. The page is yours either way.',
  },

  send: {
    heading: 'You send the template, or the files you already have',
    optionA: {
      label: 'Option A. The template',
      says:
        'One row per contractor: supplier, role, site, start date, end date, rate, hours a week.',
      names:
        'No names. Your own reference number for each person is enough, so the file holds almost nothing personal.',
      how: 'Open it in Excel, fill it, save as CSV.',
      button: 'Download the template',
      href: '/census-template.csv',
    },
    optionB: {
      label: 'Option B. The files you already have',
      says:
        'Send the supplier invoices and timesheets you hold, where you have nothing tidier than that.',
      how: 'We read them and write down every gap we hit, rather than guessing at a number.',
    },
  },

  promise: {
    heading: 'We say what happens to your file before you send it',
    standfirst:
      'Six things get asked before a file moves, and these are the six. Each one links to ' +
      'the page it is written on.',
    agreementLabel: 'Read the census agreement',
    agreementHref: '/legal/census-agreement',
    version: AGREEMENT_VERSION,
    versionSays: `This is the ${AGREEMENT_VERSION} edition, and the edition somebody accepts is written down.`,
  },

  form: {
    heading: 'Ask for your census',
    standfirst:
      'Nothing is sent yet. This puts you in the line and tells you who at Etyme runs it.',
    nameLabel: 'Your name',
    nameHint: 'The person running your census writes back to you by name.',
    companyLabel: 'Your company',
    companyHint: 'The name the page is addressed to.',
    emailLabel: 'Your work email',
    emailHint: 'A census is your company’s own data, so the page and the upload link go to a work address.',
    deskLabel: 'Which desk do you sit at?',
    deskHint: 'It decides how the page is written, and nothing else.',
    suppliersLabel: 'How many suppliers do you buy from?',
    suppliersHint: 'A round guess is fine, or leave it blank.',
    optionLabel: 'What will you send?',
    button: 'Ask for the census',
    sending: 'Sending…',
    failed: 'That did not send. Try again, or write to us and a person picks it up.',
  },

  desks: [
    { value: 'PROGRAM', label: 'Program office' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'PROCUREMENT', label: 'Procurement' },
    { value: 'OTHER', label: 'Other' },
  ],

  options: [
    { value: 'TEMPLATE', label: 'The template, filled in' },
    { value: 'FILES', label: 'My own invoices and timesheets' },
  ],
} as const

// ── The four steps, and which one is offered ──────────────────────────

export type StepKey = 'ASK' | 'AGREE' | 'UPLOAD' | 'DONE'

export interface Step {
  key: StepKey
  /** The headline over it. A sentence with a verb, like every other. */
  heading: string
  /** What it says under the headline before anything has happened. */
  says: string
  /** The words on its button, or null where the step has nothing to press. */
  button: string | null
}

const STEPS: Step[] = [
  {
    key: 'ASK',
    heading: CENSUS_COPY.form.heading,
    says: CENSUS_COPY.form.standfirst,
    button: CENSUS_COPY.form.button,
  },
  {
    key: 'AGREE',
    heading: 'Somebody at your company has to accept one page by name',
    says:
      'Read the census agreement and type the name of whoever is accepting it. The link you ' +
      'send files through is made at that moment and not before.',
    button: 'Accept it by name',
  },
  {
    key: 'UPLOAD',
    heading: 'You send your files through the link',
    says: 'Choose the filled template, or the invoices and timesheets you hold.',
    button: 'Send the files',
  },
  {
    key: 'DONE',
    heading: 'Your files are here and the deletion date is set',
    says: 'The person running your census reads them next, and writes to you by hand.',
    button: null,
  },
]

/** Where somebody has got to, read off what the routes have returned. */
export interface FlowState {
  /** The census row, once `POST /api/census/request` has written one. */
  requestId: string | null
  /** The upload token, which does not exist until the agreement is accepted. */
  uploadToken: string | null
  /** The receipt sentence, once files have arrived. */
  receiptSays: string | null
}

export const NOTHING_YET: FlowState = { requestId: null, uploadToken: null, receiptSays: null }

/**
 * Which step somebody is on.
 *
 * Read off what the software has actually done rather than off a
 * counter the page keeps: a census with no id has not been asked for, a
 * census with no upload token has not been agreed to — because the
 * token is minted by acceptance and by nothing else — and a census with
 * no receipt sentence has had no file arrive.
 */
export function currentStep(state: FlowState): StepKey {
  if (!state.requestId) return 'ASK'
  if (!state.uploadToken) return 'AGREE'
  if (!state.receiptSays) return 'UPLOAD'
  return 'DONE'
}

/**
 * The steps to draw, in order, up to the one somebody is on.
 *
 * A step further along than they are is not drawn at all — not as a
 * disabled button, not as a greyed heading. A button that cannot be
 * pressed is a question the reader has to answer ("why not?") on a page
 * whose whole job is to be answerable. The step before is drawn without
 * its button, because what it says is the record of what just happened.
 */
export function stepsSoFar(state: FlowState): Step[] {
  const here = currentStep(state)
  const upTo = STEPS.findIndex((s) => s.key === here)
  return STEPS.slice(0, upTo + 1).map((step, i) => (i === upTo ? step : { ...step, button: null }))
}

/**
 * The steps with a button on them, which is never more than one.
 *
 * The sentence this exists for: a step not yet reached is not offered as
 * a button.
 */
export function offered(state: FlowState): Step[] {
  return stepsSoFar(state).filter((s) => s.button !== null)
}

// ── Everything a test reads ───────────────────────────────────────────

/** Every headline on the page, including the four step headings. */
export function headlines(): string[] {
  return [
    CENSUS_COPY.headline,
    CENSUS_COPY.get.heading,
    CENSUS_COPY.send.heading,
    CENSUS_COPY.promise.heading,
    ...STEPS.map((s) => s.heading),
  ]
}

/**
 * Every sentence the page prints from this file, flattened.
 *
 * The test reads this rather than the source, so a sentence added to
 * the copy is inside the length rule and the price rule on the commit
 * that adds it.
 */
export function everySentence(): string[] {
  const out: string[] = [
    CENSUS_COPY.eyebrow,
    CENSUS_COPY.headline,
    CENSUS_COPY.standfirst,
    CENSUS_COPY.get.heading,
    CENSUS_COPY.get.free,
    CENSUS_COPY.get.firstStep,
    CENSUS_COPY.send.heading,
    CENSUS_COPY.send.optionA.label,
    CENSUS_COPY.send.optionA.says,
    CENSUS_COPY.send.optionA.names,
    CENSUS_COPY.send.optionA.how,
    CENSUS_COPY.send.optionA.button,
    CENSUS_COPY.send.optionB.label,
    CENSUS_COPY.send.optionB.says,
    CENSUS_COPY.send.optionB.how,
    CENSUS_COPY.promise.heading,
    CENSUS_COPY.promise.standfirst,
    CENSUS_COPY.promise.agreementLabel,
    CENSUS_COPY.promise.versionSays,
    kindsSentence(),
    limitsSentence(),
    ...deletionPromise(),
    ...CENSUS_COPY.get.lines.flatMap((l) => [l.label, l.says]),
    ...promises().flatMap((p) => [p.heading, p.says]),
    ...Object.values(CENSUS_COPY.form),
    ...CENSUS_COPY.desks.map((d) => d.label),
    ...CENSUS_COPY.options.map((o) => o.label),
    ...STEPS.flatMap((s) => [s.heading, s.says, s.button ?? '']),
  ]
  return out.filter((s) => s.trim().length > 0)
}
