/**
 * The HTML part of a letter that carries a link.
 *
 * The founder, on his phone, 2026-11-18, on the invitation email: "those
 * long links look ugly". The letter was plain text with two raw long
 * addresses. Now every letter that carries a link also sends an HTML part
 * beside the text part: one short heading, the same sentences, ONE filled
 * button for the main link and, where the letter offers a second way in, a
 * short text link. The address is never printed in the HTML part.
 *
 * It reads the letter's own plain text (`dressLetter`), so the sentences
 * cannot differ between the two parts and no caller has to change. The
 * plain-text part is left exactly as it was, the address on its own line.
 * Where the text holds an address this cannot dress, it answers null and
 * the letter goes as text alone: never an HTML part that prints an address.
 *
 * Etyme's own look: canvas #F0EEE6, ink #1F1E1D, the one filled button
 * #5228FF with white text, a serif heading, system fonts only, no images,
 * no tracking (no pixel, no redirect: the button is the address itself).
 * No database, no fetch, nothing logged or returned but the markup.
 */

const CANVAS = '#F0EEE6'
const SURFACE = '#FBFAF7'
const INK = '#1F1E1D'
const MUTED = '#6B6862'
const RULE = '#E3DFD5'
const ACTION = '#5228FF'
const ACTION_TEXT = '#4421D6'
const SERIF = "'Iowan Old Style', Palatino, Georgia, serif"
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

const URL_AT = /\s+at\s+(https?:\/\/[^\s]+?)(?=[.,]?(?:\s|$))/
const ANY_URL = /https?:\/\/[^\s]+/
const WORK_ACCOUNT = /^Or sign in with your work account at (https?:\/\/[^\s]+?)\.$/

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** What the one button says, from where its address goes. */
export function buttonLabelFor(href: string): string {
  const path = href.replace(/^https?:\/\/[^/\s]+/, '')
  if (path.startsWith('/reset/')) return 'Set your password'
  if (path.startsWith('/verify/')) return 'Confirm your email'
  if (path.startsWith('/answer/') || path.startsWith('/login')) return 'Sign in'
  return 'Open Etyme'
}

export interface LetterParts {
  heading: string
  paragraphs: string[]
  button: { label: string; href: string } | null
  /** A second way in, as a short text link. */
  textLink: { label: string; href: string } | null
}

/**
 * The letter's plain text read into its parts, or null where it carries no
 * link or carries an address this cannot turn into a button or a text link.
 * Pure.
 */
export function partsOf(subject: string, body: string): LetterParts | null {
  const lines = body.split('\n').map((l) => l.trim())
  let button: LetterParts['button'] = null
  // The main link stands alone on the last line.
  let last = lines.length - 1
  while (last >= 0 && !lines[last]) last--
  if (last >= 0 && /^https?:\/\/\S+$/.test(lines[last])) {
    button = { label: buttonLabelFor(lines[last]), href: lines[last] }
    lines.length = last
  }
  let textLink: LetterParts['textLink'] = null
  const paragraphs: string[] = []
  for (const raw of lines) {
    if (!raw) continue
    const work = raw.match(WORK_ACCOUNT)
    if (work) { textLink = { label: 'Sign in with your work account', href: work[1] }; continue }
    let line = raw
    // A sentence that says "at <address>" loses the address; the button or
    // the link carries it. With no button yet, the first one becomes it.
    for (let m = line.match(URL_AT); m; m = line.match(URL_AT)) {
      if (!button) button = { label: buttonLabelFor(m[1]), href: m[1] }
      line = line.replace(URL_AT, '')
    }
    if (ANY_URL.test(line)) return null
    paragraphs.push(line)
  }
  if (!button && !textLink) return null
  return { heading: subject, paragraphs, button, textLink }
}

/** The page, from its parts. Inline styles and one table, which every mail app draws. Pure. */
export function letterHtml(p: LetterParts): string {
  const e = escapeHtml
  const paras = p.paragraphs
    .map((t) => `<p style="margin:0 0 14px;font:16px/1.5 ${SANS};color:${INK}">${e(t)}</p>`)
    .join('')
  const button = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 18px"><tr><td bgcolor="${ACTION}" style="background:${ACTION};border-radius:8px"><a href="${e(p.button.href)}" style="display:inline-block;padding:14px 26px;font:600 16px/1 ${SANS};color:#FFFFFF;text-decoration:none">${e(p.button.label)}</a></td></tr></table>`
    : ''
  const second = p.textLink
    ? `<p style="margin:0 0 6px;font:15px/1.5 ${SANS}"><a href="${e(p.textLink.href)}" style="color:${ACTION_TEXT};text-decoration:underline">${e(p.textLink.label)}</a></p>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(p.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CANVAS}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${SURFACE};border:1px solid ${RULE};border-radius:12px"><tr><td style="padding:28px 24px">` +
    `<h1 style="margin:0 0 18px;font:600 24px/1.25 ${SERIF};color:${INK}">${e(p.heading)}</h1>${paras}${button}${second}` +
    `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid ${RULE};font:13px/1.4 ${SANS};color:${MUTED}">Etyme</p>` +
    `</td></tr></table></td></tr></table></body></html>`
}

/** The HTML part for a plain-text letter, or null where it carries no link to dress. Pure. */
export function dressLetter(subject: string, body: string): string | null {
  const parts = partsOf(subject, body)
  return parts ? letterHtml(parts) : null
}
