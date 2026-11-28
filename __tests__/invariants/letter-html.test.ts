/**
 * A letter that carries a link sends an HTML part beside its text part
 * (founder, 2026-11-18: "those long links look ugly").
 */
import { describe, it, expect } from 'vitest'
import { inviteLetter, INVITE_LINK_HOURS } from '@/lib/access-grant'
import { dressLetter, buttonLabelFor } from '@/lib/notify/letter-html'
import { sendEmailNow } from '@/lib/notify/send-now'
import { emailSender } from '@/lib/senders'
import type { Sender } from '@/lib/notification-delivery'

const SET = 'https://app.example/reset/EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE'
const LOGIN = 'https://app.example/login'
const letter = inviteLetter({
  door: 'PASSWORD', companyName: 'Corvane Packaging', roleName: 'Admin',
  setPasswordUrl: SET, loginUrl: LOGIN, linkHours: INVITE_LINK_HOURS, workAccount: true,
})
const text = [...letter.lines, '', letter.link].join('\n')
const SUBJECT = 'Sharath invited you to Corvane Packaging'

describe('the invitation email', () => {
  const html = dressLetter(SUBJECT, text)!

  it('shows one button and prints no raw address in its HTML part', () => {
    expect(html).not.toBeNull()
    expect((html.match(/background:#5228FF/g) ?? []).length).toBe(1)
    expect(html).toContain('>Set your password</a>')
    const shown = html.replace(/<[^>]*>/g, ' ')
    expect(shown).not.toMatch(/https?:\/\//)
    expect(html).toContain(`href="${SET}"`)
  })

  it('offers the work account as a short text link, not a printed address', () => {
    expect(html).toContain('>Sign in with your work account</a>')
    expect(html).toContain(`href="${LOGIN}"`)
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/work account at/)
  })

  it('keeps the same sentences in the HTML part', () => {
    expect(html).toContain('Set your password and you are signed in. You are in Corvane Packaging as Admin.')
    expect(html).toContain('The link works once, for 3 days. After that, use &quot;Forgot password&quot; on the sign-in page.')
  })

  it('draws in Etyme’s own colors with system fonts and no images or tracking', () => {
    expect(html).toContain('#F0EEE6')
    expect(html).toContain('#1F1E1D')
    expect(html).toContain('Georgia')
    expect(html).not.toMatch(/<img|<script|<link|url\(|@import/i)
  })

  it('goes out with the plain-text part still carrying the link on its own line', async () => {
    const sent: unknown[][] = []
    const sender: Sender = { channel: 'EMAIL', async send(...a) { sent.push(a) } }
    const out = await sendEmailNow({ to: 'a@firm-mail.org', subject: SUBJECT, body: text }, { sender })
    expect(out.left).toBe(true)
    const [, , body, , sentHtml] = sent[0] as string[]
    expect(body.split('\n')).toContain(SET)
    expect(sentHtml).toContain('Set your password')
  })
})

describe('the password reset email', () => {
  it('shows one Set your password button and no printed address', () => {
    const t = ['Somebody asked.', 'Click the link to set a new password. It works once, for 1 hour.', '', SET].join('\n')
    const html = dressLetter('Set your Etyme password', t)!
    expect(html).toContain('>Set your password</a>')
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/https?:\/\//)
  })
})

describe('letters that need no button or no link', () => {
  it('a sign-in letter with the address in a sentence gets a Sign in button and the sentence loses the address', () => {
    const html = dressLetter('S', `Sign in at ${LOGIN} the way you usually do. You are in X as Admin.`)!
    expect(html).toContain('>Sign in</a>')
    expect(html).toContain('Sign in the way you usually do.')
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/https?:\/\//)
  })

  it('a letter with no link is sent as text alone', () => {
    expect(dressLetter('S', 'Nothing to open here.')).toBeNull()
  })

  it('an address it cannot dress leaves the letter as text alone, never a printed address', () => {
    expect(dressLetter('S', `See ${LOGIN}/x for more.`)).toBeNull()
  })

  it('a name or subject with markup is shown as words, never drawn', () => {
    const html = dressLetter('<b>Hi</b>', `Hello <script>.\n\n${SET}`)!
    expect(html).not.toContain('<b>Hi')
    expect(html).not.toContain('<script>')
  })

  it('the button says what it does from where it goes', () => {
    expect(buttonLabelFor('https://a.example/verify/T')).toBe('Confirm your email')
    expect(buttonLabelFor('https://a.example/answer/sign-in/T.S')).toBe('Sign in')
  })

  it('a letter whose sender is given its HTML as nothing goes as text alone', async () => {
    const sent: unknown[][] = []
    const sender: Sender = { channel: 'EMAIL', async send(...a) { sent.push(a) } }
    await sendEmailNow({ to: 'a@firm-mail.org', subject: 'S', body: text, html: null }, { sender })
    expect(sent[0].length).toBe(3)
  })
})

describe('the email provider is handed both parts', () => {
  it('Resend and SendGrid each get the text and the HTML', async () => {
    const calls: { url: string; body: any }[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }) }) as any
    const env = { ...process.env }
    try {
      process.env.NOTIFY_FROM_EMAIL = 'hello@etyme.example'
      process.env.RESEND_API_KEY = 'k'; delete process.env.SENDGRID_API_KEY
      await emailSender()!.send('a@firm-mail.org', 'S', 'T', null, '<p>H</p>')
      delete process.env.RESEND_API_KEY; process.env.SENDGRID_API_KEY = 'k'
      await emailSender()!.send('a@firm-mail.org', 'S', 'T', null, '<p>H</p>')
    } finally { globalThis.fetch = real; process.env = env }
    expect(calls[0].body).toMatchObject({ text: 'T', html: '<p>H</p>' })
    expect(calls[1].body.content).toEqual([{ type: 'text/plain', value: 'T' }, { type: 'text/html', value: '<p>H</p>' }])
  })
})
