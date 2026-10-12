'use client'

import dynamic from 'next/dynamic'

/**
 * Where the conversation with the twin sits on the twin's page.
 *
 * The panel is etyme-conversation's (`components/twin-conversation`),
 * built at the same time as this page. Found by webpack's own directory
 * listing rather than named in an import, so this page builds whether or
 * not that file exists yet: with none, the slot draws nothing, and the
 * moment it lands the page shows it with no change here.
 *
 * It exports `TwinConversation`, or a default; either is drawn.
 */
type Panel = (props: { companyId?: string | null }) => JSX.Element | null

// require.context with no match is an empty listing, never a build error.
const found = (require as unknown as {
  context: (dir: string, deep: boolean, re: RegExp, mode: 'lazy') => { keys(): string[]; (k: string): Promise<Record<string, unknown>> }
}).context('../../../components', false, /^\.\/twin-conversation(\.tsx|\/index\.tsx)$/, 'lazy')

const Nothing: Panel = () => null

const Loaded = dynamic<{ companyId?: string | null }>(
  async () => {
    const key = found.keys()[0]
    if (!key) return Nothing
    try {
      const mod = await found(key)
      return ((mod.TwinConversation ?? mod.default) as Panel | undefined) ?? Nothing
    } catch {
      return Nothing
    }
  },
  { ssr: false, loading: () => null },
)

export function TwinConversationSlot({ companyId }: { companyId?: string | null }) {
  return <Loaded companyId={companyId} />
}
