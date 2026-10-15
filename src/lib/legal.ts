/**
 * The data the legal pages stand on, and the census agreement.
 *
 * ── What moved on 2026-10-15 ─────────────────────────────────────────
 *
 * The Privacy Notice, the Terms of Service and the DPA are published
 * from the text the founder approved, held word for word in
 * `lib/legal/` beside this file and read by `lib/legal/documents`. Their
 * old words, written here as objects, are gone, so there is one copy of
 * each document and it is the one on the page.
 *
 * What stays here is what other modules read:
 *
 *   HELD          the categories of personal data, one line each, which
 *                 the retention schedule, erasure, the data page and the
 *                 notice's own tables are keyed by
 *   POPULATIONS   the two kinds of people, read by the breach screen
 *   NOT_USED      the services named in configuration that nothing calls
 *   the census agreement, with its summary, words and counsel questions,
 *                 drawn by `app/legal/census-document`
 *
 * `__tests__/invariants/legal-pages.test.ts` reads all of it back
 * against the code it describes.
 *
 * Owned by etyme-regulatory (`lib/legal` in `lib/domains.ts`).
 */

import { AGREEMENT_CHANGES, AGREEMENT_VERSION } from '@/lib/census'

// ── The banner the census agreement carries ───────────────────────────

export const DRAFT_BANNER = {
  eyebrow: 'Draft for counsel',
  headline: 'Not legal advice, and not yet reviewed by a lawyer.',
  body:
    'Etyme wrote this by reading its own code, so that every sentence describes ' +
    'behavior that exists rather than behavior somebody hopes for. It has not been ' +
    'reviewed by a qualified lawyer in any jurisdiction, and it is not legal advice ' +
    'to anybody. The open questions below are the ones counsel has to answer before ' +
    'this is published as binding.',
} as const

/** The day the code behind these documents was last read end to end. */
export const LAST_VERIFIED = '2026-09-15'

// ── What counsel must decide ──────────────────────────────────────────

export interface CounselQuestion {
  /** Short handle, used to link a question from the body of a document. */
  id: string
  /** The question, asked the way a lawyer would ask it. */
  question: string
  /** What the code does today, stated without a legal conclusion. */
  whatTheCodeDoes: string
  /** Why it cannot be settled by an engineer. */
  whyItIsOpen: string
}

