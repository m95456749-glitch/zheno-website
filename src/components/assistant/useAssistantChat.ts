// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ تا ۷) — منطق گفتگو
//
// در فاز ۷ فقط «نمایش» صفحه عوض شده است (محیط چت تمام‌صفحه شبیه
// ChatGPT)؛ منطق این فایل، منابع پاسخ و منبع داده دست‌نخورده‌اند.
//
// یک هوک، دو منبع پاسخ و دو «حقیقت» جدا که هرگز با هم قاطی نمی‌شوند:
//
//   ۱) منبع داده (dataSource): آیا کاتالوگ/قیمت/موجودی از دیتابیس
//      واقعی سوپابیس خوانده شده یا از دادهٔ محلی خود سایت؟
//      (خوانده‌شده از src/services/assistant/knowledge.ts)
//
//   ۲) منبع پاسخ (connection): آیا مدل زبانی پشت سرور پاسخ می‌دهد
//      یا موتور محلی فروشگاه؟ اگر مدل در دسترس نباشد، Fallback محلی
//      با یادداشت شفاف فعال می‌شود.
//
// رابط کاربری فقط وضعیت همین هوک را نشان می‌دهد؛ پس افزودن قابلیت
// تازه یا تعویض مدل، این فایل و UI را دست‌نخورده می‌گذارد.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogSync } from '../../services/catalogSync';
import { useRemoteSiteData } from '../../services/siteDataSync';
import {
  AssistantRemoteError,
  askRemoteAssistant,
  assistantErrorNote,
  isAssistantRemoteConfigured,
  probeAssistantRemote,
  type AssistantRemoteErrorKind,
} from '../../services/assistant/client';
import { DEFAULT_SUGGESTIONS, answerLocally } from '../../services/assistant/engine';
import { buildAssistantContext, getAssistantDataSource } from '../../services/assistant/knowledge';
import type {
  AssistantChatMessage,
  AssistantConnection,
  AssistantDataSource,
  AssistantHistoryTurn,
  AssistantSuggestion,
} from '../../services/assistant/types';

/** سقف طول پیام کاربر (هم در ورودی و هم در ارسال رعایت می‌شود) */
export const ASSISTANT_MAX_LENGTH = 600;

/**
 * بعد از این تعداد خطای پشت‌سرهم، دستیار دیگر برای هر پیام سراغ مدل
 * نمی‌رود و مستقیم محلی پاسخ می‌دهد (کاربر معطل یک Endpoint خراب
 * نمی‌ماند). دکمهٔ «تلاش دوباره» این شمارنده را صفر می‌کند.
 */
const MAX_REMOTE_FAILURES = 2;

/**
 * یادداشت شفاف وضعیت اتصال — زیر پیام خوش‌آمد.
 * هر دو حقیقت را جدا می‌گوید: مدل هوشمند و منبع داده.
 */
export function connectionNote(connection: AssistantConnection, dataSource: AssistantDataSource): string {
  const dataLine =
    dataSource === 'database'
      ? 'محصولات، قیمت، موجودی و دستورها همین حالا از دیتابیس فروشگاه خوانده می‌شود.'
      : 'محصولات، قیمت، موجودی و دستورها از دادهٔ خودِ فروشگاه خوانده می‌شود (اتصال دیتابیس در این لحظه فعال نیست).';

  switch (connection) {
    case 'online':
      return `پاسخ‌ها از دستیار هوشمند ژینو می‌آید و ${dataLine}`;
    case 'checking':
      return `در حال بررسی اتصال به دستیار هوشمند… ${dataLine}`;
    case 'error':
      return `دستیار هوشمند پاسخ نداد؛ ${dataLine} برای همین، پاسخ‌ها از موتور محلی فروشگاه ساخته می‌شود.`;
    case 'unconfigured':
    default:
      return `${dataLine} دستیار هوشمند روی سرور فعال نشده است، پس پاسخ‌ها از موتور محلی همین فروشگاه ساخته می‌شود.`;
  }
}

/**
 * برچسب کوتاه وضعیت — برای نشان (پیل) سربرگ صفحه.
 * «متصل» فقط وقتی گفته می‌شود که مدل واقعاً پاسخ می‌دهد.
 */
export function connectionLabel(connection: AssistantConnection, dataSource: AssistantDataSource): string {
  const dataLabel = dataSource === 'database' ? 'دادهٔ زندهٔ دیتابیس' : 'دادهٔ فروشگاه';
  switch (connection) {
    case 'online':
      return `متصل به دستیار هوشمند — ${dataLabel}`;
    case 'checking':
      return `در حال بررسی اتصال… (${dataLabel})`;
    case 'error':
      return `بدون مدل هوشمند (خطای اتصال) — ${dataLabel}`;
    case 'unconfigured':
    default:
      return `بدون مدل هوشمند — ${dataLabel}`;
  }
}

