import type { TileIcon } from '@/lib/public-site/course-door-page'

/** Simple original line icons, one per topic tile. Decorative: the tile's name is the label. */
const PATHS: Record<TileIcon, React.ReactNode> = {
  llm: <><path d="M4 6h16v10H9l-5 4z" /><path d="M8 10h8M8 13h5" /></>,
  agents: <><circle cx="12" cy="8" r="3" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" /><path d="M18 4l1.5 1.5L22 3" /></>,
  mcp: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 11l7.4-3.6M8.3 13l7.4 3.6" /></>,
  rag: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8 12h8M8 16h5" /></>,
  training: <><path d="M3 17l5-5 4 4 8-9" /><path d="M15 7h5v5" /></>,
  compute: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  cloud: <path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 18z" />,
  cost: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.7 5 1.4 5 4.1 0 1.1-1 1.9-2.5 1.9-1.1 0-2-.4-2.6-1.2M12 6.5V8M12 16v1.5" /></>,
  performance: <><path d="M4 18a8 8 0 1116 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1" /></>,
  deploy: <><path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z" /><circle cx="12" cy="10" r="1.5" /><path d="M9 15l-2 5 5-2 5 2-2-5" /></>,
}

export function TileGlyph({ name }: { name: TileIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
