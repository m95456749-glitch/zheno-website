// ============================================================
// ZHINO — page frame
// The header is fixed (exactly --header-h tall, see index.css);
// every page except the home hero reserves that height plus a
// small breather so content never sits underneath the nav.
//
// «دستیار ژینو» دو حالت دارد:
//   • در بقیهٔ صفحه‌های فروشگاه، یک دکمهٔ شناور که کاربر را به
//     صفحهٔ مستقل /assistant می‌برد (پنجرهٔ Popup حذف شده است).
//     جای دکمه در Layout است تا روی همهٔ صفحه‌های اصلی فروشگاه —
//     و فقط فروشگاه، نه پنل مدیریت — ثابت بماند. روی «سبد خرید» و
//     «تسویه حساب» نمایش داده نمی‌شود تا با دکمه‌های پایین فرم و
//     خلاصهٔ سفارش تداخل نداشته باشد.
//   • روی خود /assistant (فاز ۷) صفحه یک محیط چت تمام‌صفحه و خلوت
//     است: هدر و فوتر فروشگاه اصلاً رندر نمی‌شوند تا تمرکز کامل روی
//     گفتگو باشد؛ دکمهٔ شناور هم طبیعتاً همان‌جا نمایش داده نمی‌شود.
// ============================================================

import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import Toast from './Toast';
import ZhinoAssistant from './assistant/ZhinoAssistant';
import { cn } from '../utils/cn';

/** صفحه‌هایی که دکمهٔ شناور دستیار روی آن‌ها نمایش داده نمی‌شود */
const ASSISTANT_HIDDEN_ROUTES = ['/cart', '/checkout'];

/** هر دو پیش‌نمایش دستیار، همراه با مسیر قدیمی /assistant، تمام‌صفحه‌اند. */
const isAssistantRoute = (pathname: string) => pathname === '/assistant' || pathname.startsWith('/assistant/');

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const immersive = isAssistantRoute(pathname);
  const showAssistant = !ASSISTANT_HIDDEN_ROUTES.includes(pathname) && !immersive;

  if (immersive) {
    return (
      <div className="flex min-h-screen flex-col bg-cream-page">
        <main className="flex-1">{children}</main>
        <Toast />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream-page">
      <Header />
      <main className={cn('flex-1', !isHome && 'pt-[calc(var(--header-h)+0.5rem)]')}>{children}</main>
      <Footer />
      <Toast />
      {showAssistant && <ZhinoAssistant />}
    </div>
  );
}
