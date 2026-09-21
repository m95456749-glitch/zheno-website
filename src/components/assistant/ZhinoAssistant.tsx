// ============================================================
// ZHINO — دکمهٔ شناور دستیار ژینو - بازطراحی شده
// کاراکتر سه‌بعدی زنده در دکمهٔ شناور
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import AssistantAvatar from './AssistantAvatar';
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from './assistantData';
import './assistant.css';

const SEEN_KEY = 'zhino_assistant_seen_v1';

function hasVisited(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function rememberVisit(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* حالت خصوصی */
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
          {/* بدون size: آواتار کل قاب مدالی را می‌پوشاند (crop سر و بالاتنه
              در assistant.css، بخش «فاز ۱۰») */}
          <AssistantAvatar compact={true} mode="idle" />
          {!visited && <span className="zhino-assistant-dot" aria-hidden="true" />}
        </span>
        <span className="zhino-assistant-tip" aria-hidden="true">
          {ASSISTANT_NAME}
        </span>
      </span>
    </Link>
  );
}
