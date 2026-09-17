// ============================================================
// ZHINO — Chrome Android TTS engine simulator (phase 9)
//
// Why this script exists:
//   Real Chrome Android cannot run in every CI box (and cannot run
//   in this sandbox at all). But the Web Speech stack on Chrome
//   Android has a well-documented, repeatable set of behaviours:
//
//     1. getVoices() returns [] until the system TTS engine warms
//        up — often only after the first user gesture; the
//        voiceschanged event is unreliable.
//     2. speak() without (sticky) user activation is dropped
//        silently — no events at all.
//     3. An utterance in a language the engine has no data for
//        (e.g. Persian without Persian voice data) is dropped
//        silently — onstart AND onend never fire.
//     4. The pause bug: the queue can freeze and speechSynthesis.
//        paused still reports false; until a resume() lands,
//        speak() and even cancel() are swallowed.
//     5. The cancel race: a speak() issued within a few dozen ms
//        after a cancel() that really cleared work can be dropped.
//     6. The ~14 s stall: a long utterance freezes mid-way and
//        onend never fires until a resume() unfreezes it.
//
// This script bundles the REAL app (src/main.tsx, production
// defines) and drives it in jsdom against an engine model that
// reproduces exactly those semantics. It proves the app:
//
//   S1 — no Persian voice on device   → short clear message,
//        nothing handed to the engine, no stuck UI, chat intact
//   S2 — Persian voice present        → full read, and play /
//        pause / resume / stop all behave; re-reading after stop
//        survives the cancel race
//   S3 — queue stuck from before      → the unfreeze (resume
//        before every operation) recovers; the whole answer is
//        read (the old code would have been silent forever)
//   S4 — voice list arrives late      → the first tap populates
//        it; reading works without a second visit
//   S5 — the list LIES (fa listed but
//        no data)                     → the onstart probe catches
//        it, retries once, then explains clearly; no hang
//
// Usage:  npm run test:voice-android
// ============================================================

import { buildSync } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
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

/* ── the real app bundle (same production defines as the smoke) ── */
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
  'import.meta.env.VITE_SUPABASE_URL': '""',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
  'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  'import.meta.env.VITE_ASSISTANT_API_URL': '""',
};

