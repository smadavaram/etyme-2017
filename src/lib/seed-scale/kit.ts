/**
 * The generated world's tools: the seeded random, deterministic ids,
 * names, addresses and batches. No database except the two readers at
 * the bottom, which read what exists once per table.
 *
 * Every choice is keyed on a stable string (`sx/firm/prime/07`), never on
 * `Math.random` or the wall clock, so two seedings make the same world
 * and a second seeding finds every row by its id and writes nothing
 * (docs/seed-scale-brief.md, section 4.1).
 */

import { createHash } from 'node:crypto'
import { rng, hash, pick, weighted, PLACES } from '@/lib/demo-volume'
import { seedToday } from '@/lib/seed-days'
import { BATCH_ROWS, SCALE_EMAIL_DOMAIN, SCALE_EMAIL_SUFFIX, SCALE_KEY_PREFIX, SCALE_SLUG_PREFIX, type Position } from './types'

export { rng, hash, pick, weighted, PLACES }

/** A random stream keyed on a stable string: the same key, the same numbers. */
export function keyed(key: string): () => number {
  return rng(hash(SCALE_KEY_PREFIX + key))
}

/** A whole number in [min, max], from a keyed stream. */
export function between(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1))
}

// ── Ids ───────────────────────────────────────────────────────────────

/**
 * A deterministic id, cuid-shaped: 25 lowercase characters beginning
 * `cz`, so every generated id sorts after the base world's (whose cuids
 * begin `c` and a timestamp that reads `cm…` for years yet). Foreign keys
 * are computable with no read-back, and `skipDuplicates` on the primary
 * key is the idempotency check.
 */
export function idFor(key: string): string {
  const hex = createHash('sha256').update(SCALE_KEY_PREFIX + key).digest('hex')
  const b36 = BigInt('0x' + hex).toString(36).padStart(50, '0')
  return 'cz' + b36.slice(-23)
}

/**
 * The ids among these that share their last six characters. Invoice
 * numbers are cut from a contract id's last six (`IN-<tail>-<period>`)
 * and are unique, so a set of contract ids must come back empty here.
 */
export function sharedTails(ids: readonly string[]): string[] {
  const seen = new Map<string, string>()
  const out: string[] = []
  for (const id of ids) {
    const t = id.slice(-6)
    const was = seen.get(t)
    if (was && was !== id) out.push(id)
    else seen.set(t, id)
  }
  return out
}

// ── Addresses and slugs ───────────────────────────────────────────────

/** Whether an address is the generated world's. The base world's reads exclude these. */
export function scaleAddress(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(SCALE_EMAIL_SUFFIX)
}

/** Letters only, accents folded, never dropped: "Sørensen" reads "sorensen". */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

/**
 * `<first>.<last>.<nnnn>@people.scale.invalid`. The number is the
 * person's own: the frame's seated staff are numbered from 8001, the
 * people the bench and the payroll hold from 0001, so the two never meet.
 */
export function emailFor(name: string, n: number): string {
  const parts = name.split(' ')
  const local = `${fold(parts[0])}.${fold(parts.slice(1).join(' '))}.${String(n).padStart(4, '0')}`
  return `${local}@${SCALE_EMAIL_DOMAIN}`
}

/** The first number a seated staff member's address carries. */
export const STAFF_NUMBER_FROM = 8001

const POSITION_WORD: Record<Position, string> = {
  CLIENT: 'client', GSI: 'gsi', MSP: 'msp', PRIME: 'prime', SUB_VENDOR: 'sub', BENCH: 'bench', SOLO: 'solo',
}

/** `world-sx-<kind>-<nn>-<handle>`: opened by the demo door, never on the base roster. */
export function slugFor(position: Position, n: number, name: string): string {
  const handle = fold(name).replace(/\./g, '-').split('-').slice(0, 2).join('-')
  return `${SCALE_SLUG_PREFIX}${POSITION_WORD[position]}-${String(n).padStart(2, '0')}-${handle}`
}

// ── Names ─────────────────────────────────────────────────────────────
//
// Invented pools, not the demo material's: the demo pools combine into
// people the hand-written world already has (Priya Raman, Karthik
// Menon), and a generated namesake on a screen beside them is a puzzle.

