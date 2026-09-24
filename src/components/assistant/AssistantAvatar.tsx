// ============================================================
// ZHINO — آواتار دستیار ژینو (تصویر واقعی ربات)
//
// آواتار همان فایل تصویر واقعی ربات است (ASSISTANT_BOT_IMAGE) —
// بدون تغییر asset، بدون crop جدید، بدون حرکت سر/بدن/دست. تصویر با
// object-fit: contain و نسبت اصلی‌اش (۱۰۲۴×۱۵۳۶) داخل ظرف می‌نشیند.
// تنها واکنش مجاز: در حالت‌های thinking/speaking دو هالهٔ نور خیلی
// ملایم روی ناحیهٔ چشم‌ها (فقط opacity، CSS خالص)؛ با فعال‌شدن
// prefers-reduced-motion انیمیشن آن قطع می‌شود.
// اندازه از ظرف‌های همیشگی (سربرگ، ردیف پیام، دکمهٔ شناور) می‌آید و
// prop size برای استفادهٔ آزاد بیرون این ظرف‌ها نگه داشته شده.
// ============================================================

import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

type AvatarMode = 'idle' | 'thinking' | 'speaking';

interface Props {
  className?: string;
  alt?: string;
  /** حالت دستیار — فقط برای واکنش بسیار ظریف ناحیهٔ چشم در حالت‌های فعال */
  mode?: AvatarMode;
  size?: number;
  /** فقط سر — نگه‌داشته شده برای سازگاری امضای قبلی */
  compact?: boolean;
}

export default function AssistantAvatar({ className, alt, size, mode }: Props) {
  const awake = mode === 'thinking' || mode === 'speaking';
  const style = size
    ? { display: 'inline-flex', width: size, height: size }
    : { display: 'inline-flex', width: '100%', height: '100%' };
  return (
    <span className={cn('zhino-avatar-wrap', className)} style={style}>
      <img
        className="zhino-bot-photo"
        src={ASSISTANT_BOT_IMAGE}
        alt={alt ?? ASSISTANT_NAME}
        draggable={false}
      />
      {awake && (
        <span className="zhino-avatar-awake" aria-hidden="true">
          <span className="zhino-avatar-awake-dot is-left" />
          <span className="zhino-avatar-awake-dot is-right" />
        </span>
      )}
    </span>
  );
}