/**
 * پیام خوش‌آمد — کوتاه، فارسی و دوستانه (فاز ۷).
 * همان متن در دو جا دیده می‌شود: عنوان/زیرعنوان حالت خوشامد
 * (AssistantChat) و حباب اول گفتگو پس از شروع چت.
 */
export const ASSISTANT_WELCOME_TITLE = 'سلام! من دستیار ژینو هستم.';
export const ASSISTANT_WELCOME_SUB =
  'دربارهٔ طعم‌ها، قیمت و موجودی، دستور تهیهٔ ژله و کاستر یا انتخاب دسر بپرسید.';

const WELCOME_TEXT = `${ASSISTANT_WELCOME_TITLE} ${ASSISTANT_WELCOME_SUB}`;

/** پیام اول گفتگو — با یادداشت زندهٔ وضعیت اتصال زیر آن */
function welcomeMessage(): AssistantChatMessage {
  return { id: 1, from: 'bot', text: WELCOME_TEXT, welcome: true };
}

export interface UseAssistantChatResult {
  messages: AssistantChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  thinking: boolean;
  connection: AssistantConnection;
  /** منبع دادهٔ همین لحظه (دیتابیس واقعی یا دادهٔ محلی فروشگاه) */
  dataSource: AssistantDataSource;
  suggestions: AssistantSuggestion[];
  send: (text?: string) => void;
  clear: () => void;
  retry: () => void;
  canRetry: boolean;
}

