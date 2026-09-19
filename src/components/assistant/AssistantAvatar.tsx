// ============================================================
// ZHINO — آواتار جدید ربات دستیار ژینو
// بازطراحی کامل: کاراکتر سه‌بعدی Premium، زنده و دوست‌داشتنی
// - چشم‌های بزرگ و قابل حرکت
// - لبخند و حالات صورت
// - بدن کامل (در حالت full) با دست و پا
// - محصول «محصولات ژله و کاستر» در دست
// - انیمیشن‌های طبیعی: پلک زدن نامنظم، نگاه زنده، تنفس
// ============================================================

import ZhinoCharacter from './ZhinoCharacter';
import { cn } from '../../utils/cn';

type AvatarMode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving';

interface Props {
  className?: string;
  alt?: string;
  mode?: AvatarMode;
  size?: number;
  compact?: boolean;
}

export default function AssistantAvatar({ className, mode = 'idle', size, compact = true }: Props) {
  // سایز پیش‌فرض بر اساس محل استفاده
  // compact=true -> فقط سر، مناسب آواتارهای کوچک چت و هدر
  // compact=false -> بدن کامل، مناسب صفحه خوشامد
  const computedSize = size ?? (compact ? 56 : 200);

  return (
    <span className={cn('zhino-avatar-wrap', className)} style={{ display: 'inline-flex' }}>
      <ZhinoCharacter mode={mode} size={computedSize} compact={compact} showProduct={!compact} />
    </span>
  );
}
