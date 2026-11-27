import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { readCredential } from '@/lib/training/learn-read'
import { addToProfileUrl, credentialPath } from '@/lib/training/credential'
import { formatMonth } from '@/lib/format-date'
import { appUrl } from '@/lib/app-url'

/** A shared page is read by strangers and kept out of search engines: the learner chose who gets the link. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * One finished course, shown publicly only with the learner's own yes. The
 * id in the address is checked against the record on every read; a page
 * that is not shown, was taken down, is not complete or belongs to another
 * firm reads as no page at all.
 */
export default async function CredentialPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params
  const r = await readCredential(tenant, id)
  if (!r.ok) notFound()
  const v = r.view
  const add = addToProfileUrl({ courseName: v.courseTitle, issuer: v.issuer, issuedAt: v.completedAt, certUrl: `${appUrl()}${credentialPath(r.tenantSlug, v.code)}`, certId: v.certId })
  return (
    <article className="learn-card" style={{ minHeight: 0 }}>
      <p className="text-sm" style={{ color: '#6B6862' }}>Course completed</p>
      <h1 className="text-2xl my-2" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>{v.courseTitle}{v.trackTitle ? ` — ${v.trackTitle}` : ''}</h1>
      <p><strong>{v.learnerName}</strong> finished this course.</p>
      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-y-1 text-sm">
        <dt style={{ color: '#6B6862' }}>Issued by</dt><dd className="mb-2 sm:mb-0">{v.issuer}</dd>
        <dt style={{ color: '#6B6862' }}>Completed</dt><dd className="mb-2 sm:mb-0">{formatMonth(v.completedAt)}</dd>
        <dt style={{ color: '#6B6862' }}>Verification id</dt><dd className="learn-mono" style={{ wordBreak: 'break-all' }}>{v.certId}</dd>
      </dl>
      <p className="mt-4 text-sm" style={{ color: '#6B6862' }}>This page is the record. It matches the completion {v.issuer} holds, and {v.learnerName} chose to show it. {v.learnerName} can take it down at any time.</p>
      <p className="mt-4"><a className="learn-run inline-block" href={add} target="_blank" rel="noopener noreferrer">Add to your profile</a></p>
    </article>
  )
}
