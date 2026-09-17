// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۷ و ۸) — محیط گفتگو
//
// این کامپوننت فقط «نمایش» است: تمام وضعیت گفتگو از هوک
// useAssistantChat می‌آید (که خودش بین موتور محلی فروشگاه و مدل
// هوش مصنوعی پشت سرور تصمیم می‌گیرد). بنابراین همین یک محیط، هم
// در صفحهٔ مستقل /assistant و هم در هر سطح دیگری قابل استفاده است.
//
// فاز ۸ — تجربهٔ کاربری:
//   • هیچ متن فنی به مشتری نشان داده نمی‌شود: نه «دیتابیس»، نه
//     «موتور محلی»، نه «اتصال/عدم اتصال به مدل». اتصال دیتابیس و
//     Fallback سرِ جایشان هستند، فقط پشت صحنه.
//   • پیشنهادها چیپ‌های کوچک و Premium‌اند؛ در حالت خوشامد وسط صفحه
//     و بعد از شروع گفتگو در یک ردیف جمع‌شونده بالای کادر نوشتن.
//     کلیک روی هر چیپ، همان پرسش را می‌فرستد.
//   • پاسخ دستیار با صدای خود مرورگر (Web Speech API، بدون هیچ سرویس
//     خارجی) خوانده می‌شود؛ دکمهٔ روشن/خاموش + دکمهٔ توقف. پیش‌فرض
//     خاموش است تا کاربر را اذیت نکند.
//   • امضای کوچک سازنده، زیر کادر نوشتن، کم‌رنگ و بی‌سروصدا.
//
// چیدمان (شبیه ChatGPT):
//   • سربرگ عنوان/دکمه‌ها در AssistantPage است، نه اینجا.
//   • تا وقتی گفتگو تازه است، پیام خوشامد وسط صفحه می‌نشیند.
//   • کادر نوشتن پایین صفحه: گوشه‌های نرم، border ظریف، دکمهٔ ارسال
//     داخل کادر — و در موبایل کاملاً جا می‌افتد.
// ============================================================

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import AssistantAvatar from './AssistantAvatar';
import { ASSISTANT_NAME } from './assistantData';
import { useAssistantSpeech } from './useAssistantSpeech';
import {
  ASSISTANT_MAX_LENGTH,
  ASSISTANT_WELCOME_SUB,
  ASSISTANT_WELCOME_TITLE,
  type UseAssistantChatResult,
} from './useAssistantChat';

interface Props {
  chat: UseAssistantChatResult;
  className?: string;
}

/** آیکن صدای روشن — دکمهٔ خواندن پاسخ */
function SoundOnIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 7.6h2.4L10.5 5v10L6.4 12.4H4a.9.9 0 0 1-.9-.9V8.5c0-.5.4-.9.9-.9Zm9.1-.5a3.4 3.4 0 0 1 0 5.8m1.9-8.2a6.3 6.3 0 0 1 0 10.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** آیکن صدای خاموش */
function SoundOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 7.6h2.4L10.5 5v10L6.4 12.4H4a.9.9 0 0 1-.9-.9V8.5c0-.5.4-.9.9-.9Zm10.1-.2 3.4 3.4m0-3.4-3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** آیکن توقف خواندن */
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="5.6" y="5.6" width="8.8" height="8.8" rx="2" fill="currentColor" />
    </svg>
  );
}