export function useAssistantChat(): UseAssistantChatResult {
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [welcomeMessage()]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [connection, setConnection] = useState<AssistantConnection>(() =>
    isAssistantRemoteConfigured() ? 'checking' : 'unconfigured',
  );
  // منبع داده از همان لایهٔ اطلاعات فروشگاه خوانده می‌شود؛ هرگز حدسی نیست.
  // اشتراک روی وضعیت همگام‌سازی باعث می‌شود پیل وضعیت همان لحظه‌ای که
  // snapshot دیتابیس می‌رسد (یا خطا می‌دهد) به‌روز شود.
  const catalogSync = useCatalogSync();
  const siteDataSync = useRemoteSiteData();
  const dataSource: AssistantDataSource = useMemo(
    () => getAssistantDataSource(),
    // وضعیت همگام‌سازی ورودی محاسبه است، نه چیزی که در محاسبه خوانده شود
    [catalogSync, siteDataSync],
  );
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>(() =>
    DEFAULT_SUGGESTIONS.slice(0, 4),
  );
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);

  const nextId = useRef(2);
  const busy = useRef(false);
  const mounted = useRef(true);
  const timers = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  /** خطاهای پشت‌سرهم مدل در همین نشست گفتگو */
  const remoteFailures = useRef(0);

  const push = useCallback((message: Omit<AssistantChatMessage, 'id'>) => {
    // شناسه بیرون از تابع به‌روزرسانی ساخته می‌شود تا در حالت
    // StrictMode (که به‌روزرسانی‌ها دو بار اجرا می‌شوند) شمارنده
    // دو بار جلو نرود.
    const id = nextId.current++;
    setMessages((current) => [...current, { ...message, id }]);
  }, []);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          timers.current = timers.current.filter((item) => item !== timer);
          resolve();
        }, ms);
        timers.current.push(timer);
      }),
    [],
  );

  // هیچ تایمر یا درخواستی بعد از ترک صفحه باقی نمی‌ماند
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // بررسی یک‌بارهٔ آماده‌بودن Endpoint (فقط اگر پیکربندی شده باشد).
  // پاسخ GET هم وضعیت مدل و هم وضعیت خواندن دیتابیس را می‌گوید.
  useEffect(() => {
    if (!isAssistantRemoteConfigured()) return;
    const controller = new AbortController();
    void probeAssistantRemote(controller.signal).then((probe) => {
      if (!mounted.current) return;
      setConnection(probe.online ? 'online' : 'error');
    });
    return () => controller.abort();
  }, []);

  const send = useCallback(
    (text?: string) => {
      const clean = (text ?? draft).trim().slice(0, ASSISTANT_MAX_LENGTH);
      // پیام خالی هیچ‌وقت ارسال نمی‌شود؛ پردازش هم‌زمان هم قفل است
      if (clean.length === 0 || busy.current) return;

      busy.current = true;
      setFailedPrompt(null);
      setDraft('');
      push({ from: 'user', text: clean });
      setThinking(true);

      const history: AssistantHistoryTurn[] = messages
        .slice(-8)
        .map((message) => ({
          role: message.from === 'user' ? 'user' : 'assistant',
          content: message.text,
        }));

      /** پاسخ محلی — با تأخیر طبیعی، از کارت اطلاعات همین لحظه */
      const finishLocally = async (note?: string) => {
        await sleep(420 + Math.round(Math.random() * 240));
        if (!mounted.current) return;
        const context = buildAssistantContext();
        const answer = answerLocally(clean, context);
        push({ from: 'bot', text: answer.text, links: answer.links, note, source: 'local' });
        setSuggestions(answer.suggestions ?? DEFAULT_SUGGESTIONS);
        setThinking(false);
        busy.current = false;
      };

      const run = async () => {
        let fallbackNote: string | undefined;
        const remoteConfigured = isAssistantRemoteConfigured();
        const mayAskModel = remoteConfigured && remoteFailures.current < MAX_REMOTE_FAILURES;

        // مدل پیکربندی شده اما چند بار پشت‌سرهم پاسخ نداده: به‌جای معطل‌کردن
        // کاربر، مستقیم محلی پاسخ می‌دهیم و همان‌جا دلیلش را می‌گوییم.
        if (remoteConfigured && !mayAskModel) {
          fallbackNote =
            'دستیار هوشمند در این لحظه پاسخ نمی‌دهد؛ این پاسخ از دادهٔ واقعی فروشگاه ساخته شده است.';
          // دکمهٔ «تلاش دوباره» روی همان پیام می‌ماند تا کاربر بتواند
          // دستی را مدل را دوباره امتحان کند
          setFailedPrompt(clean);
        }

        if (mayAskModel) {
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            const reply = await askRemoteAssistant({
              message: clean,
              history,
              context: buildAssistantContext(),
              signal: controller.signal,
            });
            abortRef.current = null;
            if (!mounted.current) return;
            remoteFailures.current = 0;
            setConnection('online');
            // اگر مدل هیچ دادهٔ فروشگاهی نداشته، صادقانه هشدار می‌دهیم
            const note =
              reply.knowledgeSource === 'none'
                ? 'این پاسخ از دستیار هوشمند است، اما دادهٔ فروشگاه در اختیارش نبود؛ برای قیمت و موجودی، همین‌جا دوباره بپرسید تا از دیتابیس پاسخ بگیرید.'
                : undefined;
            push({ from: 'bot', text: reply.text, links: reply.links, source: 'ai', note });
            setSuggestions(reply.suggestions ?? DEFAULT_SUGGESTIONS);
            setThinking(false);
            busy.current = false;
            return;
          } catch (error) {
            abortRef.current = null;
            if (!mounted.current) return;
            const kind: AssistantRemoteErrorKind =
              error instanceof AssistantRemoteError ? error.kind : 'network';
            remoteFailures.current += 1;
            setConnection(kind === 'unconfigured' ? 'unconfigured' : 'error');
            // «unconfigured» خطای کاربر نیست: سرور عمداً مدل ندارد، پس
            // دکمهٔ «تلاش دوباره» هم نمایش داده نمی‌شود.
            setFailedPrompt(kind === 'unconfigured' ? null : clean);
            fallbackNote = assistantErrorNote(kind);
          }
        }

        await finishLocally(fallbackNote);
      };

      void run();
    },
    [draft, messages, push, sleep],
  );

  const retry = useCallback(() => {
    // تلاش دوباره یعنی «دوباره سراغ مدل برو»، حتی اگر دفعهٔ قبل چند بار
    // پشت‌سرهم خطا داده باشد.
    remoteFailures.current = 0;
    if (failedPrompt) send(failedPrompt);
  }, [failedPrompt, send]);

  const clear = useCallback(() => {
    // درخواست در پرواز لغو می‌شود تا پاسخ دیرهنگام روی گفتگوی تازه ننشیند
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    busy.current = false;
    remoteFailures.current = 0;
    setThinking(false);
    setFailedPrompt(null);
    setDraft('');
    // بازگشت به همان حالت خوشامد اولیه: پیام تازه، وسط صفحه، با
    // پیشنهادهای پیش‌فرض — دقیقاً مثل اولین ورود به صفحهٔ دستیار.
    setMessages([welcomeMessage()]);
    setSuggestions(DEFAULT_SUGGESTIONS.slice(0, 4));
  }, []);

  return {
    messages,
    draft,
    setDraft,
    thinking,
    connection,
    dataSource,
    suggestions,
    send,
    clear,
    retry,
    canRetry: failedPrompt !== null,
  };
}
