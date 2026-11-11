'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { Check, ErrorState, Field, Input, LoadingState, PageHead, Panel, RefusedState, Select, SubmitButton, Textarea, Chip } from '@/components/ui'
import { momentFor, readerZone } from '@/lib/when'
import { SIGN_IN_SCREEN_MODES, modeOptionSays, eventWords, sourceWords } from '@/lib/identity/screen-words'

/**
 * Settings → Sign-in (founder, 2026-11-11, "Enterprise identity"): how the
 * company's people sign in. The Owner sets it; an Admin reads it.
 *
 * Every question a route on this page asks has a field here: the mode and
 * its reason (PATCH /api/settings/sign-in, with just-in-time, SCIM, the
 * assurance level, the data region and the supplier rule); the directory
 * (PUT /api/settings/sign-in/directory: kind, label, issuer, client id,
 * discovery address, secret or its secret-store name, the three claim
 * names, SAML's entity id and certificate, on or off, and why); the SCIM
 * token; a group's id, name and role; and "Sign out everywhere" per person.
 * The assurance level and the data region are recorded and said so: they
 * are not yet enforced.
 */

type Overview = {
  mode: string | null
  effective: string
  says: string
  jit: boolean
  scim: boolean
  requiredAssurance: string | null
  dataRegion: string | null
  requireDirectorySuppliers: boolean
  setBy: string | null
  setAt: string | null
  reason: string | null
  mayChange: boolean
  slug: string
  domains: string[]
  directory: null | {
    type: string; label: string | null; issuer: string; clientId: string | null; metadataUrl: string | null
    entityId: string | null; hasCertificate: boolean; secret: string
    subjectClaim: string | null; emailClaim: string | null; groupsClaim: string | null; enabled: boolean; isMock: boolean
  }
  scimBase: string
  scimToken: null | { last4: string; createdAt: string; lastUsedAt: string | null }
  groups: { id: string; groupId: string; groupName: string | null; role: string }[]
  roles: { id: string; name: string }[]
  people: { contextId: string; personId: string; name: string; email: string; role: string | null; source: string | null; paused: boolean }[]
  events: { id: string; at: string; action: string; allowed: boolean; surface: string | null; says: string }[]
}

/** The route's answer, keeping the field and the status a refusal names, so the sentence lands beside its field. */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!res.ok) {
    const e: any = new Error(body?.error?.message ?? `That did not go through (${res.status}).`)
    e.status = res.status
    e.field = body?.error?.field ?? null
    throw e
  }
  return body as T
}

const when = (iso: string | null) => (iso ? momentFor(new Date(iso), readerZone()) : '')