/** آیکن پیشنهاد (جرقهٔ کوچک) — برای چیپ‌ها و ردیف جمع‌شونده */
function IdeaIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M10 2.6c2.6 0 4.6 2 4.6 4.5 0 1.6-.8 2.6-1.7 3.6-.5.6-.7 1-.8 1.8H7.9c-.1-.8-.3-1.2-.8-1.8-.9-1-1.7-2-1.7-3.6C5.4 4.6 7.4 2.6 10 2.6ZM7.9 14.4h4.2M8.6 16.8h2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** آیکن بازشوندهٔ ردیف پیشنهادها */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true">
      <path d="m6 12 4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AssistantChat({ chat, className }: Props) {
  // «گفتگوی تازه» (clear) در سربرگ صفحه است، نه اینجا
  const { messages, draft, setDraft, thinking, suggestions, send } = chat;
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    available: voiceAvailable,
    status: voiceStatus,
    enabled: voiceOn,
    speaking: voiceReading,
    setEnabled,
    speak,
    stop,
  } = useAssistantSpeech();
  /** چیپ‌ها بعد از شروع گفتگو جمع می‌شوند؛ کاربر هر وقت خواست باز می‌کند */
  const [ideasOpen, setIdeasOpen] = useState(false);
  /** پیغام کوتاه و انسانیِ «این مرورگر صدا ندارد» — چند لحظه بعد می‌رود */
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  /** کدام پیام الان خوانده می‌شود (برای تبدیل دکمهٔ «خواندن» به «توقف») */
  const [readingId, setReadingId] = useState<number | null>(null);
  const spokenId = useRef(0);

  // گفتگو همیشه به آخرین پیام اسکرول می‌شود
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages, thinking]);

  // روی دسکتاپ فوکوس از همان ابتدا داخل کادر ورود پیام است.
  // روی موبایل عمداً فوکوس نمی‌کنیم تا کیبورد ناخواسته باز نشود.
  useEffect(() => {
    const finePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) inputRef.current?.focus();
  }, []);

  /** گفتگوی تازه: هنوز فقط پیام خوشامد در فهرست است */
  const fresh = messages.length === 1 && messages[0]?.welcome === true && !thinking;

  // با شروع گفتگوی تازه، هم خواندن ساکت می‌شود و هم پیشنهادها جمع می‌شوند
  useEffect(() => {
    if (!fresh) return;
    stop();
    setReadingId(null);
    spokenId.current = 0;
    setIdeasOpen(false);
  }, [fresh, stop]);

  // هر پاسخ تازه (به‌جز خوشامد) یک‌بار خوانده می‌شود — فقط اگر روشن باشد
  useEffect(() => {
    if (!voiceOn || thinking) return;
    const last = messages[messages.length - 1];
    if (!last || last.from !== 'bot' || last.welcome) return;
    if (spokenId.current === last.id) return;
    spokenId.current = last.id;
    setReadingId(last.id);
    speak(last.text);
  }, [messages, thinking, voiceOn, speak]);

  // بعد از هر پرسش، ردیف پیشنهادها دوباره جمع می‌شود تا چت خلوت بماند
  useEffect(() => {
    setIdeasOpen(false);
  }, [messages.length]);

  // راهنمای صدا چند ثانیه می‌ماند و خودش می‌رود
  useEffect(() => {
    if (!voiceNotice) return;
    const timer = window.setTimeout(() => setVoiceNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [voiceNotice]);

  const submit = () => {
    if (draft.trim().length === 0 || thinking) return;
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter می‌فرستد؛ Shift+Enter خط جدید (رفتار معمول چت)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = ASSISTANT_MAX_LENGTH - draft.length;
  // راهنمای کوتاه زیر کادر؛ فقط وقتی طول پیام به سقف نزدیک می‌شود، شمارنده جایش می‌آید
  const hint = remaining <= 80 ? `${remaining} نویسه باقی مانده` : 'برای ارسال، Enter را بزنید';

  /** روشن/خاموش کردن خواندن پاسخ‌ها — اگر مرورگر صدا نداشت، فقط گفته می‌شود */
  const toggleVoice = () => {
    if (!voiceAvailable) {
      setVoiceNotice('این مرورگر خواندن با صدا را ندارد؛ متن پاسخ کامل روی صفحه است.');
      return;
    }
    if (!voiceOn && voiceStatus === 'none') {
      setVoiceNotice('صدای فارسی روی این دستگاه نصب نیست؛ متن پاسخ را می‌خوانید.');
      return;
    }
    // تازه روشن‌کردن صدا نباید پاسخ قبلی را بلند بخواند: همان را «خوانده‌شده»
    // علامت می‌زنیم و فقط پاسخ‌های بعدی صدا پیدا می‌کنند
    if (!voiceOn) {
      const last = messages[messages.length - 1];
      if (last) spokenId.current = last.id;
    }
    setEnabled(!voiceOn);
  };

  /** دکمهٔ «خواندن» زیر هر پاسخ */
  const readAnswer = (id: number, text: string) => {
    if (!voiceAvailable) {
      setVoiceNotice('این مرورگر خواندن با صدا را ندارد؛ متن پاسخ کامل روی صفحه است.');
      return;
    }
    if (readingId === id && voiceReading) {
      stop();
      setReadingId(null);
      return;
    }
    if (voiceStatus === 'none') {
      setVoiceNotice('صدای فارسی روی این دستگاه نصب نیست؛ متن پاسخ را می‌خوانید.');
      return;
    }
    spokenId.current = id;
    setReadingId(id);
    speak(text);
  };

  const chips = (
    <div className="zhino-assistant-ideas-list">
      {suggestions.map((item) => (
        <button
          key={item.label}
          type="button"
          className="zhino-assistant-chip"
          onClick={() => send(item.prompt)}
          disabled={thinking}
        >
          <span className="zhino-assistant-chip-spark" aria-hidden="true">
            <IdeaIcon />
          </span>
          <span className="zhino-assistant-chip-text">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <section className={cn('zhino-assistant-console', className)} aria-label="محیط گفتگوی دستیار ژینو">
      <div
        className="zhino-assistant-feed"
        ref={feedRef}
        role="log"
        aria-live="polite"
        aria-busy={thinking}
        aria-label="پیام‌های گفتگو"
        // tabIndex لازم است تا کاربر کیبوردی بتواند در فهرست پیام‌ها اسکرول کند
        tabIndex={0}
      >
        {fresh ? (
          /* پیام خوشامد — کوتاه، فارسی و وسط صفحه، با پیشنهادها زیر آن */
          <div className="zhino-assistant-welcome">
            <span className="zhino-assistant-welcome-mark">
              <AssistantAvatar />
            </span>
            <h2 className="zhino-assistant-welcome-title">{ASSISTANT_WELCOME_TITLE}</h2>
            <p className="zhino-assistant-welcome-sub">{ASSISTANT_WELCOME_SUB}</p>
            <span className="rule-lux zhino-assistant-welcome-rule" aria-hidden="true" />
            <div className="zhino-assistant-welcome-chips">{chips}</div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn('zhino-assistant-row', message.from === 'user' && 'is-user')}
            >
              {message.from === 'bot' && (
                <span className="zhino-assistant-avatar">
                  <AssistantAvatar />
                </span>
              )}
              <div className="zhino-assistant-stack">
                <div
                  className={cn(
                    'zhino-assistant-bubble',
                    message.from === 'user' ? 'is-user' : 'is-bot',
                    message.links && 'zhino-assistant-card',
                  )}
                >
                  {message.text}
                  {/* یادداشت کوتاه و انسانی — فقط وقتی پاسخ هوشمند دادهٔ
                      فروشگاه را نداشته؛ بدون هیچ اصطلاح فنی */}
                  {message.note && <span className="zhino-assistant-note">{message.note}</span>}
                  {message.links && (
                    <span className="zhino-assistant-links">
                      {message.links.map((item) => (
                        <Link key={`${message.id}-${item.to}`} to={item.to} className="zhino-assistant-link">
                          {item.label}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>

                {/* کار کوچک زیر پاسخ: خواندن با صدای مرورگر */}
                {message.from === 'bot' && !message.welcome && voiceAvailable && (
                  <div className="zhino-assistant-msg-foot">
                    <button
                      type="button"
                      className="zhino-assistant-read"
                      onClick={() => readAnswer(message.id, message.text)}
                      aria-label={readingId === message.id && voiceReading ? 'توقف خواندن این پاسخ' : 'خواندن این پاسخ'}
                      title={readingId === message.id && voiceReading ? 'توقف خواندن' : 'خواندن با صدای مرورگر'}
                    >
                      {readingId === message.id && voiceReading ? <StopIcon /> : <SoundOnIcon />}
                      <span>{readingId === message.id && voiceReading ? 'توقف خواندن' : 'خواندن پاسخ'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {thinking && (
          <div className="zhino-assistant-row">
            <span className="zhino-assistant-avatar">
              <AssistantAvatar />
            </span>
            <div className="zhino-assistant-bubble is-bot">
              <span className="zhino-assistant-typing">
                <span />
                <span />
                <span />
              </span>
              <span className="sr-only">در حال پاسخ‌گویی…</span>
            </div>
          </div>
        )}
      </div>

      {/* کادر نوشتن پیام — همیشه پایین صفحه، الگوی ChatGPT */}
      <div className="zhino-assistant-composer">
        {/* بعد از شروع گفتگو پیشنهادها در یک ردیف جمع‌شونده می‌نشینند */}
        {!fresh && suggestions.length > 0 && (
          <div className="zhino-assistant-ideas">
            <button
              type="button"
              className="zhino-assistant-ideas-toggle"
              onClick={() => setIdeasOpen((open) => !open)}
              aria-expanded={ideasOpen}
              aria-controls="zhino-assistant-ideas-list"
            >
              <IdeaIcon />
              <span>پیشنهادها</span>
              <span className="zhino-assistant-ideas-caret" aria-hidden="true">
                <ChevronIcon />
              </span>
            </button>
            {ideasOpen && (
              <div id="zhino-assistant-ideas-list" className="zhino-assistant-ideas-body">
                {chips}
              </div>
            )}
          </div>
        )}

        <form
          className="zhino-assistant-composer-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <span className="zhino-assistant-field">
            <label className="sr-only" htmlFor="zhino-assistant-input">
              متن پیام به {ASSISTANT_NAME}
            </label>
            <input
              id="zhino-assistant-input"
              ref={inputRef}
              className="zhino-assistant-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`پیام خود را برای ${ASSISTANT_NAME} بنویسید…`}
              autoComplete="off"
              enterKeyHint="send"
              maxLength={ASSISTANT_MAX_LENGTH}
              aria-describedby="zhino-assistant-hint"
            />
          </span>

          {/* خواندن پاسخ‌ها با صدای خود مرورگر — پیش‌فرض خاموش */}
          <button
            type="button"
            className={cn('zhino-assistant-voice', voiceOn && 'is-on')}
            onClick={toggleVoice}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? 'خاموش کردن صدای پاسخ‌ها' : 'روشن کردن صدای پاسخ‌ها'}
            title={voiceOn ? 'صدای پاسخ‌ها روشن است — برای خاموش کردن بزنید' : 'پاسخ‌ها با صدای مرورگر خوانده شود'}
          >
            {voiceOn ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>

          <button
            type="submit"
            className="zhino-assistant-send"
            disabled={thinking || draft.trim().length === 0}
            aria-label="ارسال پیام"
            title="ارسال پیام"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 -scale-x-100" aria-hidden="true">
              <path
                d="M2.7 9.3 17.2 2.6a.6.6 0 0 1 .8.75l-6.6 14.9a.6.6 0 0 1-1.1-.05l-1.8-5-5.05-1.8a.6.6 0 0 1-.05-1.1Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>

        <div className="zhino-assistant-composer-meta">
          <span id="zhino-assistant-hint" className="zhino-assistant-hint">
            {hint}
          </span>
          {voiceReading && (
            <button
              type="button"
              className="zhino-assistant-stop"
              onClick={() => {
                stop();
                setReadingId(null);
              }}
              aria-label="توقف خواندن"
            >
              <StopIcon />
              <span>توقف خواندن</span>
              <span className="zhino-assistant-soundbars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          )}
        </div>

        {voiceNotice && (
          <p className="zhino-assistant-voice-note" role="status">
            {voiceNotice}
          </p>
        )}

        {/* امضای کوچک سازنده — کم‌رنگ، بی‌مزاحمت */}
        <p className="zhino-assistant-signature">ساخته شده توسط m.azizi</p>
      </div>
    </section>
  );
}