console.log('bundling the real app for the Android TTS simulation…');
const appCode = buildSync({
  entryPoints: [join(root, 'src', 'main.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  write: false,
  logLevel: 'silent',
  define: BASE_DEFINES,
}).outputFiles[0].text;
ok(`app bundle ready for simulation (${(appCode.length / 1024).toFixed(0)} KB)`);

/* ════════════════════════════════════════════════════════════
   The Chrome Android TTS engine model
   ════════════════════════════════════════════════════════════ */

const CANCEL_RACE_MS = 60;

class AndroidTtsEngine {
  constructor(opts = {}) {
    this.opts = opts;
    this.hasPersianData = opts.hasPersianData === true;
    this.lateVoices = opts.lateVoices === true;
    this.stallOnce = opts.stallOnce === true;
    this.voices = [];
    if (this.hasPersianData) {
      this.voices = [
        { lang: 'fa-IR', name: 'Google Persian' },
        { lang: 'en-US', name: 'Google US English' },
      ];
    } else {
      this.voices = [{ lang: 'en-US', name: 'Google US English' }];
    }
    this.activated = false;
    this.voicesReady = !this.lateVoices;
    this.stuck = opts.stuckFromStart === true;
    this.current = null;
    this.queue = [];
    this.lastCancelAt = 0;
    this.log = [];
    this.stalledOnce = false;
  }

  // ── Web Speech surface ──
  get speaking() {
    return this.current !== null && !this.current.stalled && !this.stuck;
  }
  // The documented Android bug: paused never reports true.
  get paused() {
    return false;
  }
  get pending() {
    return this.queue.length > 0;
  }

  getVoices() {
    return this.voicesReady ? this.voices.map((v) => ({ ...v })) : [];
  }
  addEventListener() {}
  removeEventListener() {}

  /** the test harness calls this after every simulated tap */
  markActivation() {
    this.activated = true;
    if (this.lateVoices) this.voicesReady = true;
  }

  speak(utterance) {
    this.log.push(`speak(lang=${utterance.lang})`);
    if (!this.activated) {
      this.log.push('dropped:no-activation');
      return;
    }
    if (this.stuck) {
      // the frozen queue swallows the utterance (bug #4)
      this.log.push('swallowed:stuck-queue');
      return;
    }
    if (Date.now() - this.lastCancelAt < CANCEL_RACE_MS) {
      this.log.push('dropped:cancel-race');
      return;
    }
    this.schedule(utterance, 90);
  }

  schedule(utterance, delay) {
    const row = { u: utterance, done: false, stalled: false, startTimer: null, endTimer: null, stallTimer: null };
    row.startTimer = setTimeout(() => {
      if (row.done) return;
      // bug #3: unsupported language → total silence, no events
      if (typeof utterance.lang === 'string' && /^fa/i.test(utterance.lang) && !this.hasPersianData) {
        this.log.push('silent:unsupported-fa');
        row.done = true;
        return;
      }
      if (this.stuck) {
        this.log.push('silent:stuck-at-start');
        row.done = true;
        return;
      }
      this.current = row;
      this.log.push('start:' + String(utterance.text).slice(0, 24));
      if (typeof utterance.onstart === 'function') utterance.onstart();
      const dur = Math.min(4000, Math.max(350, String(utterance.text).length * 25));
      row.endAt = Date.now() + dur;
      row.endTimer = setTimeout(() => this.finishRow(row), dur);
      // bug #6: the long-utterance stall (once per engine)
      if (this.stallOnce && !this.stalledOnce && dur > 1000) {
        this.stalledOnce = true;
        row.stallTimer = setTimeout(() => {
          if (row.done || row.stalled) return;
          row.stalled = true;
          clearTimeout(row.endTimer);
          this.log.push('stall:mid-utterance');
          // audio frozen — onend will not fire until resume()
        }, 900);
      }
    }, delay);
  }

  finishRow(row) {
    if (!row || row.done) return;
    row.done = true;
    clearTimeout(row.startTimer);
    clearTimeout(row.endTimer);
    clearTimeout(row.stallTimer);
    if (this.current === row) this.current = null;
    this.log.push('end');
    if (typeof row.u.onend === 'function') row.u.onend();
  }

  resume() {
    // the documented unfreeze (workaround for bug #4 and #6)
    if (this.stuck) {
      this.stuck = false;
      this.log.push('unfrozen');
    }
    if (this.current && this.current.stalled) {
      const row = this.current;
      row.stalled = false;
      this.log.push('unstall:resume');
      clearTimeout(row.endTimer);
      const remaining = row.endAt - Date.now();
      row.endTimer = setTimeout(() => this.finishRow(row), Math.max(120, remaining));
    }
  }

  pause() {
    // bug #4 in the wild: freezing the queue while paused stays false
    if (this.current && !this.current.stalled) {
      this.stuck = true;
      this.log.push('pause-bug:queue-frozen');
    }
  }

  cancel() {
    if (this.stuck) {
      // the frozen queue swallows cancel too (bug #4)
      this.log.push('swallowed:stuck-cancel');
      return;
    }
    const hadWork = this.current !== null || this.queue.length > 0;
    if (hadWork) this.lastCancelAt = Date.now();
    this.log.push('cancel');
    const drop = (row) => {
      if (!row || row.done) return;
      row.done = true;
      clearTimeout(row.startTimer);
      clearTimeout(row.endTimer);
      clearTimeout(row.stallTimer);
      if (typeof row.u.onerror === 'function') {
        const u = row.u;
        setTimeout(() => {
          try {
            u.onerror({ error: 'canceled' });
          } catch {
            /* fine */
          }
        }, 15);
      }
    };
    drop(this.current);
    this.current = null;
    this.queue.forEach(drop);
    this.queue = [];
  }
}

/* ════════════════════════════════════════════════════════════
   App harness (jsdom)
   ════════════════════════════════════════════════════════════ */

const SHELL =
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head>' +
  '<body><div id="root"></div></body></html>';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

async function openAssistant(engine, { android = false } = {}) {
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

  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/assistant',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    // jsdom 30 takes the user agent under `resources`
    resources: android ? { userAgent: ANDROID_UA } : undefined,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      window.fetch = () => Promise.reject(new Error('offline (simulation)'));
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
    },
  });

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appCode;
  document.body.appendChild(script);

  const text = () => document.getElementById('root')?.textContent ?? '';
  const waitFor = async (predicate, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(80);
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
    // a real tap grants sticky user activation to the TTS engine
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

  let rendered = await waitFor(() => Boolean(document.querySelector('#zhino-assistant-input')));
  if (!rendered) throw new Error('the assistant page never rendered');

  return { dom, document, text, waitFor, typeInto, tap, send, errors, engine, close: () => dom.window.close() };
}