export const FIRST_NAMES: readonly string[] = [
  'Abena', 'Adrian', 'Agnes', 'Ahmed', 'Alba', 'Aldo', 'Alina', 'Amos', 'Anouk', 'Anselm',
  'Ansgar', 'Arlo', 'Astrid', 'Aurelio', 'Basil', 'Bettina', 'Bjorn', 'Bram', 'Calla', 'Casimir',
  'Cecily', 'Cosmo', 'Dalia', 'Darius', 'Delphine', 'Dorian', 'Edda', 'Eamon', 'Elio', 'Elodie',
  'Emeric', 'Esme', 'Ettore', 'Fenna', 'Fintan', 'Flavia', 'Gaspard', 'Greer', 'Gunnar', 'Halima',
  'Hamish', 'Hedda', 'Hollis', 'Ilka', 'Imre', 'Ines', 'Isidro', 'Ivo', 'Jalen', 'Jessamy',
  'Joaquin', 'Junia', 'Kasimir', 'Keziah', 'Kian', 'Klara', 'Lazlo', 'Leocadia', 'Linus', 'Lorcan',
  'Lumi', 'Magnus', 'Malin', 'Marit', 'Matteo', 'Mireille', 'Nadia', 'Niamh', 'Nils', 'Noor',
  'Odile', 'Olek', 'Orla', 'Osric', 'Paloma', 'Pavel', 'Quinlan', 'Rafferty', 'Rhona', 'Rasmus',
  'Saoirse', 'Seren', 'Silas', 'Solveig', 'Stellan', 'Tamsin', 'Teodor', 'Thea', 'Torin', 'Ulla',
  'Valentin', 'Vesna', 'Wendell', 'Wilhelmina', 'Xavi', 'Yara', 'Yorick', 'Zelda', 'Zoltan', 'Zuri',
]

/** Last names whose first four letters are nearly all distinct, so a firm of fifty can be told apart. */
export const LAST_NAMES: readonly string[] = [
  'Abernathy', 'Achterberg', 'Aldana', 'Ambrose', 'Arkwright', 'Ashdown', 'Aventi', 'Bakshi', 'Baldacci', 'Barlowe',
  'Bechtel', 'Bergkamp', 'Birchall', 'Blomqvist', 'Bonifacio', 'Bramwell', 'Brightley', 'Calderon', 'Carmody', 'Castellan',
  'Chatterton', 'Ciorba', 'Colquhoun', 'Corrigan', 'Crowther', 'Dalgaard', 'Darrow', 'Delacorte', 'Dimitrov', 'Donnelly',
  'Drummond', 'Dunleavy', 'Eckhardt', 'Ellingsen', 'Engstrom', 'Esposito', 'Falconer', 'Fenwick', 'Fiorentino', 'Fitzalan',
  'Fonseca', 'Fraser-Lowe', 'Galbraith', 'Garnier', 'Gilchrist', 'Goldfinch', 'Granqvist', 'Grimaldi', 'Hadfield', 'Hallorann',
  'Hartigan', 'Haverford', 'Hellstrom', 'Holloway', 'Huxtable', 'Ibarra', 'Ingleby', 'Jankowski', 'Jessup', 'Joubert',
  'Kalinowski', 'Kavanagh', 'Kestrel', 'Kilbride', 'Kowalczyk', 'Lachance', 'Lambrecht', 'Larkspur', 'Lennox', 'Lindholm',
  'Lockhart', 'Lombardo', 'Lundqvist', 'Macready', 'Maitland', 'Malvern', 'Marchetti', 'Mattheus', 'Mendelson', 'Merriweather',
  'Montague', 'Moriarty', 'Mulcahy', 'Nakashima', 'Nettleton', 'Nordahl', 'Oakhurst', 'Olafsson', 'Ormsby', 'Pacheco',
  'Pemberton', 'Penhallow', 'Petrakis', 'Pickering', 'Quartermain', 'Radcliffe', 'Ravensworth', 'Redgrave', 'Rinaldi', 'Rochford',
  'Rothwell', 'Ruskin', 'Saltonstall', 'Sandoval', 'Scarlatti', 'Sedgewick', 'Sheringham', 'Silvestri', 'Stanhope', 'Strickland',
  'Tavernier', 'Thistlewood', 'Tremaine', 'Underhill', 'Valdivia', 'Vanderpool', 'Velasquez', 'Wainwright', 'Westbrook', 'Yardley',
]

