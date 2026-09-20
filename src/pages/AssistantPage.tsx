// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۷ و ۸ + بازطراحی لَونج) — محیط چت تمام‌صفحه
//
// صفحهٔ /assistant شبیه یک صفحهٔ معمولی سایت نیست:
//
//   • فوتر، منوها، پرچم‌ها و ستون کنار حذف شده‌اند (Layout روی همین
//     مسیر هدر/فوتر فروشگاه را رندر نمی‌کند).
//   • صفحه دقیقاً هم‌قد دید کاربر است و فقط فهرست پیام‌ها اسکرول
//     می‌شود؛ کادر نوشتن پیام همیشه پایین می‌ماند (الگوی ChatGPT).
//   • بازطراحی جدید: صحنهٔ «لَونج لوکس ژینو» (ترکیب کانسپت B + A) بالای
//     گفتگو می‌نشیند — ربات زندهٔ concept-A-v3 داخل اتاق گرم با نور
//     سینمایی. هیچ قابلیتی حذف نشده؛ فقط پوسته عوض شده است.
//   • وضعیت ربات در صحنه از گفتگوی واقعی می‌آید: thinking → «فکر
//     کردن»، رسیدن پاسخ تازه → چند ثانیه «صحبت کردن».
//   • سربرگ خیلی ساده و Premium: نشان کوچک ژینو، عنوان «دستیار ژینو»،
//     «گفتگوی تازه» و دکمهٔ ظریف «بازگشت به فروشگاه».
//
// فاز ۸: پیل وضعیت فنی (دیتابیس/مدل/منبع داده) همچنان نمایش داده
// نمی‌شود. پیل کوچک روی صحنه فقط حالت ربات است (آنلاین/فکر/پاسخ) و
// کلاس مستقل zhino-lounge دارد. اتصال دیتابیس، مدل هوش مصنوعی و
// Fallback محلی پشت صحنه دقیقاً مثل قبل کار می‌کنند (useAssistantChat
// + services/assistant) — فقط هیچ‌جا در این صفحه نوشته نمی‌شوند.
// هیچ قابلیت فنی‌ای اینجا حذف نشده و قیمت/موجودی/دستور تهیه همچنان از
// دادهٔ واقعی فروشگاه می‌آید. «بازگشت به فروشگاه» به صفحهٔ اصلی (/)
// می‌رود؛ مسیر هم با push در تاریخچه ثبت می‌شود، پس دکمهٔ Back مرورگر
// مثل قبل کار می‌کند.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AssistantAvatar from '../components/assistant/AssistantAvatar';
import AssistantChat from '../components/assistant/AssistantChat';
import ZhinoLoungeScene, { type ZhinoLoungeHandle } from '../components/assistant/ZhinoLoungeScene';
import { useAssistantChat } from '../components/assistant/useAssistantChat';
import { ASSISTANT_NAME } from '../components/assistant/assistantData';

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
  const sceneRef = useRef<ZhinoLoungeHandle>(null);

  /** گفتگو هنوز تازه است؟ — همان تعریف AssistantChat */
  const fresh = chat.messages.length === 1 && chat.messages[0]?.welcome === true && !chat.thinking;

  /** آخرین پاسخ واقعی ربات — برای حالت «صحبت کردن» صحنه */
  const lastBotReplyId = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
      const message = chat.messages[i];
      if (message.from === 'bot' && !message.welcome) return message.id;
    }
    return null;
  }, [chat.messages]);

  const [speakingSim, setSpeakingSim] = useState(false);

  useEffect(() => {
    if (lastBotReplyId === null) {
      setSpeakingSim(false);
      return;
    }
    setSpeakingSim(true);
    const timer = window.setTimeout(() => setSpeakingSim(false), 5200);
    return () => window.clearTimeout(timer);
  }, [lastBotReplyId]);

  const robotMode = chat.thinking ? 'thinking' : speakingSim ? 'speaking' : 'idle';

  /* شروع گفتگوی تازه → ربات دوباره سلام می‌کند */
  useEffect(() => {
    if (fresh) sceneRef.current?.wave();
  }, [fresh]);

  const goHome = () => navigate('/');

  return (
    <div
      className={`zhino-assistant-page zhino-lounge-mode${fresh ? '' : ' zhino-lounge-chatting'}${
        speakingSim ? ' is-speaking-state' : ''
      }`}
    >
      {/* ── دکمه بازگشت به سایت — بالای سمت چپ، ثابت، Premium ── */}
      <button
        type="button"
        className="zhino-assistant-back-site"
        onClick={goHome}
        aria-label="بازگشت به سایت"
        title="بازگشت به سایت"
      >
        <svg viewBox="0 0 20 20" fill="none" className="zhino-assistant-back-site-icon" aria-hidden="true">
          <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>بازگشت به سایت</span>
      </button>

      {/* ── سربرگ بسیار ساده: نشان، عنوان، گفتگوی تازه ── */}
      <header className="zhino-assistant-topbar">
        <span className="zhino-assistant-brand">
          <span className="zhino-assistant-brand-mark">
            <AssistantAvatar compact={true} size={36} mode={robotMode} />
          </span>
          <span className="zhino-assistant-brand-text">
            <span className="zhino-assistant-brand-name">Zhino</span>
            <span className="zhino-assistant-brand-title">{ASSISTANT_NAME}</span>
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

      {/* ── لَونج لوکس ژینو — ربات زنده، متصل به وضعیت واقعی گفتگو ──
          «گفتگوی تازه» به chat.clear وصل است: گفتگو با همان پیام
          خوشامد و پیشنهادهای پیش‌فرض از نو شروع می‌شود. */}
      <ZhinoLoungeScene
        ref={sceneRef}
        mode={robotMode}
        fresh={fresh}
        welcomeLine="سلام! من دستیار ژینو هستم — ژله‌های قفسه را لمس کنید یا از من بپرسید"
      />

      <AssistantChat chat={chat} />
    </div>
  );
}