export const COUNSEL_QUESTIONS: CounselQuestion[] = [
  {
    id: 'controller-or-processor',
    question:
      'Is Etyme a controller or a processor, and is the answer the same for a client ' +
      'workforce record and for a candidate profile?',
    whatTheCodeDoes:
      'A client company writes job requests, approvals, timesheet decisions and tenure ' +
      'reads about workers it did not employ, and Etyme holds them on the client’s behalf. ' +
      'A candidate separately signs in with their own consumer email, keeps their own ' +
      'profile, uploads their own resumes, grants or declines each bench listing, and ' +
      'can turn on a public page of their own. Nothing in the code labels either flow.',
    whyItIsOpen:
      'The two look like different roles, and the DPA, the lawful basis for each ' +
      'processing activity and who answers a data subject request all follow from the ' +
      'answer. It is the single most consequential open question in these documents.',
  },
  {
    id: 'lawful-basis',
    question:
      'What is the lawful basis for each kind of processing, per jurisdiction — and ' +
      'does a bench listing granted by a consultant carry the weight the product treats ' +
      'it as carrying?',
    whatTheCodeDoes:
      'A submission requires a BenchListing whose state is GRANTED, moved by the ' +
      'consultant and not by the vendor. A consultant can decline, revoke, ask to be ' +
      'asked before each client, and refuse to be shown before their current contract ' +
      'ends. That is a real, recorded, per-vendor permission. Nothing calls it consent ' +
      'in the GDPR sense, and nothing records a purpose, a version or a withdrawal ' +
      'notice beyond the timestamps.',
    whyItIsOpen:
      'Whether that record is consent, legitimate interest or contract performance ' +
      'changes what has to be shown at the moment it is granted.',
  },
  {
    id: 'retention',
    question:
      'What retention periods apply, and what must be deleted rather than kept for ' +
      'the audit trail?',
    whatTheCodeDoes:
      'There is a retention schedule in code, one line per category named in the notice, ' +
      'and every period on it is a United States federal minimum with its rule cited — ' +
      'the I-9 at 8 CFR 274a.2, employment tax at 26 CFR 31.6001-1, payroll at 29 CFR ' +
      '516.5, personnel records at 29 CFR 1602.14. Where no federal minimum can be cited ' +
      'the line returns nothing and says why, and a visa petition file is one of those. A ' +
      'person can ask for everything held about them or ask to be forgotten, from their ' +
      'own page; an erasure waits fourteen days, anonymizes rather than deleting, and ' +
      'reports what a statutory minimum keeps back. A nightly sweep deletes what has ' +
      'passed its period and holds anything a live legal hold names.',
    whyItIsOpen:
      'The federal floors are citable and the state floors are not, several states run ' +
      'longer than the federal minimum, and which regime a given person is under is a ' +
      'question about where they live and worked rather than about the code. The clock ' +
      'on a request is one calendar month or forty-five days depending on the regime, ' +
      'and where nobody has recorded one the shortest of them is used and called ' +
      'conservative rather than correct. Whether a person who has simply gone quiet ' +
      'should be aged out at all is not decided, and nothing does it.',
  },
  {
    id: 'model-disclosure',
    question:
      'Does sending a candidate’s name, skills, work authorization class and the full ' +
      'text of their resume to a third-party model require a specific disclosure, a ' +
      'separate legal basis, or an opt-out — and does any of it amount to automated ' +
      'decision-making with legal or similarly significant effect?',
    whatTheCodeDoes:
      'Match scoring sends a candidate’s name, skills, headline, location, work ' +
      'authorization class, rate floor and availability date. The evidence check sends ' +
      'the extracted text of a resume with the skills claimed for it. Both fall back to ' +
      'arithmetic, or skip entirely, when no model key is set. A score is always ' +
      'advisory: no route in the product awards, rejects or bars anybody on a model ' +
      'output alone, and every score carries its factors, basis, confidence and ' +
      'unknowns.',
    whyItIsOpen:
      'Advisory is an engineering fact, not a legal one, and the threshold for ' +
      'automated decision-making is not ours to set.',
  },
  {
    id: 'cross-border',
    question:
      'Which transfer mechanism covers data leaving its country of origin, and does ' +
      'the deployment need regional isolation?',
    whatTheCodeDoes:
      'One deployment, one database. Nothing in the code pins a record to a region or ' +
      'refuses to move it. Email, hosting and the model provider are all reached over ' +
      'the public internet from wherever the deployment runs.',
    whyItIsOpen:
      'Standard contractual clauses, a UK addendum, or a regional deployment are ' +
      'alternatives with different costs, and the choice is a legal one.',
  },
  {
    id: 'tenure-visibility',
    question:
      'May a client be shown a worker days on site aggregated across suppliers that ' +
      'never employed them, and what has to be told to the worker?',
    whatTheCodeDoes:
      'Tenure accrues to the person at the client across every supplier, counted once ' +
      'per day on site. A client with a seat can read it. Every read writes a log row ' +
      'naming the reader, their company and the reason.',
    whyItIsOpen:
      'It is the sharpest thing the product does and the one most likely to need a ' +
      'specific notice to the worker. Co-employment exposure is the reason the client ' +
      'needs it; the worker interest in it is separate.',
  },
  {
    id: 'sensitive-categories',
    question:
      'Which fields are special category or sensitive personal information in each ' +
      'jurisdiction, and do any need separate handling?',
    whatTheCodeDoes:
      'Work authorization class, visa petition history, I-9 and E-Verify attestations, ' +
      'background check and drug screening outcomes, and a bar on a named person with a ' +
      'reason are all held. They are held as attestations that a check happened, with a ' +
      'provider, a date and an expiry, rather than as a verdict on a person.',
    whyItIsOpen:
      'Immigration status and criminal record checks are treated very differently ' +
      'across US states, the UK and the EU, and some of these may not be storable at ' +
      'all in some places.',
  },
  {
    id: 'sub-processor-contracts',
    question:
      'Which sub-processors need a data processing agreement in place before the first ' +
      'paying client, and what notice of a change is promised?',
    whatTheCodeDoes:
      'The code calls a managed Postgres host, Vercel, Resend or SendGrid for email, ' +
      'and Anthropic. Sign-in reaches Microsoft or Google. No processing agreement with ' +
      'any of them is recorded in this repository.',
    whyItIsOpen:
      'The DPA promises a notice period for a new sub-processor, and the period is a ' +
      'commercial and legal choice nobody has made.',
  },
  {
    id: 'liability-and-law',
    question:
      'Governing law, venue, liability cap, indemnities, and what happens on ' +
      'termination.',
    whatTheCodeDoes:
      'Nothing. These are the clauses the terms below leave marked as open rather than ' +
      'guessing at, because a number in a liability cap written by an engineer is worse ' +
      'than a blank.',
    whyItIsOpen: 'It is the part of a contract that is entirely counsel work.',
  },
  {
    id: 'employment-agency-status',
    question:
      'Does operating this platform make Etyme an employment agency, an employment ' +
      'business, or a staffing supplier in any jurisdiction it operates in?',
    whatTheCodeDoes:
      'Etyme runs no bench, employs no consultant, and places nobody. Every placement ' +
      'ends with a supplier holding the paper. The code refuses to produce a single ' +
      'cleared-to-place verdict about a person at all: the function that would return ' +
      'one throws instead, deliberately, so that no judgment about a person is ever ' +
      'made by Etyme rather than by whoever is legally accountable for it.',
    whyItIsOpen:
      'Agency licensing regimes turn on activity rather than self-description, and ' +
      'the UK, several US states and most EU member states each draw the line ' +
      'differently.',
  },
]

