// ============================================================
// ZHINO — محیط گفتگو با کاراکتر سه‌بعدی جدید
// کاراکتر زنده: idle, thinking, speaking, greeting
// ============================================================

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { formatPrice, toPersianDigits } from '../../utils/format';
import { cheapestVariant } from '../../services/assistant/knowledge';
import AssistantAvatar from './AssistantAvatar';
import ZhinoWelcomeAnimation from './ZhinoWelcomeAnimation';
import { ASSISTANT_NAME } from './assistantData';
import { useAssistantSpeech } from './useAssistantSpeech';
import { useVoiceSettings } from '../../services/voiceSettings';
import {
  ASSISTANT_MAX_LENGTH,
  ASSISTANT_WELCOME_TITLE,
  type UseAssistantChatResult,
} from './useAssistantChat';

interface Props {
  chat: UseAssistantChatResult;
  className?: string;
}

const VOICE_UNAVAILABLE_MSG = 'این مرورگر خواندن با صدا را ندارد؛ متن پاسخ کامل روی صفحه است.';
const NO_PERSIAN_MSG = 'صدای فارسی روی این دستگاه نیست؛ متن پاسخ را همین‌جا می‌خوانید.';
const ANDROID_VOICE_HINT = 'برای فعال‌شدن صدا: در تنظیمات اندروید، بخش «تبدیل متن به گفتار» را باز کنید و صدای فارسی را نصب کنید.';
const ENGINE_STALLED_MSG = 'شروع صدا نشد؛ دوباره بزنید تا یک‌بار دیگر امتحان شود.';
const LOADING_VOICE_MSG = 'در حال آماده‌سازی صدا… لطفاً دوباره بزنید.';
const CLOUD_FAILED_MSG = 'صدا این لحظه در دسترس نیست؛ متن پاسخ را همین‌جا می‌خوانید.';
const NOT_ALLOWED_MSG = 'پخش خودکار توسط مرورگر مسدود شد؛ برای شنیدن روی دکمهٔ «خواندن پاسخ» بزنید.';
const PREPARING_VOICE_MSG = 'در حال آماده‌سازی صدا…';

