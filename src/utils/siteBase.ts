// ============================================================
// ZHINO — deployment base path (custom domain + Pages sub-path)
//
// One production build serves BOTH:
//   - the custom-domain root:  https://zheno.devs.surf/
//   - the repository URL:      https://<user>.github.io/zheno-website/
// (GitHub Pages redirects the latter to the former once a custom
// domain is set, but direct visits keep working too.)
//
// The Vite `base` is "/" so the bundle carries no sub-path
// assumption; the router basename and every public-asset URL are
// resolved here at runtime from the actual mount point. This is
// what keeps the app from rendering a blank page when the mount
// point and a hardcoded basename disagree.
// ============================================================

/** Sub-path mount kept working for direct repository-URL visits. */
const LEGACY_SUBPATH = '/zheno-website';

/**
 * Site mount point: "/" on the custom domain (and in dev), or
 * "/zheno-website" when the app is served from the repository URL.
 * Pure function of the current location — constant for a page load.
 */
export function getSiteBase(): string {
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    if (pathname === LEGACY_SUBPATH || pathname.startsWith(`${LEGACY_SUBPATH}/`)) {
      return LEGACY_SUBPATH;
    }
    return '/';
  }
  const base = import.meta.env.BASE_URL;
  if (typeof base === 'string' && base.startsWith('/')) {
    return base.replace(/\/+$/, '') || '/';
  }
  return '/';
}

/**
 * Join a public-folder-relative path (e.g. "images/x.jpg") onto the
 * current mount point, so images resolve on both the custom-domain
 * root and the repository sub-path.
 */
export function withSiteBase(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  const base = getSiteBase();
  return base === '/' ? `/${clean}` : `${base}/${clean}`;
}