// ── Who we are to each other ──────────────────────────────────────────

export interface Population {
  id: 'business' | 'candidate'
  name: string
  /** How they get in. */
  signIn: string
  /** How they are reached. */
  channel: string
  /** What is held about them. */
  held: string
  /** What is theirs to control today, in the product as built. */
  control: string
}

export const POPULATIONS: Population[] = [
  {
    id: 'business',
    name: 'Business users',
    signIn:
      'Through their employer’s identity provider — Microsoft Entra or Google Workspace ' +
      '— or by an emailed link where their company has not connected one. A consumer ' +
      'email address cannot register a company.',
    channel:
      'In the product, and by email to their work address. A company can also receive ' +
      'notices on a Microsoft Teams channel where one is configured.',
    held:
      'Name, work email, the identity provider subject claim, when they last signed ' +
      'in, their seat at a company, their role and its permissions, the org unit they ' +
      'sit in, and every act they took in the product — an approval, a decision, a ' +
      'signature on a timesheet, a note on a supplier.',
    control:
      'Their employer holds their seat. An owner or administrator at that company can ' +
      'suspend it or end it. Suspension is reversible and keeps their history attached ' +
      'to them; ending a seat removes access and removes no record.',
  },
  {
    id: 'candidate',
    name: 'Candidates and consultants',
    signIn:
      'With their own Google account or an emailed link to their own address. They are ' +
      'individuals here, not employees of whoever signed them up, and their account ' +
      'travels with them between suppliers.',
    channel:
      'Email only. Nothing in the product sends a text message: a mobile number is ' +
      'held because a shared number is the strongest signal for recognizing the same ' +
      'person across two suppliers, which is what tenure aggregation rests on, and it ' +
      'is not used as a messaging channel.',
    held:
      'Name, email, time zone, and where they supply it: a headline, skills, location, ' +
      'work authorization class, a rate floor, a mobile number, availability, resumes ' +
      'and the text read out of them, and an optional public page they turn on ' +
      'themselves. Alongside the profile: submissions a supplier made for them, ' +
      'interviews, contracts and rates, timesheets and expenses, attestations that a ' +
      'check was run, visa petition history, and days on site.',
    control:
      'A profile is internal by default. A public page exists only from the day they ' +
      'turn it on. Every bench listing is granted or declined by them, per supplier, ' +
      'and can be revoked; they can require a supplier to ask before each client and ' +
      'refuse to be shown before their current contract ends. They can remove a resume ' +
      'from their own list, and a company it was already sent to keeps its copy.',
  },
]

