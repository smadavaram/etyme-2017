/**
 * An email body as plain text, and nothing else.
 *
 * HTML is never rendered and never kept: tags go, scripts and styles go
 * with their contents, entities are decoded, and what is left is words.
 * A link keeps its words and its address as text; nothing here, or
 * anywhere in the intake, ever follows one.
 *
 * Pure.
 */

/** The most of a body kept, in characters. A forward longer than this is cut and says so. */
export const BODY_CAP = 100_000

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™', bull: '•',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      // Control characters and anything outside Unicode stay out.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0x7f && code < 0xa0)) return ' '
      return String.fromCodePoint(code)
    }
    return NAMED[e.toLowerCase()] ?? whole
  })
}

export function htmlToText(html: string): string {
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<(script|style|head|title|template|noscript|iframe|object|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, '\n')
  s = s.replace(/<li\b[^>]*>/gi, '• ')
  s = s.replace(/<\/t[dh]\s*>/gi, '\t')
  s = s.replace(/<[^>]*>/g, '')
  s = s.replace(/<[^>]*$/g, '')
  return decodeEntities(s)
}

/** Strip what a text body may not carry: control characters other than tab and newline. */
function clean(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The body to keep. The provider's own text part where there is one;
 * otherwise the HTML turned to text. Never the HTML itself.
 */
export function plainBody(input: { text?: string | null; html?: string | null }): string {
  const fromText = typeof input.text === 'string' && input.text.trim() ? input.text : null
  const raw = fromText ?? (typeof input.html === 'string' ? htmlToText(input.html) : '')
  const body = clean(raw)
  return body.length > BODY_CAP ? body.slice(0, BODY_CAP) + '\n\n[The rest of this message was longer than Etyme keeps, and was not kept.]' : body
}

/** A subject as one plain line. */
export function plainSubject(subject: string | null | undefined): string {
  return clean(decodeEntities(String(subject ?? ''))).replace(/\s+/g, ' ').slice(0, 300)
}
