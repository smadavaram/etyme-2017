/**
 * Platform settings: numbers the whole deployment runs on, set by Etyme's
 * Superadmin from the Superadmin screen (founder, 2026-11-11: "I should be
 * able to configure that in the Superadmin screen").
 *
 * The ladder (CLAUDE.md, 2026-11-11): Superadmin, then Owner, then Admin.
 * A Superadmin is an address on ETYME_STAFF_EMAILS and holds platform tools
 * only. So nothing here names a company, a person's data or anybody's
 * money: a key, its value, who set it and when.
 *
 * - A key set here beats the environment variable of the same name; a key
 *   not set here falls back to it, so a deployment that never opens the
 *   screen works exactly as before.
 * - Every change writes one PlatformSettingChange row (who, when, before,
 *   after) in the same transaction as the setting. Nothing edits or
 *   deletes a change row.
 * - A null value clears the key here, which hands it back to the
 *   deployment's environment variable.
 *
 * The checks on a value (is it a number, is it under the ceiling) are the
 * caller's: this door stores what it is given. lib/ask-etyme-limits holds
 * them for the two Ask Etyme limits.
 */
import { prisma } from '@/lib/db'

export interface PlatformSettingRow {
  key: string
  value: string
  setByEmail: string
  setByName: string | null
  setAt: Date
}

export interface PlatformSettingChangeRow {
  key: string
  oldValue: string | null
  newValue: string | null
  changedByEmail: string
  changedByName: string | null
  changedAt: Date
}

/** The values set here for these keys. Throws on a database fault; the reader decides the fallback. */
export async function readPlatformSettings(keys: readonly string[]): Promise<Map<string, string>> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...keys] } }, select: { key: true, value: true } })
  return new Map(rows.map((r) => [r.key, r.value]))
}

/** The rows for these keys, with who set each and when. */
export async function platformSettingRows(keys: readonly string[]): Promise<PlatformSettingRow[]> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true, setByEmail: true, setAt: true, setBy: { select: { name: true } } },
  })
  return rows.map((r) => ({ key: r.key, value: r.value, setByEmail: r.setByEmail, setByName: r.setBy?.name ?? null, setAt: r.setAt }))
}

/** The last changes to these keys, newest first. */
export async function platformSettingHistory(keys: readonly string[], take = 10): Promise<PlatformSettingChangeRow[]> {
  const rows = await prisma.platformSettingChange.findMany({
    where: { key: { in: [...keys] } },
    orderBy: { changedAt: 'desc' },
    take,
    select: {
      key: true, oldValue: true, newValue: true, changedByEmail: true, changedAt: true,
      changedBy: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    key: r.key, oldValue: r.oldValue, newValue: r.newValue,
    changedByEmail: r.changedByEmail, changedByName: r.changedBy?.name ?? null, changedAt: r.changedAt,
  }))
}

export interface SettingChange {
  key: string
  /** The new value, or null to clear it here. */
  value: string | null
}

/**
 * Set or clear keys, one change row per key that actually moved, all in one
 * transaction. Returns the changes written; a value equal to the one stored
 * writes nothing.
 */
export async function changePlatformSettings(
  changes: readonly SettingChange[],
  who: { personId: string | null; email: string },
  now = new Date(),
): Promise<PlatformSettingChangeRow[]> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.platformSetting.findMany({ where: { key: { in: changes.map((c) => c.key) } }, select: { key: true, value: true } })
    const was = new Map(before.map((r) => [r.key, r.value]))
    const written: PlatformSettingChangeRow[] = []
    for (const c of changes) {
      const oldValue = was.get(c.key) ?? null
      if (oldValue === c.value) continue
      if (c.value === null) {
        await tx.platformSetting.delete({ where: { key: c.key } })
      } else {
        await tx.platformSetting.upsert({
          where: { key: c.key },
          create: { key: c.key, value: c.value, setById: who.personId, setByEmail: who.email, setAt: now },
          update: { value: c.value, setById: who.personId, setByEmail: who.email, setAt: now },
        })
      }
      await tx.platformSettingChange.create({
        data: { key: c.key, oldValue, newValue: c.value, changedById: who.personId, changedByEmail: who.email, changedAt: now },
      })
      written.push({ key: c.key, oldValue, newValue: c.value, changedByEmail: who.email, changedByName: null, changedAt: now })
    }
    return written
  })
}