// ── What is actually held ─────────────────────────────────────────────

export interface HeldCategory {
  category: string
  /** Examples, named the way the schema names them. */
  examples: string
  /** Which population it is about. */
  about: 'Candidates' | 'Business users' | 'Companies' | 'Everybody'
  /** The file or model that proves it, for whoever checks this. */
  provenBy: string
}

export const HELD: HeldCategory[] = [
  {
    category: 'Identity and sign-in',
    examples:
      'Name, primary email, time zone, and one record per sign-in method holding the ' +
      'identity provider subject claim, the email it carries and when it was last used.',
    about: 'Everybody',
    provenBy: 'Person, Credential in prisma/schema.prisma',
  },
  {
    category: 'A consultant’s own profile',
    examples:
      'Headline, skills, location, work authorization class, rate floor, mobile number, ' +
      'availability date, an optional public address and the words on that page.',
    about: 'Candidates',
    provenBy: 'ConsultantProfile in prisma/schema.prisma',
  },
  {
    category: 'Resumes',
    examples:
      'The file itself, its name, type and size, and the text read out of it for ' +
      'search and for filling a profile. The bytes sit in the database; there is no ' +
      'third-party file store.',
    about: 'Candidates',
    provenBy: 'Resume in prisma/schema.prisma',
  },
  {
    category: 'Work authorization and immigration',
    examples:
      'Visa petitions with their filings, requests for evidence, approvals, expiry ' +
      'dates and stamping, and the documents recorded against them.',
    about: 'Candidates',
    provenBy: 'VisaPetition, VisaDocument, VisaEvent in prisma/schema.prisma',
  },
  {
    category: 'Checks somebody else ran',
    examples:
      'I-9 and E-Verify, background checks, education evaluations and drug screenings — ' +
      'held as who ran it, when, its reference number, when it expires and what it ' +
      'returned. Etyme runs none of these itself and states no verdict about a person ' +
      'from them.',
    about: 'Candidates',
    provenBy: 'Verification, VerificationDoc in prisma/schema.prisma',
  },
  {
    category: 'Onboarding paperwork',
    examples:
      'The checklist of documents a placement needs, what was asked for, what was sent, ' +
      'what was uploaded or attested to, the file name, and a hash so the same file ' +
      'twice is stored once.',
    about: 'Candidates',
    provenBy: 'DocumentPacket, PacketItem, VerificationDoc in prisma/schema.prisma',
  },
  {
    category: 'Positions taken about how somebody is engaged',
    examples:
      'Whether a company treats somebody as its employee or as an independent ' +
      'contractor, and — where they are an employee — whether that employer says they ' +
      'are exempt from overtime. Both are held as what a company asserted: the answers ' +
      'it gave, the position it took, who took it, when, the written reason where the ' +
      'position departs from what the answers indicate, and a date to remake it. Etyme ' +
      'takes neither position itself: it is neither the employer nor their lawyer, and a ' +
      'determination about employment status is the duty of whoever carries the liability ' +
      'for getting it wrong.',
    about: 'Candidates',
    provenBy: 'ClassificationCall in prisma/schema.prisma; src/lib/worker-classification.ts',
  },
  {
    category: 'Money about a person',
    examples:
      'Pay rates and bill rates on contracts, timesheets and the hours accepted, ' +
      'expenses, bill lines and payments.',
    about: 'Candidates',
    provenBy: 'SellContract, BuyContractCandidate, Timesheet, Expense, InvoiceLine, Payment',
  },
  {
    category: 'Time on site',
    examples:
      'Days a person has worked at a client, added up across every supplier, counted ' +
      'once per day however many firms billed it, and only days actually served.',
    about: 'Candidates',
    provenBy: 'src/lib/tenure-days.ts',
  },
  {
    category: 'A seat at a company, and what was decided from it',
    examples:
      'The seat itself — which company granted it, the role and the permissions on it, ' +
      'the org unit it sits in, why it was granted, when it was last used and whether it ' +
      'is suspended or ended — and every act taken from it: a job request raised, an ' +
      'approval given or refused with the reason in words, somebody else’s week of hours ' +
      'signed off, an overtime call, a position taken on how a worker is engaged, a ' +
      'supplier decided by a role, a payment run approved, a legal hold placed, an ' +
      'incident opened. An agreement carries the signer’s own name, title and email as they ' +
      'appear on the paper. An order names the company that raised it and not a person, ' +
      'so nothing here claims one.',
    about: 'Business users',
    provenBy:
      'Context, Role, OrgUnit, Requirement.raisedById, RequirementApproval, ' +
      'Timesheet.clientApprovedById and Timesheet.employerAcceptedById, OvertimeDecision, ' +
      'ClassificationCall, SupplierRequest, PaymentRun, LegalHold, Breach, ' +
      'AgreementSignature in prisma/schema.prisma',
  },
  {
    category: 'Bars and preferences',
    examples:
      'A bar on a named person or firm with a reason, held by the company that set it; ' +
      'and a star on a person or firm a company would take again. Neither is read ' +
      'across companies.',
    about: 'Everybody',
    provenBy: 'Blacklist, DoNotSubmit, Favorite in prisma/schema.prisma',
  },
  {
    category: 'A contractor census',
    examples:
      'What a client sent us before they were a customer, so we could give them one page ' +
      'of numbers about their own contingent workforce: the company name, the contact name ' +
      'and work address typed on a page with no login behind it, the team they work in, who ' +
      'accepted the one-page census agreement and which edition, and the files themselves — ' +
      'a filled template or their own invoice receipts and timesheets. The files are ' +
      'deleted on a day fixed when they arrived; the row saying how many there were and ' +
      'when they went outlives them, because it is the proof we did it on the day we said.',
    about: 'Business users',
    provenBy: 'CensusRequest, CensusFile in prisma/schema.prisma, src/lib/census.ts',
  },
  {
    category: 'Company and supplier records',
    examples:
      'Legal name, addresses, tax registration, org units, cost centers, roles, ' +
      'contacts, agreements, orders, bills and invoices, and a supplier’s own application — its ' +
      'legal name, address, D-U-N-S number, website, experience and named references ' +
      'with their contact details.',
    about: 'Companies',
    provenBy: 'Company, LegalEntity, OrgUnit, CostCenter, CompanyContact, SupplierRequest',
  },
  {
    category: 'Payment details',
    examples:
      'A bank name, the name on the account and the last four digits. Full account and ' +
      'routing numbers are never asked for and never stored — the supplier apply form ' +
      'takes four digits and says so on the page, and the remit-to record holds last ' +
      'four only, for display.',
    about: 'Companies',
    provenBy:
      'src/app/api/supplier-apply/[token]/route.ts, src/app/apply/[token]/page.tsx, RemitTo in prisma/schema.prisma',
  },
  {
    category: 'Messages',
    examples:
      'Conversations on a deal between two companies, the messages in them, ' +
      'notifications and their delivery, and emails the system sent.',
    about: 'Everybody',
    provenBy: 'Conversation, Message, Notification in prisma/schema.prisma',
  },
  {
    category: 'Logs',
    examples:
      'Every read of another person’s record on the routes that read one — who read it, ' +
      'from which company, what they were doing and whether they were allowed, ' +
      'refusals included. Alongside those: what the system did unprompted and why, ' +
      'scheduled job runs, and errors.',
    about: 'Everybody',
    provenBy: 'AccessLog, AutomationLog, JobRun, Incident in prisma/schema.prisma',
  },
]

