// ============================================================
// ZHINO — انیمیشن خوشامدگویی کاراکتر سه‌بعدی دستیار ژینو
// بازطراحی کامل: کاراکتر زنده با بدن کامل، دست و پا
// - ورود با لبخند
// - سلام با دست
// - نشان دادن محصول «محصولات ژله و کاستر»
// - سپس حالت Idle طبیعی با تنفس و پلک زدن نامنظم
// ============================================================

import { useState, useCallback } from 'react';
import ZhinoCharacter from './ZhinoCharacter';
import { cn } from '../../utils/cn';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  const [animKey, setAnimKey] = useState(0);
  const [mode, setMode] = useState<'greeting' | 'idle'>('greeting');
  const [showBubble, setShowBubble] = useState(true);

  const handleGreetingComplete = useCallback(() => {
    setMode('idle');
    setShowBubble(false);
  }, []);

  const restartAnimation = useCallback(() => {
    setMode('greeting');
    setShowBubble(true);
    setAnimKey((k) => k + 1);
  }, []);

  return (
    <div
      key={animKey}
      className={cn('zhino-welcome-new', className)}
      role="region"
      aria-label="خوشامدگویی دستیار ژینو"
    >
      {/* حباب سلام */}
      <div className={cn('zhino-welcome-bubble', !showBubble && 'is-hidden')} aria-hidden="true">
        <span>سلام! 👋</span>
        <span className="zhino-welcome-bubble-tail" />
      </div>

      {/* کاراکتر اصلی */}
      <button
        type="button"
        className="zhino-welcome-char-btn"
        onClick={restartAnimation}
        aria-label="پخش مجدد انیمیشن خوشامدگویی"
        title="برای اجرای مجدد انیمیشن کلیک کنید"
      >
        <ZhinoCharacter
          mode={mode}
          size={220}
          compact={false}
          showProduct={true}
          onGreetingComplete={handleGreetingComplete}
          className="zhino-welcome-char"
        />
      </button>

      {/* متن راهنما */}
      <div className="zhino-welcome-hint" aria-hidden="true">
        <span>من دستیار ژینو هستم — راهنمای محصولات ژله و کاستر</span>
      </div>
    </div>
  );
}
