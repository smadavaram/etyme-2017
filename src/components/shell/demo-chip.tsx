/**
 * "Demo", in front of a made-up company's name.
 *
 * The founder, 2026-09-28: a reminder that the company on screen does not
 * exist. Whether it does is decided on the server from who is seated
 * there (lib/demo-company); this only draws the answer.
 *
 * The action tokens, not the attention ones, and the numbers are why:
 * clay on its own wash scores about 3.6 at this size, under the 4.5
 * floor, where the deeper violet on the violet wash scores 7.27
 * (CLAUDE.md's token table). Never the logo green, which is the logo and
 * nothing else. Small, uppercase and letter-spaced like every other chip,
 * and `shrink-0` so a long name truncates before the chip ever does —
 * which is what keeps it on screen at 390 pixels.
 */
export function DemoChip({ className = '' }: { className?: string }) {
  return (
    <span
      title="A made-up company, seeded for the demo. Nothing here is real."
      className={
        'inline-flex shrink-0 items-center rounded border border-etyme-action-line ' +
        'bg-etyme-action-wash px-1.5 py-px text-[9.5px] font-semibold uppercase leading-[14px] ' +
        'tracking-[0.06em] text-etyme-action-press ' +
        className
      }
    >
      Demo
    </span>
  )
}
