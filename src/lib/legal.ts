/**
 * Terms, privacy and the DPA — as data, so every sentence can be checked.
 *
 * ── Why this is a module and not three pages of prose ─────────────────
 *
 * A privacy notice that misdescribes what a system holds is worse than no
 * notice at all. It is a written misrepresentation, it is the first thing
 * a client's security review reads, and it is the easiest thing in the
 * product to falsify — a paragraph written in March is wrong in April and
 * nothing fails.
 *
 * So the substance lives here, as structures a test can walk, and the
 * pages only render it. `__tests__/invariants/legal-pages.test.ts` reads
 * these values back against the code they describe: the sub-processor
 * list against the modules that actually call out, the bank fields
 * against the apply route, the retention claim against the absence of any
 * deletion path.
 *
 * ── These are drafts for counsel ─────────────────────────────────────
 *
 * Nobody who wrote this is a lawyer. Everything here is an honest
 * description of what the code does, in the shape a lawyer expects to
 * find it, so counsel edits rather than starts from nothing. Every place
 * where a legal question is open is in COUNSEL_QUESTIONS and says so on
 * the page rather than being decided quietly in a sentence.
 *
 * Owned by etyme-regulatory (`lib/legal` in `lib/domains.ts`).
 */

// ── The banner every page carries ─────────────────────────────────────

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
      'A client company writes requisitions, approvals, timesheet decisions and tenure ' +
      'reads about workers it did not employ, and Etyme holds them on the client behalf. ' +
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
      'Does sending a candidate name, skills, work authorization class and the full ' +
      'text of their resume to a third-party model require a specific disclosure, a ' +
      'separate legal basis, or an opt-out — and does any of it amount to automated ' +
      'decision-making with legal or similarly significant effect?',
    whatTheCodeDoes:
      'Match scoring sends a candidate name, skills, headline, location, work ' +
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
      'Through their employer identity provider — Microsoft Entra or Google Workspace ' +
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
    category: 'A consultant own profile',
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
      'expenses, invoice lines and payments.',
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
    category: 'Bars and preferences',
    examples:
      'A bar on a named person or firm with a reason, held by the company that set it; ' +
      'and a star on a person or firm a company would take again. Neither is read ' +
      'across companies.',
    about: 'Everybody',
    provenBy: 'Blacklist, DoNotSubmit, Favorite in prisma/schema.prisma',
  },
  {
    category: 'Company and supplier records',
    examples:
      'Legal name, addresses, tax registration, org units, cost centers, roles, ' +
      'contacts, agreements, orders, invoices, and a supplier own application — its ' +
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
      'Every read of another person record on the routes that read one — who read it, ' +
      'from which company, what they were doing and whether they were allowed, ' +
      'refusals included. Alongside those: what the system did unprompted and why, ' +
      'scheduled job runs, and errors.',
    about: 'Everybody',
    provenBy: 'AccessLog, AutomationLog, JobRun, Incident in prisma/schema.prisma',
  },
]

// ── Who else touches it ───────────────────────────────────────────────

