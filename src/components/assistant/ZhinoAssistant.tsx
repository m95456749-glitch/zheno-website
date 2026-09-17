// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵) — دکمهٔ شناور
//
// از این فاز، این دکمه هیچ پنجرهٔ Popup باز نمی‌کند: کاربر را به
// صفحهٔ مستقل /assistant می‌برد (Link واقعی — بنابراین کلیک وسط،
// باز کردن در تب تازه و دکمهٔ Back مرورگر همه درست کار می‌کنند).
//
// جای این دکمه در Layout فروشگاه است (نه پنل مدیریت) و روی
// /cart، /checkout و خود /assistant نمایش داده نمی‌شود؛ پس در صفحهٔ
// دستیار تکرار نمی‌شود.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import AssistantAvatar from './AssistantAvatar';
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from './assistantData';
import './assistant.css';

/** نشان «تازه» فقط تا اولین بازدید از صفحهٔ دستیار می‌ماند */
const SEEN_KEY = 'zhino_assistant_seen_v1';

function hasVisited(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // بدون دسترسی به حافظه، نشان نمایش داده نمی‌شود
  }
}

function rememberVisit(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* حالت خصوصی مرورگر — بی‌اهمیت */
  }
}

export default function ZhinoAssistant() {
  const [visited, setVisited] = useState(hasVisited);

  return (
    <Link
      to="/assistant"
      className="zhino-assistant-launcher"
      aria-label={`گفتگو با ${ASSISTANT_NAME} — صفحهٔ دستیار`}
      title={`${ASSISTANT_NAME} — ${ASSISTANT_TAGLINE}`}
      onClick={() => {
        rememberVisit();
        setVisited(true);
      }}
    >
      <span className="zhino-assistant-float">
        <span className="zhino-assistant-medallion">
          <AssistantAvatar />
          {!visited && <span className="zhino-assistant-dot" aria-hidden="true" />}
        </span>
        <span className="zhino-assistant-tip" aria-hidden="true">
          {ASSISTANT_NAME}
        </span>
      </span>
    </Link>
  );
}
