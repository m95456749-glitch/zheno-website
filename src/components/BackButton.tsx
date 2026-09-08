// ============================================================
// ZHINO — back navigation
// A small, quiet pill (see .btn-back in index.css) that returns
// to the previous in-app view through the router's own history,
// with no page reload. Rendered only on inner pages: the
// homepage has no meaningful previous destination, and pages
// that already own a «بازگشت» control (checkout steps, 404)
// opt out to avoid duplicates.
// ============================================================

import { useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';

interface Props {
  /** where to land when the app has no earlier entry to pop (deep link / fresh tab) */
  fallback?: string;
  className?: string;
}

export default function BackButton({ fallback = '/', className }: Props) {
  const navigate = useNavigate();

  // React Router keeps an entry index in the history state. Index 0 means
  // the current page is the first entry the app created, so popping it
  // would walk out of the site — fall back instead.
  const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const hasAppHistory = historyIndex > 0;

  const goBack = () => {
    if (hasAppHistory) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <button type="button" onClick={goBack} className={cn('btn-back', className)}>
      {/* RTL: "back" points right, toward the previous page */}
      <svg viewBox="0 0 20 20" fill="none" className="btn-back-arrow h-4 w-4" aria-hidden="true">
        <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      بازگشت
    </button>
  );
}