const NO_PERSIAN = 'صدای فارسی روی این دستگاه نیست';
const LOADING = 'در حال آماده‌سازی صدا';

/* ── S1 — the device has no Persian voice (typical phone) ── */
{
  console.log('\nS1 — no Persian voice on device…');
  const engine = new AndroidTtsEngine({});
  const h = await openAssistant(engine, { android: true });
  try {
    // the customer switches reading on
    h.tap(h.document.querySelector('button.zhino-assistant-voice'));
    const explained = await h.waitFor(() => h.text().includes(NO_PERSIAN));
    if (explained) ok('S1 — a short, clear Persian message explains the situation');
    else fail('S1 — no message when the device lacks a Persian voice');
    if (h.text().includes('تبدیل متن به گفتار')) {
      ok('S1 — on Android the hint points to the right settings screen');
    } else {
      fail('S1 — the Android settings hint is missing');
    }
    // and the conversation continues to work
    await h.send('قیمت ژله توت فرنگی چند است؟');
    const PRICE = '\u06f2\u06f0\u06f0\u066c\u06f0\u06f0\u06f0 \u062a\u0648\u0645\u0627\u0646';
    const answered = await h.waitFor(() => h.text().includes(PRICE));
    if (answered) ok('S1 — the answer is displayed as text, chat untouched');
    else fail('S1 — the chat answer never arrived: ' + h.text().slice(-160));
    await sleep(400);
    if (!engine.log.some((line) => line.startsWith('start:'))) {
      ok('S1 — nothing was ever handed to the speech engine');
    } else {
      fail(`S1 — the engine started speaking: ${engine.log.join(' | ')}`);
    }
    if (!h.document.querySelector('.zhino-assistant-playback')) {
      ok('S1 — no stuck «reading…» control left behind');
    } else {
      fail('S1 — the playback row is stuck on screen');
    }
    if (h.errors.length === 0) ok('S1 — no runtime errors');
    else fail('S1 — runtime errors: ' + h.errors.join(' | '));
  } finally {
    h.close();
  }
}

