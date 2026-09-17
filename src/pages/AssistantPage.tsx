// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۷) — محیط چت تمام‌صفحه
//
// صفحهٔ /assistant دیگر شبیه یک صفحهٔ معمولی سایت نیست:
//
//   • فوتر، منوها، پرچم‌ها، بخش معرفی قابلیت‌ها و ستون کنار حذف
//     شده‌اند (Layout روی همین مسیر هدر/فوتر فروشگاه را رندر نمی‌کند).
//   • صفحه دقیقاً هم‌قد دید کاربر است و فقط فهرست پیام‌ها اسکرول
//     می‌شود؛ کادر نوشتن پیام همیشه پایین می‌ماند (الگوی ChatGPT).
//   • سربرگ خیلی ساده و Premium: نشان کوچک ژینو، عنوان «دستیار ژینو»،
//     پیل ظریف وضعیت/منبع داده، «گفتگوی تازه» و دکمهٔ ظریف
//     «بازگشت به فروشگاه».
//
// هیچ قابلیت فنی‌ای اینجا نیست: منطق گفتگو، اتصال دیتابیس، مدل
// هوش مصنوعی، fallback محلی و قیمت/موجودی/دستور تهیه همچنان از
// همان لایه‌های قبلی می‌آید (useAssistantChat + services/assistant).
// Routing فروشگاه، سبد خرید، API و Edge Function دست‌نخورده‌اند و
// «بازگشت به فروشگاه» به صفحهٔ اصلی (/) می‌رود؛ مسیر هم با push در
// تاریخچه ثبت می‌شود، پس دکمهٔ Back مرورگر مثل قبل کار می‌کند.
// ============================================================

import { useNavigate } from 'react-router-dom';
import AssistantAvatar from '../components/assistant/AssistantAvatar';
import AssistantChat from '../components/assistant/AssistantChat';
import {
  connectionLabel,
  connectionNote,
  useAssistantChat,
} from '../components/assistant/useAssistantChat';
import { ASSISTANT_NAME } from '../components/assistant/assistantData';
import { cn } from '../utils/cn';

/** آیکن فروشگاه برای دکمهٔ «بازگشت به فروشگاه» */
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

/** آیکن «گفتگوی تازه» */
function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M16.3 8.6A6.4 6.4 0 0 0 5.1 6.1L3.4 7.9m0 0V4.3m0 3.6h3.6m-3.3 3.5a6.4 6.4 0 0 0 11.2 2.5l1.7-1.8m0 0v3.6m0-3.6h-3.6"
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
      {/* ── سربرگ بسیار ساده: نشان، عنوان، وضعیت، گفتگوی تازه، بازگشت ── */}
      <header className="zhino-assistant-topbar">
        <span className="zhino-assistant-brand">
          <span className="zhino-assistant-brand-mark">
            <AssistantAvatar />
          </span>
          <span className="zhino-assistant-brand-text">
            <span className="zhino-assistant-brand-name">Zhino</span>
            <span className="zhino-assistant-brand-title">{ASSISTANT_NAME}</span>
          </span>
        </span>

        {/* دو «حقیقت» جدا و ظریف: منبع پاسخ (مدل/محلی) و منبع داده (دیتابیس/فروشگاه) */}
        <span
          className={cn('zhino-assistant-status', `is-${chat.connection}`)}
          title={connectionNote(chat.connection, chat.dataSource)}
        >
          <span className="zhino-assistant-status-dot" aria-hidden="true" />
          <span className="zhino-assistant-status-text">
            {connectionLabel(chat.connection, chat.dataSource)}
          </span>
        </span>

        <button
          type="button"
          className="zhino-assistant-ghost is-icon"
          onClick={chat.clear}
          aria-label="گفتگوی تازه"
          title="گفتگوی تازه"
        >
          <RefreshIcon />
        </button>

        <button
          type="button"
          className="zhino-assistant-ghost is-back"
          onClick={goHome}
          aria-label="بازگشت به فروشگاه"
          title="بازگشت به فروشگاه"
        >
          <StoreIcon />
          <span className="zhino-assistant-back-text">بازگشت به فروشگاه</span>
        </button>
      </header>

      {/* ── محیط گفتگو — تمام‌قد، بدون هیچ بخش اضافی ── */}
      <AssistantChat chat={chat} />
    </div>
  );
}
