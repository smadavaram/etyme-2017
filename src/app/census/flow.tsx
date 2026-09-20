'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CENSUS_COPY,
  NOTHING_YET,
  stepsSoFar,
  type FlowState,
} from '@/lib/census-copy'
import { ACCEPTED, checkWorkEmail } from '@/lib/census'

/**
 * The four steps of asking for a census, on one page.
 *
 * ── Why one page and not `/census/[id]` ──────────────────────────────
 *
 * Both were allowed and this is the choice. A census has no account
 * behind it, so a URL of its own would have to carry something that
 * stands in for one — the id at least, and the upload token to be any
 * use. A credential in a URL is a credential in a browser history, in a
 * corporate proxy log and in whatever the reader pastes into their own
 * chat. The token that lets somebody send files into this census is the
 * one thing here worth stealing.
 *
 * So the steps happen in this component's own state, in one session,
 * and nothing that identifies the census is ever in the address bar.
 * What survives a closed tab is the census row and the person running
 * it, who writes back by hand.
 *
 * ── The one thing that does arrive in the address bar ────────────────
 *
 * Closed above with the letter, on 2026-09-20. Somebody who closes this
 * tab between accepting the agreement and uploading used to have no way
 * back in; the agreed letter now carries `/census?token=…`
 * (`censusUploadUrl`), and this page reads it.
 *
 * It is read **once**, on arrival, and then taken straight back out
 * with `history.replaceState`. The paragraph above is the reason and
 * nothing about it has softened: the token is the one thing here worth
 * stealing, and a URL is copied into chat windows, read by proxies and
 * kept in a history that outlives the tab. So the arrival URL is the
 * only place it is ever written, the page tells the reader it has gone,
 * and what is left in the address bar is `/census`.
 *
 * The token is proof the first two steps happened — acceptance mints
 * one and nothing else does — so `currentStep` opens at the upload
 * step, and the asking and the accepting are not redrawn at somebody
 * who did them days ago.
 *
 * ── A step not yet reached is not drawn ──────────────────────────────
 *
 * `stepsSoFar` returns the steps up to the one somebody is on and no
 * further, and only the last of them carries a button. A disabled
 * button is a question the reader cannot answer, on a page whose whole
 * argument is that we say what happens before it happens.
 */

type Busy = null | 'ASK' | 'AGREE' | 'UPLOAD'

interface Refused {
  name: string
  says: string
}

const FIELD =
  'mt-2 w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-3 text-[16px] ' +
  'text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-ink focus:outline-none'

const BUTTON =
  'mt-6 rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white shadow-sm ' +
  'transition-opacity hover:opacity-90 disabled:opacity-60'

/** What the file picker offers, read off the list the upload route checks. */
const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED).join(',')

/**
 * What a client reads where this deployment has named nobody.
 *
 * Not `assignmentSays(null)`, which tells the reader to set
 * `ETYME_STAFF_EMAILS` — a true sentence written for staff, and a
 * client reading it learns that the promise of a named person is
 * unconfigured. The census row is still written and somebody still
 * picks it up, so this says that and nothing it cannot stand behind.
 */
const NOBODY_ASSIGNED_YET =
  'Your census is written down. The person who picks it up writes to you by name.'

