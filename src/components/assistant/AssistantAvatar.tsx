// ============================================================
// ZHINO — آواتار دستیار ژینو (مدالیون سه‌بعدی)
//
// بازطراحی کامل: به‌جای تصویر ثابت، یک مدالیون فلزی طلایی مات با
// میدان زرشکی و سرِ زندهٔ ربات داخل آن (ZhinoMedallion). آواتار با
// حالت گفتگو واکنش نشان می‌دهد: هالهٔ نور عوض می‌شود و چشم‌ها/دهان
// ربات حرکت می‌کنند.
//
// اندازه از ظرف‌های همیشگی (سربرگ، ردیف پیام، دکمهٔ شناور) می‌آید و
// مدالیون کل ظرف را پر می‌کند؛ prop size برای استفادهٔ آزاد بیرون
// این ظرف‌ها نگه داشته شده است.
// ============================================================

import ZhinoMedallion, { type ZhinoMedallionMode } from './ZhinoMedallion';
import { cn } from '../../utils/cn';

type AvatarMode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving' | 'happy';

interface Props {
  className?: string;
  alt?: string;
  mode?: AvatarMode;
  size?: number;
  /** فقط سر (مدالیون) — همان حالت پیش‌فرض مدالیون */
  compact?: boolean;
}

export default function AssistantAvatar({ className, mode = 'idle', size, compact = true }: Props) {
  const style = size ? { display: 'inline-flex', width: size, height: size } : { display: 'inline-flex', width: '100%', height: '100%' };
  void compact;
  return (
    <span className={cn('zhino-avatar-wrap', className)} style={style}>
      <ZhinoMedallion mode={mode as ZhinoMedallionMode} />
    </span>
  );
}
