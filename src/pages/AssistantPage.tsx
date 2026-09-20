// ============================================================
// ZHINO — دو کانسپت مستقل برای صفحهٔ دستیار ژینو
//
// هویت مشترک هر دو نسخه از رفرنس اصلی concept-A-v3.jpg می‌آید؛
// اما معماری تجربه عمداً متفاوت است:
//   A) Premium Robot Pod — یک اتاقک/محفظهٔ سینمایی با کنسول کناری
//   B) Cute Interactive Robot Lounge — یک لانژ گرم با گفتگوی شناور
//
// منطق گفتگو، پیشنهادها، خواندن پاسخ، لینک محصولات و سبد خرید همان
// AssistantChat قبلی است و فقط در یک قاب بصری تازه قرار گرفته است.
// ============================================================

import { Link, useNavigate } from 'react-router-dom';
import AssistantChat from '../components/assistant/AssistantChat';
import { useAssistantChat } from '../components/assistant/useAssistantChat';
import { ASSISTANT_NAME } from '../components/assistant/assistantData';
import { withSiteBase } from '../utils/siteBase';

export type AssistantConcept = 'premium' | 'lounge';

interface Props {
  concept?: AssistantConcept;
}

const ROBOT_REFERENCE = withSiteBase('images/assistant/concepts/concept-A-v3.jpg');

const LOUNGE_PRODUCTS = [
  {
    name: 'ژله توت‌فرنگی',
    caption: 'شاد و میوه‌ای',
    image: withSiteBase('images/opt/jelly-strawberry.webp'),
    className: 'is-berry',
  },
  {
    name: 'کاستر وانیل',
    caption: 'نرم و کلاسیک',
    image: withSiteBase('images/opt/custard-mahlab-vanilla.webp'),
    className: 'is-vanilla',
  },
];

function ArrowBackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.8c.7 5 2.2 6.5 7.2 7.2-5 .7-6.5 2.2-7.2 7.2-.7-5-2.2-6.5-7.2-7.2 5-.7 6.5-2.2 7.2-7.2Z" fill="currentColor" />
      <path d="M19.1 16.8c.3 2 .9 2.6 2.9 2.9-2 .3-2.6.9-2.9 2.9-.3-2-.9-2.6-2.9-2.9 2-.3 2.6-.9 2.9-2.9Z" fill="currentColor" opacity=".72" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 12h3.2l1.8-4.5 4.2 9 2.3-5.4h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.2 6.2A3.2 3.2 0 0 1 8.4 3h7.2a3.2 3.2 0 0 1 3.2 3.2v5.2a3.2 3.2 0 0 1-3.2 3.2h-3.9l-3.8 3v-3H8.4a3.2 3.2 0 0 1-3.2-3.2V6.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.8 8.8h6.4m-6.4 3h3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LoungeArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h11.2m0 0-4.2-4.2M15.2 10 11 14.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConceptSwitcher({ active }: { active: AssistantConcept }) {
  return (
    <nav className="zhino-concept-switcher" aria-label="انتخاب نسخهٔ طراحی">
      <Link
        to="/assistant/premium"
        className={`zhino-concept-switch ${active === 'premium' ? 'is-active' : ''}`}
        aria-current={active === 'premium' ? 'page' : undefined}
      >
        <span className="zhino-concept-switch-number">01</span>
        <span className="zhino-concept-switch-label">Premium Pod</span>
      </Link>
      <Link
        to="/assistant/lounge"
        className={`zhino-concept-switch ${active === 'lounge' ? 'is-active' : ''}`}
        aria-current={active === 'lounge' ? 'page' : undefined}
      >
        <span className="zhino-concept-switch-number">02</span>
        <span className="zhino-concept-switch-label">Robot Lounge</span>
      </Link>
    </nav>
  );
}