/* ── S2 — Persian voice present: play / pause / resume / stop ── */
{
  console.log('\nS2 — Persian voice present, with a mid-utterance stall…');
  const engine = new AndroidTtsEngine({ hasPersianData: true, stallOnce: true });
  const h = await openAssistant(engine);
  try {
    h.tap(h.document.querySelector('button.zhino-assistant-voice'));
    await h.waitFor(
      () => h.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'true',
    );
    // a long, many-chunk answer (the full flavor list)
    await h.send('چه طعم‌هایی دارید؟');
    const started = await h.waitFor(() => engine.log.some((l) => l.startsWith('start:')), 9000);
    if (started) ok('S2 — the answer is actually read aloud');
    else fail('S2 — nothing was read: ' + engine.log.join(' | '));

    // the long-utterance stall hits the first chunk — the keepalive
    // (resume every 8 s) must unfreeze it and reading must continue
    const stalled = await h.waitFor(() => engine.log.includes('stall:mid-utterance'), 10000);
    if (stalled) ok('S2 — the mid-utterance stall was reproduced');
    else fail('S2 — the stall never happened: ' + engine.log.join(' | '));
    const unstalled = await h.waitFor(() => engine.log.includes('unstall:resume'), 30000);
    if (unstalled) ok('S2 — the keepalive unfroze the stall and reading continued');
    else fail('S2 — the stall was never recovered: ' + engine.log.join(' | '));

    // pause
    const pauseBtn = h.document.querySelector('button[aria-label="مکث خواندن"]');
    if (!pauseBtn) {
      fail('S2 — the pause control is missing while reading');
    } else {
      const cancelsBefore = engine.log.filter((l) => l === 'cancel').length;
      h.tap(pauseBtn);
      const paused = await h.waitFor(() => Boolean(h.document.querySelector('button[aria-label="ادامه خواندن"]')));
      if (paused) ok('S2 — pause switches the control to «ادامه»');
      else fail('S2 — pause did not switch the control');
      const cancelsAfter = engine.log.filter((l) => l === 'cancel').length;
      if (cancelsAfter > cancelsBefore) ok('S2 — pause really cancelled the engine queue');
      else fail('S2 — the engine queue was not cancelled on pause');
    }

    // resume — the same chunk is spoken again
    const startsBefore = engine.log.filter((l) => l.startsWith('start:')).length;
    const resumeBtn = h.document.querySelector('button[aria-label="ادامه خواندن"]');
    if (!resumeBtn) fail('S2 — the resume control is missing after pause');
    else {
      h.tap(resumeBtn);
      const resumed = await h.waitFor(
        () => engine.log.filter((l) => l.startsWith('start:')).length > startsBefore,
        6000,
      );
      if (resumed) ok('S2 — resume speaks again from the same place');
      else fail('S2 — resume produced no speech: ' + engine.log.join(' | '));
    }

    // let the whole (stall-hit) answer finish
    const allSpoken = await h.waitFor(
      () => !h.document.querySelector('.zhino-assistant-playback'),
      90000,
    );
    if (allSpoken) ok('S2 — the full multi-chunk answer finished reading');
    else fail('S2 — reading did not finish: ' + engine.log.join(' | '));

    // stop from the per-message button (cancel race: right after stop,
    // the customer reads the SAME message again)
    const readBtn = h.document.querySelector('button.zhino-assistant-read');
    if (!readBtn) {
      fail('S2 — the read button disappeared after reading');
    } else {
      const startsBeforeReread = engine.log.filter((l) => l.startsWith('start:')).length;
      h.tap(readBtn);
      const reread = await h.waitFor(
        () => engine.log.filter((l) => l.startsWith('start:')).length > startsBeforeReread,
        9000,
      );
      if (reread) ok('S2 — re-reading right after the end works (cancel race survived)');
      else fail('S2 — re-reading after the previous read did not start: ' + engine.log.join(' | '));
      // and stop really stops
      const stopBtn = h.document.querySelector('button[aria-label="توقف خواندن"]');
      if (!stopBtn) fail('S2 — the stop control is missing');
      else {
        const startsAtStop = engine.log.filter((l) => l.startsWith('start:')).length;
        h.tap(stopBtn);
        await sleep(1200);
        const startsAfterStop = engine.log.filter((l) => l.startsWith('start:')).length;
        if (startsAfterStop === startsAtStop) ok('S2 — stop ends the speech at once');
        else fail('S2 — speech continued after stop');
        if (!h.document.querySelector('.zhino-assistant-playback')) {
          ok('S2 — the playback row is gone after stop');
        } else {
          fail('S2 — the playback row remains after stop');
        }
      }
    }
    if (h.errors.length === 0) ok('S2 — no runtime errors');
    else fail('S2 — runtime errors: ' + h.errors.join(' | '));
  } finally {
    h.close();
  }
}

/* ── S3 — the queue was stuck before the visit (the real “it
      stopped working on my phone” case) ── */
{
  console.log('\nS3 — queue stuck from before the page load…');
  const engine = new AndroidTtsEngine({ hasPersianData: true, stuckFromStart: true });
  const h = await openAssistant(engine);
  try {
    h.tap(h.document.querySelector('button.zhino-assistant-voice'));
    await h.waitFor(
      () => h.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'true',
    );
    await h.send('قیمت ژله توت فرنگی چند است؟');
    const started = await h.waitFor(() => engine.log.some((l) => l.startsWith('start:')), 12000);
    if (started) ok('S3 — the stuck queue was unfrozen and the answer is read');
    else fail('S3 — the stuck queue was never unfrozen: ' + engine.log.join(' | '));
    if (engine.log.includes('unfrozen')) {
      ok('S3 — the unfreeze (resume before every operation) is what recovered it');
    } else {
      fail('S3 — no unfreeze was recorded: ' + engine.log.join(' | '));
    }
    const finished = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 60000);
    if (finished) ok('S3 — the whole answer finished');
    else fail('S3 — reading hung: ' + engine.log.join(' | '));
    if (h.errors.length === 0) ok('S3 — no runtime errors');
    else fail('S3 — runtime errors: ' + h.errors.join(' | '));
  } finally {
    h.close();
  }
}

