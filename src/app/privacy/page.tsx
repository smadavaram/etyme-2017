import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'

export const metadata: Metadata = {
  title: 'Privacy Notice — Etyme',
  description:
    'What personal information Etyme holds, where it comes from, how it is used, who receives it, how long it is kept, and the choices you have.',
}

export default function PrivacyPage() {
  return <LegalDocument docKey="privacy" />
}
