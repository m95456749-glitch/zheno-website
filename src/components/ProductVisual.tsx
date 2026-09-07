// ============================================================
// ZHINO — data-driven product visual (v2)
// Editorial "plated" presentation: the flavor's jewel disc sits
// on a tinted table wash, like food photography on a set.
// Still 100% derived from catalog data — no invented imagery.
// ============================================================

interface Props {
  color: string;
  emoji: string;
  name: string;
  className?: string;
  emojiClassName?: string;
  /** hide the tiny Zhino mark (used on small thumbs) */
  compact?: boolean;
}

export default function ProductVisual({
  color,
  emoji,
  name,
  className = '',
  emojiClassName = 'text-6xl',
  compact = false,
}: Props) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--color-cream-100)',
        backgroundImage: `
          radial-gradient(120% 95% at 50% 118%, rgba(31,9,15,0.16) 0%, rgba(31,9,15,0) 52%),
          radial-gradient(85% 65% at 22% 8%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%),
          linear-gradient(178deg, color-mix(in srgb, ${color} 12%, #fbf7ef) 0%, color-mix(in srgb, ${color} 24%, #f3eadb) 100%)
        `,
      }}
    >
      {/* the plate — a jewel disc of the flavor color */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative aspect-square w-[64%] max-w-[22rem] rounded-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          style={{
            background: `radial-gradient(70% 62% at 32% 24%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 46%), linear-gradient(150deg, color-mix(in srgb, ${color} 88%, white 6%) 0%, ${color} 55%, color-mix(in srgb, ${color} 55%, black) 100%)`,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 18px rgba(0,0,0,0.28), 0 22px 34px -14px rgba(31,9,15,0.45)',
          }}
          aria-hidden="true"
        >
          <div className="absolute inset-[7%] rounded-full border border-white/18" />
          <div className="absolute inset-[18%] rounded-full" style={{ background: 'radial-gradient(circle at 50% 46%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 62%)' }} aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${emojiClassName} drop-shadow-[0_8px_14px_rgba(0,0,0,0.4)]`} aria-hidden="true">
              {emoji}
            </span>
          </div>
        </div>
      </div>

      {/* table shadow under the plate */}
      <div
        className="absolute bottom-[9%] left-1/2 h-[7%] w-[52%] -translate-x-1/2 rounded-[100%] bg-noir/30 blur-md"
        aria-hidden="true"
      />

      {!compact && (
        <div className="absolute bottom-3 right-4 font-display text-[0.56rem] uppercase tracking-[0.34em] text-wine-950/45">
          Zhino
        </div>
      )}
    </div>
  );
}