function ConceptTopbar({ concept, onClear }: { concept: AssistantConcept; onClear: () => void }) {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        className="zhino-concept-back-button"
        onClick={() => navigate('/')}
        aria-label="بازگشت به سایت"
        title="بازگشت به سایت"
      >
        <ArrowBackIcon />
        <span>بازگشت به فروشگاه</span>
      </button>

      <header className={`zhino-assistant-topbar zhino-concept-topbar is-${concept}`}>
        <Link to="/assistant/premium" className="zhino-concept-brand" aria-label="صفحهٔ دستیار ژینو">
          <span className="zhino-concept-brand-seal" aria-hidden="true">
            <span>ZH</span>
            <i />
          </span>
          <span className="zhino-concept-brand-copy">
            <span className="zhino-concept-brand-kicker">ZHINO / AI COMPANION</span>
            <strong>{ASSISTANT_NAME}</strong>
          </span>
        </Link>

        <ConceptSwitcher active={concept} />

        <div className="zhino-concept-top-actions">
          <span className="zhino-concept-ready">
            <i aria-hidden="true" />
            <span>آمادهٔ گفتگو</span>
          </span>
          <button
            type="button"
            className="zhino-concept-clear"
            onClick={onClear}
            aria-label="گفتگوی تازه"
            title="گفتگوی تازه"
          >
            <RefreshIcon />
            <span>گفتگوی تازه</span>
          </button>
        </div>
      </header>
    </>
  );
}

function ReferenceRobot({ className = '', alt = 'ربات ژینو' }: { className?: string; alt?: string }) {
  return (
    <img
      className={`zhino-reference-robot ${className}`}
      src={ROBOT_REFERENCE}
      alt={alt}
      loading="eager"
      decoding="async"
    />
  );
}

function PodStage({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <section className="zhino-concept-stage zhino-pod-stage" aria-labelledby="zhino-pod-title">
      <div className="zhino-stage-heading">
        <div>
          <span className="zhino-stage-eyebrow"><span>01</span> / PREMIUM ROBOT POD</span>
          <h1 id="zhino-pod-title">یک اتاقک اختصاصی برای<br /><em>همراه هوشمند شما</em></h1>
        </div>
        <span className="zhino-stage-index">Z / 01</span>
      </div>

      <div className="zhino-pod-scene" aria-label="محفظهٔ لوکس ربات ژینو">
        <span className="zhino-pod-orbit is-one" aria-hidden="true" />
        <span className="zhino-pod-orbit is-two" aria-hidden="true" />
        <span className="zhino-pod-grid" aria-hidden="true" />
        <div className="zhino-pod-beacon is-top" aria-hidden="true"><i /><span>CORE 01</span></div>

        <div className="zhino-pod-chamber">
          <span className="zhino-pod-chamber-glow" aria-hidden="true" />
          <span className="zhino-pod-chamber-line is-left" aria-hidden="true" />
          <span className="zhino-pod-chamber-line is-right" aria-hidden="true" />
          <div className="zhino-pod-photo-window">
            <span className="zhino-pod-photo-light" aria-hidden="true" />
            <ReferenceRobot alt="ربات سه‌بعدی ژینو در محفظهٔ هوشمند" />
            <span className="zhino-pod-photo-sheen" aria-hidden="true" />
          </div>
          <div className="zhino-pod-floor" aria-hidden="true"><span /></div>
          <div className="zhino-pod-status"><PulseIcon /><span>آرام، دقیق، همیشه آماده</span></div>
        </div>

        <div className="zhino-pod-callout is-left">
          <span className="zhino-callout-line" aria-hidden="true" />
          <span className="zhino-callout-kicker">INTERACTIVE CORE</span>
          <strong>با ژینو حرف بزنید</strong>
          <span>راهنمای انتخاب طعم و تهیهٔ دسر</span>
        </div>
        <div className="zhino-pod-callout is-right">
          <span className="zhino-callout-kicker">MATERIAL STUDY</span>
          <strong>شیشه · کرم · زرشکی</strong>
          <span>نور گرم، عمق نرم، جزئیات زنده</span>
        </div>
      </div>

      <div className="zhino-pod-stage-foot">
        <div className="zhino-pod-metrics">
          <span><b>01</b> فضای انیمیشن آینده</span>
          <span><b>∞</b> گفتگوی شخصی</span>
        </div>
        <button type="button" className="zhino-pod-invite" onClick={() => onPrompt('برای شروع، یک طعم ژله و یک طعم کاستر پیشنهاد بده')}>
          <SparkIcon />
          <span>شروع یک گفتگوی تازه</span>
          <LoungeArrowIcon />
        </button>
      </div>
    </section>
  );
}

function LoungeProduct({ product }: { product: (typeof LOUNGE_PRODUCTS)[number] }) {
  return (
    <div className={`zhino-lounge-product ${product.className}`}>
      <div className="zhino-lounge-product-image">
        <img src={product.image} alt="" loading="lazy" />
      </div>
      <div className="zhino-lounge-product-copy">
        <strong>{product.name}</strong>
        <span>{product.caption}</span>
      </div>
    </div>
  );
}

