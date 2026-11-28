/**
 * What a change of a company's Owners says, to each person who reads it
 * (the Owner walk, 2026-11-12). The walk read machine lines said in the
 * third person to the very people they were about: "Ownership passed by
 * Camille Ostrander to Lorena Kellerman, accepted by Lorena Kellerman;
 * Camille Ostrander now: Admin." on the confirmation, on the card's Done
 * line, in the log and in the notice; "Ines Okafor said no to your ask
 * about Ines Okafor"; and "They will be an Admin." on the card.
 *
 * So one sentence per reader, from the ask's own fields:
 *  - the person who took over reads it in the second person;
 *  - the Owner who asked reads it in the second person too;
 *  - anybody else (the log, another Owner, an Admin) reads plain third
 *    person, every person named, never a pronoun, because the record
 *    keeps none.
 *
 * Pure: names in, sentences out. The routes that land the change
 * (app/api/settings/owners, lib/owner-rules) call these.
 */

/** What the Owner who passed ownership becomes. */
export type AfterPass = 'OWNER' | 'ADMIN' | 'LEAVE'

export interface PassFacts {
  /** The Owner who passed it. */
  askerName: string
  /** The person who took over. */
  subjectName: string
  companyName: string
  after: AfterPass
}

/**
 * The confirmation and the card's Done line, to the person who took over:
 * "You are now an Owner of Tapin. Camille Ostrander is now an Admin."
 */
export function passDoneForNewOwner(f: PassFacts): string {
  const asker = f.after === 'ADMIN' ? `${f.askerName} is now an Admin.`
    : f.after === 'LEAVE' ? `${f.askerName} has left ${f.companyName}.`
      : `${f.askerName} stays an Owner.`
  return `You are now an Owner of ${f.companyName}. ${asker}`
}

/**
 * The notice to the Owner who passed it:
 * "Lorena Kellerman accepted. Lorena Kellerman is now an Owner of Tapin, and you are an Admin."
 */
export function passDoneForAsker(f: PassFacts): string {
  const you = f.after === 'ADMIN' ? 'and you are an Admin.'
    : f.after === 'LEAVE' ? `and your seat at ${f.companyName} has ended.`
      : 'and you stay an Owner.'
  return `${f.subjectName} accepted. ${f.subjectName} is now an Owner of ${f.companyName}, ${you}`
}

/** The notice's title to the Owner who passed it: "Lorena Kellerman accepted ownership of Tapin". */
export function passDoneTitleForAsker(f: Pick<PassFacts, 'subjectName' | 'companyName'>): string {
  return `${f.subjectName} accepted ownership of ${f.companyName}`
}

/**
 * The log line and what anybody else reads, plain third person:
 * "Camille Ostrander passed Tapin’s ownership to Lorena Kellerman. Lorena
 * Kellerman is now an Owner, and Camille Ostrander is now an Admin."
 */
export function passDoneForOthers(f: PassFacts): string {
  const asker = f.after === 'ADMIN' ? `${f.askerName} is now an Admin`
    : f.after === 'LEAVE' ? `${f.askerName} has left ${f.companyName}`
      : `${f.askerName} stays an Owner`
  return `${f.askerName} passed ${possessive(f.companyName)} ownership to ${f.subjectName}. ${f.subjectName} is now an Owner, and ${asker}.`
}

/**
 * The pass card the person taking over reads before saying yes, the
 * asker named again rather than "They":
 * "Camille Ostrander wants to pass Tapin’s ownership to you. After this
 * you are an Owner of Tapin. Camille Ostrander will be an Admin."
 */
export function passCardForNewOwner(f: PassFacts): string {
  const asker = f.after === 'ADMIN' ? 'an Admin' : f.after === 'LEAVE' ? `leaving ${f.companyName}` : 'an Owner too'
  return `${f.askerName} wants to pass ${possessive(f.companyName)} ownership to you. After this you are an Owner of ${f.companyName}. ${f.askerName} will be ${asker}.`
}

export interface NoFacts {
  /** Who said no. */
  deciderName: string
  kind: 'PASS' | 'REMOVE' | 'DEMOTE'
  /** Who the ask was about: the person asked to take over, or the Owner to remove or move. */
  subjectName: string
  companyName: string
  /** DEMOTE: the role the Owner was to move to. */
  toRoleName?: string | null
}

/** What was asked, as the asker reads the no: "taking over as Owner", "removing Ana Ruiz as an Owner". */
function whatWasAsked(f: NoFacts): string {
  const self = f.deciderName === f.subjectName
  if (f.kind === 'PASS') return 'taking over as Owner'
  if (f.kind === 'REMOVE') return self ? 'being removed as an Owner' : `removing ${f.subjectName} as an Owner`
  const to = f.toRoleName ?? 'another role'
  return self ? `being moved from Owner to ${to}` : `moving ${f.subjectName} from Owner to ${to}`
}

/** The no notice's title to the Owner who asked: "Lorena Kellerman said no to taking over as Owner". */
export function saidNoTitle(f: NoFacts): string {
  return `${f.deciderName} said no to ${whatWasAsked(f)}`
}

/** The no notice's body: "Lorena Kellerman said no to taking over as Owner of Tapin. Nothing changed." */
export function saidNoBody(f: NoFacts): string {
  return `${f.deciderName} said no to ${whatWasAsked(f)} ${f.kind === 'DEMOTE' ? 'at' : 'of'} ${f.companyName}. Nothing changed.`
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}
