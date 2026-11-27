'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { lookWarnings } from './site-look'

/**
 * What the Owner reads in Settings about the colors saved for the site
 * (record 79): a sentence for each color that is hard to read where the page
 * uses it, and the words "kept as you chose". It never offers a corrected
 * color and never writes one. The Settings page mounts `SiteLookPanel`.
 */

export function LookWarnings({ branding }: { branding: { primaryColor: string | null; secondaryColor: string | null } }) {
  const warnings = lookWarnings(branding)
  if (warnings.length === 0) return null
  return (
    <ul className="space-y-1.5" aria-label="Colors that are hard to read">
      {warnings.map((w) => (
        <li key={w} className="text-[13px] text-etyme-attention leading-relaxed">{w}</li>
      ))}
    </ul>
  )
}

export function SiteLookPanel() {
  const [branding, setBranding] = useState<{ primaryColor: string | null; secondaryColor: string | null } | null>(null)
  useEffect(() => {
    fetch('/api/settings/site-branding')
      .then(readJson)
      .then((b) => setBranding(b.data.branding))
      .catch(() => setBranding(null))
  }, [])
  return branding ? <LookWarnings branding={branding} /> : null
}
