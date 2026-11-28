/**
 * Reading one received email from the mail provider.
 *
 * Resend's webhook carries only the email's id and envelope. The body,
 * the headers, the SPF, DKIM and DMARC results its own server computed,
 * and the attachments are read from its receiving API, with a key that is
 * this intake's own (`RESEND_RECEIVING_KEY`). Resend has no read-only key:
 * reading received mail needs a full-access one, so it is kept apart from
 * the sending key (`RESEND_API_KEY`), which stays sending-only. There is
 * deliberately no fallback from one to the other.
 *
 * Only the provider's own API and the download addresses it returns are
 * ever fetched. Nothing an email says is fetched, ever.
 */

export const RECEIVING_KEY_ENV = 'RESEND_RECEIVING_KEY'

const API = 'https://api.resend.com'

export interface ReceivedEmail {
  id: string
  from: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  receivedFor: string[]
  subject: string | null
  text: string | null
  html: string | null
  /** Lowercased header names. */
  headers: Record<string, string>
  authentication: { spf: string | null; dkim: string | null; dmarc: string | null } | null
  attachments: ReceivedAttachment[]
}

export interface ReceivedAttachment {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  disposition: string | null
  downloadUrl: string | null
}

export class ProviderError extends Error {
  constructor(message: string, readonly retry: boolean) {
    super(message)
  }
}

function key(): string {
  const k = (process.env[RECEIVING_KEY_ENV] ?? '').trim()
  if (!k) throw new ProviderError(`${RECEIVING_KEY_ENV} is not set, so the email could not be read from the provider.`, true)
  return k
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${key()}`, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new ProviderError(`The provider answered ${res.status} for ${path.split('/').slice(0, 3).join('/')}.`, res.status >= 500 || res.status === 429)
  return res.json()
}

/** The email and its attachments' download addresses. */
export async function readReceived(emailId: string): Promise<ReceivedEmail> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(emailId)) throw new ProviderError('The email id is not one the provider issues.', false)
  const e = await getJson(`/emails/receiving/${emailId}`)
  const headers: Record<string, string> = {}
  if (e && typeof e.headers === 'object' && e.headers) {
    for (const [k, v] of Object.entries(e.headers as Record<string, unknown>)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v
      else if (Array.isArray(v) && typeof v[0] === 'string') headers[k.toLowerCase()] = v[0]
    }
  }
  const auth = e?.authentication && typeof e.authentication === 'object'
    ? { spf: asString(e.authentication.spf), dkim: asString(e.authentication.dkim), dmarc: asString(e.authentication.dmarc) }
    : null

  let list: any[] = []
  const declared = Array.isArray(e?.attachments) ? e.attachments : []
  if (declared.length) {
    const l = await getJson(`/emails/receiving/${emailId}/attachments`)
    list = Array.isArray(l?.data) ? l.data : []
  }
  const byId = new Map<string, any>(list.map((a) => [String(a?.id), a]))
  const attachments: ReceivedAttachment[] = declared.map((a: any) => {
    const full = byId.get(String(a?.id)) ?? a
    return {
      id: String(a?.id ?? ''),
      fileName: asString(full?.filename) ?? asString(a?.filename) ?? 'unnamed',
      contentType: asString(full?.content_type),
      sizeBytes: asNumber(full?.size) ?? asNumber(a?.size),
      disposition: asString(full?.content_disposition),
      downloadUrl: asString(full?.download_url),
    }
  })

  return {
    id: String(e?.id ?? emailId),
    from: asString(e?.from),
    to: asStrings(e?.to),
    cc: asStrings(e?.cc),
    bcc: asStrings(e?.bcc),
    receivedFor: asStrings(e?.received_for),
    subject: asString(e?.subject),
    text: asString(e?.text),
    html: asString(e?.html),
    headers,
    authentication: auth,
    attachments,
  }
}

/**
 * The bytes of one attachment, from the address the provider's API gave,
 * never more than `cap` bytes: a file that grows past the cap while
 * downloading is cut off and reported as too large.
 */
export async function downloadAttachment(url: string, cap: number): Promise<Uint8Array | 'TOO_LARGE'> {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new ProviderError('The provider gave a download address that is not https.', false)
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!res.ok || !res.body) throw new ProviderError(`The provider answered ${res.status} for an attachment.`, res.status >= 500)
  const declared = Number(res.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > cap) return 'TOO_LARGE'
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel().catch(() => undefined)
      return 'TOO_LARGE'
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.byteLength
  }
  return out
}
