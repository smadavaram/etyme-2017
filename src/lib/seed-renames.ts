/**
 * Demo firms whose name was retired after the world had been seeded.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The bench vendor in the demo world was called CloudEPA. A real company
 * of that name asked for its own tenancy on 2026-10-04, so the founder
 * chose a new name for the demo firm: Techpeple. A real firm's name in
 * the demo reads as a customer, and its domain as a door into a demo
 * tenant (see `docs/demo-names.md`).
 *
 * The live demo already holds that firm, under the slug `world-cloudepa`,
 * with its people at `world-cloudepa-*@demo.etyme.local`. The demo world
 * may not be deleted to make the change. So the seed renames it in place:
 * the same row, the same people, the same history, under the new name.
 * A second seeding finds nothing old and changes nothing.
 *
 * This file is the rename map. It is the one place in the code that is
 * allowed to spell the retired name, and
 * `__tests__/invariants/demo-names.test.ts` holds it to that.
 */
import type { PrismaClient } from '@prisma/client'

export interface RenamedFirm {
  /** The slug under the world prefix, before and after. */
  fromSlug: string
  toSlug: string
  /** The name a person read, before and after. */
  fromName: string
  toName: string
  /** The day it was decided, and why, in a sentence. */
  on: string
  why: string
}

export const RENAMED_FIRMS: readonly RenamedFirm[] = [
  {
    fromSlug: 'cloudepa',
    toSlug: 'techpeple',
    fromName: 'CloudEPA',
    toName: 'Techpeple',
    on: '2026-10-04',
    why: 'a real company of that name asked for its own tenancy, 2026-10-04',
  },
]

/**
 * A seeded address under the old slug, moved to the new one. Null when the
 * address is not one of that firm's seeded addresses.
 *
 * Only the firm's own owner address (`world-cloudepa@…`) and its desks
 * (`world-cloudepa-ap@…`) at the demo domain move. Anything at another
 * domain is somebody real, and is never touched.
 */
export function renamedEmail(email: string, firm: RenamedFirm, prefix: string, domain: string): string | null {
  const at = `@${domain}`
  if (!email.endsWith(at)) return null
  const local = email.slice(0, -at.length)
  const old = prefix + firm.fromSlug
  if (local === old) return `${prefix}${firm.toSlug}${at}`
  if (local.startsWith(old + '-')) return `${prefix}${firm.toSlug}${local.slice(old.length)}${at}`
  return null
}

/**
 * Every spelling of the old name in a sentence, and what it becomes. The
 * prefixed slug comes first so `world-cloudepa` is not read as the bare
 * name inside an address.
 */
export function renamePairs(firm: RenamedFirm, prefix: string): [string, string][] {
  const lower = firm.fromName.toLowerCase()
  const capital = lower[0].toUpperCase() + lower.slice(1)
  return [
    [prefix + firm.fromSlug, prefix + firm.toSlug],
    [firm.fromName, firm.toName],
    [capital, firm.toName],
    [lower, firm.toSlug],
    [firm.fromName.toUpperCase(), firm.toName.toUpperCase()],
  ]
}

/** A sentence with every spelling of the old name replaced. Pure; used by the tests and by nothing that writes. */
export function renameInText(text: string, firm: RenamedFirm, prefix: string): string {
  let out = text
  for (const [from, to] of renamePairs(firm, prefix)) out = out.split(from).join(to)
  return out
}

