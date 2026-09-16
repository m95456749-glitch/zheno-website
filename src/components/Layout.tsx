// ============================================================
// ZHINO — page frame
// The header is fixed (exactly --header-h tall, see index.css);
// every page except the home hero reserves that height plus a
// small breather so content never sits underneath the nav.
// ============================================================

import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import Toast from './Toast';
import { cn } from '../utils/cn';

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="flex min-h-screen flex-col bg-cream-page">
      <Header />
      <main className={cn('flex-1', !isHome && 'pt-[calc(var(--header-h)+0.5rem)]')}>{children}</main>
      <Footer />
      <Toast />
    </div>
  );
}