export default function SignInSettings() {
  const eyebrow = usePageSection('/dashboard/settings/sign-in')
  const [o, setO] = useState<Overview | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [token, setToken] = useState<string | null>(null)
  const [test, setTest] = useState<string | null>(null)
  const [mock, setMock] = useState<{ id: string; name: string; email: string; enabled: boolean }[] | null>(null)

  // The mode form
  const [mode, setMode] = useState('HYBRID')
  const [reason, setReason] = useState('')
  const [jit, setJit] = useState(false)
  const [scim, setScim] = useState(false)
  const [assurance, setAssurance] = useState('')
  const [region, setRegion] = useState('')
  const [dirSuppliers, setDirSuppliers] = useState(false)
  // The directory form
  const [d, setD] = useState({ type: 'OIDC', label: '', issuer: '', clientId: '', metadataUrl: '', secret: '', secretRef: '', subjectClaim: '', emailClaim: '', groupsClaim: '', entityId: '', certificate: '', enabled: false, reason: '' })
  // A group row
  const [g, setG] = useState({ groupId: '', groupName: '', roleId: '' })

  const load = useCallback(async () => {
    try {
      const j = await readJson<{ data: Overview }>(await fetch('/api/settings/sign-in/overview'))
      const v = j.data
      setO(v)
      setMode(v.mode ?? 'HYBRID'); setJit(v.jit); setScim(v.scim); setAssurance(v.requiredAssurance ?? ''); setRegion(v.dataRegion ?? ''); setDirSuppliers(v.requireDirectorySuppliers)
      if (v.directory) {
        setD((x) => ({
          ...x, type: v.directory!.type, label: v.directory!.label ?? '', issuer: v.directory!.issuer, clientId: v.directory!.clientId ?? '',
          metadataUrl: v.directory!.metadataUrl ?? '', subjectClaim: v.directory!.subjectClaim ?? '', emailClaim: v.directory!.emailClaim ?? '',
          groupsClaim: v.directory!.groupsClaim ?? '', entityId: v.directory!.entityId ?? '', enabled: v.directory!.enabled,
        }))
        if (v.directory.isMock) {
          const m = await fetch(`/api/mock-directory/${encodeURIComponent(v.slug)}/people`).then((r) => r.json()).catch(() => null)
          setMock(m?.data ?? null)
        }
      }
    } catch (e: any) {
      if (e?.status === 403) setRefused(e.message)
      else setError(e?.message ?? 'Could not read how your people sign in.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function send(key: string, url: string, method: string, body?: unknown) {
    setBusy(key); setSaid(null); setFieldError({})
    try {
      const j = await readJson<{ data: { says?: string; token?: string; ok?: boolean } }>(await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      }))
      if (j.data.token) setToken(j.data.token)
      if (key === 'test') setTest(j.data.says ?? null)
      else setSaid(j.data.says ?? 'Saved.')
      await load()
    } catch (e: any) {
      if (e?.field) setFieldError({ [e.field]: e.message })
      else setSaid(e?.message ?? 'That did not go through.')
    } finally {
      setBusy(null)
    }
  }

  if (refused) return <RefusedState says={refused} />
  if (error) return <ErrorState says={error} />
  if (!o) return <LoadingState says="Reading how your people sign in…" />
  const can = o.mayChange
  const isSaml = d.type === 'SAML'

  return (
    <div className="space-y-6">
      <PageHead eyebrow={eyebrow} title="Sign-in" subtitle={o.says} />
      {said && <p role="status" className="text-sm text-etyme-ink">{said}</p>}
      {!can && <p className="text-[13px] text-etyme-muted">You can read this page. Only an Owner changes how people sign in.</p>}

      <Panel title="How your people sign in" subtitle={o.setAt ? `Set by ${o.setBy ?? 'somebody'} on ${when(o.setAt)}${o.reason ? `: ${o.reason}` : ''}.` : 'Nothing is set yet.'}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void send('mode', '/api/settings/sign-in', 'PATCH', { mode, reason, jit, scim, requiredAssurance: assurance, dataRegion: region, requireDirectorySuppliers: dirSuppliers }) }}>
          <fieldset className="space-y-2" disabled={!can}>
            {SIGN_IN_SCREEN_MODES.map((m) => (
              <label key={m.mode} className="flex items-start gap-2 text-[13px] text-etyme-ink">
                <input type="radio" name="mode" value={m.mode} checked={mode === m.mode} onChange={() => setMode(m.mode)} className="mt-1 accent-etyme-action" />
                <span><span className="font-medium">{m.label}.</span> {modeOptionSays(m.mode)}</span>
              </label>
            ))}
          </fieldset>
          {fieldError.mode && <p role="alert" className="text-[12px] text-etyme-danger">{fieldError.mode}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Check label="Seat a person the first time they sign in through your company's directory" checked={jit} disabled={!can} onChange={(e) => setJit(e.target.checked)} />
            <Check label="Your company's directory adds and removes people by SCIM" checked={scim} disabled={!can} onChange={(e) => setScim(e.target.checked)} />
            <Check label="Approve only suppliers whose people sign in through their own directory" checked={dirSuppliers} disabled={!can} onChange={(e) => setDirSuppliers(e.target.checked)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Assurance level your directory must assert" help="Recorded, not yet enforced. For a government's identity provider, as it names the level.">
              <Input value={assurance} disabled={!can} onChange={(e) => setAssurance(e.target.value)} />
            </Field>
            <Field label="Where your data must stay" help="Recorded, not yet enforced: Etyme runs in one region today.">
              <Input value={region} disabled={!can} onChange={(e) => setRegion(e.target.value)} />
            </Field>
          </div>
          <Field label="Why" help="Kept beside the change, with your name and the time." error={fieldError.reason}>
            <Input value={reason} disabled={!can} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {can && <SubmitButton pending={busy === 'mode'} disabled={!reason.trim()}>Save how people sign in</SubmitButton>}
        </form>
      </Panel>

      <Panel title="Verified domains" subtitle="An address on one of these is governed by this page at every sign-in door.">
        {o.domains.length ? <ul className="flex flex-wrap gap-2">{o.domains.map((x) => <li key={x}><Chip tone="verified">{x}</Chip></li>)}</ul>
          : <p className="text-[13px] text-etyme-muted">No verified domain yet. Verify one in Setup; directory only needs it.</p>}
      </Panel>

      <Panel title="Your company's directory" subtitle={o.directory ? `${o.directory.enabled ? 'On' : 'Off'}${o.directory.isMock ? ' · the demo’s mock directory' : ''} · secret ${o.directory.secret}` : 'Not connected.'}
        action={o.directory ? <SubmitButton tone="secondary" type="button" pending={busy === 'test'} onClick={() => void send('test', '/api/settings/sign-in/directory/test', 'POST')}>Test</SubmitButton> : null}>
        {test && <p role="status" className="mb-3 text-[13px] text-etyme-ink">{test}</p>}
        {isSaml && <p className="mb-3 text-[13px] text-etyme-attention">SAML is stored and not built yet in this pass. Nobody can sign in through it until it is.</p>}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send('dir', '/api/settings/sign-in/directory', 'PUT', d) }}>
          <fieldset disabled={!can} className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" error={fieldError.type}>
              <Select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
                <option value="OIDC">OpenID Connect</option>
                <option value="ENTRA">Microsoft Entra ID</option>
                <option value="GOOGLE_WORKSPACE">Google Workspace</option>
                <option value="SAML">SAML 2.0 (stored, not built)</option>
              </Select>
            </Field>
            <Field label="Name on this page"><Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} /></Field>
            <Field label={isSaml ? 'Entity id (issuer)' : 'Issuer'} error={fieldError.issuer} help="Exactly as your directory signs its tokens.">
              <Input value={d.issuer} onChange={(e) => setD({ ...d, issuer: e.target.value })} />
            </Field>
            <Field label="Discovery address" help="Leave empty to use the issuer's /.well-known/openid-configuration." error={fieldError.metadataUrl}>
              <Input value={d.metadataUrl} onChange={(e) => setD({ ...d, metadataUrl: e.target.value })} />
            </Field>
            <Field label="Client id" error={fieldError.clientId}><Input value={d.clientId} onChange={(e) => setD({ ...d, clientId: e.target.value })} /></Field>
            <Field label="Client secret" help="Locked before it is stored, and never shown again. Or give its secret-store name below." error={fieldError.secret}>
              <Input type="password" autoComplete="off" value={d.secret} onChange={(e) => setD({ ...d, secret: e.target.value })} />
            </Field>
            <Field label="Secret-store name" help="ETYME_IDP_<NAME>, set in the platform's secret store." error={fieldError.secretRef}>
              <Input value={d.secretRef} onChange={(e) => setD({ ...d, secretRef: e.target.value })} />
            </Field>
            <Field label="Claim that names the person" help="sub by default. Its value must be the externalId your directory sends by SCIM."><Input value={d.subjectClaim} onChange={(e) => setD({ ...d, subjectClaim: e.target.value })} /></Field>
            <Field label="Claim that carries the email" help="email by default. Shown, never trusted as who the person is."><Input value={d.emailClaim} onChange={(e) => setD({ ...d, emailClaim: e.target.value })} /></Field>
            <Field label="Claim that carries the groups" help="groups by default."><Input value={d.groupsClaim} onChange={(e) => setD({ ...d, groupsClaim: e.target.value })} /></Field>
            {isSaml && (
              <>
                <Field label="Etyme's entity id for you"><Input value={d.entityId} onChange={(e) => setD({ ...d, entityId: e.target.value })} /></Field>
                <Field label="Signing certificate (PEM)"><Textarea value={d.certificate} onChange={(e) => setD({ ...d, certificate: e.target.value })} /></Field>
              </>
            )}
          </fieldset>
          <Check label="Turn it on (runs the test first)" checked={d.enabled} disabled={!can} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />
          {fieldError.enabled && <p role="alert" className="text-[12px] text-etyme-danger">{fieldError.enabled}</p>}
          <Field label="Why" error={fieldError.reason}><Input value={d.reason} disabled={!can} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
          {can && <SubmitButton pending={busy === 'dir'} disabled={!d.reason.trim()}>Save the directory</SubmitButton>}
        </form>
      </Panel>

      {mock && (
        <Panel title="People at the mock directory" subtitle="The demo's stand-in for a company directory. Turning somebody off here is what a real directory does by SCIM: their seat pauses and every session ends.">
          <ul className="divide-y divide-etyme-rule">
            {mock.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span><span className="text-etyme-ink">{p.name}</span> <span className="text-etyme-muted">{p.email}</span></span>
                <SubmitButton tone="secondary" type="button" pending={busy === `mock-${p.id}`}
                  onClick={() => void send(`mock-${p.id}`, `/api/mock-directory/${encodeURIComponent(o.slug)}/people`, 'PATCH', { id: p.id, enabled: !p.enabled })}>
                  {p.enabled ? 'Turn off in the directory' : 'Turn back on'}
                </SubmitButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="SCIM" subtitle={`Your directory adds and removes people at ${o.scimBase}. ${o.scim ? 'On.' : 'Off: turn it on above.'}`}>
        {token && (
          <div className="mb-3 rounded-box border border-etyme-attention/40 bg-etyme-canvas p-3">
            <p className="text-[12px] text-etyme-attention">Copy this token now. It is shown once and never again.</p>
            <code className="mt-1 block break-all font-mono text-[12px] text-etyme-ink">{token}</code>
          </div>
        )}
        <p className="text-[13px] text-etyme-muted">
          {o.scimToken ? `Token ending ${o.scimToken.last4}, issued ${when(o.scimToken.createdAt)}${o.scimToken.lastUsedAt ? `, last used ${when(o.scimToken.lastUsedAt)}` : ', never used yet'}.` : 'No token issued.'}
        </p>
        {can && (
          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton type="button" pending={busy === 'scim'} onClick={() => void send('scim', '/api/settings/sign-in/scim', 'POST')}>{o.scimToken ? 'Replace the token' : 'Issue a token'}</SubmitButton>
            {o.scimToken && <SubmitButton tone="secondary" type="button" pending={busy === 'scim-off'} onClick={() => void send('scim-off', '/api/settings/sign-in/scim', 'DELETE')}>Revoke</SubmitButton>}
          </div>
        )}
      </Panel>

      <Panel title="Directory groups and roles" subtitle="People in a group hold its role here. A group never makes anybody an Owner.">
        <ul className="divide-y divide-etyme-rule">
          {o.groups.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <span><span className="text-etyme-ink">{x.groupName ?? x.groupId}</span> <span className="text-etyme-muted">{x.groupId} · {x.role}</span></span>
              {can && <SubmitButton tone="secondary" type="button" pending={busy === `g-${x.id}`} onClick={() => void send(`g-${x.id}`, `/api/settings/sign-in/groups?id=${encodeURIComponent(x.id)}`, 'DELETE')}>Remove</SubmitButton>}
            </li>
          ))}
          {o.groups.length === 0 && <li className="py-2 text-[13px] text-etyme-muted">No group is mapped yet.</li>}
        </ul>
        {can && (
          <form className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); void send('g', '/api/settings/sign-in/groups', 'POST', g) }}>
            <Field label="Group id in your directory" error={fieldError.groupId}><Input value={g.groupId} onChange={(e) => setG({ ...g, groupId: e.target.value })} /></Field>
            <Field label="Group name"><Input value={g.groupName} onChange={(e) => setG({ ...g, groupName: e.target.value })} /></Field>
            <Field label="Role" error={fieldError.roleId}>
              <Select value={g.roleId} onChange={(e) => setG({ ...g, roleId: e.target.value })}>
                <option value="">Choose a role</option>
                {o.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <SubmitButton pending={busy === 'g'}>Add</SubmitButton>
          </form>
        )}
      </Panel>

      <Panel title="People and their sessions" subtitle="Sign out everywhere ends every session a person holds, on their next click.">
        <ul className="divide-y divide-etyme-rule">
          {o.people.map((p) => (
            <li key={p.contextId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="text-etyme-ink">{p.name}</span> <span className="text-etyme-muted break-all">{p.email}</span>
                <span className="text-etyme-muted"> · {p.role ?? 'No role'} · {sourceWords(p.source)}{p.paused ? ' · paused' : ''}</span>
              </span>
              <SubmitButton tone="secondary" type="button" pending={busy === `s-${p.personId}`} onClick={() => void send(`s-${p.personId}`, '/api/settings/sign-in/sessions', 'POST', { personId: p.personId })}>Sign out everywhere</SubmitButton>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Recent sign-in activity" subtitle="Every sign-in, refusal and change, from the access log.">
        <ul className="divide-y divide-etyme-rule">
          {o.events.map((e) => (
            <li key={e.id} className="py-2 text-[13px]">
              <span className="text-etyme-muted tabular-nums">{when(e.at)}</span>{' '}
              <Chip tone={e.allowed ? 'passive' : 'attention'}>{eventWords(e.action)}</Chip>{' '}
              <span className="text-etyme-ink">{e.says}</span>
            </li>
          ))}
          {o.events.length === 0 && <li className="py-2 text-[13px] text-etyme-muted">Nothing yet.</li>}
        </ul>
      </Panel>
    </div>
  )
}