/**
 * Named because a reader will find them in `.env.example` and reasonably
 * ask. Nothing in `src/` reads either, and no data reaches either.
 */
export const NOT_USED = [
  'S3, or any other object storage. `.env.example` still carries S3 keys from an ' +
    'earlier plan; nothing in the application reads them. Uploaded resume bytes are ' +
    'held in the database, and other documents are recorded by file name and a link ' +
    'supplied by whoever uploaded them.',
  'DocuSign, or any e-signature provider. `.env.example` carries its keys; nothing ' +
    'reads them. A document is signed here by attestation from the person’s own page, ' +
    'recorded with who attested and when.',
  'Any SMS provider. Text messages are composed and stored; nothing sends one.',
  'Any analytics, advertising or session-replay service. There is no such dependency ' +
    'in the application.',
] as const

// ── The documents themselves ──────────────────────────────────────────

export interface Section {
  heading: string
  paragraphs: string[]
  bullets?: string[]
  /** Where in the code this section came from. Rendered small, on purpose. */
  provenBy?: string
  /** A counsel question this section is waiting on. */
  open?: string
}

// ── The census agreement: the one page a census client's legal reads ──

/**
 * The census agreement.
 *
 * Not a contract and not an addendum: one page, six headings, read by a
 * procurement lead or a lawyer in the two minutes before they say yes to
 * a company they had not heard of last week. `docs/census-brief.md`:
 * "Legal reads one page, not a contract."
 *
 * It is the fourth document beside the terms, the privacy notice and the
 * DPA, and it is the only one anybody **accepts by name** — the other
 * three are read. `CensusRequest.agreementAcceptedBy`, `-At` and
 * `-Version` hold that acceptance, and `lib/census`'s
 * `AGREEMENT_VERSION` is the edition written into the row, because which
 * edition somebody accepted is the finding in an audit.
 *
 * Every sentence below is true of the code today or it does not belong
 * here. The three that matter most — the day we delete it, that we never
 * approach their suppliers or their contractors, and that a named person
 * reads it — are each held by a test, because a promise in prose that
 * nothing checks is the one that quietly stops being true.
 */
