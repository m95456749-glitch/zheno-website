// ============================================================
// ZHINO — صفحهٔ مستقل «دستیار ژینو» (فاز ۵)
//
// قبلاً دکمهٔ شناور یک پنجرهٔ Popup باز می‌کرد؛ از این فاز همان
// دکمه کاربر را به این صفحه می‌آورد (/assistant) و روی این صفحه
// هم دیگر تکرار نمی‌شود (Layout).
//
// ساختار صفحه:
//   • سربرگ Premium هم‌هویت برند (پلیت burgundy + فیلم‌دانه + هالهٔ
//     ملایم) با تصویر ربات، نام دستیار، توضیح کوتاه، نشان وضعیت
//     اتصال و دکمهٔ «بازگشت به سایت».
//   • محیط گفتگو (AssistantChat) با منطق کامل فارسی و RTL.
//   • ستون کنار: توانایی‌های فعلی و آیندهٔ دستیار + لینک‌های مفید.
//
// Routing فروشگاه و پنل مدیریت دست‌نخورده است: این صفحه فقط یک
// مسیر اضافه در همان قالب فروشگاه است و «بازگشت به سایت» به
// صفحهٔ اصلی (/) می‌رود؛ دکمهٔ Back مرورگر هم مثل بقیهٔ صفحه‌ها
// کار می‌کند چون مسیر با push در تاریخچه ثبت می‌شود.
// ============================================================

import { Link, useNavigate } from 'react-router-dom';
import AssistantAvatar from '../components/assistant/AssistantAvatar';
import AssistantChat from '../components/assistant/AssistantChat';
import { connectionLabel, connectionNote, useAssistantChat } from '../components/assistant/useAssistantChat';
import { ASSISTANT_CAPABILITIES } from '../services/assistant/engine';
import { cn } from '../utils/cn';

/** آیکن فروشگاه برای دکمهٔ «بازگشت به سایت» */
function StoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M3.4 7.6V16c0 .5.4.9.9.9h11.4c.5 0 .9-.4.9-.9V7.6M2.3 7.6h15.4l-1-3.2a1.4 1.4 0 0 0-1.3-1H4.6a1.4 1.4 0 0 0-1.3 1l-1 3.2Zm4.1 0c0 1.1.9 2 2 2s2-.9 2-2m4 0c0 1.1.9 2 2 2s2-.9 2-2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AssistantPage() {
  const navigate = useNavigate();
  const chat = useAssistantChat();

  const goHome = () => navigate('/');

  return (
    <div className="zhino-assistant-page">
      {/* ── سربرگ Premium ── */}
      <header className="page-plate grain dark-surface burgundy-ambient relative isolate overflow-hidden text-cream-50">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cream-50/35 to-transparent"
          aria-hidden="true"
        />
        {/* روی موبایل سربرگ جمع‌وجورتر است تا محیط گفتگو زودتر دیده شود */}
        <div className="relative mx-auto max-w-6xl px-4 py-7 text-center sm:px-6 sm:py-12">
          <span className="zhino-assistant-hero-mark">
            <AssistantAvatar />
          </span>
          <p className="kicker kicker-dark mt-4 font-display sm:mt-5">Zhino Assistant</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-light leading-[1.5] sm:text-[2.5rem] sm:leading-[1.5]">
            دستیار ژینو
          </h1>
          <p className="mx-auto mt-3 hidden max-w-xl text-sm font-light leading-8 text-cream-200/75 sm:block">
            راهنمای انتخاب محصول، دستور تهیهٔ ژله و کاستر، پیشنهاد دسر و پاسخ دربارهٔ قیمت و موجودی
            واقعی فروشگاه — همیشه در دسترس.
          </p>
          <span className="rule-lux mt-6" aria-hidden="true" />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button type="button" className="btn-lux btn-line-light" onClick={goHome}>
              <StoreIcon />
              بازگشت به سایت
            </button>
            <span
              className={cn('zhino-assistant-status', `is-${chat.connection}`)}
              title={connectionNote(chat.connection, chat.dataSource)}
            >
              <span className="zhino-assistant-status-dot" aria-hidden="true" />
              {connectionLabel(chat.connection, chat.dataSource)}
            </span>
          </div>
        </div>
      </header>

      {/* ── محیط گفتگو + ستون راهنما ── */}
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start">
        <AssistantChat chat={chat} />

        <aside className="space-y-4">
          <section className="panel-lux rounded-2xl p-5 sm:p-6" aria-label="توانایی‌های دستیار">
            <h2 className="kicker font-display">توانایی‌های دستیار</h2>
            <ul className="mt-4 space-y-3.5">
              {ASSISTANT_CAPABILITIES.map((capability) => (
                <li key={capability.id} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45',
                      capability.needsModel ? 'bg-gold-500' : 'bg-wine-800',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-wine-950">{capability.title}</span>
                      {capability.needsModel && (
                        <span className="rounded-full border border-gold-500/40 bg-gold-300/15 px-2 py-0.5 text-[0.6rem] font-semibold text-gold-700">
                          با اتصال مدل
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-6 text-mocha">{capability.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-lux rounded-2xl p-5 sm:p-6" aria-label="شفافیت و لینک‌های مفید">
            <h2 className="kicker font-display">شفاف و بی‌ادعا</h2>
            <p className="mt-3 text-xs leading-7 text-mocha">
              دستیار ژینو دربارهٔ قیمت و موجودی فقط از اطلاعات همین فروشگاه حرف می‌زند؛ اگر
              اطلاعاتی در فروشگاه نباشد، صریح می‌گوید «نمی‌دانم» و چیزی از خودش نمی‌سازد. اگر
              پرسشتان بیرون از حوزهٔ ژله، کاستر و خرید باشد، با احترام محدودهٔ کارش را توضیح می‌دهد.
            </p>
            <p className="mt-2 text-xs leading-7 text-mocha">
              منبع داده و وضعیت اتصال همیشه بالای صفحه نوشته می‌شود. کلید مدل هوش مصنوعی هم فقط
              روی سرور می‌ماند و هیچ‌وقت به مرورگر نمی‌آید؛ پرسش‌های شما هم به سفارش‌ها یا اطلاعات
              مشتریان دسترسی ندارند.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/products" className="zhino-assistant-link">
                مشاهدهٔ محصولات
              </Link>
              <Link to="/recipes" className="zhino-assistant-link">
                دستور تهیه
              </Link>
              <Link to="/contact" className="zhino-assistant-link">
                تماس با ژینو
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
