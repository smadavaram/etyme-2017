/**
 * Which attachments are held, and which are refused, and why.
 *
 * Allowed: PDF, PNG, JPEG, Word (.docx), Excel (.xlsx) and CSV. The type
 * is read from the file's own bytes and must agree with its name. A file
 * whose bytes and name disagree — an executable named .pdf — is a
 * disguise, not a mistake, and drops the whole message. A file that is
 * simply not on the list (a .gif, a .zip) is refused on its own and the
 * message is still kept. Nothing here opens a file beyond reading its
 * first bytes and the names inside a Word or Excel package.
 *
 * Pure.
 */

/** The most one file may weigh. */
export const FILE_CAP_BYTES = 10 * 1024 * 1024
/** The most all of a message's files together may weigh. Over it, the whole message is dropped. */
export const MESSAGE_CAP_BYTES = 25 * 1024 * 1024
/** The most files one message may carry. Over it, the whole message is dropped. */
export const MAX_ATTACHMENTS = 10

export type AllowedType =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'text/csv'

const BY_EXTENSION: Record<string, AllowedType> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
}

/** Names that run code where they land. One of these drops the whole message. */
const DANGEROUS = new Set([
  'exe', 'dll', 'com', 'scr', 'pif', 'cpl', 'msi', 'msp', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse',
  'wsf', 'wsh', 'hta', 'jar', 'lnk', 'reg', 'sh', 'app', 'dmg', 'pkg', 'iso', 'img', 'vhd', 'docm', 'xlsm',
  'pptm', 'dotm', 'xltm', 'xlam', 'one', 'html', 'htm', 'svg', 'xhtml', 'mht',
])

export function extensionOf(name: string): string {
  const base = name.trim().toLowerCase().replace(/[\s.]+$/, '')
  const dot = base.lastIndexOf('.')
  return dot < 0 ? '' : base.slice(dot + 1)
}

export type Severity = 'REFUSED' | 'DISGUISED'

export type AttachmentVerdict =
  | { keep: true; contentType: AllowedType; activeContent: boolean }
  | { keep: false; severity: Severity; code: string; says: string }

export interface Declared {
  fileName: string
  sizeBytes: number | null
  /** "inline" for an image inside the message body. */
  disposition: string | null
}

/**
 * What can be decided before a byte is downloaded: a name that runs code,
 * an image inside the body, a file over the cap, a type not on the list.
 */
export function judgeDeclared(d: Declared): AttachmentVerdict | null {
  const name = d.fileName || 'unnamed'
  const ext = extensionOf(name)
  // A name hiding a second extension before the last ("invoice.pdf.exe") is read by its last.
  if (DANGEROUS.has(ext)) {
    return { keep: false, severity: 'DISGUISED', code: 'RUNS_CODE', says: `${name} is a file that runs code, so the whole message was dropped.` }
  }
  if ((d.disposition ?? '').toLowerCase() === 'inline') {
    return { keep: false, severity: 'REFUSED', code: 'INLINE', says: `${name} is a picture inside the message, not an attachment, so it was not kept.` }
  }
  if (d.sizeBytes !== null && d.sizeBytes > FILE_CAP_BYTES) {
    return { keep: false, severity: 'REFUSED', code: 'TOO_LARGE', says: `${name} is larger than 10 MB, so it was not kept.` }
  }
  if (!BY_EXTENSION[ext]) {
    return {
      keep: false,
      severity: 'REFUSED',
      code: 'TYPE_NOT_ALLOWED',
      says: `${name} is not a PDF, picture (PNG or JPEG), Word file, Excel file or CSV, so it was not kept.`,
    }
  }
  return null
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false
  return sig.every((b, i) => bytes[i] === b)
}

function contains(bytes: Uint8Array, ascii: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(ascii, 'latin1'))
}

/** What the bytes are, as far as the first bytes and a package's names say. */
export function sniff(bytes: Uint8Array): AllowedType | 'EXECUTABLE' | 'OLD_OFFICE' | 'MACROS' | 'ZIP' | 'TEXT' | 'UNKNOWN' {
  if (startsWith(bytes, [0x4d, 0x5a])) return 'EXECUTABLE' // MZ: Windows
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return 'EXECUTABLE' // ELF
  if (startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return 'EXECUTABLE' // Mach-O, Java class
  if (startsWith(bytes, [0x23, 0x21])) return 'EXECUTABLE' // #! script
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'OLD_OFFICE' // a .doc, .xls, or a password-protected package
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (contains(bytes, 'vbaProject.bin')) return 'MACROS'
    if (!contains(bytes, '[Content_Types].xml')) return 'ZIP'
    if (contains(bytes, 'word/document.xml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (contains(bytes, 'xl/workbook.xml')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return 'ZIP'
  }
  // Text: valid UTF-8, no NUL, no control characters but tab and line ends.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return 'TEXT'
  } catch {
    // not UTF-8
  }
  return 'UNKNOWN'
}

/** Whether a PDF carries scripts or files of its own. Kept, and said, because the file is never opened here. */
function pdfActive(bytes: Uint8Array): boolean {
  return ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia'].some((k) => contains(bytes, k))
}

/** The verdict on a downloaded file: its bytes against its name, and the cap. */
export function judgeAttachment(fileName: string, bytes: Uint8Array): AttachmentVerdict {
  const name = fileName || 'unnamed'
  const declared = judgeDeclared({ fileName: name, sizeBytes: bytes.byteLength, disposition: null })
  if (declared) return declared
  const claimed = BY_EXTENSION[extensionOf(name)]
  const real = sniff(bytes)

  if (real === 'EXECUTABLE') {
    return { keep: false, severity: 'DISGUISED', code: 'DISGUISED', says: `${name} is named like a document but is a program, so the whole message was dropped.` }
  }
  if (real === 'MACROS') {
    return { keep: false, severity: 'DISGUISED', code: 'MACROS', says: `${name} carries macros, which run code when opened, so the whole message was dropped.` }
  }
  if (real === 'OLD_OFFICE') {
    return {
      keep: false,
      severity: 'REFUSED',
      code: 'OLD_OR_LOCKED',
      says: `${name} is an older or password-protected Office file, which cannot be checked, so it was not kept. Send it as a .docx, .xlsx or PDF.`,
    }
  }
  if (claimed === 'text/csv') {
    if (real === 'TEXT') return { keep: true, contentType: 'text/csv', activeContent: false }
    return { keep: false, severity: 'DISGUISED', code: 'DISGUISED', says: `${name} is named a CSV but its contents are something else, so the whole message was dropped.` }
  }
  if (real !== claimed) {
    return { keep: false, severity: 'DISGUISED', code: 'DISGUISED', says: `${name} is named one kind of file and its contents are another, so the whole message was dropped.` }
  }
  return { keep: true, contentType: claimed, activeContent: claimed === 'application/pdf' && pdfActive(bytes) }
}
