// ============================================================
// ZHINO — تصویر کوچک و تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
//
// فقط همان فایل تصویر واقعی ربات (ASSISTANT_BOT_IMAGE) — کوچک، در
// مرکز، با نسبت اصلی و بدون هیچ انیمیشن، حباب یا افکت. عنوان و متن
// راهنمای خوش‌آمدگویی در AssistantChat کنار همین تصویر می‌نشینند.
// ============================================================

import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  return (
    <img
      className={cn('zhino-welcome-photo', className)}
      src={ASSISTANT_BOT_IMAGE}
      alt={`تصویر واقعی ${ASSISTANT_NAME}`}
      draggable={false}
    />
  );
}
