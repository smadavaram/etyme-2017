/**
 * Real files, sent as files, and the count of every paper that moved.
 * Owned by regulatory; shared by the documents station and
 * paperwork-and-start.
 *
 * The founder, 2026-10-20: "Exchange 10000 documents like insurance, W-9,
 * NCA during submissions and screening and background checks." A paper is
 * a file somebody sends, so every one here is a real small PDF or a real
 * photograph (PNG), a few kilobytes, different in its bytes from every
 * other, sent through the same multipart door a phone uses
 * (`POST /api/documents/:id/upload` and `/sign`), so the bytes are stored
 * and the storage is exercised. Never a link to a file that is not there.
 *
 * The actors speak JSON only, so a file goes out here, as the same seat
 * with the same session, and lands on the same ledger with its timing —
 * an upload is a call like any other in the report.
 */
import { performance } from 'node:perf_hooks'
import { deflateSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { expecting, type Actor, type Res } from '../../actors'
import type { Ctx } from '../../stage'

// ── The files ────────────────────────────────────────────────────────

export interface PaperFile {
  name: string
  type: string
  bytes: Buffer
}

/** Text a PDF can carry in a literal string. */
function pdfText(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
}

/**
 * A one-page PDF with these lines on it, readable by any viewer. The
 * lines carry the paper's own facts and a serial, so no two files are
 * the same bytes.
 */
export function pdf(name: string, title: string, lines: string[]): PaperFile {
  const serial = randomBytes(6).toString('hex')
  const body = [title, '', ...lines, '', `Document serial ${serial}`]
  // A real certificate is mostly boilerplate; enough of it that the file
  // is a few kilobytes, as a scanned page's text layer is.
  for (let i = 0; i < 18; i++) body.push(`Clause ${i + 1}. ${CLAUSE[i % CLAUSE.length]}`)
  let y = 760
  const ops = ['BT', '/F1 10 Tf']
  for (const l of body) {
    ops.push(`1 0 0 1 50 ${y} Tm (${pdfText(l)}) Tj`)
    y -= 14
    if (y < 40) break
  }
  ops.push('ET')
  const stream = ops.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return { name, type: 'application/pdf', bytes: Buffer.from(out, 'latin1') }
}

const CLAUSE = [
  'This document is issued for the named holder and is valid only for the period printed above.',
  'The issuer may be contacted at the address of record to confirm the facts stated here.',
  'Any alteration of this document voids it. A copy is as good as the original for the purpose stated.',
  'The holder agrees to notify the requesting party of any change to the facts stated here.',
  'Nothing here is a judgment about the holder beyond the facts printed on it.',
  'Retained for as long as the law or the agreement between the parties requires, and no longer.',
]

let crcTable: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** A small photograph (PNG, 48 by 32): the phone picture of an ID card or a passport page. Different pixels every time. */
export function photo(name: string): PaperFile {
  const w = 48
  const h = 32
  const noise = randomBytes(w * h * 3)
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    noise.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return { name, type: 'image/png', bytes }
}

// ── Sending one ──────────────────────────────────────────────────────

/**
 * POST a file as a multipart form, as this seat. Recorded on the run's
 * ledger exactly as an actor's call is, the expected flag included.
 */
export async function sendFile(ctx: Ctx, actor: Actor, path: string, file: PaperFile, fields: Record<string, string> = {}): Promise<Res> {
  const native = (actor as unknown as { upload?: (p: string, f: FormData) => Promise<Res> }).upload
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  form.set('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
  if (typeof native === 'function') return native.call(actor, path, form)

  await actor.open()
  // The session the actor already holds. Read rather than reopened, so the
  // file goes as the same person in the same session as every other call.
  const cookie = (actor as unknown as { cookie: string | null }).cookie
  const started = new Date()
  const t0 = performance.now()
  let status = 0
  let json: any = null
  let sentence: string | null = null
  let code: string | undefined
  try {
    const res = await fetch(ctx.base + path, {
      method: 'POST',
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
      body: form,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    })
    status = res.status
    const text = await res.text()
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text.slice(0, 500) }
    }
  } catch (e: any) {
    sentence = `The server did not answer: ${String(e?.message ?? e)}`
  }
  const ms = Math.round(performance.now() - t0)
  const ok = status >= 200 && status < 300
  if (!ok && !sentence) {
    const err = json?.error
    sentence = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : null
    code = typeof err?.code === 'string' ? err.code : undefined
  }
  ctx.ledger.record({
    at: started.toISOString(), seat: actor.key, method: 'POST', path, status, ms,
    ...(sentence ? { sentence } : {}), ...(code ? { code } : {}),
    ...(expecting.getStore() ? { expected: true } : {}),
  })
  return { status, json, ms, ok, sentence }
}

// ── The count ────────────────────────────────────────────────────────

/** The four moves a paper makes between parties, each counted once. */
export type Move = 'sent' | 'received' | 'examined' | 'verdict'

class PaperCount {
  readonly byKind = new Map<string, Record<Move, number>>()
  bytes = 0
  files = 0
  sentBack = 0

  count(kind: string, move: Move, n = 1): void {
    const row = this.byKind.get(kind) ?? { sent: 0, received: 0, examined: 0, verdict: 0 }
    row[move] += n
    this.byKind.set(kind, row)
  }

  stored(file: PaperFile): void {
    this.bytes += file.bytes.length
    this.files += 1
  }

  get total(): number {
    let n = 0
    for (const r of this.byKind.values()) n += r.sent + r.received + r.examined + r.verdict
    return n
  }

  /** "W-9 412 (sent 104, received 104, examined 104 …)", largest first. */
  says(): string {
    const rows = [...this.byKind.entries()]
      .map(([k, r]) => ({ k, r, n: r.sent + r.received + r.examined + r.verdict }))
      .sort((a, b) => b.n - a.n)
    return rows
      .map(({ k, r, n }) =>
        `${k} ${n.toLocaleString('en-US')} (` +
        (['sent', 'received', 'examined', 'verdict'] as Move[]).filter((m) => r[m]).map((m) => `${m} ${r[m]}`).join(', ') + ')'
      )
      .join('; ')
  }
}

/** One count for the whole run, across both stations. */
export const papers = new PaperCount()

export function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}