const firstOf = (n: string) => n.split(' ')[0].toLowerCase()
const lastOf = (n: string) => n.split(' ').slice(1).join(' ').toLowerCase()
const prefixOf = (n: string) => lastOf(n).replace(/[^a-z]/g, '').slice(0, 4)

/**
 * Hands out names that never repeat in the world and never clash inside
 * one firm: nobody at a firm shares a first name, a last name or the
 * first four letters of a last name with anybody else there
 * (`__tests__/invariants/seeded-names-distinct.test.ts`).
 *
 * Deterministic: the same calls in the same order give the same names.
 * The frame takes its seated staff first; `bookAfter(frame)` hands
 * supply a book that already holds them, so the people it adds at an
 * integrator never clash with that firm's staff.
 */
export class NameBook {
  private used = new Set<string>()
  private atFirm = new Map<string, { first: Set<string>; last: Set<string>; prefix: Set<string> }>()

  constructor(taken: Iterable<string> = []) {
    for (const n of taken) this.used.add(n.toLowerCase())
  }

  /** Mark a name as held at a firm, without choosing it here. */
  hold(name: string, firmKey: string | null): void {
    this.used.add(name.toLowerCase())
    if (firmKey) {
      const f = this.firm(firmKey)
      f.first.add(firstOf(name)); f.last.add(lastOf(name)); f.prefix.add(prefixOf(name))
    }
  }

  /** A fresh name for `key`, distinct at `firmKey` where one is given. */
  take(key: string, firmKey: string | null): string {
    const r = keyed(`name/${key}`)
    const nF = FIRST_NAMES.length
    const nL = LAST_NAMES.length
    const f0 = Math.floor(r() * nF)
    const l0 = Math.floor(r() * nL)
    const f = firmKey ? this.firm(firmKey) : null
    for (let i = 0; i < nF * nL; i++) {
      // Walk the grid on a diagonal, so neighbors differ in both names.
      const first = FIRST_NAMES[(f0 + i) % nF]
      const last = LAST_NAMES[(l0 + i * 7 + Math.floor(i / nF)) % nL]
      const name = `${first} ${last}`
      if (this.used.has(name.toLowerCase())) continue
      if (f && (f.first.has(firstOf(name)) || f.last.has(lastOf(name)) || f.prefix.has(prefixOf(name)))) continue
      this.hold(name, firmKey)
      return name
    }
    throw new Error(`No name left for ${key}${firmKey ? ` at ${firmKey}` : ''}: the pools are too small for this firm.`)
  }

  private firm(k: string) {
    let f = this.atFirm.get(k)
    if (!f) {
      f = { first: new Set(), last: new Set(), prefix: new Set() }
      this.atFirm.set(k, f)
    }
    return f
  }
}

// ── Dates ─────────────────────────────────────────────────────────────

/** The day the base world was born, which every generated date counts from. Call `anchorSeed` first. */
export function birthday(): Date {
  return seedToday()
}

/** A moment `n` minutes after `d`. */
export function minutesAfter(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000)
}

// ── Batches ───────────────────────────────────────────────────────────

/** Rows in batches of at most `size`: 500 rows of 30 columns stays under Prisma's bind limit. */
export function batch<T>(rows: readonly T[], size = BATCH_ROWS): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/** Any table with an `id`, as `existing` reads it. */
type IdTable = { findMany(args: { where: { id: { in: string[] } }; select: { id: true } }): Promise<{ id: string }[]> }

/**
 * Which of these ids already exist, in one query per five thousand: what
 * a step reads once before it writes only what is missing.
 */
export async function existing(table: unknown, ids: readonly string[]): Promise<Set<string>> {
  const t = table as IdTable
  const out = new Set<string>()
  for (const chunk of batch(ids, 5000)) {
    if (chunk.length === 0) continue
    for (const r of await t.findMany({ where: { id: { in: chunk } }, select: { id: true } })) out.add(r.id)
  }
  return out
}

/** Write the rows whose id is not there yet, in batches. Returns how many were written. */
export async function writeMissing<R extends { id: string }>(table: unknown, rows: readonly R[]): Promise<number> {
  if (rows.length === 0) return 0
  const have = await existing(table, rows.map((r) => r.id))
  const missing = rows.filter((r) => !have.has(r.id))
  const t = table as { createMany(args: { data: R[]; skipDuplicates: boolean }): Promise<{ count: number }> }
  let n = 0
  for (const b of batch(missing)) n += (await t.createMany({ data: b, skipDuplicates: true })).count
  return n
}
