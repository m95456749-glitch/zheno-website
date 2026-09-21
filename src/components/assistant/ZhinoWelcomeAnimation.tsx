// ============================================================
// ZHINO — تصویر کوچک و تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
//
// فقط همان فایل تصویر واقعی ربات (ASSISTANT_BOT_IMAGE) — کوچک، در
// مرکز، با نسبت اصلی و بدون هیچ قاب یا حباب. عنوان و متن راهنمای
// خوش‌آمدگویی در AssistantChat کنار همین تصویر می‌نشینند.
//
// یکپارچگی با محیط چت و دو حرکت بسیار ظریف (فاز ۱۱):
//   • wrapper هم‌رنگ صفحهٔ چت است و بدون خط دور/سایه؛ لبه‌های عکس با
//     چهار گرادیانِ هم‌رنگ صفحه در پس‌زمینه حل می‌شوند (assistant.css
//     بخش «فاز ۱۱») — هیچ کادر قابل‌دیدنی نمی‌ماند.
//   • sway بسیار آرام سر/بدن + پلک طبیعی با دو لکهٔ هم‌رنگِ وایزر
//     روی چشم‌های واقعیِ همان عکس — فایل اصلی تصویر دست‌نخورده است.
//   • با prefers-reduced-motion هر دو حرکت خاموش می‌شوند.
// ============================================================

import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  return (
    <div className={cn('zhino-welcome-photo-wrap', className)}>
      {/* لایهٔ حرکت آرام — پلک‌ها داخل همین لایه‌اند تا با بدن هم‌حرکت بمانند */}
      <div className="zhino-welcome-photo-stage">
        <img
          className="zhino-welcome-photo"
          src={ASSISTANT_BOT_IMAGE}
          alt={`تصویر واقعی ${ASSISTANT_NAME}`}
          draggable={false}
        />
        {/* پلک: دو لکهٔ هم‌رنگ وایزر دقیقاً روی چشم‌ها — معمولاً نامرئی */}
        <span className="zhino-welcome-eyes" aria-hidden="true">
          <span className="zhino-welcome-eye is-left" />
          <span className="zhino-welcome-eye is-right" />
        </span>
      </div>
    </div>
  );
}