function LoungeStage({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <section className="zhino-concept-stage zhino-lounge-stage" aria-labelledby="zhino-lounge-title">
      <div className="zhino-lounge-topline">
        <span className="zhino-stage-eyebrow"><span>02</span> / CUTE INTERACTIVE ROBOT LOUNGE</span>
        <span className="zhino-lounge-room-label"><i /> ZHINO ROOM / 09:41</span>
      </div>

      <div className="zhino-lounge-room">
        <span className="zhino-lounge-sun" aria-hidden="true" />
        <span className="zhino-lounge-line-art is-one" aria-hidden="true" />
        <span className="zhino-lounge-line-art is-two" aria-hidden="true" />

        <div className="zhino-lounge-copy">
          <span className="zhino-lounge-sticker"><SparkIcon /> یک گوشهٔ دنج برای انتخاب</span>
          <h1 id="zhino-lounge-title">بیا با هم،<br /><em>طعم بعدی را پیدا کنیم.</em></h1>
          <p>ژینو اینجاست تا بین دنیای رنگی ژله و لطافت کاستر، انتخاب خوشمزهٔ شما را پیدا کند.</p>
          <button type="button" className="zhino-lounge-cta" onClick={() => onPrompt('برای من یک پیشنهاد دوست‌داشتنی از ژله و کاستر بساز')}>
            <ChatIcon />
            <span>از ژینو پیشنهاد بگیر</span>
            <LoungeArrowIcon />
          </button>
        </div>

        <div className="zhino-lounge-robot-zone" aria-label="فضای نشیمن ربات ژینو">
          <span className="zhino-lounge-arch-shadow" aria-hidden="true" />
          <div className="zhino-lounge-arch">
            <span className="zhino-lounge-arch-shine" aria-hidden="true" />
            <ReferenceRobot alt="ربات دوست‌داشتنی ژینو در لانژ هوشمند" />
          </div>
          <span className="zhino-lounge-floor-shadow" aria-hidden="true" />
          <span className="zhino-lounge-speech"><span>سلام، من ژینو هستم!</span><i /></span>
        </div>

        <div className="zhino-lounge-products" aria-label="محصولات پیشنهادی امروز">
          <span className="zhino-lounge-products-label">TODAY'S LITTLE PICKS</span>
          {LOUNGE_PRODUCTS.map((product) => <LoungeProduct key={product.name} product={product} />)}
        </div>

        <div className="zhino-lounge-note"><span>●</span> حالت فکر کردن همیشه روشن است</div>
      </div>
    </section>
  );
}

function ConversationPanel({ concept, chat }: { concept: AssistantConcept; chat: ReturnType<typeof useAssistantChat> }) {
  return (
    <section className={`zhino-concept-chat-panel is-${concept}`} aria-labelledby="zhino-conversation-title">
      <div className="zhino-concept-chat-heading">
        <div className="zhino-concept-chat-identity">
          <span className="zhino-concept-chat-mark" aria-hidden="true"><span>ژ</span><i /></span>
          <div>
            <span className="zhino-concept-chat-kicker">YOUR PRIVATE CONVERSATION</span>
            <h2 id="zhino-conversation-title">گفتگو با ژینو</h2>
          </div>
        </div>
        <span className="zhino-concept-chat-state"><i /> آنلاین</span>
      </div>
      <AssistantChat chat={chat} />
    </section>
  );
}

export default function AssistantPage({ concept = 'premium' }: Props) {
  const chat = useAssistantChat();
  const handlePrompt = (prompt: string) => chat.send(prompt);

  return (
    <div className={`zhino-assistant-page zhino-concept-page is-${concept}`}>
      <ConceptTopbar concept={concept} onClear={chat.clear} />
      {concept === 'premium' ? (
        <main className="zhino-concept-main zhino-premium-main">
          <PodStage onPrompt={handlePrompt} />
          <ConversationPanel concept={concept} chat={chat} />
        </main>
      ) : (
        <main className="zhino-concept-main zhino-lounge-main">
          <LoungeStage onPrompt={handlePrompt} />
          <ConversationPanel concept={concept} chat={chat} />
        </main>
      )}
    </div>
  );
}
