// ============================================================
// ZHINO — admin icon set (quiet 1.7px stroke, brand-neutral)
// ============================================================

interface IconProps {
  className?: string;
}

function svgProps(className: string) {
  return {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

export function IconDashboard({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function IconProducts({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6L10 2.5Z" />
      <path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" />
    </svg>
  );
}

export function IconOrders({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5.5 2.5h9a.5.5 0 0 1 .5.5v14.5l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M8 7h4.5M8 10.5h4.5" />
    </svg>
  );
}

export function IconInventory({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m10 3 7 3.5-7 3.5-7-3.5L10 3Z" />
      <path d="m3.5 10.7 6.5 3.3 6.5-3.3" />
      <path d="m3.5 14 6.5 3.3L16.5 14" />
    </svg>
  );
}

export function IconRecipes({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10 4.6C8.4 3.2 6.4 3 4 3v13.2c2.4 0 4.4.3 6 1.6 1.6-1.3 3.6-1.6 6-1.6V3c-2.4 0-4.4.2-6 1.6Z" />
      <path d="M10 4.6v13.2" />
    </svg>
  );
}

export function IconContent({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 5h13M3.5 9h13M3.5 13h8M3.5 16.5h5" />
    </svg>
  );
}

export function IconSettings({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
      {/* fill via style — CSS vars are not valid in SVG presentation attributes */}
      <circle cx="13" cy="6" r="1.8" style={{ fill: 'var(--color-wine-950)' }} />
      <circle cx="7" cy="10" r="1.8" style={{ fill: 'var(--color-wine-950)' }} />
      <circle cx="12" cy="14" r="1.8" style={{ fill: 'var(--color-wine-950)' }} />
    </svg>
  );
}

export function IconLogout({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6.5 3.5H15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6.5" />
      <path d="M10.5 10H3.5m0 0 2.5-2.5M3.5 10 6 12.5" />
    </svg>
  );
}

export function IconExternal({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8.5 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5V11.5" />
      <path d="M11.5 3.5h5v5M16 4 10 10" />
    </svg>
  );
}

export function IconPlus({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconPencil({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m13.2 3.3 3.5 3.5L7 16.5H3.5V13L13.2 3.3Z" />
    </svg>
  );
}

export function IconTrash({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 5h13M8 5V3.5h4V5M5.5 5l.7 11a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-11M8.2 8.2v4.6M11.8 8.2v4.6" />
    </svg>
  );
}

export function IconClose({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export function IconMenu({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
    </svg>
  );
}

export function IconSearch({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.3 13.3 3.7 3.7" />
    </svg>
  );
}
