// ============================================================
// ZHINO — «دستیار ژینو» — محیط چت تمام‌صفحه با استودیوی زنده
//
// صفحهٔ /assistant شبیه یک صفحهٔ معمولی سایت نیست:
//
//   • فوتر، منوها، پرچم‌ها و ستون کنار حذف شده‌اند (Layout روی همین
//     مسیر هدر/فوتر فروشگاه را رندر نمی‌کند).
//   • صفحه دقیقاً هم‌قد دید کاربر است و فقط فهرست پیام‌ها اسکرول
//     می‌شود؛ کادر نوشتن پیام همیشه پایین می‌ماند (الگوی ChatGPT).
//   • بالای گفتگو «استودیوی ژینو» می‌نشیند: اتاقک اختصاصی ربات با
//     نور گرم زنده، ذرات طلایی و عمق سه‌بعدی. ربات قهرمان صحنه است
//     و حالت‌هایش از گفتگوی واقعی می‌آید:
//         thinking  → فکر کردن (دست به چانه، نگاه به بالا)
//         speaking  → پاسخ دادن (دهان و ژست دست)
//         happy     → معرفی محصول (جهشِ شاد، جرقه، لبخند پهن)
//         idle      → انتظار آرام (تنفس، پلک، نگاه)
//   • محصولات داخل صحنه از کاتالوگ واقعی‌اند و لمس‌شان یک پرسش واقعی
//     به دستیار می‌فرستد؛ هیچ برچسب/قیمت تستی ثابتی وجود ندارد.
//   • سربرگ خیلی ساده و Premium: مدالیون ژینو، عنوان، «گفتگوی تازه»
//     و دکمهٔ ظریف «بازگشت به فروشگاه».
//
// منطق چت، API و اتصال‌ها دست‌نخورده‌اند (useAssistantChat +
// services/assistant) — فقط پوسته و تجربه عوض شده است.
//
// نکتهٔ تجربهٔ تازه: محصولاتِ صحنه (قفسه و میز استودیو) در شروعِ
// گفتگو پنهان‌اند — صفحه فقط ربات + خوش‌آمدگویی + پیشنهادهاست.
// به‌محض این‌که کاربر سراغ محصولات برود («محصولات را نشان بده»،
// «چه طعم‌هایی دارید؟» …) یا ربات در پاسخش محصولی معرفی کند، قفسه و
// میز با یک لغزشِ نرم ظاهر می‌شوند. این فقط یک «نمایشِ شرطیِ رابط
// کاربری» است: کاتالوگ، موتور پاسخ و API دست‌نخورده‌اند و محصولاتِ
// صحنه همان دادهٔ واقعی فروشگاه‌اند.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AssistantAvatar from '../components/assistant/AssistantAvatar';
import AssistantChat from '../components/assistant/AssistantChat';
import ZhinoLoungeScene, { type ZhinoLoungeHandle, type ZhinoLoungeMode } from '../components/assistant/ZhinoLoungeScene';
import { useAssistantChat } from '../components/assistant/useAssistantChat';
import { ASSISTANT_NAME } from '../components/assistant/assistantData';

/**
 * پرسش‌هایی که یعنی «کاربر دارد سراغ محصولات می‌رود».
 * فقط برای نمایشِ محصولاتِ صحنه به کار می‌رود — تصمیمِ پاسخ، کاتالوگ
 * و API همچنان همان مسیر همیشگی خودشان را می‌روند.
 */
const PRODUCT_INTENT = /محصول|کالا|طعم|قیمت|قيمت|موجود|کاتالوگ|قفسه|ویترین/u;

/** آیکن فروشگاه برای دکمهٔ «بازگشت به فروشگاه» */
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

  /** آخرین پاسخی که محصول معرفی کرده — برای حالت «خوشحال» ربات */
  const lastProductReplyId = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
      const message = chat.messages[i];
      if (message.from === 'bot' && !message.welcome && message.products && message.products.length > 0) {
        return message.id;
      }
    }
    return null;
  }, [chat.messages]);

  /**
   * آیا کاربر تا این لحظه سراغ محصولات رفته است؟ (فقط برای نمایشِ
   * محصولات در صحنهٔ استودیو؛ منطق پاسخ‌گویی تغییر نمی‌کند.)
   * وقتی خودِ ربات هم محصولی معرفی کند، قفسه و میز همراهِ پاسخ باز
   * می‌شوند تا صحنه با گفتگو هماهنگ بماند.
   */
  const productsRequested = useMemo(
    () =>
      chat.messages.some(
        (message) =>
          (message.from === 'user' && PRODUCT_INTENT.test(message.text)) ||
          (message.from === 'bot' && (message.products?.length ?? 0) > 0),
      ),
    [chat.messages],
  );

  const [speakingSim, setSpeakingSim] = useState(false);
  const [happySim, setHappySim] = useState(false);

  useEffect(() => {
    if (lastBotReplyId === null) {
      setSpeakingSim(false);
      return;
    }
    setSpeakingSim(true);
    const timer = window.setTimeout(() => setSpeakingSim(false), 5200);
    return () => window.clearTimeout(timer);
  }, [lastBotReplyId]);

  /* خوشحالیِ معرفی محصول کمی بعد از تمام‌شدن صحبت هم می‌ماند */
  useEffect(() => {
    if (lastProductReplyId === null) {
      setHappySim(false);
      return;
    }
    setHappySim(true);
    const timer = window.setTimeout(() => setHappySim(false), 10000);
    return () => window.clearTimeout(timer);
  }, [lastProductReplyId]);

  const robotMode: ZhinoLoungeMode = chat.thinking
    ? 'thinking'
    : speakingSim
      ? 'speaking'
      : happySim
        ? 'happy'
        : 'idle';

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
      {/* ── سربرگ بسیار ساده: مدالیون، عنوان، گفتگوی تازه، بازگشت ── */}
      <header className="zhino-assistant-topbar">
        <span className="zhino-assistant-brand">
          <span className="zhino-assistant-brand-mark">
            <AssistantAvatar compact={true} mode={robotMode} />
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

      {/* ── استودیوی ژینو — ربات زنده، متصل به وضعیت واقعی گفتگو ──
          لمس محصولات صحنه = پرسش واقعی از دستیار (داده از کاتالوگ). */}
      <ZhinoLoungeScene
        ref={sceneRef}
        mode={robotMode}
        fresh={fresh}
        productsVisible={productsRequested}
        welcomeLine="سلام! من ژینو هستم — هر چه خواستید بپرسید"
        onAsk={(question) => chat.send(question)}
      />

      <AssistantChat chat={chat} />
    </div>
  );
}