export const CENSUS_AGREEMENT: { title: string; intro: string; sections: Section[] } = {
  title: 'Census agreement',
  intro:
    'You are about to send us data about your own contingent workforce so that we can ' +
    'give you one page of numbers back. This is the whole of what we undertake about ' +
    'that data. It is one page on purpose: six things get asked before a file moves, and ' +
    'they are the six headings below. ' +
    `This is the ${AGREEMENT_VERSION} edition. ` +
    AGREEMENT_CHANGES.filter((c) => c.edition === AGREEMENT_VERSION)
      .map((c) => `Since the ${c.previous} edition: ${c.says}`)
      .join(' '),
  sections: [
    {
      heading: 'What we receive',
      paragraphs: [
        'Whatever you choose to send, and nothing we go and get. There are two ways to ' +
          'send it and the lighter one is the default: a filled template with one row per ' +
          'contractor — supplier, role, site, start date, end date, rate, hours a week — or ' +
          'your own invoice receipts and timesheets where you have nothing tidier.',
        'The template asks for no names. A reference number of your own is enough, and a ' +
          'census sent that way holds no personal data at all beyond the work address of ' +
          'whoever asked for it. That is the point of offering it first.',
        'We accept a CSV, a PDF, an Excel file or a Word file, up to five megabytes each ' +
          'and fifty megabytes for the census. Nothing else is taken, because a file ' +
          'nobody here can open is a file we would have to ask you for again.',
      ],
      provenBy: 'src/lib/census.ts, src/app/api/census/upload/route.ts',
    },
    {
      heading: 'Who at Etyme can see it',
      paragraphs: [
        'One named person. You are told who runs your census when you ask for it, and ' +
          'only that person can open your files — not our staff generally, and nobody at ' +
          'any other company on this platform, ever.',
        'Every time one of your files is opened it is counted on the file and recorded ' +
          'against the person who opened it, with the day and the hour. A refusal is ' +
          'recorded the same way, because a refusal is the interesting one. You can ask ' +
          'for that record at any time and we will send it.',
        'Nothing computes your census before a person has read your file. There is no ' +
          'self-serve path through this and no model is asked to decide anything about ' +
          'your workforce.',
      ],
      provenBy: 'src/app/api/census/review/route.ts, src/lib/access-log.ts',
    },
    {
      heading: 'Where it sits',
      paragraphs: [
        'In our own database, in the United States, inside the same system every other ' +
          'record in this product lives in. The files are held as bytes in the database ' +
          'rather than in a bucket somewhere else — which is also what makes the deletion ' +
          'below honest, because deleting the row deletes the data and there is no object ' +
          'left behind for somebody to sweep later.',
        'Your rows are loaded into a private company of your own, created for this census ' +
          'and used for nothing else. It is not shared, not pooled, and no number from it ' +
          'appears in anything we publish or show another client. We run no benchmark ' +
          'across clients and none is planned.',
        'The services this product depends on are listed in full in the data processing ' +
          'addendum, with what reaches each one. Nothing new is introduced for a census.',
      ],
      provenBy: 'prisma/schema.prisma, src/lib/census.ts',
    },
    {
      heading: 'We never approach your suppliers or your contractors',
      paragraphs: [
        'Your census names your suppliers and it may name people working for you. We do ' +
          'not write to any of them, do not invite them to this platform on the strength ' +
          'of it, and do not use what you sent to sell anything to anybody. Etyme runs no ' +
          'bench and places nobody, so we are not a competitor of your suppliers and have ' +
          'nothing to gain by going near them.',
        'Asking for a census does not add you to a list either. There is no sequence and no ' +
          'campaign: nothing is ever sent to you because time passed.',
        'We write to you at five moments and no others, and every one of them answers ' +
          'something that has just happened. You ask, and we confirm it and name the person ' +
          'running it. Somebody at your company accepts the agreement, and we send the link ' +
          'to upload through. Your files arrive, and we confirm what came and the day it ' +
          'goes. Your page is ready, and we send it. Your data is deleted, and we say so on ' +
          'the day. After the page, the person running your census writes to you by hand or ' +
          'nobody writes at all.',
      ],
      provenBy: 'src/lib/notify/census.ts, src/app/api/census/request/route.ts, src/lib/data-request.ts',
    },
    {
      heading: 'The day we delete it',
      paragraphs: [
        'Forty-five days after your files arrive. You are given that exact date when we ' +
          'confirm receipt, it is printed on the page we send you, and it is the same date ' +
          'the nightly job reads — there is one date, in one place, so the three cannot ' +
          'disagree.',
        'It does not move. It is not recalculated when we send your page and it is not ' +
          'extended because somebody is busy. Forty-five days covers the five working days ' +
          'we take to produce your page and thirty days with it in your hands, which is ' +
          'what we said we would give you.',
        'On that day the files themselves go, the rows loaded from them go, and the ' +
          'private company they sat in goes. What is left is one row saying how many files ' +
          'there were, how many bytes, and the day they were deleted — kept deliberately, ' +
          'because it is the proof that we did it when we said we would. Nothing puts the ' +
          'data back.',
      ],
      provenBy: 'src/lib/census.ts, src/lib/data-request.ts, src/lib/retention.ts',
    },
    {
      heading: 'What happens if you start a program',
      paragraphs: [
        'If you decide to run contingent workforce on Etyme, the deletion is cancelled and ' +
          'your data stays — it becomes the opening balance of your own program rather ' +
          'than something we throw away and ask you to send again. The cancellation is ' +
          'recorded with a reason and the date it was called off, and it is the only thing ' +
          'that changes the date above.',
        'If you do not, the date stands, and you do not have to do anything or ask anybody ' +
          'for it to happen.',
        'There is no price on a census and none on anything else yet. Etyme is free while ' +
          'it is being tested and no price has been set, so nothing here is conditional on ' +
          'your buying anything.',
      ],
      provenBy: 'src/lib/census.ts, src/app/api/census/review/route.ts',
    },
  ],
}