export interface SubProcessor {
  name: string
  purpose: string
  /** What personal data actually reaches them. */
  reaches: string
  /** The environment variable or dependency that proves it. */
  provenBy: string
  /** Whether it is on in every deployment, or only when configured. */
  always: boolean
}

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'The managed Postgres host',
    purpose: 'Every record in the product, including uploaded resume bytes.',
    reaches:
      'All of it — every record described in this notice, including the bytes of an ' +
      'uploaded resume.',
    provenBy: 'DATABASE_URL',
    always: true,
  },
  {
    name: 'Vercel',
    purpose: 'Hosting and the scheduler that runs the daily jobs.',
    reaches:
      'Everything in a request and a response passes through it, plus the usual ' +
      'platform request logs.',
    provenBy: 'VERCEL_URL, and the deployment target named in docs/deploying.md',
    always: true,
  },
  {
    name: 'Anthropic',
    purpose:
      'Matching a candidate to a role, checking a resume against the skills claimed ' +
      'for it, reading an imported file into records, and writing a company or ' +
      'consultant public page.',
    reaches:
      'For matching: a candidate name, skills, headline, location, work authorization ' +
      'class, rate floor and availability date, in batches. For the evidence check: the ' +
      'extracted text of a resume and the skills claimed for it. For an import: up to ' +
      'sixty thousand characters of whatever file or paste is being loaded. For a ' +
      'public page: the words that page will carry.',
    provenBy:
      'ANTHROPIC_API_KEY, MATCH_MODEL, CHECK_MODEL; src/lib/match-engine.ts, ' +
      'src/app/api/submissions/[id]/check/route.ts, ' +
      'src/app/api/requirements/[id]/screen/route.ts, src/lib/extract.ts, ' +
      'src/lib/consultant-portfolio.ts, src/lib/site-voice.ts',
    always: false,
  },
  {
    name: 'Resend, or SendGrid',
    purpose: 'Sending email — sign-in links, notices, invitations and alerts.',
    reaches: 'A name, an email address and the body of the message.',
    provenBy: 'RESEND_API_KEY or SENDGRID_API_KEY; src/lib/senders.ts',
    always: false,
  },
  {
    name: 'Microsoft Entra, and Google',
    purpose:
      'Sign-in only, where a company has connected one. They authenticate; they ' +
      'receive no workforce data back.',
    reaches:
      'The sign-in exchange itself — an email address and the identity provider own ' +
      'subject claim.',
    provenBy:
      'AZURE_AD_CLIENT_ID, GOOGLE_CLIENT_ID; src/lib/auth.ts, which registers a ' +
      'provider only when its credentials are present',
    always: false,
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
    'reads them. A document is signed here by attestation from the person own page, ' +
    'recorded with who attested and when.',
  'Any SMS provider. Text messages are composed and stored; nothing sends one.',
  'Any analytics, advertising or session-replay service. There is no such dependency ' +
    'in the application.',
] as const

// ── What happens to it over time ──────────────────────────────────────

export const RETENTION = {
  /** The honest headline, and it is a schedule with blanks in it. */
  headline:
    'There is a retention schedule, one line per category above, and where no legal ' +
    'minimum can be cited the line says so instead of naming a period.',
  paragraphs: [
    'The schedule is code rather than a setting, because a client who sets a retention ' +
      'period wrong deletes something that is gone. A company that needs records kept ' +
      'longer places a legal hold, which carries a reason and a name and a review date.',
    'Every period stated is a United States federal minimum with its rule cited. ' +
      'Employment tax records run four years from the later of the tax being due and ' +
      'being paid; payroll records three years; an I-9 three years after the date of hire ' +
      'or one year after the employment ends, whichever is later; personnel records made ' +
      'in the course of hiring one year, two for a federal contractor. State law is ' +
      'longer in places and the schedule says so where it is. Which applies to whom is ' +
      'still counsel.',
    'Where no federal minimum can be cited, no period is stated and nothing is deleted ' +
      'on one. A visa petition file is the clearest case: what can be cited covers the ' +
      'public access file and not the petition, so the line returns nothing and says why. ' +
      'A retention period invented by an engineer deletes a record that does not come back.',
    'Ending somebody access revokes their seat and deletes no record. That is ' +
      'deliberate: a person who worked somewhere worked there, and an audit long ' +
      'afterward has to be able to find them. Suspension is the reversible form, for a ' +
      'leave of absence or a lapsed visa, and keeps their history attached to them.',
    'A resume a candidate removes is hidden from their own list. A company it was ' +
      'already sent to can still open its copy, because it is in that company records ' +
      'and Etyme cannot unsend it.',
    'Demo workspaces nobody returns to are cleared automatically after a fixed number ' +
      'of days.',
    'Erasure is anonymization and never a row delete. A person who asks to be forgotten ' +
      'keeps every row a counterparty book depends on — the signed hours, the amounts, ' +
      'the days on a client site — and loses the name on them: the address becomes one ' +
      'on a reserved domain that cannot be registered or routed to, and the name becomes ' +
      '"Erased person". Sign-in records, the consultant profile, resumes never sent, and ' +
      'bars and stars set against the name are deleted outright.',
    'A statutory minimum beats an erasure request, and the request says which and why ' +
      'in the person own words rather than being refused.',
  ],
  provenBy:
    'src/lib/retention.ts, src/lib/erasure.ts, src/lib/data-request.ts, ' +
    'src/lib/legal-hold.ts, src/lib/account-lifecycle.ts, ' +
    'Person.erasedAt and Resume.deletedAt in prisma/schema.prisma, ' +
    'src/app/api/cron/reap-demos/route.ts, ' +
    '__tests__/invariants/retention.test.ts, __tests__/invariants/erasure.test.ts',
} as const

