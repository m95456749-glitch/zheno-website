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
import { useCartContext } from '../../context/CartContext';
import { getProductById, getVariantById } from '../../services/catalog';
import { productPath, searchProducts } from '../../services/assistant/knowledge';
import { formatPrice } from '../../utils/format';
import {
  AssistantRemoteError,
  askRemoteAssistant,
  isAssistantRemoteConfigured,
  probeAssistantRemote,
} from '../../services/assistant/client';
import { DEFAULT_SUGGESTIONS, answerLocally, createAssistantMemory } from '../../services/assistant/engine';
import { buildAssistantContext, getAssistantDataSource } from '../../services/assistant/knowledge';
import type {
  AssistantCartOffer,
  AssistantChatMessage,
  AssistantConnection,
  AssistantContext,
  AssistantDataSource,
  AssistantHistoryTurn,
  AssistantProductFact,
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
 */
export const ASSISTANT_WELCOME_TITLE = 'سلام! من دستیار ژینو هستم.';

const WELCOME_TEXT = ASSISTANT_WELCOME_TITLE;

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
  /**
   * تکرار آخرین پرسش — برای وقتی پاسخ دیر می‌رسد یا نصفه می‌ماند.
   * کاربر مجبور نیست سؤالش را دوباره تایپ کند.
   */
  retry: () => void;
  clear: () => void;
  /**
   * تأیید یا ردِ پیشنهاد «افزودن به سبد».
   *
   * تا وقتی acceptCartOffer صدا زده نشود هیچ چیزی به سبد اضافه نمی‌شود؛
   * افزودن هم دقیقاً از همان مسیر همیشگی سبد فروشگاه انجام می‌شود
   * (CartContext) و هرگز به تسویه‌حساب یا پرداخت خودکار نمی‌رسد.
   */
  acceptCartOffer: (messageId: number, offer: AssistantCartOffer) => void;
  dismissCartOffer: (messageId: number, offer: AssistantCartOffer) => void;
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
  /** سبد خرید فروشگاه — همان Context مشترک همهٔ صفحه‌ها، بدون مسیر تازه */
  const cart = useCartContext();

  const nextId = useRef(2);
  const busy = useRef(false);
  /**
   * حافظهٔ گفتگو (فاز ۱۲) — موتور محلی با آن «پیام قبلی» را می‌فهمد:
   * آخرین محصولاتِ موضوعِ بحث برای پیگیری‌های مثل «قیمتش چنده؟»،
   * و واریانت‌های تازه‌استفاده‌شده تا پاسخ‌ها فوراً تکرار نشوند.
   * روی «گفتگوی تازه» ریست می‌شود.
   */
  const memory = useRef(createAssistantMemory());
  /** آخرین پرسش کاربر — برای دکمهٔ «تلاش دوباره» */
  const lastQuestion = useRef<string>('');
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
      lastQuestion.current = clean;
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
        const answer = answerLocally(clean, context, memory.current);
        push({
          from: 'bot',
          text: answer.text,
          links: answer.links,
          products: answer.products,
          cartOffer: answer.cartOffer,
          source: 'local',
        });
        setSuggestions(answer.suggestions ?? DEFAULT_SUGGESTIONS);
        setThinking(false);
        busy.current = false;
      };

      /**
       * کارت‌های محصول برای پاسخی که از مدل آمده: مدل دادهٔ ساختاری
       * محصول نمی‌فرستد، پس کارت‌ها از همان «کارت اطلاعات» همین لحظه
       * ساخته می‌شوند (از روی همان لینک‌های محصولی که در پاسخ هست).
       * هیچ عدد تازه‌ای از مدل گرفته نمی‌شود.
       */
      const attachProducts = (
        context: AssistantContext,
        replyLinks?: { to: string }[],
      ): AssistantProductFact[] | undefined => {
        const paths = new Set((replyLinks ?? []).map((item) => item.to));
        const matched = context.products.filter((product) => paths.has(product.to));
        const fallback = matched.length > 0 ? matched : searchProducts(context, clean).slice(0, 3);
        return fallback.length > 0 ? fallback.slice(0, 5) : undefined;
      };

      const run = async () => {
        const remoteConfigured = isAssistantRemoteConfigured();
        const mayAskModel = remoteConfigured && remoteFailures.current < MAX_REMOTE_FAILURES;

        // اگر مدل پیکربندی شده اما چند بار پشت‌سرهم پاسخ نداده، بی‌صدا
        // محلی پاسخ می‌دهیم تا کاربر معطل یک Endpoint خراب نشود —
        // و هیچ پیام فنی‌ای هم به مشتری نمی‌رسد.
        if (mayAskModel) {
          const context = buildAssistantContext();
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            const reply = await askRemoteAssistant({
              message: clean,
              history,
              context,
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
            push({
              from: 'bot',
              text: reply.text,
              links: reply.links,
              products: attachProducts(context, reply.links),
              source: 'ai',
              note,
            });
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

  /**
   * «بله، اضافه کن» — تنها راهی که از گفتگو چیزی به سبد اضافه می‌شود.
   * قیمت و موجودی دوباره از خود کاتالوگ خوانده می‌شود (نه از متن چت)،
   * پس عدد کهنه هیچ‌وقت وارد سبد نمی‌شود. بعد از افزودن فقط یک لینک
   * «دیدن سبد خرید» نشان داده می‌شود — بدون هیچ پرداخت خودکار.
   */
  const acceptCartOffer = useCallback(
    (messageId: number, offer: AssistantCartOffer) => {
      const product = getProductById(offer.productId);
      const variant = getVariantById(offer.productId, offer.variantId);
      const label = product?.shortName ?? offer.label;

      const markAdded = () =>
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, cartState: 'added' as const } : message,
          ),
        );

      if (!product || !variant || !variant.available) {
        markAdded();
        push({
          from: 'bot',
          text: `«${label}» همین لحظه ناموجود شد و به سبد اضافه نشد. اگر خواستید، طعم دیگری پیشنهاد می‌دهم.`,
          links: [{ label: 'مشاهدهٔ محصولات', to: '/products' }],
          source: 'local',
        });
        return;
      }

      const result = cart.addItemWithToast(offer.productId, offer.variantId, 1);

      // رفتار فروشندهٔ واقعی (فاز ۱۲): بعد از افزودن، صادقانه بگوییم
      // تا ارسال رایگان چقدر مانده — عدد از خود سبد/تنظیمات فروشگاه،
      // نه از حدس. (سبد همان لحظه به‌روز می‌شود؛ ماندهٔ جدید = ماندهٔ
      // فعلی منهای همین اقلام تازه.)
      const remainingAfterAdd = Math.max(0, cart.remainingForFreeShipping - offer.price);

      const successText =
        Math.random() < 0.5
          ? `${label} (${variant.weight}) به سبد خرید اضافه شد. ثبت سفارش و پرداخت با خودتان است؛ هر وقت خواستید از سبد خرید انجامش بدهید.`
          : `${label} (${variant.weight}) به سبد خرید اضافه شد — توی سبد منتظر شماست. پرداخت و ثبت نهایی همیشه دست خودتان می‌ماند.`;
      const progressLine =
        remainingAfterAdd > 0
          ? ` فقط ${formatPrice(remainingAfterAdd)} تا ارسال رایگان مانده — اگر بخواهید، پیشنهادهای هم‌سبدتان را می‌گویم.`
          : ' با همین سفارش، ارسال رایگان می‌شود.';

      markAdded();
      push({
        from: 'bot',
        text: result.success ? successText + progressLine : `افزودن «${label}» به سبد انجام نشد${result.error ? `: ${result.error}` : ''}. از صفحهٔ محصول هم می‌توانید اضافه‌اش کنید.`,
        links: result.success
          ? [{ label: 'دیدن سبد خرید', to: '/cart' }]
          : [{ label: 'صفحهٔ محصول', to: productPath(product.id) }],
        source: 'local',
        suggestions: [{ label: 'پیشنهاد طعم دیگر', prompt: 'یک طعم دیگر پیشنهاد بده' }],
      });
    },
    [cart, push],
  );

  /** «تلاش دوباره» — همان آخرین پرسش، بدون تایپ مجدد */
  const retry = useCallback(() => {
    if (busy.current) return;
    const text = lastQuestion.current.trim();
    if (text.length === 0) return;
    send(text);
  }, [send]);

  /** «نه» — پیشنهاد بی‌اثر می‌شود و هیچ چیز به سبد نمی‌رود */
  const dismissCartOffer = useCallback(
    (messageId: number, offer: AssistantCartOffer) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, cartState: 'dismissed' as const } : message,
        ),
      );
      const product = getProductById(offer.productId);
      push({
        from: 'bot',
        text: 'باشه، چیزی به سبد اضافه نکردم. هر وقت خواستید بگویید تا اضافه کنم.',
        links: product
          ? [{ label: `صفحهٔ ${product.shortName}`, to: productPath(product.id) }]
          : undefined,
        source: 'local',
      });
    },
    [push],
  );

  const clear = useCallback(() => {
    // درخواست در پرواز لغو می‌شود تا پاسخ دیرهنگام روی گفتگوی تازه ننشیند
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    busy.current = false;
    remoteFailures.current = 0;
    lastQuestion.current = '';
    memory.current = createAssistantMemory();
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
    retry,
    clear,
    acceptCartOffer,
    dismissCartOffer,
  };
}
