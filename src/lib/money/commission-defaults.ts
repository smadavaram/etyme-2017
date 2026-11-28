/**
 * The firm's default commission rates — the setting the award reads.
 *
 * Founder, 2026-11-08: "Commission is object on sell and buy contracts."
 * The award writes a sales commission on the sell line for whoever sold
 * the deal and a recruiting commission on the buy line for whoever put the
 * person forward, from the firm's own default (`writeDefaultCommissions`).
 * The shipped default is none. This file is the other half: how the Owner
 * or a Contract Manager says what the default is, refused in a sentence per
 * bad value, with who set it and when kept beside it.
 *
 * Stored on `Company.commissionDefaults` as
 *
 *   { SALES?: { basis, rateBps, amountCents, capCents, accrueOn, currency, setById, setByName, setAt },
 *     RECRUITING?: { ... } }
 *
 * A kind that is absent is no default, and the award writes no row of that
 * kind. `defaultsFrom` in lib/money/commission-rows reads it and ignores
 * the who-and-when keys.
 *
 * ── Currency ─────────────────────────────────────────────────────────
 *
 * A share needs no currency: 10% of the margin is 10% in rupees or in
 * dollars. A fixed amount and a cap do. So a default that carries either
 * names its currency, and the award never applies it to a line in another
 * one: rupees and dollars are never added, and a $2 an hour default on a
 * line paid in rupees is not two rupees.
 *
 * No database here.
 */

import { decimalsFor, parse } from '@/lib/money'
import { formatDay } from '@/lib/format-date'
import {
  checkCommission, termsSay, KINDS, KIND_WORD, SETS_COMMISSIONS, IS_SHARE,
  type CommissionKind, type CommissionBasis, type CommissionAccrual,
} from '@/lib/money/commission-rows'

/** One kind's default as stored, with who set it and when. */
export interface StoredDefault {
  basis: CommissionBasis
  rateBps: number | null
  amountCents: number | null
  capCents: number | null
  accrueOn: CommissionAccrual
  /** The currency of `amountCents` and `capCents`; null where neither is set. */
  currency: string | null
  setById: string
  setByName: string
  setAt: string
}

export type StoredDefaults = Partial<Record<CommissionKind, StoredDefault>>

/** What the screen sends for one kind: null to have no default of that kind. */
export interface DefaultDraft {
  basis?: string | null
  rateBps?: number | null
  amountCents?: number | null
  capCents?: number | null
  accrueOn?: string | null
}

export type DefaultsDraft = Partial<Record<CommissionKind, DefaultDraft | null>>

/** The fields the screen draws for each kind; each is a field the route may refuse on. */
export const DEFAULT_FIELDS = ['basis', 'rateBps', 'amountCents', 'capCents', 'accrueOn'] as const

export type DefaultsVerdict =
  | { ok: true; defaults: Partial<Record<CommissionKind, Omit<StoredDefault, 'setById' | 'setByName' | 'setAt'> | null>> }
  | { ok: false; field: string; says: string }

/**
 * Who may say the firm's defaults: the Owner or a Contract Manager, the
 * same seats that set a commission on a line. Null where they may.
 */
export function mayEditDefaults(roleName: string | null, companyName: string): string | null {
  if (roleName && (SETS_COMMISSIONS as readonly string[]).includes(roleName)) return null
  return `The default commission rates are set by the Owner or a Contract Manager at ${companyName}.`
}

/**
 * Is this a default at all? Each kind is checked as a commission row would
 * be (`checkCommission`), so a default can never be something a person
 * could not set on a line by hand. A kind sent as null clears it; a kind
 * not sent is left as it was. Every refusal names the kind and the field.
 */
export function checkDefaults(draft: DefaultsDraft, currency: string): DefaultsVerdict {
  const out: Partial<Record<CommissionKind, Omit<StoredDefault, 'setById' | 'setByName' | 'setAt'> | null>> = {}
  if (!draft || typeof draft !== 'object') {
    return { ok: false, field: 'SALES.basis', says: 'Say the default for a sales commission, a recruiting commission, or both.' }
  }
  const sent = KINDS.filter((k) => k in draft)
  if (sent.length === 0) {
    return { ok: false, field: 'SALES.basis', says: 'Say the default for a sales commission, a recruiting commission, or both.' }
  }
  for (const kind of sent) {
    const d = draft[kind]
    if (d === null) { out[kind] = null; continue }
    const v = checkCommission({
      ...(kind === 'SALES' ? { sellContractId: 'line' } : { buyContractId: 'line' }),
      earnedById: 'whoever the award names', kind, fromDate: new Date(0), reason: 'default',
      basis: d?.basis ?? null, rateBps: d?.rateBps ?? null, amountCents: d?.amountCents ?? null,
      capCents: d?.capCents ?? null, accrueOn: d?.accrueOn ?? null,
    })
    if (!v.ok) {
      return { ok: false, field: `${kind}.${v.field ?? 'basis'}`, says: `${KIND_WORD[kind]}: ${v.says}` }
    }
    const t = v.terms
    out[kind] = {
      basis: t.basis, rateBps: t.rateBps, amountCents: t.amountCents, capCents: t.capCents, accrueOn: t.accrueOn,
      currency: t.amountCents != null || t.capCents != null ? currency.toUpperCase() : null,
    }
  }
  return { ok: true, defaults: out }
}

/**
 * The stored setting after a change: each kind sent is replaced, with who
 * and when; a kind cleared is removed; a kind not sent keeps what it had,
 * and who set it.
 */