// ── The walls, stated where a data subject cares ──────────────────────

export const WALLS = {
  paragraphs: [
    'A company sees its own data. Records are filtered by the company asking for them ' +
      'in the database query, not hidden on the screen, so a record another company ' +
      'owns does not arrive and then get styled away.',
    'Inside a firm there is a second wall. A person attached to an org unit sees that ' +
      'unit and what sits under it; a person attached to none is firm-wide, and that ' +
      'absence is a deliberate act by whoever set up their seat. A delivery manager on ' +
      'one client account has no reason to see who is staffed at another, at what rate.',
    'A conversation about a deal stays between the two companies on it. A firm not on ' +
      'the deal is told there is nothing there rather than that it is not allowed.',
    'Notes a client makes about an interview stay with the client. They are not shown ' +
      'to the supplier or to the candidate.',
    'Rate bands live on the invitation sent to one supplier, never on the requirement ' +
      'where another supplier could read them.',
  ],
  provenBy: 'src/lib/walls.ts, src/lib/account-walls.ts, src/lib/seat.ts, src/lib/threads.ts',
} as const

export const ACCESS_LOGGING = {
  paragraphs: [
    'Reads of a person record are logged. The row names the person read, who read it, ' +
      'which company they were sitting at, what they were doing, whether they were ' +
      'allowed and, where they were not, why. A refusal is logged as carefully as a ' +
      'read, because a refusal is the interesting one.',
    'This covers the routes that read a named person: a profile, a consultant record, ' +
      'a resume file, a placement, a submission, a shared document packet, a bench or ' +
      'alumni list, match results, a compliance record, a classification position, a ' +
      'program roster and the tenure ledger. It is not every route in the product, and ' +
      'this document does not claim it is.',
  ],
  provenBy:
    'src/lib/access-log.ts and the nineteen route files that call logAccess or ' +
    'logBulkAccess',
} as const

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

