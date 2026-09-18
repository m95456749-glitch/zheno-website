// ============================================================
// ZHINO — Cloud Persian voice simulator (phase 9 final)
//
// What this proves with the REAL bundled app in jsdom (no deploy,
// no real Azure, no network):
//
//   C1 — cloud success: one POST to zhino-voice with the publishable
//        key header, real HTMLAudio playback, browser engine untouched,
//        and a visible "در حال آماده‌سازی صدا…" state while fetching
//   C2 — replay / pause / resume / stop on the SAME reply uses the
//        in-memory cache: NO second request ever goes out
//   C3 — secret missing (501) → the browser voice takes over
//        (user needs no phone voice install when cloud works; when
//        the cloud path is down the device voice is tried silently)
//   C4 — network error AND quota 429 → same browser takeover, and
//        the circuit breaker skips the cloud on the next reply
//   C5 — cloud down + device has no Persian voice → the short
//        Persian message appears, nothing is handed to the engine,
//        and no button stays stuck
//   C6 — stop during an in-flight fetch → nothing plays late, no
//        stuck loading/playing state
//   S7–S9 — admin switches (cloud off / auto-read off / custom rate)
//        reach the storefront through the settings snapshot
//   S10 — the «ربات ژینو» admin page: one entry point, three
//        collapsible subsections, demo-local save, engine-backed
//        voice test, zero secrets on screen (phase 11)
//   S11 — the master «صدای ربات» switch off = total silence AND
//        hidden voice buttons (phase 11)
//   S12 — starter suggestions obey the admin switch (phase 11)
//
// Usage:  npm run test:voice-cloud
// ============================================================

import { buildSync } from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the real app bundle, configured for a simulated Supabase ── */
const CLOUD_DEFINES = {
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.BASE_URL': '"/"',
  'import.meta.env.MODE': '"production"',
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.VITE_API_BASE_URL': '""',
  'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
  'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
  'import.meta.env.VITE_ADMIN_AUTH_MODE': '"demo"',
  'import.meta.env.VITE_SUPABASE_URL': '"https://sim.supabase.co"',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_cloud_sim"',
  'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  'import.meta.env.VITE_ASSISTANT_API_URL': '""',
};

/** آفلاین/دمو برای سناریوی پنل مدیریت (بدون Supabase) */
const OFFLINE_DEFINES = {
  ...CLOUD_DEFINES,
  'import.meta.env.VITE_SUPABASE_URL': '""',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
};

const buildApp = (defines) =>
  buildSync({
    entryPoints: [join(root, 'src', 'main.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    write: false,
    logLevel: 'silent',
    define: defines,
  }).outputFiles[0].text;

console.log('bundling the real app for the cloud voice simulation…');
const appCode = buildApp(CLOUD_DEFINES);
const offlineAppCode = buildApp(OFFLINE_DEFINES);
ok(`app bundles ready (${(appCode.length / 1024).toFixed(0)} KB cloud, ${(offlineAppCode.length / 1024).toFixed(0)} KB offline-demo)`);

const SIM_REPLY = 'پاسخ آزمایشی دستیار برای آزمون صدا';
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22]);
const PUBLIC_KEY = 'sb_publishable_cloud_sim';

/* ── مسیر مرورگر: موتور TTS سبک (مثل Chrome Android سالم) ───── */
class SimTtsEngine {
  constructor({ hasPersian = false } = {}) {
    this.hasPersianData = hasPersian;
    this.voices = hasPersian
      ? [
          { lang: 'fa-IR', name: 'Sim Persian' },
          { lang: 'en-US', name: 'Sim English' },
        ]
      : [{ lang: 'en-US', name: 'Sim English' }];
    this.activated = false;
    this.current = null;
    this.log = [];
  }
  get speaking() {
    return this.current !== null;
  }
  get paused() {
    return false;
  }
  get pending() {
    return false;
  }
  getVoices() {
    return this.voices.map((v) => ({ ...v }));
  }
  addEventListener() {}
  removeEventListener() {}
  markActivation() {
    this.activated = true;
  }
  speak(utterance) {
    this.log.push(
      `speak(lang=${utterance.lang};rate=${utterance.rate}):${String(utterance.text).slice(0, 24)}`,
    );
    if (!this.activated) {
      this.log.push('dropped:no-activation');
      return;
    }
    if (/^fa/i.test(utterance.lang ?? '') && !this.hasPersianData) {
      this.log.push('silent:unsupported-fa');
      return;
    }
    this.current = utterance;
    const u = utterance;
    setTimeout(() => {
      if (typeof u.onstart === 'function') u.onstart();
      setTimeout(() => {
        if (this.current === u) this.current = null;
        if (typeof u.onend === 'function') u.onend();
      }, 60);
    }, 20);
  }
  resume() {}
  pause() {}
  cancel() {
    const u = this.current;
    this.current = null;
    this.log.push('cancel');
    if (u && typeof u.onerror === 'function') {
      setTimeout(() => {
        try {
          u.onerror({ error: 'canceled' });
        } catch {
          /* fine */
        }
      }, 5);
    }
  }
}

/* ── عنصر صوتی جعلی: واقعی‌گرایانه اما قطعی ────────────────── */
class FakeAudio {
  constructor() {
    this.src = '';
    this.preload = '';
    this.plays = [];
    this.pauses = 0;
    this.onended = null;
    this.onerror = null;
    FakeAudio.last = this;
  }
  play() {
    this.plays.push(this.src);
    return Promise.resolve();
  }
  pause() {
    this.pauses += 1;
  }
  finish() {
    if (typeof this.onended === 'function') this.onended();
  }
  errorNow() {
    if (typeof this.onerror === 'function') this.onerror();
  }
}

