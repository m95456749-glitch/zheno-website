// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵) — آواتار ربات
//
// همان تصویر اختصاصی ربات در دکمهٔ شناور، سربرگ صفحه، آواتار
// پیام‌ها و کارت‌های کنار گفتگو. اگر تصویر به هر دلیلی بارگذاری
// نشود، هیچ‌وقت تصویر شکسته دیده نمی‌شود: همان ربات به‌صورت نشانهٔ
// برداری درون‌خطی می‌آید.
// ============================================================

import { useState } from 'react';
import { ASSISTANT_BOT_IMAGE } from './assistantData';
import { cn } from '../../utils/cn';

/** نشانهٔ برداری ربات — جایگزین تصویر در صورت خطای بارگذاری */
function BotGlyph() {
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

interface Props {
  className?: string;
  /** تصویر تزئینی است و نام دستیار کنارش نوشته می‌شود */
  alt?: string;
}

export default function AssistantAvatar({ className, alt = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) return <BotGlyph />;

  return (
    <img
      src={ASSISTANT_BOT_IMAGE}
      alt={alt}
      width={128}
      height={128}
      decoding="async"
      className={cn(className)}
      onError={() => setFailed(true)}
    />
  );
}
