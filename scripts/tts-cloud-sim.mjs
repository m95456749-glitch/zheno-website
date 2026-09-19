// ============================================================
// ZHINO — Browser SpeechSynthesis regression simulation
//
// The cloud TTS route is intentionally not part of the storefront
// execution path anymore. This test keeps its old command name for CI
// compatibility, but now proves the opposite of the old cloud contract:
//
//   B1 — a Persian device voice is used with the configured rate;
//        the answer is read locally and no zhino-voice request occurs
//   B2 — with no listed Persian voice, the browser fallback is tried
//        with lang="fa-IR" and no premature error is shown
//   B3 — when that fallback genuinely stays silent, the existing short
//        Persian explanation appears and the playback row is cleared
//   B4 — all three paths leave bot text and normal chat behaviour intact
//
// Usage: npm run test:voice-cloud
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

/* ── the real app bundle, with a simulated assistant backend ── */
const BASE_DEFINES = {
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
  ...BASE_DEFINES,
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

console.log('bundling the real app for the browser voice simulation…');
const appCode = buildApp(BASE_DEFINES);
const offlineAppCode = buildApp(OFFLINE_DEFINES);
ok(`app bundles ready (${(appCode.length / 1024).toFixed(0)} KB connected, ${(offlineAppCode.length / 1024).toFixed(0)} KB offline-demo)`);

const SIM_REPLY = 'پاسخ آزمایشی دستیار برای آزمون صدا';
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22]);
const PUBLIC_KEY = 'sb_publishable_cloud_sim';

/* ── مسیر مرورگر: موتور TTS سبک (مثل Chrome Android سالم) ───── */
class SimTtsEngine {
  constructor({ hasPersian = false, fallbackSpeaks = false } = {}) {
    this.hasPersianData = hasPersian;
    this.fallbackSpeaks = fallbackSpeaks;
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
    if (/^fa/i.test(utterance.lang ?? '') && !this.hasPersianData && !this.fallbackSpeaks) {
      this.log.push('silent:unsupported-fa');
      return;
    }
    this.current = utterance;
    const u = utterance;
    setTimeout(() => {
      this.log.push('start:' + String(u.text).slice(0, 24));
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

/* ── fetch جعلی: پاسخ دستیار + دیتابیس عمومی؛ صدای ابری فقط ناظرِ عدم‌فراخوانی است ── */
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


/* ════════════════════════════════════════════════════════════
   B1 — Persian device voice, configured speed, and zero cloud calls
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nB1 — صدای فارسی دستگاه، سرعت تنظیم‌شده و بدون درخواست ابری…');
  const h = await openAssistant({
    voiceMode: 'ok',
    engineOpts: { hasPersian: true },
    restRows: [{ key: 'assistant_voice_rate', value: '1.25' }],
  });
  try {
    if (await h.enableVoice()) ok('B1 — the voice switch turns on with a Persian device voice');
    else fail('B1 — the voice switch did not turn on');

    await h.send('ژله انار داری؟');
    const started = await h.waitFor(
      () => h.engine.log.some((line) => line.startsWith('start:')),
      10000,
    );
    if (started) ok('B1 — the assistant answer is read by SpeechSynthesis');
    else fail('B1 — the browser speech engine never started: ' + JSON.stringify(h.engine.log));

    const call = h.engine.log.find((line) => line.startsWith('speak(')) ?? '';
    if (call.startsWith('speak(lang=fa-IR;rate=1.25)')) {
      ok('B1 — the selected Persian voice uses fa-IR and preserves rate 1.25');
    } else {
      fail(`B1 — wrong browser utterance settings: ${call || 'none'}`);
    }
    if (h.voiceCalls.length === 0) {
      ok('B1 — no zhino-voice request was sent');
    } else {
      fail(`B1 — unexpected cloud voice request (${h.voiceCalls.length})`);
    }
    const replyShown = await h.waitFor(() => h.text().includes(SIM_REPLY), 10000);
    if (replyShown) ok('B1 — the bot answer remains visible as text');
    else fail('B1 — the bot answer was not displayed');
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   B2 — no listed Persian voice: try the browser fallback first
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nB2 — نبود صدای فارسی: ابتدا fallback خود مرورگر…');
  const h = await openAssistant({
    voiceMode: 'ok',
    engineOpts: { hasPersian: false, fallbackSpeaks: true },
  });
  try {
    await h.enableVoice();
    await h.send('سلام');
    const started = await h.waitFor(
      () => h.engine.log.some((line) => line.startsWith('start:')),
      10000,
    );
    if (started) ok('B2 — the browser fallback speaks without a listed Persian voice');
    else fail('B2 — the browser fallback was not attempted successfully: ' + JSON.stringify(h.engine.log));
    const call = h.engine.log.find((line) => line.startsWith('speak(')) ?? '';
    if (call.startsWith('speak(lang=fa-IR;')) ok('B2 — the fallback utterance is tagged fa-IR');
    else fail(`B2 — fallback was not tagged fa-IR: ${call || 'none'}`);
    if (!h.text().includes('صدای فارسی روی این دستگاه نیست')) {
      ok('B2 — no error message appears before the fallback result');
    } else {
      fail('B2 — a no-Persian-voice message appeared although fallback spoke');
    }
    if (h.voiceCalls.length === 0) ok('B2 — fallback stays entirely off the network');
    else fail(`B2 — fallback caused a cloud request (${h.voiceCalls.length})`);
  } finally {
    h.close();
  }
}

/* ════════════════════════════════════════════════════════════
   B3/B4 — genuine silent fallback: explain, clear playback, keep chat
   ════════════════════════════════════════════════════════════ */
{
  console.log('\nB3/B4 — fallback واقعاً ساکت: توضیح روشن و بدون وضعیت گیرکرده…');
  const h = await openAssistant({
    voiceMode: 'ok',
    engineOpts: { hasPersian: false, fallbackSpeaks: false },
  });
  try {
    await h.enableVoice();
    await h.send('قیمت ژله چند است؟');
    const attempted = await h.waitFor(
      () => h.engine.log.some((line) => line.startsWith('speak(')),
      10000,
    );
    if (attempted) ok('B3 — the browser fallback is attempted before showing an error');
    else fail('B3 — the browser fallback was not attempted');

    const explained = await h.waitFor(
      () => h.text().includes('صدای فارسی روی این دستگاه نیست'),
      20000,
    );
    if (explained) ok('B3 — a clear Persian explanation appears only after real silence');
    else fail('B3 — silent fallback did not produce the existing explanation');

    const settled = await h.waitFor(
      () => !h.document.querySelector('.zhino-assistant-playback'),
      5000,
    );
    if (settled) ok('B3 — the playback row is cleared after the engine stalls');
    else fail('B3 — the playback row stayed stuck');
    if (h.text().includes(SIM_REPLY)) ok('B4 — chat text remains intact after speech failure');
    else fail('B4 — the bot answer disappeared after speech failure');
    if (h.voiceCalls.length === 0) ok('B4 — no cloud TTS request occurs even on fallback failure');
    else fail(`B4 — fallback failure caused a cloud request (${h.voiceCalls.length})`);
  } finally {
    h.close();
  }
}

console.log('');
if (failures > 0) {
  console.error(`tts-browser-sim: ${failures} failure(s)`);
  process.exit(1);
}
console.log('tts-browser-sim: all browser voice simulations passed');
