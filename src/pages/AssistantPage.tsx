// ============================================================
// ZHINO — «دستیار ژینو» — محیط اختصاصی، لوکس و مینیمال
//
// بازطراحی سربرگ (فاز «سادگی لوکس»):
//   • سمت راست: آواتار کوچک ربات + عنوان «دستیار ژینو» + وضعیت
//     بسیار ظریف «همراه شما برای انتخاب محصولات ژینو».
//   • سمت چپ: دکمهٔ «بازگشت به سایت» + «شروع گفتگوی جدید».
//   • بی‌وزن، بدون قاب اضافه، فقط یک جداکنندهٔ مویی در پایین.
//
// منطق چت، API و اتصال‌ها دست‌نخورده‌اند (useAssistantChat +
// services/assistant) — فقط پوسته عوض شده است.
// ============================================================

import { useNavigate } from 'react-router-dom';
import AssistantAvatar from '../components/assistant/AssistantAvatar';
import AssistantChat from '../components/assistant/AssistantChat';
import { useAssistantChat } from '../components/assistant/useAssistantChat';
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from '../components/assistant/assistantData';

/** آیکن فروشگاه برای دکمهٔ «بازگشت به سایت» */
function StoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M3.4 7.6V16c0 .5.4.9.9.9h11.4c.5 0 .9-.4.9-.9V7.6M2.3 7.6h15.4l-1-3.2a1.4 1.4 0 0 0-1.3-1H4.6a1.4 1.4 0 0 0-1.3 1l-1 3.2Zm4.1 0c1.1 0 2 .9 2 2s2-.9 2-2m4 0c1.1 0 2 .9 2 2s2-.9 2-2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** آیکن «شروع گفتگوی جدید» */
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
      {/* ── سربرگ باریک و هم‌سطح صفحه ── */}
      <header className="zhino-assistant-topbar">
        <span className="zhino-assistant-brand">
          <span className="zhino-assistant-brand-mark">
            <AssistantAvatar compact={true} />
          </span>
          <span className="zhino-assistant-brand-text">
            <span className="zhino-assistant-brand-name">{ASSISTANT_NAME}</span>
            <span className="zhino-assistant-brand-title">{ASSISTANT_TAGLINE}</span>
          </span>
        </span>

        <span className="zhino-assistant-topbar-actions">
          <button
            type="button"
            className="zhino-assistant-ghost is-back"
            onClick={goHome}
            aria-label="بازگشت به سایت"
            title="بازگشت به سایت"
          >
            <StoreIcon />
            <span className="zhino-assistant-back-text">بازگشت به سایت</span>
          </button>

          <button
            type="button"
            className="zhino-assistant-ghost is-icon"
            onClick={chat.clear}
            aria-label="شروع گفتگوی جدید"
            title="شروع گفتگوی جدید"
          >
            <RefreshIcon />
          </button>
        </span>
      </header>

      {/* ── محیط گفتگو — یک سطح، بدون لایهٔ اضافه ── */}
      <AssistantChat chat={chat} />
    </div>
  );
}
