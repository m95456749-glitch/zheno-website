// ============================================================
// ZHINO — data-driven product visual
// Renders the flavor color + motif stored in the product catalog.
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
        background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 55%, black) 135%)`,
      }}
    >
      {/* decorative glow circles */}
      <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/15" aria-hidden="true" />
      <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      {/* flavor motif */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${emojiClassName} drop-shadow-lg transition-transform duration-300 group-hover:scale-110`} aria-hidden="true">
          {emoji}
        </span>
      </div>
      {/* glass shine */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 40%)' }}
      />
      {/* brand ribbon */}
      <div className="absolute bottom-2 right-3 rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
        ژینو
      </div>
    </div>
  );
}
