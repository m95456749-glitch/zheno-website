// ============================================================
// ZHINO — آواتار دستیار ژینو (تصویر واقعی ربات)
//
// آواتار فقط همان فایل تصویر واقعی ربات است (ASSISTANT_BOT_IMAGE) —
// بدون انیمیشن، پلک‌زدن یا افکت. تصویر با object-fit: contain و با
// نسبت اصلی خود (۱۰۲۴×۱۵۳۶) داخل ظرف می‌نشیند؛ نه کشیده می‌شود و
// نه بریده. اندازه از ظرف‌های همیشگی (سربرگ، ردیف پیام، دکمهٔ شناور)
// می‌آید و prop size برای استفادهٔ آزاد بیرون این ظرف‌ها نگه داشته شده.
// ============================================================

import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

type AvatarMode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving' | 'happy';

interface Props {
  className?: string;
  alt?: string;
  /** نگه‌داشته شده برای سازگاری امضای قبلی — تصویر ثابت است و حالتی ندارد */
  mode?: AvatarMode;
  size?: number;
  /** فقط سر — نگه‌داشته شده برای سازگاری امضای قبلی */
  compact?: boolean;
}

export default function AssistantAvatar({ className, alt, size }: Props) {
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
    </span>
  );
}
