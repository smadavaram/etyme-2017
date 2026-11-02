/**
 * What the supplier's apply page posts (`POST /api/supplier-apply/:token`),
 * as pure functions of what it draws: the full answer (Send), and the
 * papers already given to another client sent again in one click (Send
 * again). The field contract fills in every field the page draws, builds
 * exactly these, and checks them against what the route reads
 * (`every-question-has-a-field-demand.test.ts`).
 */

export interface ApplyForm {
  legalName: string; address: string; duns: string; website: string; experience: string; skills: string
  bankName: string; accountName: string; last4: string
}
export interface Reference { name: string; company: string; email: string; phone: string }
export type Dates = Record<string, { validFrom: string; validUntil: string }>
export type Files = Record<string, { fileName: string; size: number; type: string; content: string }>

/** References with a name or a firm; a blank pair the page drew is not sent. */
const named = (refs: readonly Reference[]) => refs.filter((r) => r.name || r.company)

/** Send: every answer, the bank, the references, every date typed, and each file with its content. */
export function applyBody(form: ApplyForm, refs: readonly Reference[], dates: Dates, files: Files): Record<string, unknown> {
  return {
    legalName: form.legalName, address: form.address, duns: form.duns, website: form.website, experience: form.experience, skills: form.skills,
    bank: { bankName: form.bankName, accountName: form.accountName, last4: form.last4 },
    references: named(refs),
    // Every date typed, with or without a new file this time.
    dates,
    docs: Object.entries(files).map(([key, f]) => ({
      key, fileName: f.fileName, size: f.size, type: f.type, content: f.content,
      validFrom: dates[key]?.validFrom || null,
      validUntil: dates[key]?.validUntil || null,
    })),
  }
}

/** Send again: the papers given to another client, by request and key, with the answers and dates typed here. */
export function reuseBody(
  sentBefore: readonly { requestId: string; key: string }[],
  form: ApplyForm,
  refs: readonly Reference[],
  dates: Dates
): Record<string, unknown> {
  return {
    reuse: sentBefore.map((b) => ({ requestId: b.requestId, key: b.key })),
    dates,
    references: named(refs),
    legalName: form.legalName, address: form.address, website: form.website, experience: form.experience, skills: form.skills,
  }
}