export const TERMS: { title: string; intro: string; sections: Section[] } = {
  title: 'Terms of service',
  intro:
    'These terms cover the use of Etyme by a company and by the people who sign in on ' +
    'its behalf. They are a working draft written from the behavior of the software, ' +
    'for a lawyer to turn into a binding agreement.',
  sections: [
    {
      heading: 'What Etyme is',
      paragraphs: [
        'Etyme is the system of record for contingent workers: the layer between a ' +
          'company and every staffing supplier it uses. It spans the requisition, the ' +
          'suppliers who see it, submissions, screening, interviews, onboarding, ' +
          'timesheets, invoices and compliance.',
        'Etyme is not a staffing agency. It runs no bench, employs no consultant and ' +
          'places nobody. Every placement ends with a supplier holding the paper and ' +
          'carrying the employment relationship. Neutrality is not a policy here, it is ' +
          'a constraint on the product: the moment Etyme competed with its own ' +
          'suppliers the network would stop growing.',
        'Etyme does not decide whether a person may work. It records that a check ' +
          'happened — who ran it, when, and when it expires — and refuses to convert ' +
          'those records into a single verdict about a person. The duty to decide stays ' +
          'with whoever is legally accountable for it.',
        'The same holds for employment status. Etyme does not decide whether somebody is ' +
          'an employee or an independent contractor, and it does not decide whether an ' +
          'employee is exempt from overtime. It records what a company asserted, with the ' +
          'reason where the assertion departs from what the facts on file indicate. Where ' +
          'arithmetic alone settles part of the question — a pay rate below the floor every ' +
          'overtime exemption requires — it says so, and it still never concludes that ' +
          'anybody is exempt, because that turns on what the person actually does and only ' +
          'their employer knows it.',
      ],
      provenBy:
        'src/lib/attestation.ts, where the function that would return a single verdict throws ' +
        'instead; src/lib/worker-classification.ts, where the exemption screen has no verdict ' +
        'that means exempt',
    },
    {
      heading: 'Accounts and seats',
      paragraphs: [
        'A business user signs in through their employer identity provider, or by an ' +
          'emailed link. A seat belongs to the company that granted it: an owner or ' +
          'administrator there can suspend it or end it at any time.',
        'A consultant account belongs to the person, not to whichever supplier signed ' +
          'them up. It travels with them.',
        'Whoever holds an account is responsible for what is done from it. Sessions ' +
          'last thirty days unless ended sooner.',
      ],
      provenBy: 'src/lib/auth.ts, src/lib/account-lifecycle.ts',
    },
    {
      heading: 'What a customer may and may not do with the platform',
      paragraphs: [
        'A customer may use Etyme to run its own contingent workforce and its own ' +
          'supplier relationships. A customer may not use it to reach data belonging to ' +
          'another company, to work around the walls described in the privacy notice, ' +
          'or to load personal data it has no right to load.',
        'A customer uploading somebody personal data warrants that it is entitled to ' +
          'do so and that the person has been told what they must be told. That ' +
          'matters most for resumes and onboarding documents, which arrive here from ' +
          'recruiters far more often than from the person themselves.',
      ],
    },
    {
      heading: 'What the software does on its own',
      paragraphs: [
        'Some things happen without anybody asking: a contract whose last day has ' +
          'passed is ended, an invitation nobody answered expires, a requisition inside ' +
          'policy clears itself, a timesheet inside tolerance is approved, a visa ' +
          'nearing its expiry raises a flag. Each of them writes a row saying what was ' +
          'done, in plain English, with an honest flag for whether it can be undone.',
        'Every one of those is available for a customer to read. Almost all of them are ' +
          'a date comparison, a threshold or a count rather than a model, and the ' +
          'product says which.',
      ],
      provenBy: 'src/lib/autonomy.ts, AutomationLog in prisma/schema.prisma',
    },
    {
      heading: 'Where a model is used',
      paragraphs: [
        'A model helps with matching a candidate to a role, checking a resume against ' +
          'the skills claimed for it, reading an imported file into records, and ' +
          'drafting the words on a public page. A score always carries its factors, its ' +
          'basis, a confidence and what it could not assess; a bare number is treated as ' +
          'a defect.',
        'No award, rejection or bar in this product is made by a model. Where no model ' +
          'is configured, matching falls back to arithmetic and says so on the row, and ' +
          'the resume evidence check does not run at all rather than pretending to have ' +
          'run.',
      ],
      provenBy: 'src/lib/match-engine.ts, src/app/api/submissions/[id]/check/route.ts',
    },
    {
      heading: 'Availability, support and change',
      paragraphs: [
        'No uptime commitment is made in this draft. What exists today: errors are ' +
          'recorded and staff are emailed, and a daily heartbeat is sent whether or not ' +
          'anything broke, so silence is not mistaken for health.',
        'A service level, a support commitment and a notice period for material changes ' +
          'are all open for counsel and for whoever signs the first contract.',
      ],
      provenBy: 'src/lib/alerts.ts, src/app/api/cron/daily/route.ts',
      open: 'liability-and-law',
    },
    {
      heading: 'Fees',
      paragraphs: [
        'Etyme is free while it is being tested. No price is stated here, in any ' +
          'material, or in any conversation, because none has been set. Firms using it ' +
          'now will be given terms in writing before any price exists.',
      ],
    },
    {
      heading: 'Liability, indemnity, governing law and termination',
      paragraphs: [
        'Left open. These are the clauses that are entirely a lawyer work, and a ' +
          'number written into a liability cap by an engineer would be worse than a ' +
          'blank.',
      ],
      open: 'liability-and-law',
    },
  ],
}

