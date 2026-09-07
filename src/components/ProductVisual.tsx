// ============================================================
// ZHINO — data-driven product visual
// Renders the flavor color + motif stored in the product catalog
// as a jewel-toned, softly lit plate (no external images).
// ============================================================

interface Props {
  color: string;
  emoji: string;
  name: string;
  className?: string;
  emojiClassName?: string;
}

export default function ProductVisual({ color, emoji, name, className = '', emojiClassName = 'text-6xl' }: Props) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: color,
        backgroundImage: `radial-gradient(115% 85% at 26% 16%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 52%), radial-gradient(130% 100% at 74% 96%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 58%), linear-gradient(152deg, ${color} 0%, color-mix(in srgb, ${color} 66%, black) 72%, color-mix(in srgb, ${color} 40%, black) 100%)`,
      }}
    >
      {/* studio light pools */}
      <div className="absolute left-1/2 top-1/2 h-[55%] w-[62%] -translate-x-1/2 -translate-y-[58%] rounded-full bg-white/12 blur-2xl" aria-hidden="true" />
      {/* pedestal shadow under the motif */}
      <div className="absolute bottom-[16%] left-1/2 h-6 w-2/5 -translate-x-1/2 rounded-[100%] bg-black/25 blur-md" aria-hidden="true" />
      {/* flavor motif */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`${emojiClassName} drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-out group-hover:scale-108 group-hover:-translate-y-1`}
          aria-hidden="true"
        >
          {emoji}
        </span>
      </div>
      {/* glass shine */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ background: 'linear-gradient(108deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 36%)' }}
      />
      {/* hairline inner rim */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" aria-hidden="true" />
      {/* brand mark */}
      <div className="absolute bottom-2.5 right-3 font-display text-[0.58rem] uppercase tracking-[0.35em] text-cream-50/75">
        Zhino
      </div>
    </div>
  );
}
