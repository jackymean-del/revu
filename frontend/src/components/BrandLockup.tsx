/** The revU lockup: the bhusku Fader U on its tile, then "rev" + the U in lavender. */
export function BrandLockup() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-8 items-center justify-center rounded-[9px] bg-brand shadow-[0_1px_2px_rgba(19,17,30,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]"
      >
        <svg viewBox="0 0 52 52" width="19" height="19">
          <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" />
          <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" />
        </svg>
      </span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        rev<span className="text-brand">U</span>
      </span>
    </span>
  )
}