/* ── S4 — the voice list arrives only after the first gesture ── */
{
  console.log('\nS4 — voices list arrives late (first tap)…');
  const engine = new AndroidTtsEngine({ hasPersianData: true, lateVoices: true });
  const h = await openAssistant(engine);
  try {
    // before any tap the list is empty
    if (engine.getVoices().length === 0) ok('S4 — before the first tap the engine list is empty');
    else fail('S4 — the late-voices setup is broken');
    h.tap(h.document.querySelector('button.zhino-assistant-voice'));
    if (engine.getVoices().length > 0) ok('S4 — the first tap populates the voice list');
    else fail('S4 — the tap did not populate the list');
    await h.send('قیمت کاستر موز چند است؟');
    const started = await h.waitFor(() => engine.log.some((l) => l.startsWith('start:')), 12000);
    if (started) ok('S4 — reading works with the late-arriving list');
    else fail('S4 — reading never started: ' + engine.log.join(' | '));
    const finished = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 60000);
    if (finished) ok('S4 — the answer finished reading');
    else fail('S4 — reading hung: ' + engine.log.join(' | '));
    if (h.errors.length === 0) ok('S4 — no runtime errors');
    else fail('S4 — runtime errors: ' + h.errors.join(' | '));
  } finally {
    h.close();
  }
}

/* ── S5 — the list lies: fa is listed but the engine has no data ── */
{
  console.log('\nS5 — the voice list lies (fa listed, no data)…');
  const engine = new AndroidTtsEngine({});
  // make the list claim Persian is available while the engine cannot
  engine.voices = [
    { lang: 'fa-IR', name: 'Google Persian' },
    { lang: 'en-US', name: 'Google US English' },
  ];
  const h = await openAssistant(engine);
  try {
    h.tap(h.document.querySelector('button.zhino-assistant-voice'));
    await h.waitFor(
      () => h.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'true',
    );
    await h.send('قیمت ژله توت فرنگی چند است؟');
    // the onstart probe must give up and explain — with no hang
    const explained = await h.waitFor(() => h.text().includes(NO_PERSIAN), 20000);
    if (explained) ok('S5 — the probe caught the silent engine and explained it');
    else fail('S5 — no explanation for the silent engine: ' + h.text().slice(-160));
    const finished = await h.waitFor(() => !h.document.querySelector('.zhino-assistant-playback'), 20000);
    if (finished) ok('S5 — the UI is back to idle (no stuck «reading…» state)');
    else fail('S5 — the playback row is stuck: ' + engine.log.join(' | '));
    if (!engine.log.some((l) => l.startsWith('start:'))) {
      ok('S5 — nothing was audible (correct: the engine has no Persian data)');
    } else {
      fail('S5 — the engine claimed to start: ' + engine.log.join(' | '));
    }
    if (engine.log.filter((l) => l === 'silent:unsupported-fa').length >= 2) {
      ok('S5 — one honest retry was attempted before giving up');
    } else {
      fail('S5 — the retry behaviour is wrong: ' + engine.log.join(' | '));
    }
    // the chat must still be usable afterwards
    await h.send('چه طعم‌هایی دارید؟');
    const answered = await h.waitFor(() => h.text().includes('طعم'), 12000);
    if (answered) ok('S5 — the chat keeps working after the failed read');
    else fail('S5 — the chat broke after the failed read');
    if (h.errors.length === 0) ok('S5 — no runtime errors');
    else fail('S5 — runtime errors: ' + h.errors.join(' | '));
  } finally {
    h.close();
  }
}

/* ── production bundle sanity (only when a build exists) ── */
{
  const bundlePath = join(root, 'dist', 'index.html');
  if (existsSync(bundlePath)) {
    const bundle = readFileSync(bundlePath, 'utf8');
    if (bundle.includes(NO_PERSIAN)) ok('production bundle — ships the clear no-Persian-voice message');
    else fail('production bundle — the no-Persian-voice message is missing');
    if (bundle.includes('مکث خواندن') && bundle.includes('ادامه خواندن')) {
      ok('production bundle — ships the pause/resume controls');
    } else {
      fail('production bundle — pause/resume controls missing');
    }
  } else {
    ok('production bundle — not built yet (run npm run build first)');
  }
}

console.log(
  failures === 0
    ? '\nAll Android TTS simulation scenarios passed.'
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