// ── How the census agreement page is read ─────────────────────────────

/**
 * The census agreement is the one document still drawn from objects
 * here, by `app/legal/census-document`. The Privacy Notice, the Terms
 * and the DPA left this file on 2026-10-15 for `lib/legal/`, where they
 * are held as the text the founder approved.
 */

/**
 * A section's address on its page, computed from the heading so a
 * heading that changes takes its anchor with it.
 */
export function sectionId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The six things asked before a census file moves, answered at the top
 * of the agreement, each linking to the section that answers it in full.
 */
export interface SummaryLine {
  /** The question, as a procurement lead would put it. */
  ask: string
  /** The answer in one or two sentences, true of the code. */
  answer: string
  /** The section that answers it in full. */
  href: string
}


export const CENSUS_SUMMARY: SummaryLine[] = [
  {
    ask: 'What you receive',
    answer:
      'Whatever you send and nothing we go and get: a filled template with one row per ' +
      'contractor, or your own invoice receipts and timesheets. The template asks for no ' +
      'names, and a census sent that way holds no personal data at all.',
    href: '#what-we-receive',
  },
  {
    ask: 'Who can see it',
    answer:
      'One named person at Etyme, told to you when you ask. Every open of one of your ' +
      'files is counted and recorded against them, refusals included, and nobody at any ' +
      'other company ever sees it.',
    href: '#who-at-etyme-can-see-it',
  },
  {
    ask: 'Where it sits',
    answer:
      'In our own database in the United States, as bytes rather than in a bucket ' +
      'somewhere else, inside a private company created for your census and used for ' +
      'nothing else. No number from it goes into a benchmark.',
    href: '#where-it-sits',
  },
  {
    ask: 'Whether you approach our suppliers',
    answer:
      'We do not write to your suppliers or your contractors, do not invite them here on ' +
      'the strength of your file, and sell nothing to anybody from it. Etyme runs no bench ' +
      'and places nobody, so there is nothing to be gained by going near them.',
    href: '#we-never-approach-your-suppliers-or-your-contractors',
  },
  {
    ask: 'The day you delete it',
    answer:
      'Forty-five days after your files arrive. You are given the exact date on the ' +
      'confirmation, it is printed on the page we send you, and the nightly job reads the ' +
      'same date. It does not move.',
    href: '#the-day-we-delete-it',
  },
  {
    ask: 'If we start a program',
    answer:
      'The deletion is cancelled with a reason recorded and your data becomes the opening ' +
      'balance of your own program. That is the only thing that changes the date, and if ' +
      'you do nothing the date stands.',
    href: '#what-happens-if-you-start-a-program',
  },
]

