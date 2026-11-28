/**
 * The shared layer every screen draws. Import from here:
 *
 *   import { EmptyState, RefusedState, Panel, Stat, Field, Input } from '@/components/ui'
 *
 * `DetailHead` is a client component (it reads the session for its
 * eyebrow), so a server page imports it from '@/components/ui/detail-head'
 * only when it is itself a client page. The table is
 * '@/components/list-surface'.
 */
export { EmptyState, LoadingState, ErrorState, RefusedState, type StateAction } from './states'
export { Panel, Stat, Chip, Lbl, PageHead, CHIP_TONES, type ChipTone, type StatTone } from './surface'
export { Field, Input, Select, Textarea, Check, SubmitButton, FormMessage } from './form'
export { DetailHead } from './detail-head'
export { FilterChips, type FilterOption } from './filter-chips'