export function CensusFlow() {
  const [state, setState] = useState<FlowState>(NOTHING_YET)
  const [busy, setBusy] = useState<Busy>(null)

  /**
   * The link from the agreed letter, read once and taken back out.
   *
   * In an effect rather than in the initial state on purpose: this
   * component is rendered on the server too, where there is no address
   * bar, and a first client render that disagreed with the server's
   * would be a hydration error. So the page paints, the token is read,
   * and the state moves to the upload step in the same tick.
   *
   * `replaceState` rather than `push`, so Back goes where the reader
   * came from rather than back onto a URL carrying the token. The
   * search is rebuilt without it and any other parameter is left alone.
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('token')
    if (!token) return
    setState({ requestId: null, uploadToken: token, receiptSays: null, arrivedByLink: true })
    url.searchParams.delete('token')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  /**
   * And put the step in front of them.
   *
   * Everything above this component — what a census gives back, what to
   * send, the six promises — is written for somebody deciding whether
   * to ask for one. This reader decided days ago and clicked a link
   * that said send your files. Landing four screens above the only
   * thing they came to do is the same bug as landing on step one, one
   * scroll further down.
   *
   * A second effect because the panel does not exist until the state
   * set above has drawn it, and it runs once: after an upload
   * `receiptSays` is set and this stops moving the page under somebody
   * reading their own receipt.
   */
  useEffect(() => {
    if (!state.arrivedByLink || state.receiptSays) return
    document.getElementById('census-arrived')?.scrollIntoView({ block: 'start' })
  }, [state.arrivedByLink, state.receiptSays])

  // The form
  const [contactName, setContactName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [desk, setDesk] = useState<string>('PROGRAM')
  const [supplierCount, setSupplierCount] = useState('')
  const [option, setOption] = useState<string>('TEMPLATE')
  const [emailSays, setEmailSays] = useState<string | null>(null)
  const [askSays, setAskSays] = useState<string | null>(null)

  // What each step left behind, in the software's own sentences.
  const [queueSays, setQueueSays] = useState<string | null>(null)
  const [assignedSays, setAssignedSays] = useState<string | null>(null)
  const [agreementHref, setAgreementHref] = useState<string>(CENSUS_COPY.promise.agreementHref)
  const [agreedSays, setAgreedSays] = useState<string | null>(null)

  // Accepting it
  const [acceptedBy, setAcceptedBy] = useState('')
  const [agreeSays, setAgreeSays] = useState<string | null>(null)

  // Sending the files
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploadSays, setUploadSays] = useState<string | null>(null)
  const [refused, setRefused] = useState<Refused[]>([])

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    setAskSays(null)

    // Checked here in the software's own words before a round trip, so
    // somebody typing a personal address reads the same sentence the
    // route would have sent back.
    const email = checkWorkEmail(workEmail)
    if (!email.ok) {
      setEmailSays(email.says)
      return
    }
    setEmailSays(null)

    setBusy('ASK')
    try {
      const res = await fetch('/api/census/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          contactName,
          workEmail,
          desk,
          option,
          supplierCount: supplierCount.trim() === '' ? null : Number(supplierCount),
        }),
      })
      const json = await res.json().catch(() => ({}) as Record<string, never>)
      if (!res.ok) {
        setBusy(null)
        setAskSays(json?.error?.message ?? CENSUS_COPY.form.failed)
        return
      }
      setQueueSays(json?.data?.queueSays ?? null)
      // `assignmentSays` is written for the person at Etyme who reads
      // the queue: with `ETYME_STAFF_EMAILS` unset it says which
      // variable to set on this deployment. That sentence is true and
      // it is not the client's to read, so the name is shown when there
      // is one and a line of our own stands in when there is not.
      setAssignedSays(
        typeof json?.data?.assignedTo === 'string' && json.data.assignedTo.length > 0
          ? (json?.data?.assignedSays ?? null)
          : NOBODY_ASSIGNED_YET
      )
      if (typeof json?.data?.agreement?.href === 'string') setAgreementHref(json.data.agreement.href)
      setState((s) => ({ ...s, requestId: json?.data?.id ?? null }))
      setBusy(null)
    } catch {
      setBusy(null)
      setAskSays(CENSUS_COPY.form.failed)
    }
  }

  async function agree(e: React.FormEvent) {
    e.preventDefault()
    setAgreeSays(null)
    setBusy('AGREE')
    try {
      const res = await fetch('/api/census/agree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.requestId, acceptedBy, workEmail }),
      })
      const json = await res.json().catch(() => ({}) as Record<string, never>)
      if (!res.ok) {
        setBusy(null)
        setAgreeSays(json?.error?.message ?? CENSUS_COPY.form.failed)
        return
      }
      setAgreedSays(json?.data?.says ?? null)
      setState((s) => ({ ...s, uploadToken: json?.data?.uploadToken ?? null }))
      setBusy(null)
    } catch {
      setBusy(null)
      setAgreeSays(CENSUS_COPY.form.failed)
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    setUploadSays(null)
    setRefused([])
    if (!files || files.length === 0) {
      setUploadSays('Nothing is chosen yet. Pick the filled template, or your own files.')
      return
    }
    setBusy('UPLOAD')
    try {
      const form = new FormData()
      for (const file of Array.from(files)) form.append('files', file)
      form.append('token', state.uploadToken ?? '')
      const res = await fetch('/api/census/upload', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}) as Record<string, never>)
      if (!res.ok) {
        setBusy(null)
        setRefused(Array.isArray(json?.error?.refused) ? json.error.refused : [])
        setUploadSays(json?.error?.message ?? CENSUS_COPY.form.failed)
        return
      }
      setRefused(Array.isArray(json?.data?.refused) ? json.data.refused : [])
      // The receipt sentence the route built, which carries the date the
      // nightly sweep reads. Never recomputed here.
      setState((s) => ({ ...s, receiptSays: json?.data?.says ?? null }))
      setBusy(null)
    } catch {
      setBusy(null)
      setUploadSays(CENSUS_COPY.form.failed)
    }
  }

  const steps = stepsSoFar(state)

  return (
    <div className="space-y-8">
      {/* Where the reader came from, and where the link went. Drawn
          only for an arrival, because it is the only case in which the
          page skips two steps and rewrites the address bar under
          somebody. Both sentences are in `census-copy` with every other
          thing a visitor reads, so they are inside the length rule and
          the price rule. */}
      {state.arrivedByLink && (
        <section
          id="census-arrived"
          className="rounded-xl border border-etyme-rule bg-etyme-surface p-5 sm:p-6"
        >
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-etyme-ink">
            {CENSUS_COPY.arrival.says}
          </p>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-etyme-muted">
            {CENSUS_COPY.arrival.tokenSays}
          </p>
        </section>
      )}

      {steps.map((step) => (
        <section
          key={step.key}
          id={`census-step-${step.key.toLowerCase()}`}
          className="rounded-xl border border-etyme-rule bg-etyme-raised p-5 sm:p-6"
        >
          <h2 className="max-w-[30ch] text-balance font-serif text-2xl leading-tight tracking-[-0.02em] text-etyme-ink">
            {step.heading}
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-etyme-muted">
            {step.says}
          </p>

          {/* ── Ask ─────────────────────────────────────────── */}
          {step.key === 'ASK' && step.button && (
            <form onSubmit={ask} noValidate className="mt-6 max-w-xl">
              <label htmlFor="census-name" className="stat-label block">
                {CENSUS_COPY.form.nameLabel}
              </label>
              <input
                id="census-name"
                type="text"
                autoComplete="name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={FIELD}
              />
              <p className="mt-1.5 text-[13px] text-etyme-muted">{CENSUS_COPY.form.nameHint}</p>

              <label htmlFor="census-company" className="stat-label mt-6 block">
                {CENSUS_COPY.form.companyLabel}
              </label>
              <input
                id="census-company"
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={FIELD}
              />
              <p className="mt-1.5 text-[13px] text-etyme-muted">{CENSUS_COPY.form.companyHint}</p>

              <label htmlFor="census-email" className="stat-label mt-6 block">
                {CENSUS_COPY.form.emailLabel}
              </label>
              <input
                id="census-email"
                type="text"
                inputMode="email"
                autoComplete="email"
                value={workEmail}
                onChange={(e) => {
                  setWorkEmail(e.target.value)
                  setEmailSays(null)
                }}
                onBlur={() => {
                  if (workEmail.trim().length === 0) return
                  const verdict = checkWorkEmail(workEmail)
                  setEmailSays(verdict.ok ? null : verdict.says)
                }}
                placeholder="you@yourcompany.com"
                className={FIELD}
              />
              {/* The refusal for a personal address, in the words the
                  route would have sent back rather than a second copy. */}
              {emailSays ? (
                <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-etyme-attention">
                  {emailSays}
                </p>
              ) : (
                <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-etyme-muted">
                  {CENSUS_COPY.form.emailHint}
                </p>
              )}

              <fieldset className="mt-6">
                <legend className="stat-label">{CENSUS_COPY.form.deskLabel}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CENSUS_COPY.desks.map((d) => (
                    <label
                      key={d.value}
                      className="flex items-center gap-2 rounded-lg border border-etyme-rule
                                 bg-etyme-surface px-4 py-3 text-[15px] text-etyme-ink"
                    >
                      <input
                        type="radio"
                        name="desk"
                        value={d.value}
                        checked={desk === d.value}
                        onChange={() => setDesk(d.value)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[13px] text-etyme-muted">{CENSUS_COPY.form.deskHint}</p>
              </fieldset>

              <label htmlFor="census-suppliers" className="stat-label mt-6 block">
                {CENSUS_COPY.form.suppliersLabel}
              </label>
              <input
                id="census-suppliers"
                type="text"
                inputMode="numeric"
                value={supplierCount}
                onChange={(e) => setSupplierCount(e.target.value.replace(/[^0-9]/g, ''))}
                className={FIELD}
              />
              <p className="mt-1.5 text-[13px] text-etyme-muted">
                {CENSUS_COPY.form.suppliersHint}
              </p>

              <fieldset className="mt-6">
                <legend className="stat-label">{CENSUS_COPY.form.optionLabel}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CENSUS_COPY.options.map((o) => (
                    <label
                      key={o.value}
                      className="flex items-center gap-2 rounded-lg border border-etyme-rule
                                 bg-etyme-surface px-4 py-3 text-[15px] text-etyme-ink"
                    >
                      <input
                        type="radio"
                        name="option"
                        value={o.value}
                        checked={option === o.value}
                        onChange={() => setOption(o.value)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="submit" disabled={busy === 'ASK'} className={BUTTON}>
                {busy === 'ASK' ? CENSUS_COPY.form.sending : step.button}
              </button>

              {askSays && (
                <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-etyme-attention">
                  {askSays}
                </p>
              )}
            </form>
          )}

          {/* What the ask left behind, once it is a step somebody has
              passed: the queue sentence and the named person, in the
              words the route returned. */}
          {step.key === 'ASK' && !step.button && (
            <div className="mt-4 space-y-2 border-t border-etyme-rule pt-4">
              {queueSays && <p className="text-[15px] leading-relaxed text-etyme-ink">{queueSays}</p>}
              {assignedSays && (
                <p className="text-[14px] leading-relaxed text-etyme-muted">{assignedSays}</p>
              )}
            </div>
          )}

          {/* ── Accept ──────────────────────────────────────── */}
          {step.key === 'AGREE' && step.button && (
            <form onSubmit={agree} noValidate className="mt-6 max-w-xl">
              <Link
                href={agreementHref as '/legal/census-agreement'}
                className="text-[15px] text-etyme-action underline underline-offset-4 hover:opacity-80"
              >
                {CENSUS_COPY.promise.agreementLabel}
              </Link>
              <p className="mt-2 text-[13px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.promise.versionSays}
              </p>

              <label htmlFor="census-accepted-by" className="stat-label mt-6 block">
                Who is accepting it?
              </label>
              <input
                id="census-accepted-by"
                type="text"
                value={acceptedBy}
                onChange={(e) => setAcceptedBy(e.target.value)}
                placeholder="Their full name"
                className={FIELD}
              />
              <p className="mt-1.5 text-[13px] text-etyme-muted">
                The record says who accepted it and which edition, so type the name as they use it.
              </p>

              <button type="submit" disabled={busy === 'AGREE'} className={BUTTON}>
                {busy === 'AGREE' ? CENSUS_COPY.form.sending : step.button}
              </button>

              {agreeSays && (
                <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-etyme-attention">
                  {agreeSays}
                </p>
              )}
            </form>
          )}

          {step.key === 'AGREE' && !step.button && agreedSays && (
            <p className="mt-4 max-w-[60ch] border-t border-etyme-rule pt-4 text-[15px]
                          leading-relaxed text-etyme-ink">
              {agreedSays}
            </p>
          )}

          {/* ── Send ────────────────────────────────────────── */}
          {step.key === 'UPLOAD' && step.button && (
            <form onSubmit={upload} noValidate className="mt-6 max-w-xl">
              <input
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                onChange={(e) => setFiles(e.target.files)}
                className="mt-2 block w-full text-[15px] text-etyme-ink
                           file:mr-4 file:rounded-lg file:border file:border-etyme-rule
                           file:bg-etyme-surface file:px-4 file:py-2.5 file:text-[14px]
                           file:font-medium file:text-etyme-ink"
              />
              <button type="submit" disabled={busy === 'UPLOAD'} className={BUTTON}>
                {busy === 'UPLOAD' ? CENSUS_COPY.form.sending : step.button}
              </button>

              {uploadSays && (
                <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-etyme-attention">
                  {uploadSays}
                </p>
              )}
              {refused.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {refused.map((r) => (
                    <li key={r.name} className="text-[13px] leading-relaxed text-etyme-attention">
                      {r.says}
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}

          {/* ── Received ────────────────────────────────────── */}
          {step.key === 'DONE' && (
            <div className="mt-4 space-y-3 border-t border-etyme-rule pt-4">
              {/* The receipt sentence the upload route built, carrying
                  the one date every other part of this reads. */}
              {state.receiptSays && (
                <p className="text-[15px] leading-relaxed text-etyme-ink">{state.receiptSays}</p>
              )}
              {refused.length > 0 && (
                <ul className="space-y-2">
                  {refused.map((r) => (
                    <li key={r.name} className="text-[13px] leading-relaxed text-etyme-attention">
                      {r.says}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
