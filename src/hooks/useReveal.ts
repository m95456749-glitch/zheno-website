// ============================================================
// ZHINO — scroll reveal (IntersectionObserver, no libraries)
// • Elements already in view at mount reveal immediately.
// • Elements below the fold glide in when scrolled to.
// • Optional .reveal-stagger on the target cascades children in
//   with a short delay (CSS-driven; see index.css).
// • Failsafe: anything still armed after 4s reveals quietly, so
//   no environment (print, full-page capture, odd browsers) can
//   ever end up with invisible content.
// ============================================================

import { useEffect, useRef } from 'react';

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const reveal = () => el.classList.add('reveal-in');

    // Already visible at mount? Show instantly, don't hide then un-hide.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      reveal();
      return;
    }

    el.classList.add('reveal-armed');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );
    io.observe(el);

    const failsafe = window.setTimeout(() => {
      reveal();
      io.disconnect();
    }, 4000);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return ref;
}
