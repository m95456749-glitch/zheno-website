// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۴ — فقط رابط کاربری)
//
// این کامپوننت فقط دو چیز است:
//   ۱) دکمهٔ شناور ربات — سمت چپ صفحه، `position: fixed`،
//      هم‌هویت با برند (burgundy #71313B) و با انیمیشن ظریف.
//   ۲) محیط گفت‌وگوی فارسی و RTL با سربرگ، پیام خوش‌آمد،
//      چهار پیشنهاد آماده، کادر ورود پیام و دکمهٔ بستن.
//
// هیچ اتصال واقعی به هوش مصنوعی، Supabase یا دیتابیس اینجا
// وجود ندارد: پاسخ‌ها متن‌های از پیش نوشته‌شدهٔ assistantData
// هستند (اتصال واقعی در مرحلهٔ بعد). هیچ درخواست شبکه‌ای هم
// زده نمی‌شود، پس فروشگاه و پنل دست‌نخورده می‌مانند.
//
// لینک‌های داخل پاسخ‌ها فقط مسیرهای موجود فروشگاه‌اند و از
// react-router استفاده می‌کنند (Routing دست‌نخورده).
//
// این کامپوننت در Layout فروشگاه رندر می‌شود، نه در پنل مدیریت؛
// همچنین روی صفحه‌های «سبد خرید» و «تسویه حساب» نمایش داده
// نمی‌شود تا با دکمه‌های پایین فرم تداخل نکند.
// ============================================================

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import {
  ASSISTANT_BOT_IMAGE,
  ASSISTANT_DEMO_NOTE,
  ASSISTANT_FALLBACK,
  ASSISTANT_GREETING,
  ASSISTANT_INTENTS,
  buildAssistantReply,
  intentLinks,
  matchIntent,
  type AssistantIntentId,
} from './assistantData';
import './assistant.css';

interface ChatMessage {
  id: number;
  from: 'bot' | 'user';
  text: string;
  /** لینک‌های داخلی سایت که زیر پاسخ نمایش داده می‌شوند */
  links?: { label: string; to: string }[];
  /** یادداشت «نسخهٔ نمایشی» (فقط زیر پیام خوش‌آمدگویی) */
  note?: boolean;
}

