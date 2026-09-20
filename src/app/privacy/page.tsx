import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { PRIVACY } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy notice — Etyme',
  description:
    'What Etyme holds, where it goes, who can see it, and what is not true of it yet — ' +
    'each claim checked against the file that proves it.',
}

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} docKey="privacy" />
}
