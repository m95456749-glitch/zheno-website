// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵) — محیط گفتگو
//
// این کامپوننت فقط «نمایش» است: تمام وضعیت گفتگو از هوک
// useAssistantChat می‌آید (که خودش بین موتور محلی فروشگاه و مدل
// هوش مصنوعی پشت سرور تصمیم می‌گیرد). بنابراین همین یک محیط، هم
// در صفحهٔ مستقل /assistant و هم در هر سطح دیگری (مثلاً پیش‌نمایش
// پنل مدیریت در آینده) قابل استفاده است.
//
// قابلیت‌ها: پیام فارسی و RTL، آواتار ربات، پیشنهادهای آماده،
// ارسال با Enter، حالت «در حال پاسخ‌گویی»، مدیریت پیام خالی و
// خطای اتصال، اسکرول خودکار و کاملاً واکنش‌گرا.
// ============================================================

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import AssistantAvatar from './AssistantAvatar';
import {
  ASSISTANT_MAX_LENGTH,
  connectionNote,
  connectionLabel,
  type UseAssistantChatResult,
} from './useAssistantChat';

interface Props {
  chat: UseAssistantChatResult;
  className?: string;
}

export default function AssistantChat({ chat, className }: Props) {
  const { messages, draft, setDraft, thinking, connection, dataSource, suggestions, send, clear, retry, canRetry } =
    chat;
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <section className={cn('zhino-assistant-console', className)} aria-label="محیط گفتگوی دستیار ژینو">
      <header className="zhino-assistant-console-head">
        <span className="zhino-assistant-avatar">
          <AssistantAvatar />
        </span>
        <span className="zhino-assistant-titles">
          <span className="zhino-assistant-title">دستیار ژینو</span>
          <span className={cn('zhino-assistant-sub', `is-${connection}`)}>
            {connectionLabel(connection, dataSource)}
          </span>
        </span>
        <button
          type="button"
          onClick={clear}
          className="zhino-assistant-close"
          aria-label="شروع گفتگوی تازه"
          title="شروع گفتگوی تازه"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path
              d="M4.6 6.4h10.8M8.2 6.4V4.9c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.5m-6.3 0 .6 8.2c0 .5.4.9.9.9h4.4c.5 0 .9-.4.9-.9l.6-8.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* خطای اتصال: پاسخ آمده، اما از مدل هوشمند نه — با امکان تلاش دوباره */}
      {canRetry && (
        <div className="zhino-assistant-banner" role="status">
          <span>پاسخ محلی داده شد؛ اتصال به دستیار هوشمند برقرار نشد.</span>
          <button type="button" className="zhino-assistant-banner-retry" onClick={retry}>
            تلاش دوباره
          </button>
        </div>
      )}

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
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('zhino-assistant-row', message.from === 'user' && 'is-user')}
          >
            {message.from === 'bot' && (
              <span className="zhino-assistant-avatar is-small">
                <AssistantAvatar />
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
              {message.welcome && (
                <span className="zhino-assistant-note">{connectionNote(connection, dataSource)}</span>
              )}
              {message.note && <span className="zhino-assistant-note is-warn">{message.note}</span>}
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
          </div>
        ))}

        {thinking && (
          <div className="zhino-assistant-row">
            <span className="zhino-assistant-avatar is-small">
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

      {/* پیشنهادهای آماده — پس از هر پاسخ با پیشنهادهای همان پاسخ عوض می‌شوند */}
      <div className="zhino-assistant-suggestions">
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            className="zhino-assistant-chip"
            onClick={() => send(item.prompt)}
            disabled={thinking}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="zhino-assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="zhino-assistant-field">
          <label className="sr-only" htmlFor="zhino-assistant-input">
            متن پیام به دستیار ژینو
          </label>
          <input
            id="zhino-assistant-input"
            ref={inputRef}
            className="zhino-assistant-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="پیام خود را بنویسید…"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={ASSISTANT_MAX_LENGTH}
            aria-describedby="zhino-assistant-hint"
          />
          <span id="zhino-assistant-hint" className="zhino-assistant-hint">
            {remaining <= 80 ? `${remaining} نویسه باقی مانده` : 'برای ارسال، Enter را بزنید'}
          </span>
        </span>
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
    </section>
  );
}