/** تصویر ربات — همان هویت بصری در دکمه، سربرگ و پیام‌ها */
function BotMark() {
  const [failed, setFailed] = useState(false);

  // اگر تصویر به هر دلیلی بارگذاری نشد، هیچ‌وقت تصویر شکسته دیده
  // نمی‌شود؛ همان ربات به‌صورت نشانهٔ برداری درون‌خطی می‌آید.
  if (failed) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.1c.5 0 .9.4.9.9v1.3h2.3a4.1 4.1 0 0 1 4.1 4.1v5.9a3.3 3.3 0 0 1-3.3 3.3H8a3.3 3.3 0 0 1-3.3-3.3v-5.9A4.1 4.1 0 0 1 8.8 5.3h2.3V4c0-.5.4-.9.9-.9Z"
          fill="var(--color-wine-800)"
        />
        <circle cx="9.5" cy="12.1" r="1.35" fill="var(--color-gold-300)" />
        <circle cx="14.5" cy="12.1" r="1.35" fill="var(--color-gold-300)" />
        <path
          d="M9.7 15.3c.7.6 1.5.9 2.3.9s1.6-.3 2.3-.9"
          stroke="var(--color-wine-800)"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  return (
    <img
      src={ASSISTANT_BOT_IMAGE}
      alt=""
      width={96}
      height={96}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default function ZhinoAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  /** نقطهٔ طلایی «تازه» روی دکمه — بعد از اولین باز شدن می‌رود */
  const [introduced, setIntroduced] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 1, from: 'bot', text: ASSISTANT_GREETING, note: true },
  ]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextId = useRef(2);
  const timers = useRef<number[]>([]);
  /** قفل هم‌زمان: دو کلیک سریع نباید دو پاسخ پشت‌سرهم بسازد */
  const busy = useRef(false);

  // هیچ تایمری بعد از بسته‌شدن کامپوننت باقی نمی‌ماند
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    },
    [],
  );

  const push = useCallback((message: Omit<ChatMessage, 'id'>) => {
    // شناسه بیرون از تابع به‌روزرسانی ساخته می‌شود تا در حالت
    // StrictMode (که به‌روزرسانی‌ها دو بار اجرا می‌شوند) شمارنده
    // دو بار جلو نرود.
    const id = nextId.current++;
    setMessages((current) => [...current, { ...message, id }]);
  }, []);

  /** ثبت پیام کاربر و پاسخ نمایشی دستیار (بدون هیچ درخواست شبکه‌ای) */
  const ask = useCallback(
    (text: string, intentId?: AssistantIntentId) => {
      const clean = text.trim();
      if (!clean || busy.current) return;

      busy.current = true;
      push({ from: 'user', text: clean });
      setDraft('');
      setThinking(true);

      const intent = intentId ?? matchIntent(clean);
      // تأخیر کوتاه و طبیعی، مثل یک مکالمهٔ واقعی
      const delay = 520 + Math.round(Math.random() * 260);
      const timer = window.setTimeout(() => {
        busy.current = false;
        setThinking(false);
        if (intent) {
          push({ from: 'bot', text: buildAssistantReply(intent), links: intentLinks(intent) });
        } else {
          push({ from: 'bot', text: ASSISTANT_FALLBACK });
        }
      }, delay);
      timers.current.push(timer);
    },
    [push],
  );

  const openChat = useCallback(() => {
    setOpen(true);
    setIntroduced(true);
  }, []);

  const closeChat = useCallback(() => {
    // اگر فوکوس داخل پنل بود، به دکمهٔ شناور برگردد (کاربر کیبورد)
    const active = document.activeElement;
    const restoreFocus = !!panelRef.current && !!active && panelRef.current.contains(active);
    setOpen(false);
    if (restoreFocus) launcherRef.current?.focus();
  }, []);

  const toggleChat = useCallback(() => {
    if (open) closeChat();
    else openChat();
  }, [open, closeChat, openChat]);

  // گفتگو همیشه به آخرین پیام اسکرول می‌شود
  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [open, messages, thinking]);

  // کلید Escape گفتگو را می‌بندد
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeChat]);

  // روی دسکتاپ، فوکوس از همان ابتدا داخل کادر ورود پیام است.
  // روی موبایل عمداً فوکوس نمی‌کنیم تا کیبورد ناخواسته باز نشود.
  useEffect(() => {
    if (!open) return;
    const finePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) inputRef.current?.focus();
  }, [open]);

  // نشانهٔ سراسری برای اینکه توست فروشگاه زیر پنل گفتگو پنهان نماند
  // (فقط یک کلاس روی body؛ هیچ رفتاری در Toast تغییر نمی‌کند)
  useEffect(() => {
    document.body.classList.toggle('zhino-assistant-open', open);
    return () => document.body.classList.remove('zhino-assistant-open');
  }, [open]);

  // فوکوس با Tab داخل پنل می‌ماند (گفتگو پایین صفحه باز می‌شود و
  // فوکوس نباید به پشت آن رها شود)
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    }
  };

  return (
    <>
      {/* ── دکمهٔ شناور دستیار — سمت چپ، ثابت در اسکرول ── */}
      <button
        ref={launcherRef}
        type="button"
        onClick={toggleChat}
        className="zhino-assistant-launcher"
        aria-label={open ? 'بستن گفتگو با دستیار ژینو' : 'گفتگو با دستیار ژینو'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="zhino-assistant-float">
          <span className="zhino-assistant-medallion">
            <BotMark />
            {!introduced && <span className="zhino-assistant-dot" aria-hidden="true" />}
          </span>
          <span className="zhino-assistant-tip" aria-hidden="true">
            دستیار ژینو
          </span>
        </span>
      </button>

      {/* ── محیط گفتگو ── */}
      {open && (
        <div
          ref={panelRef}
          className="zhino-assistant-panel"
          role="dialog"
          aria-label="دستیار ژینو"
          onKeyDown={keepFocusInside}
        >
          <header className="zhino-assistant-head grain">
            <span className="zhino-assistant-medallion">
              <BotMark />
            </span>
            <span className="zhino-assistant-titles">
              <span className="zhino-assistant-title block">دستیار ژینو</span>
              <span className="zhino-assistant-sub">نسخهٔ نمایشی</span>
            </span>
            <button
              type="button"
              onClick={closeChat}
              className="zhino-assistant-close"
              aria-label="بستن گفتگو"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="zhino-assistant-body" ref={bodyRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('zhino-assistant-row', message.from === 'user' && 'is-user')}
              >
                {message.from === 'bot' && (
                  <span className="zhino-assistant-avatar">
                    <BotMark />
                  </span>
                )}
                <div
                  className={cn(
                    'zhino-assistant-bubble',
                    message.from === 'user' ? 'is-user' : 'is-bot',
                    message.links && 'zhino-assistant-card',
                  )}
                >
                  {message.text}
                  {message.note && <span className="zhino-assistant-note">{ASSISTANT_DEMO_NOTE}</span>}
                  {message.links && (
                    <span className="zhino-assistant-links">
                      {message.links.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="zhino-assistant-link"
                          onClick={closeChat}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="zhino-assistant-row">
                <span className="zhino-assistant-avatar">
                  <BotMark />
                </span>
                <div className="zhino-assistant-bubble is-bot">
                  <span className="zhino-assistant-typing">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="sr-only">در حال نوشتن پاسخ…</span>
                </div>
              </div>
            )}
          </div>

          {/* چهار پیشنهاد آماده */}
          <div className="zhino-assistant-suggestions">
            {ASSISTANT_INTENTS.map((intent) => (
              <button
                key={intent.id}
                type="button"
                className="zhino-assistant-chip"
                onClick={() => ask(intent.prompt, intent.id)}
                disabled={thinking}
              >
                {intent.chip}
              </button>
            ))}
          </div>

          <form
            className="zhino-assistant-compose"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <label className="sr-only" htmlFor="zhino-assistant-input">
              متن پیام به دستیار ژینو
            </label>
            <input
              id="zhino-assistant-input"
              ref={inputRef}
              className="zhino-assistant-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="پیام خود را بنویسید…"
              autoComplete="off"
              maxLength={400}
            />
            <button
              type="submit"
              className="zhino-assistant-send"
              disabled={thinking || draft.trim().length === 0}
              aria-label="ارسال پیام"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 -scale-x-100" aria-hidden="true">
                <path
                  d="M2.7 9.3 17.2 2.6a.6.6 0 0 1 .8.75l-6.6 14.9a.6.6 0 0 1-1.1-.05l-1.8-5-5.05-1.8a.6.6 0 0 1-.05-1.1Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
