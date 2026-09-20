import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { DPA } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Data processing addendum — Etyme',
  description:
    'A working draft of the addendum a client will ask for, with the controller and ' +
    'processor question left open for counsel rather than decided quietly.',
}

export default function DpaPage() {
  return <LegalDocument doc={DPA} docKey="dpa" />
}
