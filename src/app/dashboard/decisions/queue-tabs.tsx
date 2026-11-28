'use client'

import Link from 'next/link'

/** The decision queue's two tabs (record 107, A2 and A5). */
export function QueueTabs({ current }: { current: 'decisions' | 'agents' }) {
  const tab = (key: 'decisions' | 'agents', href: string, label: string) => (
    <Link
      href={href as any}
      aria-current={current === key ? 'page' : undefined}
      className={`px-3 py-1.5 rounded text-[13px] transition-colors ${
        current === key ? 'bg-etyme-ink text-white' : 'bg-etyme-surface border border-etyme-rule text-etyme-muted hover:text-etyme-ink'
      }`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Decision queue" className="flex flex-wrap gap-1 mb-5">
      {tab('decisions', '/dashboard/decisions', 'Decisions')}
      {tab('agents', '/dashboard/decisions/agents', 'Agent control')}
    </nav>
  )
}
