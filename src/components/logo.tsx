/**
 * Etyme logo — the 't' crossbar is the differentiator.
 *
 * The wordmark is "etyme" in deep navy custom sans-serif. The crossbar
 * of the 't' is replaced with a rising bar carrying a cyan-to-purple
 * gradient — progress lifting the word forward.
 *
 * Design rationale (from brand guidelines):
 *   - Rising crossbar = progress (~25° tilt, compact slash)
 *   - Wide stance = stability
 *   - Open counters = clarity
 *   - Gradient: cyan (#00D4FF) → purple (#7C3AED)
 *
 * Usage:
 *   <EtymeLogo size="lg" />           — dark text, for light backgrounds
 *   <EtymeLogo size="lg" inverted />  — white text, for dark backgrounds
 *   <EtymeMark size={32} />           — 't' in a circle, for icons
 */

interface EtymeLogoProps {
  /** sm = 20px, md = 28px, lg = 40px, xl = 56px, hero = 72px */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  /** White text for dark backgrounds */
  inverted?: boolean
  /** Show only the mark (t-in-circle), no wordmark */
  mark?: boolean
  className?: string
}

const SIZES = { sm: 20, md: 28, lg: 40, xl: 56, hero: 72 } as const

export function EtymeLogo({
  size = 'md',
  inverted = false,
  mark = false,
  className = '',
}: EtymeLogoProps) {
  const h = SIZES[size]
  const textColor = inverted ? '#FFFFFF' : '#0D1426'

  if (mark) {
    return <EtymeMark size={Math.round(h * 0.85)} className={className} />
  }

  const letterStyle: React.CSSProperties = {
    fontSize: h,
    fontWeight: 700,
    lineHeight: 1,
    color: textColor,
    letterSpacing: '-0.04em',
  }

  // Gradient crossbar — compact, steeply tilted (~25°)
  const barHeight = Math.max(2.5, h * 0.08)
  const barWidth = h * 0.5

  return (
    <span
      className={`inline-flex items-baseline select-none ${className}`}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
      role="img"
      aria-label="Etyme"
    >
      <span style={letterStyle}>e</span>

      {/* The 't' — its crossbar carries the brand gradient */}
      <span className="relative inline-block">
        <span style={letterStyle}>t</span>
        {/*
         * Gradient crossbar — the brand differentiator.
         * Compact rising slash from cyan (lower-left) to purple (upper-right).
         * Positioned at the x-height of the 't', centered on the stem.
         */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '36%',
            left: '50%',
            width: barWidth,
            height: barHeight,
            marginLeft: barWidth * -0.45,
            background: 'linear-gradient(90deg, #00D4FF, #7C3AED)',
            borderRadius: barHeight,
            transform: 'rotate(-25deg)',
            transformOrigin: 'center center',
          }}
        />
      </span>

      <span style={letterStyle}>yme</span>
    </span>
  )
}

/**
 * Standalone mark — lowercase 't' with gradient crossbar in a navy circle.
 * Used for favicon, app icon, loading states, and compact branding.
 */
export function EtymeMark({
  size = 32,
  inverted = false,
  className = '',
}: {
  size?: number
  inverted?: boolean
  className?: string
}) {
  const bgFill = inverted ? '#FFFFFF' : '#0D1426'
  const strokeFill = inverted ? '#0D1426' : '#FFFFFF'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Etyme"
    >
      <defs>
        <linearGradient id="etyme-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* Circle ground */}
      <circle cx="20" cy="20" r="20" fill={bgFill} />
      {/* Vertical stroke of 't' */}
      <rect x="18" y="8" width="4" height="24" rx="2" fill={strokeFill} />
      {/* Gradient crossbar — rising slash, ~25° tilt */}
      <rect
        x="11"
        y="17"
        width="18"
        height="4"
        rx="2"
        fill="url(#etyme-g)"
        transform="rotate(-25 20 19)"
      />
    </svg>
  )
}
