// ============================================================
// ZHINO — تصویر کوچک و تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
//
// فقط همان فایل تصویر واقعی ربات (ASSISTANT_BOT_IMAGE) — کوچک، در
// مرکز، با نسبت اصلی و بدون هیچ انیمیشن، حباب یا افکت. عنوان و متن
// راهنمای خوش‌آمدگویی در AssistantChat کنار همین تصویر می‌نشینند.
//
// قاب (wrapper) با یک CSS crop ساده فضای خالی اضافی اطراف ربات را
// کم می‌کند: تصویر از قاب بزرگ‌تر است و وسط‌چین می‌شود؛ فایل اصلی
// دست‌نخورده است و ظاهر تمام‌قد حفظ می‌ماند (نشان‌ها و اعداد crop
// در assistant.css، بخش «فاز ۱۰»).
// ============================================================

import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  return (
    <div className={cn('zhino-welcome-photo-wrap', className)}>
      <img
        className="zhino-welcome-photo"
        src={ASSISTANT_BOT_IMAGE}
        alt={`تصویر واقعی ${ASSISTANT_NAME}`}
        draggable={false}
      />
    </div>
  );
}
