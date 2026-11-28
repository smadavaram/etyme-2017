/**
 * What Settings > Integrations says about the journal file, and whether it
 * draws Export (fix list of 2026-11-14, E6). Pure.
 *
 * The page showed an accounting product as picked, seven products all
 * "(nothing mapped yet)", and a greyed Export. None of it was true:
 * nothing is connected, nothing on Etyme writes an account code yet, and
 * the file is one generic file whatever product is named (CLAUDE.md: no
 * layout named after a product, and no real company named). So it says
 * only what is true today:
 *   - Etyme is connected to no accounting system and makes a file the
 *     firm loads itself;
 *   - with nothing waiting, it says so;
 *   - with entries waiting and no account codes of the firm's own, it
 *     says how many wait and that they cannot go until each account has
 *     the firm's own code, which cannot be set here yet, and draws no
 *     Export;
 *   - where codes exist, Export is drawn as before, only for a seat whose
 *     route takes it (invoices.issue); any other seat reads who exports.
 */

/** The one file the journal leaves as. No product's layout. */
export const JOURNAL_FILE = 'CSV'

export const NOT_CONNECTED =
  'Etyme is not connected to any accounting system. It makes a file you load into your own system yourself.'

export const NO_CODES_HERE = 'Account codes cannot be set here yet.'

export interface JournalRead {
  pending: number
  sent: number
  /** Etyme accounts the firm has given its own code. */
  mappedAccounts: number
  /** The seat holds invoices.issue, which the export asks for. */
  mayExport: boolean
  /** Who exports, in a sentence, for a seat that may not. */
  whoExports: string
}

export interface JournalWords {
  says: string[]
  /** Draw Export: entries wait, codes exist and the route would take the press. */
  showExport: boolean
}

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`

export function journalWords(r: JournalRead): JournalWords {
  const says = [NOT_CONNECTED]
  const went = r.sent > 0 ? ` ${entries(r.sent)} already went.` : ''
  if (r.pending === 0) {
    says.push(`Nothing is waiting to go to your own system.${went}`)
    return { says, showExport: false }
  }
  if (r.mappedAccounts === 0) {
    says.push(
      `${entries(r.pending)} ${r.pending === 1 ? 'is' : 'are'} waiting. They cannot go until each Etyme account has your own account code. ${NO_CODES_HERE}${went}`,
    )
    return { says, showExport: false }
  }
  says.push(`${entries(r.pending)} ${r.pending === 1 ? 'is' : 'are'} waiting.${went}`)
  if (!r.mayExport) says.push(r.whoExports)
  return { says, showExport: r.mayExport }
}