export interface RenameResult {
  firm: string
  companies: number
  people: number
  /** Rows elsewhere whose words named the firm, by table. */
  rows: Record<string, number>
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

/**
 * Rename every retired demo firm still under its old slug, in place.
 *
 * Idempotent: where no company holds an old slug there is nothing to do,
 * and that is one query per entry in the map. Where both the old and the
 * new slug exist it refuses in a sentence rather than merging two firms,
 * because merging is a judgment and this is a rename.
 *
 * What moves, all in one transaction:
 *   - the company's slug and name;
 *   - its seeded people's addresses at the demo domain;
 *   - the old name in the words of any row that belongs to the demo
 *     world — a row pointing at one of the world's companies, or at a
 *     person seated at one. Nothing outside the world is read or written:
 *     a real client may one day list the real firm as a supplier, and
 *     that row is theirs.
 */
export async function renameRetiredFirms(
  db: PrismaClient,
  opts: { prefix: string; domain: string; worldSlugs: readonly string[] },
  /** The map. Only a test passes another — to put an old world back together. */
  firms: readonly RenamedFirm[] = RENAMED_FIRMS
): Promise<RenameResult[]> {
  const done: RenameResult[] = []
  for (const firm of firms) {
    const oldSlug = opts.prefix + firm.fromSlug
    const newSlug = opts.prefix + firm.toSlug
    const old = await db.company.findUnique({ where: { slug: oldSlug }, select: { id: true } })
    if (!old) continue
    if (await db.company.findUnique({ where: { slug: newSlug }, select: { id: true } })) {
      throw new Error(
        `The demo world holds both ${oldSlug} and ${newSlug}. ${firm.fromName} was renamed to ${firm.toName} ` +
          `on ${firm.on}, and two firms cannot be merged by a rename. Look at both before seeding again.`
      )
    }

    const result: RenameResult = { firm: firm.toName, companies: 0, people: 0, rows: {} }
    await db.$transaction(
      async (tx) => {
        await tx.company.update({ where: { id: old.id }, data: { slug: newSlug, name: firm.toName } })
        result.companies = 1

        const people = await tx.person.findMany({
          where: { primaryEmail: { startsWith: oldSlug, endsWith: `@${opts.domain}` } },
          select: { id: true, primaryEmail: true },
        })
        for (const p of people) {
          const to = renamedEmail(p.primaryEmail, firm, opts.prefix, opts.domain)
          if (!to) continue
          await tx.person.update({ where: { id: p.id }, data: { primaryEmail: to } })
          result.people++
        }

        // The world, after the rename, and everybody seated in it.
        const companyIds = (
          await tx.company.findMany({ where: { slug: { in: [...opts.worldSlugs] } }, select: { id: true } })
        ).map((c) => c.id)
        const personIds = (
          await tx.context.findMany({ where: { companyId: { in: companyIds } }, select: { personId: true } })
        ).map((c) => c.personId)

        // Every column holding words, in every table that points at a
        // company or a person. Names come from the catalog, never from
        // anything a user typed, and are quoted.
        const fks = await tx.$queryRawUnsafe<{ table_name: string; column_name: string; ref: string }[]>(`
          select kcu.table_name, kcu.column_name, ccu.table_name as ref
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
          where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
            and ccu.table_name in ('Company', 'Person')`)
        const words = await tx.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(`
          select table_name, column_name, data_type from information_schema.columns
          where table_schema = 'public' and data_type in ('text', 'character varying', 'jsonb')`)

        const owners = new Map<string, { company: string[]; person: string[] }>()
        owners.set('Company', { company: ['id'], person: [] })
        owners.set('Person', { company: [], person: ['id'] })
        for (const fk of fks) {
          const o = owners.get(fk.table_name) ?? { company: [], person: [] }
          ;(fk.ref === 'Company' ? o.company : o.person).push(fk.column_name)
          owners.set(fk.table_name, o)
        }

        const pairs = renamePairs(firm, opts.prefix)
        for (const [table, o] of owners) {
          const cols = words.filter((w) => w.table_name === table)
          if (!cols.length) continue
          const scope = [
            ...o.company.map((c) => `${quote(c)} = any($1::text[])`),
            ...o.person.map((c) => `${quote(c)} = any($2::text[])`),
          ].join(' or ')
          for (const col of cols) {
            const asText = col.data_type === 'jsonb' ? `${quote(col.column_name)}::text` : quote(col.column_name)
            let replaced = asText
            for (const [from, to] of pairs) replaced = `replace(${replaced}, '${from}', '${to}')`
            if (col.data_type === 'jsonb') replaced = `(${replaced})::jsonb`
            const n = await tx.$executeRawUnsafe(
              `update ${quote(table)} set ${quote(col.column_name)} = ${replaced}
               where ${asText} ilike '%${firm.fromSlug}%' and (${scope})`,
              companyIds,
              personIds
            )
            if (n) result.rows[`${table}.${col.column_name}`] = (result.rows[`${table}.${col.column_name}`] ?? 0) + n
          }
        }

        // Recorded without the old name, so that the record of the rename
        // is not the one row left that names a real company.
        await tx.automationLog.create({
          data: {
            companyId: old.id,
            action: 'DEMO_FIRM_RENAMED',
            summary: `Renamed a demo firm to ${firm.toName}, in place.`,
            reason: `Its old name belongs to a real company, which asked for its own tenancy on ${firm.on}. The demo world keeps the firm, its people and its history under the new name.`,
            payload: { to: newSlug, people: result.people, rows: result.rows },
            reversible: false,
          },
        })
      },
      { timeout: 120_000 }
    )
    done.push(result)
  }
  return done
}
