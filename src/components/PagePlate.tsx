// ============================================================
// ZHINO — page-plate: the deep-wine editorial banner that opens
// every inner page. Purely presentational; shared rhythm across
// Products / Cart / Checkout / Recipes / About / Contact.
// ============================================================

import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import BackButton from './BackButton';

interface Props {
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  /** optional ghost wordmark behind the title (decorative) */
  ghost?: string;
  /** set false where the page owns its own «بازگشت» control (e.g. checkout steps) */
  showBack?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function PagePlate({
  kicker,
  title,
  lead,
  ghost,
  showBack = true,
  className,
  children,
}: Props) {
  return (
    <header
      className={cn(
        'page-plate grain dark-surface relative isolate overflow-hidden text-cream-50',
        className,
      )}
    >
      {/* top hairline so the plate meets the frosted header cleanly */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cream-50/35 to-transparent" aria-hidden="true" />
      {ghost ? (
        <p
          className="ghost-mark pointer-events-none absolute -bottom-8 left-0 select-none text-[5.5rem] leading-none sm:text-[8rem]"
          aria-hidden="true"
        >
          {ghost}
        </p>
      ) : null}
      <div className="relative mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-16">
        {showBack ? (
          <div className="-mt-7 mb-5 flex justify-start sm:-mt-8">
            <BackButton />
          </div>
        ) : null}
        <p className="kicker kicker-dark font-display">{kicker}</p>
        <h1 className="mx-auto mt-4 max-w-2xl text-3xl font-light leading-[1.5] sm:text-[2.6rem] sm:leading-[1.5]">
          {title}
        </h1>
        {lead ? (
          <p className="mx-auto mt-4 max-w-xl text-sm font-light leading-8 text-cream-200/75">{lead}</p>
        ) : null}
        <span className="rule-lux mt-6" aria-hidden="true" />
        {children}
      </div>
    </header>
  );
}