export const PRIVACY: { title: string; intro: string; sections: Section[] } = {
  title: 'Privacy notice',
  intro:
    'What Etyme holds, where it goes, who can see it and what is not true of it yet. ' +
    'Written from the data model and the code paths rather than from a template, so ' +
    'that a security reviewer can check any sentence here against the file named ' +
    'beside it.',
  sections: [
    {
      heading: 'Two populations, two relationships',
      paragraphs: [
        'Etyme has two kinds of user and they are not one audience. Treating them as ' +
          'one is how a notice ends up untrue of both.',
      ],
      bullets: POPULATIONS.map(
        (p) => `${p.name}. ${p.signIn} ${p.channel} ${p.held} ${p.control}`
      ),
      provenBy: 'src/lib/auth.ts, ConsultantProfile and Context in prisma/schema.prisma',
      open: 'controller-or-processor',
    },
    {
      heading: 'What is held',
      paragraphs: [
        'By category, with the model or file that proves each one. Not every field of ' +
          'every record is listed; every category of personal data is.',
      ],
      bullets: HELD.map((h) => `${h.category} — ${h.examples} (${h.provenBy})`),
    },
    {
      heading: 'Bank details',
      paragraphs: [
        'Etyme does not ask for or store a full bank account number or routing number.',
        'The supplier application form asks a firm for its bank name, the name on the ' +
          'account and the last four digits, and says on the page that only those are ' +
          'kept here and that full details go on the payment form the client sends once ' +
          'the firm is approved. The remit-to record carries the same three, marked in ' +
          'the schema as display only.',
        'No card data is held anywhere in the product.',
      ],
      provenBy:
        'src/app/api/supplier-apply/[token]/route.ts, src/app/apply/[token]/page.tsx, RemitTo in prisma/schema.prisma',
    },
    {
      heading: 'Where a model sees personal data',
      paragraphs: [
        'This is stated first and plainly because it is the disclosure most easily ' +
          'buried. Personal data does reach a third-party model, and here is exactly ' +
          'which.',
        'Matching sends a candidate name, skills, headline, location, work ' +
          'authorization class, rate floor and availability date, together with the ' +
          'role being matched against. The evidence check — run by a supplier on its ' +
          'own submission, and again by the client screening it — sends the extracted ' +
          'text of the resume with the skills claimed for it. An import sends up to ' +
          'sixty thousand characters of the file being loaded, whatever it contains. A ' +
          'public page draft sends the words that page will carry.',
        'None of it is automatic in the sense of being unavoidable. Where no model key ' +
          'is configured on the deployment, matching scores with rules and records on ' +
          'the row that it did so, and the resume evidence check returns nothing rather ' +
          'than a guess. The product refuses to claim a model did work it did not do.',
        'No model output awards, rejects or bars anybody by itself.',
      ],
      provenBy:
        'src/lib/match-engine.ts, src/app/api/submissions/[id]/check/route.ts, ' +
        'src/app/api/requirements/[id]/screen/route.ts, src/lib/extract.ts, src/lib/autonomy.ts',
      open: 'model-disclosure',
    },
    {
      heading: 'Who else touches it',
      paragraphs: [
        'Every service the code actually calls, and what reaches it. A service is on ' +
          'this list because a file calls it, not because it might one day.',
      ],
      bullets: SUB_PROCESSORS.map(
        (s) =>
          `${s.name}${s.always ? '' : ' (only where configured)'} — ${s.purpose} ` +
          `What reaches it: ${s.reaches} (${s.provenBy})`
      ),
      open: 'sub-processor-contracts',
    },
    {
      heading: 'What is not used, despite appearances',
      paragraphs: [
        'A reader checking the configuration will find keys for services nothing calls. ' +
          'Named here so the list above can be trusted.',
      ],
      bullets: [...NOT_USED],
    },
    {
      heading: 'Who inside the platform can see a record',
      paragraphs: [...WALLS.paragraphs],
      provenBy: WALLS.provenBy,
    },
    {
      heading: 'Reads are logged, refusals included',
      paragraphs: [...ACCESS_LOGGING.paragraphs],
      provenBy: ACCESS_LOGGING.provenBy,
    },
    {
      heading: 'Time on site, added up across suppliers',
      paragraphs: [
        'A client can see how many days a person has worked on its sites in total, ' +
          'across every supplier that has ever supplied them — not only the supplier ' +
          'that employs them now. Two contracts covering the same week count as one ' +
          'week; time booked for next spring is not counted until it is served.',
        'This exists because time on site is a legal exposure for the client under ' +
          'co-employment and tenure rules, and it is a number no single supplier can ' +
          'compute. It is said here plainly because it is the thing about Etyme a ' +
          'worker is least likely to expect.',
        'Every read of it writes a log row naming the reader, their company and the ' +
          'reason.',
      ],
      provenBy: 'src/lib/tenure-days.ts, src/app/api/tenure/route.ts',
      open: 'tenure-visibility',
    },
    {
      heading: 'A consultant permission is per supplier, and theirs to move',
      paragraphs: [
        'No supplier may submit a consultant to a role without a bench listing the ' +
          'consultant granted. The database requires it, not the screen.',
        'A listing is granted or declined by the consultant, one per supplier. It can ' +
          'be revoked. Separately, a consultant can require a supplier to ask before ' +
          'each new client, and can refuse to be shown before their current contract ' +
          'ends without withdrawing the listing. A reason for declining is theirs and ' +
          'is never shown to another supplier.',
        'A profile is internal by default. A public page exists only from the moment ' +
          'they turn it on, and an address they used before keeps working rather than ' +
          'being reissued to somebody else.',
      ],
      provenBy: 'BenchListing and ConsultantProfile in prisma/schema.prisma, src/lib/bench-consent.ts',
      open: 'lawful-basis',
    },
    {
      heading: 'How long it is kept',
      paragraphs: [RETENTION.headline, ...RETENTION.paragraphs],
      provenBy: RETENTION.provenBy,
      open: 'retention',
    },
    {
      heading: 'Rights, and how they are honored today',
      paragraphs: [
        'A consultant can see and change their own profile, resumes, availability and ' +
          'rate floor, answer or withdraw a bench listing, answer an interview, and read ' +
          'their own paperwork, from their own pages in the product.',
        'Anybody signed in can ask for everything held about them, or ask to be ' +
          'forgotten, from their own page. Neither needs anybody permission and neither ' +
          'goes through a company. The copy is produced on the spot, in the categories ' +
          'this notice names, and every time it is opened a line is written saying who ' +
          'opened it — including us.',
        'A request to be forgotten waits fourteen days, so it can be stopped, and the ' +
          'letter sent at the time of asking says exactly what goes and what stays. What ' +
          'stays is said before the day rather than after it: payroll and tax records ' +
          'with whoever paid you, the I-9 with whoever took it, the days on site with the ' +
          'client whose site it was. Those are their obligations and are not Etyme to ' +
          'waive.',
        'Where a company has placed a legal hold naming somebody, an erasure is held ' +
          'rather than refused, the person is told that a hold applies and in whose ' +
          'words, and it runs by itself the day the last hold is lifted. The holder own ' +
          'case reference is never shown to the person.',
        'A request that arrives by email is logged by the compliance desk at a company ' +
          'that actually holds the person, and the clock counts from the day it arrived ' +
          'rather than the day it was typed in. Correction and objection are still ' +
          'handled by hand.',
      ],
      provenBy:
        'src/app/api/me/data, src/app/dashboard/my-data, src/app/api/data-requests, ' +
        'src/lib/data-request.ts, src/lib/erasure.ts, src/lib/legal-hold.ts, ' +
        'src/app/api/me/*, src/app/dashboard/my-page, src/app/dashboard/my-work',
      open: 'retention',
    },
    {
      heading: 'Cookies and tracking',
      paragraphs: [
        'A session cookie, set at sign-in, lasting thirty days. Whether a list is shown ' +
          'as a table or a feed is remembered in the browser own storage, on the device.',
        'There is no analytics, advertising or session-replay service in the ' +
          'application, and no third-party cookie is set by it.',
      ],
      provenBy: 'src/lib/auth.ts, src/components/list-surface.tsx, package.json',
    },
    {
      heading: 'Where the data sits',
      paragraphs: [
        'One deployment and one database. Nothing in the software pins a record to a ' +
          'region or refuses to move it. Whoever operates a deployment chooses the ' +
          'region their database and hosting run in, and should name it here.',
      ],
      open: 'cross-border',
    },
    {
      heading: 'Security',
      paragraphs: [
        'Stated in full, with the gaps, in the security posture document rather than ' +
          'summarized favorably here.',
      ],
    },
  ],
}