export function stampDefaults(
  previous: unknown,
  checked: Extract<DefaultsVerdict, { ok: true }>['defaults'],
  who: { personId: string; name: string },
  at: Date,
): StoredDefaults {
  const prev = storedFrom(previous)
  const next: StoredDefaults = { ...prev }
  for (const kind of KINDS) {
    if (!(kind in checked)) continue
    const d = checked[kind]
    if (d === null || d === undefined) { delete next[kind]; continue }
    next[kind] = { ...d, setById: who.personId, setByName: who.name, setAt: at.toISOString() }
  }
  return next
}

/** The stored setting, read; anything that is not a complete default is no default. */
export function storedFrom(json: unknown): StoredDefaults {
  const out: StoredDefaults = {}
  if (!json || typeof json !== 'object') return out
  for (const kind of KINDS) {
    const d = (json as Record<string, any>)[kind]
    if (!d || typeof d !== 'object') continue
    const v = checkCommission({
      ...(kind === 'SALES' ? { sellContractId: 'line' } : { buyContractId: 'line' }),
      earnedById: 'x', kind, fromDate: new Date(0), reason: 'default',
      basis: d.basis, rateBps: d.rateBps ?? null, amountCents: d.amountCents ?? null, capCents: d.capCents ?? null, accrueOn: d.accrueOn ?? null,
    })
    if (!v.ok) continue
    out[kind] = {
      basis: v.terms.basis, rateBps: v.terms.rateBps, amountCents: v.terms.amountCents, capCents: v.terms.capCents, accrueOn: v.terms.accrueOn,
      currency: typeof d.currency === 'string' ? d.currency : null,
      setById: typeof d.setById === 'string' ? d.setById : '',
      setByName: typeof d.setByName === 'string' ? d.setByName : '',
      setAt: typeof d.setAt === 'string' ? d.setAt : '',
    }
  }
  return out
}

/**
 * May this default be written on a line paid or billed in `lineCurrency`?
 * A share may, in any currency. A fixed amount or a cap only in its own.
 * Null where it may; the sentence where it may not.
 */
export function defaultFitsLine(kind: CommissionKind, d: { amountCents: number | null; capCents: number | null; currency?: string | null }, lineCurrency: string | null): string | null {
  if (d.amountCents == null && d.capCents == null) return null
  const own = (d.currency ?? '').toUpperCase()
  const line = (lineCurrency ?? '').toUpperCase()
  if (own && line && own === line) return null
  return `No ${KIND_WORD[kind].toLowerCase()} was written: the firm’s default is in ${own || 'no stated currency'} and this line is in ${line || 'no stated currency'}, and a fixed amount in one is never paid as the other.`
}

/** One kind's default as the page says it. */
export function defaultSays(kind: CommissionKind, d: StoredDefault | undefined): string {
  if (!d) return `${KIND_WORD[kind]}: no default. The award writes none; set one on the line if it is owed.`
  const terms = termsSay(d, d.currency ?? undefined)
  const by = d.setByName && d.setAt ? ` Set by ${d.setByName} on ${formatDay(new Date(d.setAt))}.` : ''
  return `${KIND_WORD[kind]}: ${terms}.${by}`
}

// ── The screen's side: what a person types, as the route reads it ────

/** What a person typed for one kind, as strings, the way a form holds them. */
export interface TypedDefault {
  on: boolean
  basis: string
  /** A share, as a percentage: "5" or "2.5". */
  percent: string
  /** A fixed amount, in whole currency: "2.50". */
  fixed: string
  /** A cap, in whole currency, or empty for none. */
  cap: string
  accrueOn: string
}

/**
 * The body the screen posts for what was typed. The same conversion is
 * used by the page and by the test that proves every refusal the route can
 * give names a field the page draws.
 */
export function defaultsBody(typed: Partial<Record<CommissionKind, TypedDefault>>, currency: string): DefaultsDraft {
  const body: DefaultsDraft = {}
  for (const kind of KINDS) {
    const t = typed[kind]
    if (!t) continue
    if (!t.on) { body[kind] = null; continue }
    const share = IS_SHARE[t.basis as CommissionBasis] ?? false
    const pct = t.percent.trim() === '' ? null : Number(t.percent.replace(/[%\s]/g, ''))
    const fixed = t.fixed.trim() === '' ? null : parse(t.fixed, currency)?.minor ?? Number.NaN
    const cap = t.cap.trim() === '' ? null : parse(t.cap, currency)?.minor ?? Number.NaN
    body[kind] = {
      basis: t.basis || null,
      rateBps: share && pct != null ? (Number.isFinite(pct) ? Math.round(pct * 100) : Number.NaN) : null,
      amountCents: share ? null : fixed,
      capCents: cap,
      accrueOn: t.accrueOn || 'ACCEPTED',
    }
  }
  return body
}

/** A stored default back into what the form shows. */
export function typedFrom(d: StoredDefault | undefined, currency: string): TypedDefault {
  if (!d) return { on: false, basis: 'SHARE_OF_MARGIN', percent: '', fixed: '', cap: '', accrueOn: 'ACCEPTED' }
  const whole = (minor: number | null) => (minor == null ? '' : (minor / 10 ** decimalsFor(d.currency ?? currency)).toFixed(decimalsFor(d.currency ?? currency)))
  return {
    on: true,
    basis: d.basis,
    percent: d.rateBps == null ? '' : String(d.rateBps / 100),
    fixed: whole(d.amountCents),
    cap: whole(d.capCents),
    accrueOn: d.accrueOn,
  }
}