function isAndroidDevice(): boolean {
  try {
    return /Android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

function SoundOnIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4 7.6h2.4L10.5 5v10L6.4 12.4H4a.9.9 0 0 1-.9-.9V8.5c0-.5.4-.9.9-.9Zm9.1-.5a3.4 3.4 0 0 1 0 5.8m1.9-8.2a6.3 6.3 0 0 1 0 10.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SoundOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4 7.6h2.4L10.5 5v10L6.4 12.4H4a.9.9 0 0 1-.9-.9V8.5c0-.5.4-.9.9-.9Zm10.1-.2 3.4 3.4m0-3.4-3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="5.6" y="5.6" width="8.8" height="8.8" rx="2" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="5.8" y="4.8" width="3" height="10.4" rx="1.2" fill="currentColor" />
      <rect x="11.2" y="4.8" width="3" height="10.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M6.8 4.9c0-.8.9-1.3 1.6-.9l6.6 4.1c.6.4.6 1.4 0 1.8l-6.6 4.1c-.7.4-1.6-.1-1.6-.9V4.9Z" fill="currentColor" />
    </svg>
  );
}
function IdeaIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M10 2.6c2.6 0 4.6 2 4.6 4.5 0 1.6-.8 2.6-1.7 3.6-.5.6-.7 1-.8 1.8H7.9c-.1-.8-.3-1.2-.8-1.8-.9-1-1.7-2-1.7-3.6C5.4 4.6 7.4 2.6 10 2.6ZM7.9 14.4h4.2M8.6 16.8h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true">
      <path d="m6 12 4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BasketIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M2.9 6.9h14.2l-1.3 8a1.6 1.6 0 0 1-1.6 1.3H5.8a1.6 1.6 0 0 1-1.6-1.3l-1.3-8Zm4.4 0L9 3.4m2 3.5 1.7-3.5M8 10v3m4-3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m4.6 10.4 3.3 3.3 7.5-7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AssistantChat({ chat, className }: Props) {
  const { messages, draft, setDraft, thinking, suggestions, send, acceptCartOffer, dismissCartOffer } = chat;
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    available: voiceAvailable,
    status: voiceStatus,
    enabled: voiceOn,
    loading: voiceLoading,
    speaking: voiceReading,
    paused: voicePaused,
    voiceProblem,
    setEnabled,
    speak,
    stop,
    pause,
    resume,
  } = useAssistantSpeech();
  const voiceSite = useVoiceSettings();
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<number | null>(null);
  const spokenId = useRef(0);

  const showVoiceNotice = (main: string, hint: string | null = null) => {
    setVoiceNotice(main);
    setVoiceHint(hint);
  };

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    const finePointer = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) inputRef.current?.focus();
  }, []);

  const fresh = messages.length === 1 && messages[0]?.welcome === true && !thinking;

  useEffect(() => {
    if (!fresh) return;
    stop();
    setReadingId(null);
    spokenId.current = 0;
    setIdeasOpen(false);
  }, [fresh, stop]);

  useEffect(() => {
    if (!voiceOn || !voiceSite.autoVoice || !voiceSite.voiceEnabled || thinking) return;
    const last = messages[messages.length - 1];
    if (!last || last.from !== 'bot' || last.welcome) return;
    if (spokenId.current === last.id) return;
    spokenId.current = last.id;
    setReadingId(last.id);
    speak(last.text);
  }, [messages, thinking, voiceOn, voiceSite.autoVoice, voiceSite.voiceEnabled, speak]);

  useEffect(() => {
    setIdeasOpen(false);
  }, [messages.length]);

  useEffect(() => {
    if (!voiceNotice) {
      setVoiceHint(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setVoiceNotice(null);
      setVoiceHint(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [voiceNotice]);

  useEffect(() => {
    if (!voiceReading && !voicePaused && !voiceLoading) {
      setReadingId(null);
    }
  }, [voiceReading, voicePaused, voiceLoading]);

  useEffect(() => {
    if (!voiceProblem) return;
    if (voiceProblem === 'no-persian-voice') {
      showVoiceNotice(NO_PERSIAN_MSG, isAndroidDevice() ? ANDROID_VOICE_HINT : null);
    } else if (voiceProblem === 'cloud-failed' || voiceProblem === 'cloud-not-deployed') {
      showVoiceNotice(CLOUD_FAILED_MSG);
    } else if (voiceProblem === 'not-allowed') {
      showVoiceNotice(NOT_ALLOWED_MSG);
    } else {
      showVoiceNotice(ENGINE_STALLED_MSG);
    }
    setReadingId(null);
  }, [voiceProblem]);

  const submit = () => {
    if (draft.trim().length === 0 || thinking) return;
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = ASSISTANT_MAX_LENGTH - draft.length;
  const hint = remaining <= 80 ? `${remaining} نویسه باقی مانده` : 'برای ارسال، Enter را بزنید';

  const toggleVoice = () => {
    if (!voiceAvailable) {
      showVoiceNotice(VOICE_UNAVAILABLE_MSG);
      return;
    }
    if (!voiceOn && voiceStatus === 'none') {
      showVoiceNotice(NO_PERSIAN_MSG, isAndroidDevice() ? ANDROID_VOICE_HINT : null);
      return;
    }
    if (!voiceOn && voiceStatus === 'loading') {
      showVoiceNotice(LOADING_VOICE_MSG);
    }
    if (!voiceOn) {
      const last = messages[messages.length - 1];
      if (last) spokenId.current = last.id;
    }
    setEnabled(!voiceOn);
  };

  const readAnswer = (id: number, text: string) => {
    if (!voiceAvailable) {
      showVoiceNotice(VOICE_UNAVAILABLE_MSG);
      return;
    }
    if (readingId === id && (voiceReading || voicePaused)) {
      if (voicePaused) {
        resume();
        return;
      }
      stop();
      setReadingId(null);
      return;
    }
    if (readingId === id && voiceLoading) {
      stop();
      setReadingId(null);
      return;
    }
    if (voiceLoading || voiceReading || voicePaused) {
      stop();
    }
    if (voiceStatus === 'none') {
      showVoiceNotice(NO_PERSIAN_MSG, isAndroidDevice() ? ANDROID_VOICE_HINT : null);
      return;
    }
    if (voiceStatus === 'loading') {
      showVoiceNotice(LOADING_VOICE_MSG);
    }
    spokenId.current = id;
    setReadingId(id);
    speak(text);
  };

  const chips = (
    <div className="zhino-assistant-ideas-list">
      {suggestions.map((item) => (
        <button key={item.label} type="button" className="zhino-assistant-chip" onClick={() => send(item.prompt)} disabled={thinking}>
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
      <div className="zhino-assistant-feed" ref={feedRef} role="log" aria-live="polite" aria-busy={thinking} aria-label="پیام‌های گفتگو" tabIndex={0}>
        {fresh ? (
          <div className="zhino-assistant-welcome">
            <ZhinoWelcomeAnimation />
            <h2 className="zhino-assistant-welcome-title">{ASSISTANT_WELCOME_TITLE}</h2>
            <span className="rule-lux zhino-assistant-welcome-rule" aria-hidden="true" />
            {voiceSite.suggestions && <div className="zhino-assistant-welcome-chips">{chips}</div>}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={cn('zhino-assistant-row', message.from === 'user' && 'is-user')}>
              {message.from === 'bot' && (
                <span className="zhino-assistant-avatar">
                  <AssistantAvatar compact={true} size={42} mode={thinking ? 'thinking' : readingId === message.id && voiceReading ? 'speaking' : 'idle'} />
                </span>
              )}
              <div className="zhino-assistant-stack">
                <div className={cn('zhino-assistant-bubble', message.from === 'user' ? 'is-user' : 'is-bot', message.links && 'zhino-assistant-card')}>
                  {message.text}
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
                  {message.from === 'bot' && message.products && message.products.length > 0 && (
                    <span className="zhino-assistant-products">
                      {message.products.map((product) => {
                        const option = cheapestVariant(product);
                        const out = option === null;
                        const lowStock = option !== null && option.stock > 0 && option.stock <= 5;
                        return (
                          <span key={`${message.id}-${product.id}`} className={cn('zhino-assistant-product', out && 'is-out')}>
                            <span className="zhino-assistant-product-main">
                              <span className="zhino-assistant-product-name">{product.name}</span>
                              <span className="zhino-assistant-product-meta">
                                {option ? (
                                  <>
                                    <span className="zhino-assistant-product-price">{formatPrice(option.price)}</span>
                                    <span className="zhino-assistant-product-sep" aria-hidden="true">·</span>
                                    <span>{option.weight}</span>
                                    <span className="zhino-assistant-product-sep" aria-hidden="true">·</span>
                                    <span className={cn('zhino-assistant-product-stock', out && 'is-out', lowStock && 'is-low')}>
                                      {out ? 'ناموجود' : lowStock ? `فقط ${toPersianDigits(String(option.stock))} عدد` : 'موجود'}
                                    </span>
                                  </>
                                ) : (
                                  <span className="zhino-assistant-product-stock is-out">ناموجود</span>
                                )}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="zhino-assistant-add"
                              disabled={out || thinking}
                              onClick={() => {
                                if (!option) return;
                                acceptCartOffer(message.id, {
                                  productId: product.id,
                                  variantId: option.id,
                                  label: `${product.shortName}${option.weight ? ` ${option.weight}` : ''}`.trim(),
                                  price: option.price,
                                  stock: option.stock,
                                });
                              }}
                              aria-label={out ? `${product.shortName} ناموجود است` : `درخواست افزودن ${product.shortName} به سبد خرید`}
                              title={out ? 'ناموجود' : 'افزودن به سبد خرید — با تأیید شما'}
                            >
                              {out ? <span>ناموجود</span> : <BasketIcon />}
                              {!out && <span>افزودن به سبد</span>}
                            </button>
                          </span>
                        );
                      })}
                    </span>
                  )}
                </div>
                {message.from === 'bot' && message.cartOffer && (message.cartState ?? 'pending') === 'pending' && (
                  <div className="zhino-assistant-cart-confirm" role="group" aria-label="تأیید افزودن به سبد خرید">
                    <p className="zhino-assistant-cart-confirm-text">
                      <span>{message.cartOffer.label} — {formatPrice(message.cartOffer.price)}</span>
                      <span>به سبد خرید اضافه شود؟</span>
                    </p>
                    <div className="zhino-assistant-cart-confirm-actions">
                      <button type="button" className="zhino-assistant-cart-yes" onClick={() => acceptCartOffer(message.id, message.cartOffer!)}>
                        <CheckIcon />
                        <span>بله، اضافه کن</span>
                      </button>
                      <button type="button" className="zhino-assistant-cart-no" onClick={() => dismissCartOffer(message.id, message.cartOffer!)}>
                        نه
                      </button>
                    </div>
                  </div>
                )}
                {message.from === 'bot' && !message.welcome && voiceAvailable && (
                  <div className="zhino-assistant-msg-foot">
                    {(() => {
                      const isReadingThis = readingId === message.id;
                      const isPausedThis = isReadingThis && voicePaused;
                      const isPlayingThis = isReadingThis && voiceReading;
                      const isPreparingThis = isReadingThis && voiceLoading;
                      return (
                        <button
                          type="button"
                          className="zhino-assistant-read"
                          onClick={() => readAnswer(message.id, message.text)}
                          aria-busy={isPreparingThis || undefined}
                          aria-label={isPreparingThis ? 'در حال آماده‌سازی صدا — برای لغو بزنید' : isPlayingThis ? 'توقف خواندن این پاسخ' : isPausedThis ? 'ادامه خواندن این پاسخ' : 'خواندن این پاسخ'}
                          title={isPreparingThis ? 'در حال آماده‌سازی صدا…' : isPlayingThis ? 'توقف خواندن' : isPausedThis ? 'ادامهٔ خواندن' : 'خواندن این پاسخ'}
                        >
                          {isPlayingThis || isPreparingThis ? <StopIcon /> : isPausedThis ? <PlayIcon /> : <SoundOnIcon />}
                          <span>{isPreparingThis ? PREPARING_VOICE_MSG : isPlayingThis ? 'توقف خواندن' : isPausedThis ? 'ادامه خواندن' : 'خواندن پاسخ'}</span>
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {thinking && (
          <div className="zhino-assistant-row">
            <span className="zhino-assistant-avatar">
              <AssistantAvatar compact={true} size={42} mode="thinking" />
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

      <div className="zhino-assistant-composer">
        {!fresh && voiceSite.suggestions && suggestions.length > 0 && (
          <div className="zhino-assistant-ideas">
            <button type="button" className="zhino-assistant-ideas-toggle" onClick={() => setIdeasOpen((open) => !open)} aria-expanded={ideasOpen} aria-controls="zhino-assistant-ideas-list">
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

          {voiceSite.autoVoice && voiceSite.voiceEnabled && (
            <button type="button" className={cn('zhino-assistant-voice', voiceOn && 'is-on')} onClick={toggleVoice} aria-pressed={voiceOn} aria-label={voiceOn ? 'خاموش کردن صدای پاسخ‌ها' : 'روشن کردن صدای پاسخ‌ها'} title={voiceOn ? 'صدای پاسخ‌ها روشن است — برای خاموش کردن بزنید' : 'پاسخ‌ها با صدا خوانده شود'}>
              {voiceOn ? <SoundOnIcon /> : <SoundOffIcon />}
            </button>
          )}

          <button type="submit" className="zhino-assistant-send" disabled={thinking || draft.trim().length === 0} aria-label="ارسال پیام" title="ارسال پیام">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 -scale-x-100" aria-hidden="true">
              <path d="M2.7 9.3 17.2 2.6a.6.6 0 0 1 .8.75l-6.6 14.9a.6.6 0 0 1-1.1-.05l-1.8-5-5.05-1.8a.6.6 0 0 1-.05-1.1Z" fill="currentColor" />
            </svg>
          </button>
        </form>

        <div className="zhino-assistant-composer-meta">
          <span id="zhino-assistant-hint" className="zhino-assistant-hint">
            {hint}
          </span>
          {(voiceReading || voicePaused) && (
            <div className={cn('zhino-assistant-playback', voicePaused && 'is-paused')} aria-label="کنترل خواندن پاسخ">
              {voicePaused ? (
                <button type="button" className="zhino-assistant-ctl" onClick={resume} aria-label="ادامه خواندن" title="ادامهٔ خواندن">
                  <PlayIcon />
                  <span>ادامه</span>
                </button>
              ) : (
                <button type="button" className="zhino-assistant-ctl" onClick={pause} aria-label="مکث خواندن" title="مکث خواندن">
                  <PauseIcon />
                  <span>مکث</span>
                </button>
              )}
              <button
                type="button"
                className="zhino-assistant-stop"
                onClick={() => {
                  stop();
                  setReadingId(null);
                }}
                aria-label="توقف خواندن"
                title="توقف خواندن"
              >
                <StopIcon />
                <span>توقف خواندن</span>
                <span className="zhino-assistant-soundbars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          )}
        </div>

        {(voiceNotice || voiceHint) && (
          <div role="status" className="zhino-assistant-voice-notes">
            {voiceNotice && <p className="zhino-assistant-voice-note">{voiceNotice}</p>}
            {voiceHint && <p className="zhino-assistant-voice-note zhino-assistant-voice-note-hint">{voiceHint}</p>}
          </div>
        )}

        <p className="zhino-assistant-signature">ساخته شده توسط m.azizi</p>
      </div>
    </section>
  );
}