export const DPA: { title: string; intro: string; sections: Section[] } = {
  title: 'Data processing addendum',
  intro:
    'A working draft of the addendum a client will ask for. It is deliberately ' +
    'incomplete in one place: whether Etyme is a controller or a processor is not ' +
    'settled, and this document sets out the facts either way rather than picking one.',
  sections: [
    {
      heading: 'The unsettled question, stated before anything else',
      paragraphs: [
        'For a client own workforce data — its requisitions, its approvals, its ' +
          'timesheet decisions, the records it keeps about workers it did not employ — ' +
          'Etyme looks like a processor acting on the client instructions.',
        'For a candidate own profile — an account they hold themselves, a profile they ' +
          'maintain, resumes they upload, a public page they turn on, permissions they ' +
          'grant and revoke per supplier — Etyme looks like a controller, because no ' +
          'customer instructed any of it.',
        'The same record can appear in both: a consultant profile the consultant ' +
          'maintains, read by a client that is measuring its own tenure exposure.',
        'Counsel decides. The rest of this addendum is written so that either answer ' +
          'can be dropped in without the facts underneath changing.',
      ],
      open: 'controller-or-processor',
    },
    {
      heading: 'Subject matter, duration, nature and purpose',
      paragraphs: [
        'Subject matter: running a contingent workforce across multiple staffing ' +
          'suppliers — requisition, supplier release, submission, screening, interview, ' +
          'award, onboarding, time, invoicing and compliance.',
        'Duration: for as long as the customer has an account, and after it for as long ' +
          'as the retention schedule says of each category — which for several of them ' +
          'is a statutory minimum measured in years, and for a few is no stated period ' +
          'at all. See retention.',
        'Nature and purpose: storage, structuring, retrieval, disclosure to the ' +
          'counterparties on a deal, and analysis for matching and compliance.',
      ],
      open: 'retention',
    },
    {
      heading: 'Categories of data subject',
      paragraphs: [
        'Contingent workers and candidates; employees of a client company; employees ' +
          'of a supplier company; named references a supplier supplies; and contacts at ' +
          'counterparty firms.',
      ],
    },
    {
      heading: 'Categories of personal data',
      paragraphs: ['As set out in the privacy notice, by category and with the model that holds each.'],
      bullets: HELD.map((h) => `${h.category} — ${h.examples}`),
    },
    {
      heading: 'Data that may be special category',
      paragraphs: [
        'Work authorization class and visa petition history; I-9 and E-Verify ' +
          'attestations; background check, education evaluation and drug screening ' +
          'outcomes; and a bar recorded against a named person with a reason.',
        'All of these are held as attestations that a check happened — who ran it, ' +
          'when, its reference, when it expires — rather than as a verdict about the ' +
          'person. Etyme runs none of them. Which of them count as special category, ' +
          'and where any of them may not be held at all, is for counsel.',
      ],
      provenBy: 'Verification, VisaPetition, Blacklist in prisma/schema.prisma; src/lib/attestation.ts',
      open: 'sensitive-categories',
    },
    {
      heading: 'Sub-processors',
      paragraphs: [
        'The list below is generated from the services the code calls. A new one would ' +
          'appear in the same list on the commit that added it.',
        'The notice period for adding one, and the customer right to object, are open.',
      ],
      bullets: SUB_PROCESSORS.map((s) => `${s.name} — ${s.purpose} What reaches it: ${s.reaches}`),
      open: 'sub-processor-contracts',
    },
    {
      heading: 'Technical and organizational measures that exist',
      paragraphs: [
        'Only measures that can be pointed at in the code are listed. The security ' +
          'posture document lists what is absent with the same specificity, and a ' +
          'reviewer should read both.',
      ],
      bullets: [
        'Records are filtered by the asking company in the database query rather than ' +
          'hidden on the screen (src/lib/walls.ts, src/lib/account-walls.ts, src/lib/seat.ts).',
        'Reads of a person record are logged with the reader, their company, the ' +
          'reason and whether they were allowed, refusals included (src/lib/access-log.ts).',
        'Segregation of duties is enforced rather than advised: an approver who is the ' +
          'beneficiary is blocked, and the refusal names whose rule blocked it ' +
          '(src/lib/governance.ts, src/lib/governance-authorship.ts).',
        'Sign-in is delegated to the customer own identity provider where one is ' +
          'connected, and a provider with no credentials is not offered at all ' +
          '(src/lib/auth.ts).',
        'API keys are stored as a SHA-256 hash and compared in constant time; a key ' +
          'cannot be shown again after it is minted (src/lib/service-accounts.ts).',
        'Outbound webhooks are signed with an HMAC over a timestamp and the payload ' +
          '(src/lib/service-accounts.ts).',
        'Public links — a supplier application, a document packet, a reply — carry a ' +
          'bearer token from a cryptographic random source rather than a sequential ' +
          'identifier, and expire when the thing they are for is decided.',
        'Scheduled jobs require a shared secret compared in constant time, and a ' +
          'deployment with no secret set refuses every scheduled call rather than ' +
          'accepting a default (src/lib/cron-auth.ts).',
        'Errors are recorded and staff are alerted, and a daily heartbeat is sent ' +
          'whether or not anything broke (src/lib/alerts.ts).',
        'Full bank account and routing numbers are never collected; the last four ' +
          'digits are, and the form says so.',
      ],
    },
    {
      heading: 'Assisting the customer with data subject requests',
      paragraphs: [
        'A data subject can ask for everything held about them, or ask to be forgotten, ' +
          'from their own page, without going through a customer at all. A customer ' +
          'compliance desk can log a request that arrived by email against somebody it ' +
          'holds, see what is due and when, and answer it from one page.',
        'The deadline on each request is stored with the reason for it in words, rather ' +
          'than recomputed from a constant, so a period counsel corrects next year does ' +
          'not silently rewrite the deadline on a request already answered. Where nobody ' +
          'has recorded which regime applies, the earliest date any of them would allow ' +
          'is used and is described as conservative rather than correct.',
        'What is refused is recorded as carefully as what is granted, in a sentence the ' +
          'person can act on rather than a code. Correction and objection are still ' +
          'handled by hand, and the response time to promise is still counsel.',
      ],
      provenBy:
        'src/app/api/me/data, src/app/api/data-requests, src/lib/data-request.ts, ' +
        'src/lib/retention.ts, src/app/dashboard/privacy',
      open: 'retention',
    },
    {
      heading: 'Breach notification',
      paragraphs: [
        'What exists: a breach is its own record, opened deliberately by somebody who ' +
          'decided that personal data went where it should not have, separate from the ' +
          'machine errors a failing route writes. It carries when somebody here became ' +
          'aware, whether personal data was involved, which populations and which ' +
          'categories, which customers, and a notification deadline for the supervisory ' +
          'authority, for the people affected, and for each customer on that customer own ' +
          'agreed period. Every deadline names the person who owns sending it. A nightly ' +
          'sweep says so a day before each one and goes on saying so once a day after it ' +
          'has passed, and a breach cannot be closed over a deadline with no notice ' +
          'recorded against it.',
        'What is deliberately absent: a severity scale. Inventing a four-point one here ' +
          'would make this paragraph read better and make nobody safer. What decides the ' +
          'deadlines is whether personal data was involved, whose, and what counsel says ' +
          'about it, and those are the facts the record holds. A scale can be added the ' +
          'day counsel gives one.',
        'Every deadline is empty until somebody decides one applies, and every screen ' +
          'says "nobody has decided" rather than counting down to a date the software ' +
          'invented. The GDPR seventy-two hours is not the United States state patchwork ' +
          'clock, and not every incident is notifiable at all.',
        'What still does not exist: a rehearsed runbook, and a named contact at each ' +
          'customer held in advance rather than looked up on the day.',
      ],
      provenBy:
        'src/lib/breach.ts, src/app/api/breaches, src/lib/notify/breach.ts, ' +
        'src/lib/alerts.ts, Breach and BreachCompany and Incident in prisma/schema.prisma',
    },
    {
      heading: 'International transfers',
      paragraphs: [
        'One deployment, one database, no regional pinning in the software. The ' +
          'transfer mechanism is for counsel.',
      ],
      open: 'cross-border',
    },
    {
      heading: 'Audit',
      paragraphs: [
        'There is no SOC 2 report, no ISO 27001 certificate and no penetration test ' +
          'report to offer in place of an audit. What can be offered is the code, the ' +
          'access log, the automation log and the test suite.',
      ],
    },
    {
      heading: 'Return and deletion at the end',
      paragraphs: [
        'Half built, and the half that is missing is named rather than papered over. A ' +
          'request can be raised about a customer own records and carries a deadline like ' +
          'any other, and the customer own tombstone column exists so that erasing a firm ' +
          'is anonymization rather than a row delete.',
        'What is not built is the export itself. A customer export is refused in words ' +
          'today, because nobody has decided which of the joint records travel with it — ' +
          'a contract between two firms, an invoice between them, and the days a person ' +
          'worked on a site are the other firm records as much as this one, and handing ' +
          'over a copy of them is a decision about somebody else data. Answering by hand ' +
          'is the honest path until that is decided.',
      ],
      provenBy:
        'Company.erasedAt and DataRequest in prisma/schema.prisma, src/lib/data-request.ts',
      open: 'retention',
    },
  ],
}

export const DOCUMENTS = { TERMS, PRIVACY, DPA } as const

/** Every sentence rendered on the three pages, for a test to read. */
export function allProse(): string {
  const doc = (d: { title: string; intro: string; sections: Section[] }) =>
    [
      d.title,
      d.intro,
      ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]),
    ].join('\n')

  return [
    DRAFT_BANNER.headline,
    DRAFT_BANNER.body,
    ...COUNSEL_QUESTIONS.flatMap((q) => [q.question, q.whatTheCodeDoes, q.whyItIsOpen]),
    doc(TERMS),
    doc(PRIVACY),
    doc(DPA),
  ].join('\n')
}