/**
 * The words these documents use, defined once and not again.
 *
 * Every one of them is a restatement of something stated in full
 * further down; none introduces a fact of its own. A definition that
 * says something the body does not is how a summary becomes a second,
 * looser document.
 */
export interface Definition {
  term: string
  meaning: string
}

export const DEFINITIONS: Definition[] = [
  {
    term: 'Business user',
    meaning:
      'Somebody with a seat at a company, signed in through their employer’s identity ' +
      'provider or by an emailed link. The seat belongs to the company that granted it.',
  },
  {
    term: 'Candidate, or consultant',
    meaning:
      'An individual with their own account and their own email address. The account ' +
      'belongs to the person, not to whichever supplier signed them up, and it travels ' +
      'with them.',
  },
  {
    term: 'Sub-processor',
    meaning:
      'A service outside Etyme that personal data reaches. A service is on the list ' +
      'because a file in this repository calls it, not because it might one day.',
  },
  {
    term: 'Attestation',
    meaning:
      'A record that a check happened — who ran it, when, its reference and when it ' +
      'expires. Etyme runs no check itself and states no verdict about a person from one.',
  },
  {
    term: 'Time on site, or tenure',
    meaning:
      'The days a person worked at a client, added up across every supplier that ever ' +
      'supplied them, counted once per day however many firms billed it.',
  },
]

/** Where a reader goes from the bottom of each page. */
export interface CrossLink {
  href: string
  label: string
  note: string
}

export const CENSUS_LINKS: CrossLink[] = [
  {
    href: '#the-day-we-delete-it',
    label: 'The day we delete it',
    note:
      'Forty-five days after your files arrive, on one date read by the confirmation, the ' +
      'page and the nightly job alike. The clause a security review reads first.',
  },
  {
    href: '/privacy',
    label: 'Privacy notice',
    note:
      'Everything else this product holds, about whom, for how long, and what a person ' +
      'may ask for. A census is one category in it, named there too.',
  },
  {
    href: '/dpa',
    label: 'Data processing addendum',
    note:
      'The sub-processor list and the breach clock, for the part of your review that is ' +
      'about us rather than about this file. Nothing new is introduced for a census.',
  },
]
