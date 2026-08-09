/**
 * Etyme logo — the 't' is the differentiator.
 *
 * The vertical stroke of the 't' extends into a clock face above the baseline.
 * Three hands in the brand colours (purple, amber, green) radiate from the
 * junction, making the 't' literally a timepiece inside the wordmark.
 *
 * Usage:
 *   <EtymeLogo size="lg" />           — dark text, for light backgrounds
 *   <EtymeLogo size="lg" inverted />  — white text, for dark backgrounds
 */

interface EtymeLogoProps {
  /** sm = 20px, md = 28px, lg = 40px, xl = 56px, hero = 72px */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  /** White text for dark backgrounds */
  inverted?: boolean
  /** Show only the clock mark, no wordmark */
  mark?: boolean
  /** Animate the second hand */
  animated?: boolean
  className?: string
}

const SIZES = { sm: 20, md: 28, lg: 40, xl: 56, hero: 72 } as const

export function EtymeLogo({
  size = 'md',
  inverted = false,
  mark = false,
  animated = false,
  className = '',
}: EtymeLogoProps) {
  const h = SIZES[size]
  const textColor = inverted ? '#FFFFFF' : '#0D1426'

  // Clock face dimensions relative to the height
  const clockR = h * 0.22
  const cx = 0
  const cy = 0

  const clockMark = (
    <svg
      width={clockR * 2.6}
      height={clockR * 2.6}
      viewBox="-13 -13 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
      aria-hidden="true"
    >
      {/* Clock face */}
      <circle
        cx={cx}
        cy={cy}
        r="11"
        stroke={textColor}
        strokeWidth="1.8"
        fill="none"
        opacity="0.2"
      />
      {/* Hour ticks — 12, 3, 6, 9 */}
      {[0, 90, 180, 270].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const x1 = Math.sin(rad) * 9
        const y1 = -Math.cos(rad) * 9
        const x2 = Math.sin(rad) * 11
        const y2 = -Math.cos(rad) * 11
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={textColor}
            strokeWidth="1.2"
            opacity="0.25"
            strokeLinecap="round"
          />
        )
      })}
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="1.4" fill={textColor} />
      {/* Hour hand — purple, pointing ~2 o'clock */}
      <line
        x1={cx}
        y1={cy}
        x2="4.5"
        y2="-5.5"
        stroke="#7C3AED"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Minute hand — amber, pointing ~10 o'clock */}
      <line
        x1={cx}
        y1={cy}
        x2="-5"
        y2="-7"
        stroke="#F59E0B"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Second hand — green, pointing ~5 o'clock */}
      <line
        x1={cx}
        y1={cy}
        x2="4"
        y2="7.5"
        stroke="#059669"
        strokeWidth="1"
        strokeLinecap="round"
        className={animated ? 'origin-center animate-clock-tick' : ''}
      />
    </svg>
  )

  if (mark) {
    return <span className={className}>{clockMark}</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-0 select-none ${className}`}
      style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
      role="img"
      aria-label="Etyme"
    >
      {/* 'e' */}
      <span
        style={{
          fontSize: h,
          fontWeight: 600,
          lineHeight: 1,
          color: textColor,
          letterSpacing: '-0.03em',
        }}
      >
        e
      </span>

      {/* 't' with clock — the differentiator */}
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: h * 0.62 }}
      >
        {/* The letter 't' */}
        <span
          style={{
            fontSize: h,
            fontWeight: 600,
            lineHeight: 1,
            color: textColor,
            letterSpacing: '-0.03em',
            opacity: 0.12,
          }}
        >
          t
        </span>
        {/* Clock overlay on the 't' */}
        <span
          className="absolute"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
          }}
        >
          {clockMark}
        </span>
      </span>

      {/* 'yme' */}
      <span
        style={{
          fontSize: h,
          fontWeight: 600,
          lineHeight: 1,
          color: textColor,
          letterSpacing: '-0.03em',
        }}
      >
        yme
      </span>
    </span>
  )
}

/** Standalone clock mark for favicon, app icon, loading states */
export function EtymeClockMark({
  size = 32,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Etyme"
    >
      {/* Outer ring */}
      <circle cx="0" cy="0" r="12" stroke="#0D1426" strokeWidth="2" fill="none" />
      {/* Hour ticks */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const major = angle % 90 === 0
        const x1 = Math.sin(rad) * (major ? 8.5 : 9.5)
        const y1 = -Math.cos(rad) * (major ? 8.5 : 9.5)
        const x2 = Math.sin(rad) * 11
        const y2 = -Math.cos(rad) * 11
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#0D1426"
            strokeWidth={major ? 1.5 : 0.8}
            strokeLinecap="round"
            opacity={major ? 0.6 : 0.3}
          />
        )
      })}
      {/* Center */}
      <circle cx="0" cy="0" r="1.5" fill="#0D1426" />
      {/* Hour — purple */}
      <line x1="0" y1="0" x2="4.5" y2="-5.5" stroke="#7C3AED" strokeWidth="2.4" strokeLinecap="round" />
      {/* Minute — amber */}
      <line x1="0" y1="0" x2="-5" y2="-7" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
      {/* Second — green */}
      <line x1="0" y1="0" x2="4" y2="7.5" stroke="#059669" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
