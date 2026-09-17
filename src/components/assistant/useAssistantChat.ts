// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ تا ۸) — منطق گفتگو
//
// فاز ۸ فقط «حرف‌های فنی» را از رابط کاربری برداشت: هیچ متن
// «دیتابیس / موتور محلی / کاتالوگ / متصل یا قطع بودن مدل» دیگر به
// مشتری نشان داده نمی‌شود. هر دو لایه پشت صحنه دقیقاً مثل قبل کار
// می‌کنند — کارت اطلاعات زنده از knowledge.ts، پرسش از مدل از
// client.ts، و Fallback محلی از engine.ts.
//
// دو «حقیقت» که همچنان جدا نگه داشته می‌شوند (فقط دیگر در UI نیستند):
//
//   ۱) منبع داده (dataSource): کاتالوگ/قیمت/موجودی از دیتابیس واقعی
//      سوپابیس خوانده شده یا از دادهٔ خود فروشگاه؟
//      (خوانده‌شده از src/services/assistant/knowledge.ts)
//
//   ۲) منبع پاسخ (connection): مدل زبانی پشت سرور پاسخ می‌دهد یا موتور
//      محلی؟ اگر مدل در دسترس نباشد، Fallback محلی بی‌صدا فعال می‌شود
//      تا مشتری هرگز «پاسخ خطا» نبیند.
//
// افزودن قابلیت تازه، تعویض مدل یا فعال‌کردن Backend — هیچ‌کدام این
// فایل و UI را دست‌نخورده می‌گذارند.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogSync } from '../../services/catalogSync';
import { useRemoteSiteData } from '../../services/siteDataSync';
import {
  AssistantRemoteError,
  askRemoteAssistant,
  isAssistantRemoteConfigured,
  probeAssistantRemote,
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
 * نمی‌ماند). این شمارنده در همین نشست گفتگو نگه داشته می‌شود.
 */
const MAX_REMOTE_FAILURES = 2;

/**
 * پیام خوش‌آمد — کوتاه، فارسی و دوستانه.
 * همان متن در دو جا دیده می‌شود: حالت خوشامد (AssistantChat) و حباب
 * اول گفتگو پس از شروع چت.
 */
export const ASSISTANT_WELCOME_TITLE = 'سلام! من دستیار ژینو هستم.';
export const ASSISTANT_WELCOME_SUB =
  'طعم‌ها، قیمت و موجودی، دستور تهیهٔ ژله و کاستر یا انتخاب دسر — هرچی لازم دارید بپرسید، کوتاه جواب می‌دم.';

const WELCOME_TEXT = `${ASSISTANT_WELCOME_TITLE} ${ASSISTANT_WELCOME_SUB}`;

/** پیام اول گفتگو */
function welcomeMessage(): AssistantChatMessage {
  return { id: 1, from: 'bot', text: WELCOME_TEXT, welcome: true };
}

export interface UseAssistantChatResult {
  messages: AssistantChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  thinking: boolean;
  /**
   * وضعیت اتصال به مدل — فقط برای مصرف داخلی (تصمیم Fallback و تست‌ها).
   * از فاز ۸ هیچ متن فنی از این وضعیت در رابط کاربری نمایش داده نمی‌شود.
   */
  connection: AssistantConnection;
  /** منبع دادهٔ همین لحظه (دیتابیس واقعی یا دادهٔ فروشگاه) — داخلی */
  dataSource: AssistantDataSource;
  suggestions: AssistantSuggestion[];
  send: (text?: string) => void;
  clear: () => void;
}

export function useAssistantChat(): UseAssistantChatResult {
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [welcomeMessage()]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [connection, setConnection] = useState<AssistantConnection>(() =>
    isAssistantRemoteConfigured() ? 'checking' : 'unconfigured',
  );
  // منبع داده از همان لایهٔ اطلاعات فروشگاه خوانده می‌شود؛ هرگز حدسی نیست.
  // اشتراک روی وضعیت همگام‌سازی باعث می‌شود لحظه‌ای که snapshot دیتابیس
  // می‌رسد (یا خطا می‌دهد) کارت اطلاعات و پاسخ‌های بعدی به‌روز شوند.
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
  // نتیجه فقط تعیین می‌کند پرسش‌ها به مدل بروند یا نه — جایی نمایش داده نمی‌شود.
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
      const finishLocally = async () => {
        await sleep(420 + Math.round(Math.random() * 240));
        if (!mounted.current) return;
        const context = buildAssistantContext();
        const answer = answerLocally(clean, context);
        push({ from: 'bot', text: answer.text, links: answer.links, source: 'local' });
        setSuggestions(answer.suggestions ?? DEFAULT_SUGGESTIONS);
        setThinking(false);
        busy.current = false;
      };

      const run = async () => {
        const remoteConfigured = isAssistantRemoteConfigured();
        const mayAskModel = remoteConfigured && remoteFailures.current < MAX_REMOTE_FAILURES;

        // اگر مدل پیکربندی شده اما چند بار پشت‌سرهم پاسخ نداده، بی‌صدا
        // محلی پاسخ می‌دهیم تا کاربر معطل یک Endpoint خراب نشود —
        // و هیچ پیام فنی‌ای هم به مشتری نمی‌رسد.
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
            // تنها «یادداشت»ی که به مشتری گفته می‌شود: اگر دادهٔ فروشگاه
            // در اختیار مدل نبوده، صادقانه و بدون اصطلاح فنی هشدار می‌دهیم
            // که عدد قیمت/موجودی را دوباره بپرسد.
            const note =
              reply.knowledgeSource === 'none'
                ? 'این پاسخ را خودم گفتم و از فهرست فروشگاه نبود. دربارهٔ قیمت یا موجودی یک بار دیگر بپرسید تا دقیق نگاه کنم.'
                : undefined;
            push({ from: 'bot', text: reply.text, links: reply.links, source: 'ai', note });
            setSuggestions(reply.suggestions ?? DEFAULT_SUGGESTIONS);
            setThinking(false);
            busy.current = false;
            return;
          } catch (error) {
            abortRef.current = null;
            if (!mounted.current) return;
            remoteFailures.current += 1;
            setConnection(
              error instanceof AssistantRemoteError && error.kind === 'unconfigured'
                ? 'unconfigured'
                : 'error',
            );
          }
        }

        await finishLocally();
      };

      void run();
    },
    [draft, messages, push, sleep],
  );

  const clear = useCallback(() => {
    // درخواست در پرواز لغو می‌شود تا پاسخ دیرهنگام روی گفتگوی تازه ننشیند
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    busy.current = false;
    remoteFailures.current = 0;
    setThinking(false);
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
  };
}
