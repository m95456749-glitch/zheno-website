// ============================================================
// ZHINO — scroll restoration
// Route change -> top of page. Deep links with a hash (#flavors)
// land on the matching section instead of the very top.
// ============================================================

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.replace(/^#/, ''));
      // let the new page paint first, then glide to the target
      const timer = window.setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        } else {
          window.scrollTo(0, 0);
        }
      }, 60);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