/* ── fetch جعلی: پاسخ دستیار + حالت‌های صدای ابری + دیتابیس عمومی ── */
function makeFetch(voiceMode, voiceCalls, voiceDelayMs, restCalls, restRows) {
  return async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? input));
    const method = (init.method ?? 'GET').toUpperCase();

    // دیتابیس عمومی (site_content / site_settings / recipes) — تنظیمات
    // غیرمحرمانهٔ صدا همین‌جا سوار می‌شود. بقیهٔ جدول‌ها (کاتالوگ) مثل
    // قبل آفلاین می‌مانند تا سناریوهای قبلی دست‌نخورده بمانند.
    if (url.includes('/rest/v1/site_content')) {
      restCalls.push({ url, method });
      return new Response(JSON.stringify(restRows ?? []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/rest/v1/site_settings') || url.includes('/rest/v1/recipes')) {
      restCalls.push({ url, method });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('zhino-assistant')) {
      if (method === 'GET') {
        return new Response(
          JSON.stringify({ ok: true, configured: true, model: 'sim-model', database: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ reply: SIM_REPLY, model: 'sim-model', knowledge: 'client' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.includes('zhino-voice')) {
      const headers = init.headers
        ? Object.fromEntries(new globalThis.Headers(init.headers).entries())
        : {};
      let bodyText = '';
      try {
        bodyText = String(init.body ?? '');
      } catch {
        bodyText = '';
      }
      voiceCalls.push({ headers, body: bodyText });
      if (voiceDelayMs > 0) await sleep(voiceDelayMs);

      if (voiceMode === 'network') throw new Error('simulated network failure');
      if (voiceMode === 'http-501') {
        return new Response(JSON.stringify({ error: 'not_configured' }), {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (voiceMode === 'http-429') {
        return new Response(JSON.stringify({ error: 'quota_exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (voiceMode === 'http-500') {
        return new Response(JSON.stringify({ error: 'upstream_error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(MP3_BYTES, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }

    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

/* ── هارنس اپ (jsdom) ──────────────────────────────────────── */

const SHELL =
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head>' +
  '<body><div id="root"></div></body></html>';

async function openAssistant({ voiceMode = 'ok', voiceDelayMs = 0, engineOpts = {}, restRows = null, code = null, startPath = '/assistant', readySelector = '#zhino-assistant-input' } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String(e?.message ?? e);
    if (/Could not load|ENOTFOUND|EAI_AGAIN|network|Not implemented/i.test(msg)) return;
    errors.push('jsdomError: ' + msg);
  });
  virtualConsole.on('error', (...args) => {
    errors.push('console.error: ' + args.map(String).join(' '));
  });

  const engine = new SimTtsEngine(engineOpts);
  const voiceCalls = [];
  const restCalls = [];
  const objectUrls = [];
  const revokedUrls = [];
  FakeAudio.last = null;

  const dom = new JSDOM(SHELL, {
    url: `http://localhost${startPath}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      window.fetch = makeFetch(voiceMode, voiceCalls, voiceDelayMs, restCalls, restRows);
      window.SpeechSynthesisUtterance = class FakeUtterance {
        constructor(text) {
          this.text = text;
          this.lang = '';
          this.voice = null;
          this.rate = 1;
          this.pitch = 1;
          this.volume = 1;
        }
      };
      window.speechSynthesis = engine;
      window.Audio = FakeAudio;
      window.URL.createObjectURL = (blob) => {
        objectUrls.push(blob);
        return `blob:sim-${objectUrls.length}`;
      };
      window.URL.revokeObjectURL = (url) => {
        revokedUrls.push(String(url));
      };
    },
  });

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = code ?? appCode;
  document.body.appendChild(script);

  const text = () => document.getElementById('root')?.textContent ?? '';
  const waitFor = async (predicate, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(60);
    }
    return predicate();
  };
  const typeInto = (selector, value) => {
    const el = document.querySelector(selector);
    const proto = dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const tap = (el) => {
    if (!el) throw new Error('tried to tap a missing element');
    engine.markActivation();
    el.click();
  };
  const send = async (message) => {
    typeInto('#zhino-assistant-input', message);
    const ready = await waitFor(() => {
      const button = document.querySelector('button[aria-label="ارسال پیام"]');
      return Boolean(button) && !button.disabled;
    });
    if (!ready) throw new Error('send button never enabled');
    tap(document.querySelector('button[aria-label="ارسال پیام"]'));
  };
  const enableVoice = async () => {
    tap(document.querySelector('button.zhino-assistant-voice'));
    return waitFor(
      () =>
        document.querySelector('button.zhino-assistant-voice')?.getAttribute('aria-pressed') ===
        'true',
    );
  };

  const rendered = await waitFor(() => Boolean(document.querySelector(readySelector)));
  if (!rendered) throw new Error(`the page never rendered (waiting for ${readySelector})`);

  /** صبر تا اسنپ‌شات دیتابیس عمومی (تنظیمات) خوانده شود */
  const waitForRemote = async () => {
    const seen = await waitFor(() => restCalls.some((c) => c.url.includes('site_content')), 8000);
    await sleep(120); // جاری‌شدن اسنپ‌شات در هوک‌ها
    return seen;
  };

  return {
    dom,
    document,
    text,
    waitFor,
    tap,
    send,
    enableVoice,
    waitForRemote,
    errors,
    engine,
    voiceCalls,
    restCalls,
    objectUrls,
    revokedUrls,
    audio: () => FakeAudio.last,
    close: () => dom.window.close(),
  };
}

const PREPARING = 'در حال آماده‌سازی صدا';
const CLOUD_FAILED_NOTE = 'صدا این لحظه در دسترس نیست';

/* ════════════════════════════════════════════════════════════
   C1 — cloud success + C2 — cache: replay, pause, resume, stop
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nC1/C2 — معماری ابری: موفقیت، کش، پخش/مکث/ادامه/توقف/پخش مجدد…');
  const h = await openAssistant({ voiceMode: 'ok', voiceDelayMs: 350, engineOpts: { hasPersian: false } });
  try {
    if (await h.enableVoice()) ok('C1 — the voice toggle switches on when the cloud voice is configured');
    else fail('C1 — voice toggle never turned on');

    await h.send('ژله انار داری؟');

    // ۱) وضعیت آماده‌سازی هنگام دریافت صدا دیده می‌شود
    const sawPreparing = await h.waitFor(() => h.text().includes(PREPARING), 5000);
    if (sawPreparing) ok('C1 — "در حال آماده‌سازی صدا…" is visible while the audio is fetched');
    else fail('C1 — the preparing state never appeared');

    // ۲) پخش ابری شروع می‌شود
    const playing = await h.waitFor(() => Boolean(h.document.querySelector('.zhino-assistant-playback')), 10000);
    if (!playing) fail('C1 — playback never started');
    else ok('C1 — cloud playback reached the playing state');

    // ۳) دقیقاً یک درخواست درست به تابع رفته است
    if (h.voiceCalls.length === 1) {
      ok('C1 — exactly one zhino-voice request was made');
    } else {
      fail(`C1 — expected exactly 1 zhino-voice request, got ${h.voiceCalls.length}`);
    }
    const call = h.voiceCalls[0] ?? { headers: {}, body: '' };
    if (call.headers.authorization === `Bearer ${PUBLIC_KEY}` && call.headers.apikey === PUBLIC_KEY) {
      ok('C1 — only the PUBLIC publishable key travels in headers (no secret)');
    } else {
      fail(`C1 — unexpected auth headers: ${JSON.stringify(call.headers)}`);
    }
    if (call.body.includes(SIM_REPLY)) {
      ok('C1 — the assistant reply text (not the user question) goes to the voice service');
    } else {
      fail(`C1 — the wrong text was sent to the voice service: ${call.body.slice(0, 60)}`);
    }

    // ۴) پخش با عنصر <audio> واقعی انجام شده، نه موتور مرورگر
    const audio = h.audio();
    if (audio && audio.plays.filter((src) => src.startsWith('blob:sim-')).length >= 1) {
      ok('C1 — the real <audio> element plays the cloud blob URL');
    } else {
      fail('C1 — no blob playback was observed on the <audio> element');
    }
    if (audio && audio.plays.some((src) => src.startsWith('data:audio/wav'))) {
      ok('C1 — the silent in-gesture unlock ran before the network fetch (mobile autoplay)');
    } else {
      fail('C1 — the silent autoplay unlock did not run in the user gesture');
    }
    if (!h.engine.log.some((line) => line.startsWith('speak('))) {
      ok('C1 — the browser speech engine stayed untouched while the cloud works');
    } else {
      fail('C1 — the browser engine was used although the cloud voice succeeded');
    }

    // ۵) مکث و ادامهٔ واقعی روی <audio>
    const pauseBtn = () => h.document.querySelector('.zhino-assistant-playback button[aria-label="مکث خواندن"]');
    const resumeBtn = () => h.document.querySelector('.zhino-assistant-playback button[aria-label="ادامه خواندن"]');
    if (pauseBtn()) {
      h.tap(pauseBtn());
      const pausedShown = await h.waitFor(() => Boolean(resumeBtn()));
      if (pausedShown && h.audio().pauses === 1) {
        ok('C2 — pause is REAL: HTMLAudioElement.pause() once, resume control shown');
      } else {
        fail('C2 — pause did not reach the audio element or the UI did not switch');
      }
      const playsBeforeResume = h.audio().plays.length;
      h.tap(resumeBtn());
      const resumed = await h.waitFor(() => Boolean(pauseBtn()));
      if (resumed && h.audio().plays.length === playsBeforeResume + 1) {
        ok('C2 — resume plays the same in-memory audio again (no request)');
      } else {
        fail('C2 — resume did not re-play the audio element');
      }
    } else {
      fail('C2 — the pause control was not available during playback');
    }
    if (h.voiceCalls.length === 1) {
      ok('C2 — pause/resume added no network request');
    } else {
      fail(`C2 — pause/resume triggered extra requests (${h.voiceCalls.length})`);
    }

    // ۶) توقف کامل
    const stopBtn = h.document.querySelector('.zhino-assistant-playback button.zhino-assistant-stop');
    h.tap(stopBtn);
    const stopped = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'));
    if (stopped) ok('C2 — stop clears the playback state (no stuck controls)');
    else fail('C2 — the playback UI never cleared after stop');
    if (h.revokedUrls.length >= 1) ok('C2 — the blob URL is revoked on stop (memory freed)');
    else fail('C2 — the blob URL was not revoked on stop');

    // ۷) پخش مجدد همان پاسخ: بدون هیچ درخواست تازه‌ای (کش فقط‌حافظه)
    const firstBlob = h.objectUrls[0];
    const readBtn = h.document.querySelector('button.zhino-assistant-read');
    h.tap(readBtn);
    const replaying = await h.waitFor(() => Boolean(h.document.querySelector('.zhino-assistant-playback')), 8000);
    if (!replaying) fail('C2 — replay of the same reply did not start');
    else ok('C2 — replay of the same reply plays again');
    if (h.voiceCalls.length === 1) {
      ok('C2 — replay made NO new zhino-voice request (served from the memory cache)');
    } else {
      fail(`C2 — replay issued a redundant request (${h.voiceCalls.length} total)`);
    }
    if (h.objectUrls.length === 2 && h.objectUrls[1] === firstBlob) {
      ok('C2 — replay reuses the SAME cached Blob (only a fresh object URL)');
    } else {
      fail('C2 — replay did not reuse the cached blob');
    }

    // ۸) پایان طبیعی پخش، وضعیت را پاک می‌کند
    h.audio().finish();
    const idleAgain = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 5000);
    if (idleAgain) ok('C2 — natural end-of-audio returns the UI to idle');
    else fail('C2 — the UI stayed in the playing state after the audio ended');
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C3 — Secret تنظیم نشده (501) → صدای مرورگر جایگزین می‌شود
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nC3 — Secret تنظیم‌نشده: جایگزینی با صدای مرورگر…');
  const h = await openAssistant({ voiceMode: 'http-501', voiceDelayMs: 30, engineOpts: { hasPersian: true } });
  try {
    await h.enableVoice();
    await h.send('سلام');
    const browserSpeaking = await h.waitFor(
      () => h.engine.log.some((line) => line.startsWith('speak(lang=fa')),
      10000,
    );
    if (browserSpeaking) {
      ok('C3 — with the secret missing (501), the browser Persian voice takes over');
    } else {
      fail('C3 — the browser voice did not take over after 501');
    }
    if (h.voiceCalls.length === 1) ok('C3 — exactly one cloud attempt was made before the takeover');
    else fail(`C3 — unexpected number of cloud attempts (${h.voiceCalls.length})`);
    const settled = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 12000);
    if (settled) ok('C3 — the browser playback finishes cleanly (no stuck UI)');
    else fail('C3 — the UI stayed stuck after browser playback');
    if (!h.text().includes(CLOUD_FAILED_NOTE)) {
      ok('C3 — no failure message is shown when the browser takeover succeeds');
    } else {
      fail('C3 — a failure message was shown although the browser read fine');
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C4 — خطای شبکه + سهمیه ۴۲۹ + مدار شکننده
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nC4a — قطعی شبکه: جایگزینی و مدار شکننده…');
  const h = await openAssistant({ voiceMode: 'network', voiceDelayMs: 20, engineOpts: { hasPersian: true } });
  try {
    await h.enableVoice();
    await h.send('پرسش اول');
    const tookOver = await h.waitFor(() => h.engine.log.some((line) => line.startsWith('speak(')), 10000);
    if (tookOver) ok('C4a — a network failure falls back to the browser voice');
    else fail('C4a — the browser voice did not take over after a network failure');

    await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 12000);
    await h.send('پرسش دوم');
    const secondRead = await h.waitFor(
      () => h.engine.log.filter((line) => line.startsWith('speak(')).length >= 2,
      10000,
    );
    if (!secondRead) fail('C4a — the second reply was never read');
    if (h.voiceCalls.length === 1) {
      ok('C4a — the circuit breaker skips the cloud after a network failure (still 1 request)');
    } else {
      fail(`C4a — the circuit breaker did not engage (${h.voiceCalls.length} requests)`);
    }
  } finally {
    h.close();
  }

  console.log('\nC4b — اتمام سهمیه (۴۲۹): جایگزینی و مدار شکننده…');
  const h2 = await openAssistant({ voiceMode: 'http-429', voiceDelayMs: 20, engineOpts: { hasPersian: true } });
  try {
    await h2.enableVoice();
    await h2.send('پرسش اول');
    const tookOver = await h2.waitFor(() => h2.engine.log.some((line) => line.startsWith('speak(')), 10000);
    if (tookOver) ok('C4b — quota exhaustion (429) falls back to the browser voice');
    else fail('C4b — the browser voice did not take over after 429');

    await h2.waitFor(() => !h2.document.querySelector('.zhino-assistant-playback'), 12000);
    await h2.send('پرسش دوم');
    await h2.waitFor(() => h2.engine.log.filter((line) => line.startsWith('speak(')).length >= 2, 10000);
    if (h2.voiceCalls.length === 1) {
      ok('C4b — after 429 the cloud is not retried immediately (no quota hammering)');
    } else {
      fail(`C4b — the cloud was retried despite the quota error (${h2.voiceCalls.length} requests)`);
    }
  } finally {
    h2.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C5 — ابری خراب + گوشی صدای فارسی ندارد → پیام کوتاه فارسی
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nC5 — آخرین حلقهٔ زنجیره: پیام کوتاه فارسی، بدون گیرکردن…');
  const h = await openAssistant({ voiceMode: 'http-500', voiceDelayMs: 30, engineOpts: { hasPersian: false } });
  try {
    await h.enableVoice();
    await h.send('قیمت‌ها را بگو');
    const noted = await h.waitFor(() => h.text().includes(CLOUD_FAILED_NOTE), 10000);
    if (noted) ok('C5 — when both engines fail, the short Persian message is shown');
    else fail('C5 — the short Persian fallback message never appeared');
    if (!h.engine.log.some((line) => line.startsWith('speak('))) {
      ok('C5 — nothing is handed to an engine that cannot read Persian');
    } else {
      fail('C5 — text was handed to the browser engine although Persian is missing');
    }
    await sleep(300);
    if (!h.text().includes(PREPARING) && !h.document.querySelector('.zhino-assistant-playback')) {
      ok('C5 — no loading or playing state is stuck after the double failure');
    } else {
      fail('C5 — a loading/playing state is stuck after the double failure');
    }
    // گفتگو سالم می‌ماند
    await h.send('باشه');
    const chatAlive = await h.waitFor(() => h.text().includes(SIM_REPLY), 8000);
    if (chatAlive) ok('C5 — the chat keeps working after the voice failure');
    else fail('C5 — the chat broke after the voice failure');
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C6 — توقف در میانهٔ دریافت: هیچ پخش دیرهنگام و گیرکردنی نیست
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nC6 — لغو هنگام آماده‌سازی صدا…');
  const h = await openAssistant({ voiceMode: 'ok', voiceDelayMs: 900, engineOpts: { hasPersian: false } });
  try {
    await h.enableVoice();
    await h.send('یک پاسخ بلند بده');
    const preparingShown = await h.waitFor(() => h.text().includes(PREPARING), 5000);
    if (!preparingShown) fail('C6 — the preparing state never appeared to be cancelled');
    // لمس دوم روی همان دکمه → لغو
    const preparingBtn = h.document.querySelector('button[aria-busy="true"]') ??
      h.document.querySelector('button.zhino-assistant-read');
    h.tap(preparingBtn);
    await sleep(1400); // پاسخ شبکه حالا می‌رسد؛ نباید دیر پخش شود
    const audio = h.audio();
    const blobPlays = audio ? audio.plays.filter((src) => src.startsWith('blob:sim-')).length : 0;
    if (blobPlays === 0) {
      ok('C6 — the late network response is discarded (no late playback after stop)');
    } else {
      fail('C6 — audio played although the user stopped the in-flight load');
    }
    if (!h.text().includes(PREPARING) && !h.document.querySelector('.zhino-assistant-playback')) {
      ok('C6 — no loading/playing state is stuck after the in-flight cancel');
    } else {
      fail('C6 — a loading or playing state is stuck after the in-flight cancel');
    }
    const readAgainLabel = h.document.querySelector('button.zhino-assistant-read span')?.textContent ?? '';
    if (readAgainLabel.includes('خواندن پاسخ')) {
      ok('C6 — the read button returns to its normal state');
    } else {
      fail(`C6 — the read button shows an unexpected label: ${readAgainLabel}`);
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S7 — کلید اصلی مدیر خاموش است: هیچ تماس ابری‌ای برقرار نمی‌شود
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS7 — تنظیمات مدیر: صدای ابری خاموش → فقط صدای مرورگر…');
  const h = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
    restRows: [{ key: 'assistant_voice_cloud', value: '0' }],
  });
  try {
    const remote = await h.waitForRemote();
    if (!remote) fail('S7 — the remote settings snapshot never loaded');
    await h.enableVoice();
    await h.send('سلام');
    const browserRead = await h.waitFor(() => h.engine.log.some((line) => line.startsWith('speak(')), 10000);
    if (browserRead) ok('S7 — with the admin master switch off, the browser voice reads');
    else fail('S7 — nothing was read with the cloud switch off');
    await sleep(600);
    if (h.voiceCalls.length === 0) {
      ok('S7 — the admin switch off means ZERO cloud requests from the storefront');
    } else {
      fail(`S7 — storefront still called the cloud voice (${h.voiceCalls.length} times)`);
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S8 — خواندن خودکار خاموش: هیچ خواندنِ خودکاری نیست، دستی می‌ماند
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS8 — تنظیمات مدیر: خواندن خودکار خاموش…');
  const h = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
    restRows: [{ key: 'assistant_voice_auto', value: '0' }],
  });
  try {
    await h.waitForRemote();
    // دکمهٔ خواندن خودکار اصلاً دیده نمی‌شود
    const toggleHidden = await h.waitFor(
      () =>
        Boolean(h.document.querySelector('#zhino-assistant-input')) &&
        !h.document.querySelector('button.zhino-assistant-voice'),
      6000,
    );
    if (toggleHidden) ok('S8 — the auto-read toggle is hidden when the admin disables it');
    else fail('S8 — the auto-read toggle is still visible');

    await h.send('قیمت ژله انار؟');
    const replied = await h.waitFor(() => h.text().includes(SIM_REPLY), 10000);
    if (!replied) fail('S8 — the bot reply never arrived');
    await sleep(700);
    if (h.voiceCalls.length === 0 && !h.engine.log.some((line) => line.startsWith('speak('))) {
      ok('S8 — new replies are NEVER auto-read while the admin switch is off');
    } else {
      fail('S8 — a reply was auto-read although the admin disabled auto voice');
    }

    // اما خواندن دستیِ همان پاسخ همچنان کار می‌کند (و ابری است)
    const readBtn = h.document.querySelector('button.zhino-assistant-read');
    if (!readBtn) fail('S8 — the manual read button disappeared too');
    h.tap(readBtn);
    const manualPlays = await h.waitFor(() => Boolean(h.document.querySelector('.zhino-assistant-playback')), 10000);
    if (manualPlays && h.voiceCalls.length === 1) {
      ok('S8 — the manual per-message read still works (one cloud request)');
    } else {
      fail('S8 — manual read did not work or made wrong requests');
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S9 — سرعت خواندن از تنظیمات مدیر به مسیر مرورگر هم می‌رسد
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS9 — تنظیمات مدیر: سرعت خواندن ۱٫۳…');
  const h = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
    restRows: [
      { key: 'assistant_voice_cloud', value: '0' },
      { key: 'assistant_voice_rate', value: '1.3' },
    ],
  });
  try {
    await h.waitForRemote();
    await h.enableVoice();
    await h.send('سلام');
    const spoken = await h.waitFor(() => h.engine.log.some((line) => line.startsWith('speak(')), 10000);
    if (!spoken) fail('S9 — nothing was read');
    if (h.engine.log.some((line) => line.includes('rate=1.3'))) {
      ok('S9 — the admin rate reaches the browser utterance (rate=1.3)');
    } else {
      fail(`S9 — the admin rate was not applied: ${h.engine.log[0] ?? '(no speak)'}`);
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S10 — پنل مدیریت: صفحهٔ «ربات ژینو» (فاز ۱۱) — یک نقطهٔ ورود،
   سه زیربخش جمع‌شونده (صدا / رفتار / وضعیت سرویس)، حالت دمو
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS10 — پنل مدیریت: صفحهٔ «ربات ژینو»…');
  const h = await openAssistant({
    code: offlineAppCode,
    startPath: '/admin',
    readySelector: 'button[type="submit"]',
    engineOpts: { hasPersian: true },
  });
  try {
    // ورود دمو (بدون اعتبار واقعی — فقط پیش‌نمایش)
    const loginReady = await h.waitFor(() => h.document.querySelectorAll('input').length >= 2, 10000);
    if (!loginReady) fail('S10 — the admin login form never rendered');
    const inputs = h.document.querySelectorAll('input');
    const typeInput = (el, value) => {
      const proto = h.dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
    };
    typeInput(inputs[0], 'demo-admin');
    typeInput(inputs[1], 'demo-secret');
    const submit = h.document.querySelector('button[type="submit"]');
    h.tap(submit);
    const navReady = await h.waitFor(() => Boolean(h.document.querySelector('a[href="/admin/assistant"]')), 10000);
    if (!navReady) fail('S10 — the admin panel did not open after the demo login');
    else ok('S10 — demo login opens the admin panel');

    // فقط یک نقطهٔ ورود برای ربات — «ربات ژینو» (نوار کناری + کارت
    // داشبورد هر دو به همان یک بخش اشاره می‌کنند؛ هیچ ورودی دومی نیست)
    const botLinks = [...h.document.querySelectorAll('a[href="/admin/assistant"]')];
    const botHrefs = new Set(
      [...h.document.querySelectorAll('a')]
        .filter((a) => a.textContent?.includes('ربات ژینو'))
        .map((a) => a.getAttribute('href')),
    );
    if (botLinks.length >= 1 && botHrefs.size === 1 && botHrefs.has('/admin/assistant')) {
      ok('S10 — the panel offers exactly one bot section: «ربات ژینو» (one destination everywhere)');
    } else {
      fail(`S10 — bot entries are inconsistent (links=${botLinks.length}, hrefs=${[...botHrefs].join(',') || 'none'})`);
    }

    // صفحهٔ تنظیمات عمومی دیگر هیچ بخش صدایی ندارد
    h.tap(h.document.querySelector('a[href="/admin/settings"]'));
    const settingsShown = await h.waitFor(() => h.text().includes('ارسال رایگان'), 10000);
    if (!settingsShown) fail('S10 — the settings page did not render');
    if (!h.text().includes('تنظیمات صدای دستیار')) {
      ok('S10 — the general settings page no longer carries any voice section');
    } else {
      fail('S10 — the voice section still lives on the settings page (must move to «ربات ژینو»)');
    }

    // صفحهٔ «ربات ژینو»
    h.tap(h.document.querySelector('a[href="/admin/assistant"]'));
    const pageShown = await h.waitFor(() => h.text().includes('تنظیمات صدا') && h.text().includes('تنظیمات رفتار ربات') && h.text().includes('وضعیت سرویس'), 10000);
    if (pageShown) ok('S10 — the «ربات ژینو» page renders its three subsections');
    else fail('S10 — the «ربات ژینو» page did not render its subsections');

    const accordionOf = (title) =>
      [...h.document.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent?.includes(title));
    const soundAcc = accordionOf('تنظیمات صدا');
    const behaviorAcc = accordionOf('تنظیمات رفتار ربات');
    const statusAcc = accordionOf('وضعیت سرویس');
    if (soundAcc?.getAttribute('aria-expanded') === 'true') {
      ok('S10 — the sound subsection starts open (the one admins use most)');
    } else {
      fail('S10 — the sound subsection should start open');
    }
    if (behaviorAcc?.getAttribute('aria-expanded') === 'false' && statusAcc?.getAttribute('aria-expanded') === 'false') {
      ok('S10 — behavior + status subsections start collapsed (clean page)');
    } else {
      fail('S10 — behavior/status subsections should start collapsed');
    }

    // کنترل‌های بخش صدا
    const switches = () => [...h.document.querySelectorAll('button[role="switch"]')];
    const masterSwitch = switches().find((s) => s.getAttribute('aria-label')?.includes('صدای ربات'));
    const autoSwitch = switches().find((s) => s.getAttribute('aria-label')?.includes('خواندن خودکار'));
    const cloudSwitch = switches().find((s) => s.getAttribute('aria-label')?.includes('صدای ابری'));
    if (masterSwitch && autoSwitch && cloudSwitch) {
      ok('S10 — all three sound switches exist (master + auto + cloud)');
    } else {
      fail('S10 — one or more sound switches are missing');
    }
    if (masterSwitch?.getAttribute('aria-checked') === 'true') {
      ok('S10 — the master voice switch defaults to ON');
    } else {
      fail('S10 — the master voice switch should default to ON');
    }

    const selects = [...h.document.querySelectorAll('select')];
    const voiceSelect = selects.find((s) => [...s.options].some((o) => o.value === 'fa-IR-DilaraNeural'));
    if (voiceSelect && voiceSelect.value === 'fa-IR-DilaraNeural' && voiceSelect.options.length === 2) {
      ok('S10 — the Persian voice select defaults to fa-IR-DilaraNeural');
    } else {
      fail(`S10 — wrong voice select state (value=${voiceSelect?.value})`);
    }
    const rateSelect = selects.find((s) => s !== voiceSelect && [...s.options].some((o) => o.value === '1.3'));
    if (rateSelect && rateSelect.value === '1' && rateSelect.options.length === 4) {
      ok('S10 — the reading speed select defaults to normal (1×)');
    } else {
      fail(`S10 — wrong speed select state (value=${rateSelect?.value})`);
    }

    // یادآوری کنترل پخش: فقط اشاره، بدون تکرار دکمه‌ها
    if (h.text().includes('اینجا تکرار نشده‌اند')) {
      ok('S10 — playback controls are documented as chat-only (not duplicated in the panel)');
    } else {
      fail('S10 — the chat-only playback note is missing');
    }

    // بخش رفتار: باز کردن آکاردئون → سوییچ پیشنهادها + انتخاب لحن
    h.tap(behaviorAcc);
    const behaviorOpen = await h.waitFor(() => accordionOf('تنظیمات رفتار ربات')?.getAttribute('aria-expanded') === 'true', 5000);
    if (!behaviorOpen) fail('S10 — the behavior accordion never opened');
    const suggSwitch = switches().find((s) => s.getAttribute('aria-label')?.includes('پیشنهادهای شروع'));
    if (suggSwitch && suggSwitch.getAttribute('aria-checked') === 'true') {
      ok('S10 — the conversation-starters switch exists and defaults to ON');
    } else {
      fail('S10 — the conversation-starters switch is missing or wrong');
    }
    const toneSelect = [...h.document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'formal'),
    );
    if (toneSelect && toneSelect.value === 'friendly') {
      ok('S10 — the reply tone select defaults to friendly');
    } else {
      fail(`S10 — wrong tone select state (value=${toneSelect?.value})`);
    }

    // بخش وضعیت سرویس: وضعیت صادقانهٰ دمو + جایگزین مرورگر، بدون هیچ راز
    h.tap(statusAcc);
    const statusOpen = await h.waitFor(() => accordionOf('وضعیت سرویس')?.getAttribute('aria-expanded') === 'true', 5000);
    if (!statusOpen) fail('S10 — the status accordion never opened');
    if (h.text().includes('بررسی نشده') && h.text().includes('فعال و آماده')) {
      ok('S10 — service status shows cloud «not probed» + browser fallback ready');
    } else {
      fail('S10 — service status lines are missing');
    }
    if (!h.text().includes('AZURE') && !h.text().includes('Ocp-Apim') && !h.text().includes('sb_secret')) {
      ok('S10 — no secret name or key material is ever shown in the status subsection');
    } else {
      fail('S10 — secret material leaked into the status subsection');
    }

    // ویرایش + ذخیره → فقط localStorage (حالت دمو) با مقادیر سالم
    // (گره را تازه می‌گیریم — بعد از باز/بسته‌شدن آکاردئون‌ها رندر تازه شده)
    const cloudSwitchNow = switches().find((s) => s.getAttribute('aria-label')?.includes('صدای ابری'));
    if (!cloudSwitchNow) fail('S10 — the cloud switch disappeared after accordion interactions');
    h.tap(cloudSwitchNow);
    const cloudFlipped = await h.waitFor(
      () => switches().find((s) => s.getAttribute('aria-label')?.includes('صدای ابری'))?.getAttribute('aria-checked') === 'false',
      5000,
    );
    if (!cloudFlipped) fail('S10 — the cloud switch did not flip to OFF');
    const saveBtn = () => [...h.document.querySelectorAll('button')].find((b) => b.textContent?.includes('ذخیره تنظیمات ربات'));
    if (!saveBtn()) fail('S10 — the «ذخیره تنظیمات ربات» button is missing');
    h.tap(saveBtn());
    const stored = await h.waitFor(() => {
      const raw = h.dom.window.localStorage.getItem('zhino_admin_voice_settings_v1');
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        return parsed.cloudVoice === false && parsed.voiceEnabled === true && parsed.voiceName === 'fa-IR-DilaraNeural';
      } catch {
        return false;
      }
    }, 5000);
    if (stored) {
      ok('S10 — saving persists the admin choices to the local settings store');
    } else {
      fail(`S10 — the saved settings are wrong: ${h.dom.window.localStorage.getItem('zhino_admin_voice_settings_v1')}`);
    }

    // تست صدا: با همان موتور گفتگو (مسیر مرورگر در حالت دمو) پخش می‌شود
    const testBtn = [...h.document.querySelectorAll('button')].find((b) => b.textContent?.includes('تست صدا'));
    if (!testBtn) fail('S10 — the «تست صدا» button is missing');
    h.tap(testBtn);
    const testSpoke = await h.waitFor(() => h.engine.log.some((line) => line.startsWith('speak(')), 6000);
    if (testSpoke && h.voiceCalls.length === 0) {
      ok('S10 — «تست صدا» speaks through the chat engine itself (browser path in demo, zero cloud calls)');
    } else {
      fail(`S10 — voice test did not speak through the engine (calls=${h.voiceCalls.length})`);
    }

    if (h.errors.length === 0) ok('S10 — no runtime errors in the «ربات ژینو» journey');
    else fail('S10 — console errors: ' + h.errors.slice(0, 3).join(' | '));
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S11 — کلید اصلی «صدای ربات» خاموش: هیچ صدا و هیچ دکمهٔ صدایی
   (فاز ۱۱ — سکوت کامل: نه ابری، نه مرورگر، نه خودکار، نه دستی)
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS11 — تنظیمات مدیر: کلید اصلی صدای ربات خاموش → سکوت کامل…');
  const h = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
    restRows: [{ key: 'assistant_voice_enabled', value: '0' }],
  });
  try {
    await h.waitForRemote();
    // هیچ دکمهٔ خواندن خودکاری دیده نمی‌شود
    const toggleHidden = await h.waitFor(
      () =>
        Boolean(h.document.querySelector('#zhino-assistant-input')) &&
        !h.document.querySelector('button.zhino-assistant-voice'),
      6000,
    );
    if (toggleHidden) ok('S11 — the auto-read toggle is hidden when the master voice is off');
    else fail('S11 — the auto-read toggle is still visible with the master voice off');

    await h.send('قیمت ژله انار؟');
    const replied = await h.waitFor(() => h.text().includes(SIM_REPLY), 10000);
    if (!replied) fail('S11 — the bot reply never arrived');
    await sleep(700);
    if (h.voiceCalls.length === 0 && !h.engine.log.some((line) => line.startsWith('speak('))) {
      ok('S11 — master off means NOTHING is read: no cloud call, no browser speech');
    } else {
      fail('S11 — something was read aloud although the master voice is off');
    }
    if (!h.document.querySelector('button.zhino-assistant-read')) {
      ok('S11 — the manual per-message read button is hidden too (total silence)');
    } else {
      fail('S11 — the manual read button is still visible with the master voice off');
    }
    // خود گفتگو سالم می‌ماند
    if (h.document.querySelector('#zhino-assistant-input')) {
      ok('S11 — the chat itself keeps working normally (only the voice is off)');
    } else {
      fail('S11 — the chat input disappeared with the voice');
    }
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   S12 — «پیشنهادهای شروع گفتگو» از پنل: روشن/خاموش واقعی در چت
   (فاز ۱۱ — تنظیمات رفتار ربات، مستقل از صدا)
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nS12 — تنظیمات مدیر: پیشنهادهای شروع گفتگو روشن/خاموش…');
  // (الف) پیش‌فرض روشن → چیپ‌های خوشامد دیده می‌شوند
  const on = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
  });
  try {
    await on.waitForRemote();
    const chipsShown = await on.waitFor(
      () =>
        Boolean(on.document.querySelector('#zhino-assistant-input')) &&
        Boolean(on.document.querySelector('.zhino-assistant-welcome-chips')),
      6000,
    );
    if (chipsShown) ok('S12 — starter suggestions show by default (admin switch ON)');
    else fail('S12 — starter suggestions did not show with the default settings');
  } finally {
    on.close();
  }
  // (ب) خاموش از پنل → نه چیپ خوشامد، نه ردیف پیشنهاد بعد از گفتگو
  const off = await openAssistant({
    voiceMode: 'ok',
    voiceDelayMs: 10,
    engineOpts: { hasPersian: true },
    restRows: [{ key: 'assistant_suggestions', value: '0' }],
  });
  try {
    await off.waitForRemote();
    const chipsHidden = await off.waitFor(
      () =>
        Boolean(off.document.querySelector('#zhino-assistant-input')) &&
        !off.document.querySelector('.zhino-assistant-welcome-chips'),
      6000,
    );
    if (chipsHidden) ok('S12 — the admin switch OFF hides the welcome chips');
    else fail('S12 — welcome chips are still shown although suggestions are off');
    await off.send('پرفروش‌ها چیه؟');
    const replied = await off.waitFor(() => off.text().includes(SIM_REPLY), 10000);
    if (!replied) fail('S12 — the bot reply never arrived');
    await sleep(500);
    if (!off.document.querySelector('.zhino-assistant-ideas')) {
      ok('S12 — the suggestions row stays hidden after the chat starts too');
    } else {
      fail('S12 — the suggestions row appeared although the admin turned them off');
    }
    if (off.document.querySelector('#zhino-assistant-input')) {
      ok('S12 — the chat itself works normally without suggestions');
    } else {
      fail('S12 — the chat broke when suggestions were off');
    }
  } finally {
    off.close();
  }
}

console.log('');
if (failures > 0) {
  console.error(`tts-cloud-sim: ${failures} failure(s)`);
  process.exit(1);
}
console.log('tts-cloud-sim: all cloud voice simulations passed');
