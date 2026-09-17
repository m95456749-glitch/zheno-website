// ============================================================
// ZHINO — Cloud Persian voice simulator (phase 9)
//
// Why this script exists:
//   Phase 9 removes the dependency on a Persian voice being
//   installed on the phone. The answer is synthesised by our own
//   Supabase Edge Function and played as an ordinary audio file.
//   That path cannot be proven by the Android TTS simulator (which
//   models the *device* engine), so it gets its own harness.
//
//   This script bundles the REAL app (src/main.tsx, production
//   defines, Supabase configured so the zhino-voice endpoint is
//   derived) and drives it in jsdom against:
//     • a fake voice endpoint that returns real MP3-shaped bytes
//     • a fake <audio> element that records play/pause/src
//     • a device speech engine that has NO Persian voice
//       (exactly the phone this phase was reported from)
//
// Scenarios:
//   C1 — cloud voice works on a phone with no Persian voice
//        → the answer is really played, the device engine is
//          never used, and the old «install a Persian voice»
//          message never appears
//   C2 — only the assistant's answer is sent, never the customer's
//        question; the request carries no provider key
//   C3 — play / pause / resume / stop all drive the audio element
//   C4 — replaying the same answer is served from memory
//        (no second request → no extra quota)
//   C5 — the cloud fails → the device engine is tried silently,
//        and when that has no Persian voice either, the customer
//        sees the same short honest line as before
//   C6 — the service is not configured → behaviour is exactly the
//        pre-phase-9 behaviour (device engine only)
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

/* ── the real app bundle ─────────────────────────────────────── */

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
  'import.meta.env.VITE_VOICE_API_URL': '""',
};

const PUBLISHABLE_KEY = 'sb_publishable_smoke_test_key';
const PROJECT_URL = 'https://smoke-test.supabase.co';
const VOICE_ENDPOINT = `${PROJECT_URL}/functions/v1/zhino-voice`;
const ASSISTANT_ENDPOINT = `${PROJECT_URL}/functions/v1/zhino-assistant`;

function buildApp(defines) {
  return buildSync({
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
}

console.log('bundling the real app for the cloud-voice simulation…');
/** the app with the voice Edge Function reachable (Supabase configured) */
const appWithVoice = buildApp({
  ...BASE_DEFINES,
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(PROJECT_URL),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(PUBLISHABLE_KEY),
});
/** the app exactly as before phase 9: no cloud voice at all */
const appNoVoice = buildApp(BASE_DEFINES);
ok(`app bundles ready (${(appWithVoice.length / 1024).toFixed(0)} KB)`);

/* ── fake MP3 bytes (an ID3 header is enough to look like audio) ── */

function fakeMp3(bytes = 512) {
  const buffer = new Uint8Array(bytes);
  buffer[0] = 0x49; // I
  buffer[1] = 0x44; // D
  buffer[2] = 0x33; // 3
  for (let i = 10; i < bytes; i += 1) buffer[i] = i % 251;
  return buffer;
}

/* ── the harness ─────────────────────────────────────────────── */

const SHELL =
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head>' +
  '<body><div id="root"></div></body></html>';

/**
 * Render /assistant with:
 *   • a recording fake <audio> implementation (jsdom has none)
 *   • a device speech engine with the requested voices
 *   • a fetch stub that answers the voice endpoint the way the
 *     scenario asks for, and fails every other request (offline)
 */
function renderAssistant({
  appSource = appWithVoice,
  voiceEndpointImpl,
  assistantEndpointImpl,
  deviceVoices = [{ lang: 'en-US', name: 'Google US English' }],
  audioPlayFails = false,
} = {}) {
  const errors = [];
  /** every request the browser made */
  const requests = [];
  /** every utterance handed to the DEVICE engine */
  const deviceSpoken = [];
  /** everything that happened on the audio element */
  const audioLog = [];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String(e?.message ?? e);
    if (/Could not load|ENOTFOUND|EAI_AGAIN|network|Not implemented|navigation|Failed to fetch|fetch failed/i.test(msg)) {
      return;
    }
    errors.push('jsdomError: ' + msg);
  });
  virtualConsole.on('error', (...args) => errors.push('console.error: ' + args.map(String).join(' ')));

  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    let body = null;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    requests.push({ url, method, headers: init.headers ?? {}, body });

    if (url.startsWith(VOICE_ENDPOINT) && voiceEndpointImpl) {
      return voiceEndpointImpl({ url, method, headers: init.headers ?? {}, body });
    }
    if (url.startsWith(ASSISTANT_ENDPOINT) && assistantEndpointImpl) {
      return assistantEndpointImpl({ url, method, headers: init.headers ?? {}, body });
    }
    // everything else behaves like an offline network
    throw new Error('offline (cloud voice simulation)');
  };

  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/zheno-website/assistant',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      window.fetch = fetchImpl;
      window.Headers = globalThis.Headers;
      window.Request = globalThis.Request;
      window.Response = globalThis.Response;
      window.AbortController = globalThis.AbortController;
      window.TextEncoder = globalThis.TextEncoder;
      window.TextDecoder = globalThis.TextDecoder;
      window.Blob = globalThis.Blob;

      // jsdom implements neither object URLs nor media playback.
      let urlSeq = 0;
      const blobs = new Map();
      window.URL.createObjectURL = (blob) => {
        urlSeq += 1;
        const url = `blob:zhino/${urlSeq}`;
        blobs.set(url, blob);
        audioLog.push({ type: 'createObjectURL', url, size: blob?.size ?? 0 });
        return url;
      };
      window.URL.revokeObjectURL = (url) => {
        blobs.delete(url);
        audioLog.push({ type: 'revokeObjectURL', url });
      };

      // A fake media element that behaves like a real one for our purposes:
      // play() resolves (or rejects), pause() stops, and — like a real
      // clip — playback ENDS on its own after a short while and fires the
      // 'ended' event. That event matters: a long answer is read as several
      // pieces in a row, and each next piece only starts once the previous
      // one has ended. A fake that never ends would hide that entirely.
      const CLIP_MS = 60;
      const proto = window.HTMLMediaElement.prototype;
      proto.play = function play() {
        audioLog.push({ type: 'play', src: this.src, muted: this.muted });
        if (audioPlayFails && !this.muted) {
          return Promise.reject(new Error('NotAllowedError (simulated autoplay block)'));
        }
        this.__playing = true;
        const src = this.src;
        clearTimeout(this.__endTimer);
        // silent unlock clips are instantaneous and must not fire 'ended'
        if (!this.muted) {
          this.__endTimer = setTimeout(() => {
            if (!this.__playing || this.src !== src) return;
            this.__playing = false;
            audioLog.push({ type: 'ended', src });
            try {
              this.dispatchEvent(new window.Event('ended'));
            } catch {
              /* ignore */
            }
          }, CLIP_MS);
        }
        return Promise.resolve();
      };
      proto.pause = function pause() {
        audioLog.push({ type: 'pause', src: this.src });
        this.__playing = false;
        clearTimeout(this.__endTimer);
      };
      proto.load = function load() {};

      // The DEVICE engine: by default a typical Android phone with no
      // Persian voice at all.
      window.SpeechSynthesisUtterance = class FakeUtterance {
        constructor(text) {
          this.text = text;
          this.lang = '';
          this.voice = null;
        }
      };
      window.speechSynthesis = {
        speaking: false,
        paused: false,
        getVoices: () => deviceVoices,
        addEventListener: () => {},
        removeEventListener: () => {},
        speak(utterance) {
          deviceSpoken.push({ text: utterance.text, lang: utterance.lang });
          setTimeout(() => {
            if (typeof utterance.onstart === 'function') utterance.onstart();
            setTimeout(() => {
              if (typeof utterance.onend === 'function') utterance.onend();
            }, 20);
          }, 10);
        },
        cancel() {},
        pause() {},
        resume() {},
      };
    },
  });

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appSource;
  document.body.appendChild(script);

  const text = () => document.getElementById('root')?.textContent ?? '';
  const waitFor = async (predicate, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(50);
    }
    return false;
  };
  /** the single <audio> the hook keeps for the whole conversation */
  const audioEl = () => dom.window.document.querySelector('audio') ?? null;

  return { dom, document, text, waitFor, errors, requests, deviceSpoken, audioLog, audioEl };
}

function typeInto(dom, selector, value) {
  const input = dom.window.document.querySelector(selector);
  if (!input) throw new Error('missing input: ' + selector);
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

async function sendChatMessage(dom, waitFor, message) {
  typeInto(dom, '#zhino-assistant-input', message);
  const ready = await waitFor(() => {
    const button = dom.window.document.querySelector('button[aria-label="ارسال پیام"]');
    return Boolean(button) && !button.disabled;
  });
  if (!ready) throw new Error('send button never enabled for: ' + message);
  dom.window.document.querySelector('button[aria-label="ارسال پیام"]').click();
}

/** the health probe + a working synthesis endpoint */
function workingVoiceEndpoint({ onSynthesize } = {}) {
  return async ({ method, body }) => {
    if (method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          configured: true,
          ready: true,
          voice: 'fa-IR-DilaraNeural',
          locale: 'fa-IR',
          format: 'audio/mpeg',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    onSynthesize?.(body);
    return new Response(fakeMp3(), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'X-Zhino-Voice': 'fa-IR-DilaraNeural' },
    });
  };
}

const ANDROID_HINT = 'در تنظیمات اندروید';
const NO_PERSIAN_LINE = 'صدای فارسی روی این دستگاه نیست';
const PRICE = '۲۰۰٬۰۰۰ تومان';
const QUESTION = 'قیمت ژله توت فرنگی چند است؟';

function expectNoErrors(label, errors) {
  if (errors.length === 0) ok(`${label} — no runtime errors`);
  else fail(`${label} — runtime errors: ${errors.slice(0, 2).join(' | ')}`);
}

/** switch reading on and mark it so a fresh answer is spoken */
async function turnVoiceOn(dom, waitFor) {
  const toggle = dom.window.document.querySelector('button.zhino-assistant-voice');
  if (!toggle) throw new Error('the voice toggle is missing');
  toggle.click();
  return waitFor(
    () =>
      dom.window.document.querySelector('button.zhino-assistant-voice')?.getAttribute('aria-pressed') === 'true',
  );
}

/* ════════════════════════════════════════════════════════════
   C1 — a phone with NO Persian voice still hears a Persian answer
   ════════════════════════════════════════════════════════════ */
{
  const synthCalls = [];
  const harness = renderAssistant({
    voiceEndpointImpl: workingVoiceEndpoint({ onSynthesize: (body) => synthCalls.push(body) }),
    deviceVoices: [{ lang: 'en-US', name: 'Google US English' }],
  });
  const { dom, text, waitFor, errors, deviceSpoken, audioLog } = harness;
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('C1 — the chat console never rendered');

    const on = await turnVoiceOn(dom, waitFor);
    if (!on) fail('C1 — reading could not be switched on although a cloud voice exists');
    else ok('C1 — reading switches on even though the phone has no Persian voice');

    // The old «install a Persian voice in Android settings» message must be gone
    await sleep(200);
    if (text().includes(NO_PERSIAN_LINE) || text().includes(ANDROID_HINT)) {
      fail('C1 — the customer is still told to install a Persian voice');
    } else {
      ok('C1 — the customer is no longer sent to the phone settings');
    }

    await sendChatMessage(dom, waitFor, QUESTION);
    const answered = await waitFor(() => text().includes(PRICE));
    if (!answered) fail('C1 — the answer never arrived: ' + text().slice(-160));
    else ok('C1 — the answer is on screen as before');

    const synthesised = await waitFor(() => synthCalls.length > 0);
    if (!synthesised) fail('C1 — the answer was never sent for synthesis');
    else ok('C1 — the answer was sent to our own voice endpoint');

    const played = await waitFor(() => audioLog.some((e) => e.type === 'play' && e.muted === false));
    if (!played) fail('C1 — the returned audio was never played: ' + JSON.stringify(audioLog.slice(-4)));
    else ok('C1 — the Persian audio is really played in the page');

    const objectUrl = audioLog.find((e) => e.type === 'createObjectURL');
    if (objectUrl && objectUrl.size > 0) ok(`C1 — a real audio file was played (${objectUrl.size} bytes)`);
    else fail('C1 — no audio blob reached the player');

    await sleep(300);
    if (deviceSpoken.length === 0) ok('C1 — the phone speech engine was never used');
    else fail(`C1 — the device engine was still used: ${deviceSpoken.map((s) => s.text).join(' | ').slice(0, 120)}`);

    expectNoErrors('C1', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C2 — only the answer is sent, and no provider key travels
   ════════════════════════════════════════════════════════════ */
{
  const synthCalls = [];
  const harness = renderAssistant({
    voiceEndpointImpl: workingVoiceEndpoint({ onSynthesize: (body) => synthCalls.push(body) }),
  });
  const { dom, text, waitFor, errors, requests } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    await turnVoiceOn(dom, waitFor);
    await sendChatMessage(dom, waitFor, QUESTION);
    await waitFor(() => text().includes(PRICE));
    const synthesised = await waitFor(() => synthCalls.length > 0);
    if (!synthesised) fail('C2 — nothing was sent for synthesis');

    const sentTexts = synthCalls.map((call) => String(call?.text ?? ''));
    if (sentTexts.some((t) => t.includes(QUESTION))) {
      fail('C2 — the customer question was sent to the voice service');
    } else {
      ok('C2 — only the assistant answer is sent, never the customer question');
    }
    if (sentTexts.some((t) => t.includes('۲۰۰'))) {
      ok('C2 — the real answer text (with the real price) is what gets spoken');
    } else {
      fail('C2 — the spoken text is not the answer on screen: ' + sentTexts.join(' | ').slice(0, 140));
    }

    // The request may only carry the project's PUBLIC key
    const voiceRequests = requests.filter((r) => r.url.startsWith(VOICE_ENDPOINT));
    if (voiceRequests.length === 0) fail('C2 — the voice endpoint was never called');
    const headerBlob = JSON.stringify(voiceRequests.map((r) => r.headers));
    const leaks = [
      ['Ocp-Apim-Subscription-Key', 'an Azure Speech key header'],
      ['sb_secret_', 'a Supabase secret key'],
      ['service_role', 'a service-role key'],
    ].filter(([needle]) => headerBlob.includes(needle));
    if (leaks.length === 0) ok('C2 — the browser sends no provider credential, only the public project key');
    else fail(`C2 — a credential leaked into the browser request: ${leaks.map(([, l]) => l).join(', ')}`);

    if (headerBlob.includes(PUBLISHABLE_KEY)) ok('C2 — the request is authorised with the public project key');
    else fail('C2 — the request is missing the public project key');

    // No request may ever go straight to a voice provider
    const direct = requests.filter((r) => /speech\.microsoft\.com|googleapis\.com|api\.openai\.com/.test(r.url));
    if (direct.length === 0) ok('C2 — the browser never talks to a voice provider directly');
    else fail(`C2 — the browser called a provider directly: ${direct[0].url}`);

    expectNoErrors('C2', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C3 — play / pause / resume / stop drive the real audio element
   ════════════════════════════════════════════════════════════ */
{
  const harness = renderAssistant({ voiceEndpointImpl: workingVoiceEndpoint() });
  const { dom, text, waitFor, errors, audioLog } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    await turnVoiceOn(dom, waitFor);
    await sendChatMessage(dom, waitFor, QUESTION);
    await waitFor(() => text().includes(PRICE));

    const playing = await waitFor(() => audioLog.some((e) => e.type === 'play' && e.muted === false));
    if (!playing) fail('C3 — playback never started');

    // the playback row appears while reading
    const rowShown = await waitFor(() => Boolean(dom.window.document.querySelector('.zhino-assistant-playback')));
    if (!rowShown) fail('C3 — the playback controls never appeared');
    else ok('C3 — the playback controls appear while reading');

    // PAUSE
    const pauseButton = await waitFor(
      () => Boolean(dom.window.document.querySelector('button[aria-label="مکث خواندن"]')),
    );
    if (!pauseButton) {
      fail('C3 — the pause button is missing');
    } else {
      const before = audioLog.filter((e) => e.type === 'pause').length;
      dom.window.document.querySelector('button[aria-label="مکث خواندن"]').click();
      const paused = await waitFor(() => audioLog.filter((e) => e.type === 'pause').length > before);
      if (!paused) fail('C3 — pause did not pause the audio');
      else ok('C3 — pause really pauses the audio file');
      const switched = await waitFor(
        () => Boolean(dom.window.document.querySelector('button[aria-label="ادامه خواندن"]')),
      );
      if (!switched) fail('C3 — the control did not switch to «ادامه»');
      else ok('C3 — the control switches to «ادامه»');
    }

    // RESUME
    const resumeButton = dom.window.document.querySelector('button[aria-label="ادامه خواندن"]');
    if (!resumeButton) {
      fail('C3 — the resume button is missing');
    } else {
      const before = audioLog.filter((e) => e.type === 'play').length;
      resumeButton.click();
      const resumed = await waitFor(() => audioLog.filter((e) => e.type === 'play').length > before);
      if (!resumed) fail('C3 — resume did not restart the audio');
      else ok('C3 — resume continues the same audio file (no re-synthesis)');
    }

    // STOP
    const stopButton = await waitFor(
      () => Boolean(dom.window.document.querySelector('button[aria-label="توقف خواندن"]')),
    );
    if (!stopButton) {
      fail('C3 — the stop button is missing');
    } else {
      const before = audioLog.filter((e) => e.type === 'pause').length;
      dom.window.document.querySelector('button[aria-label="توقف خواندن"]').click();
      const stopped = await waitFor(() => audioLog.filter((e) => e.type === 'pause').length > before);
      if (!stopped) fail('C3 — stop did not stop the audio');
      else ok('C3 — stop ends playback at once');
      const rowGone = await waitFor(() => !dom.window.document.querySelector('.zhino-assistant-playback'));
      if (!rowGone) fail('C3 — the playback row stayed behind after stop');
      else ok('C3 — the playback row disappears after stop');
    }

    expectNoErrors('C3', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C4 — replaying the same answer costs no extra quota
   ════════════════════════════════════════════════════════════ */
{
  const synthCalls = [];
  const harness = renderAssistant({
    voiceEndpointImpl: workingVoiceEndpoint({ onSynthesize: (body) => synthCalls.push(body) }),
  });
  const { dom, text, waitFor, errors, audioLog } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    await turnVoiceOn(dom, waitFor);
    await sendChatMessage(dom, waitFor, QUESTION);
    await waitFor(() => text().includes(PRICE));
    await waitFor(() => synthCalls.length > 0);
    await waitFor(() => audioLog.some((e) => e.type === 'play' && e.muted === false));
    const afterFirst = synthCalls.length;

    // Stop first — and really wait for it, otherwise pressing «خواندن پاسخ»
    // while it is still playing would toggle stop instead of replaying.
    const stopShown = await waitFor(
      () => Boolean(dom.window.document.querySelector('button[aria-label="توقف خواندن"]')),
    );
    if (!stopShown) fail('C4 — the stop control never appeared');
    dom.window.document.querySelector('button[aria-label="توقف خواندن"]')?.click();
    const idle = await waitFor(() => !dom.window.document.querySelector('.zhino-assistant-playback'));
    if (!idle) fail('C4 — playback never returned to idle after stop');

    const readButton = dom.window.document.querySelector('button.zhino-assistant-read');
    if (!readButton) {
      fail('C4 — the per-answer read button is missing');
    } else {
      const playsBefore = audioLog.filter((e) => e.type === 'play').length;
      readButton.click();
      const replayed = await waitFor(() => audioLog.filter((e) => e.type === 'play').length > playsBefore);
      if (!replayed) fail('C4 — replay never started');
      else ok('C4 — the same answer can be replayed');
      await sleep(400);
      if (synthCalls.length === afterFirst) {
        ok('C4 — the replay is served from memory: no second request, no extra quota');
      } else {
        fail(`C4 — the replay re-synthesised the answer (${afterFirst} → ${synthCalls.length} requests)`);
      }
    }

    expectNoErrors('C4', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C5 — the cloud fails → the device is tried, then the honest line
   ════════════════════════════════════════════════════════════ */
{
  // The endpoint reports healthy but every synthesis attempt fails (502),
  // exactly what a quota-exhausted or briefly broken service looks like.
  let attempts = 0;
  const harness = renderAssistant({
    voiceEndpointImpl: async ({ method }) => {
      if (method === 'GET') {
        return new Response(
          JSON.stringify({ ok: true, configured: true, ready: true, voice: 'fa-IR-DilaraNeural' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      attempts += 1;
      return new Response(JSON.stringify({ error: 'upstream_error', message: 'صدا ساخته نشد.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    deviceVoices: [{ lang: 'en-US', name: 'Google US English' }],
  });
  const { dom, text, waitFor, errors, audioLog } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    await turnVoiceOn(dom, waitFor);
    await sendChatMessage(dom, waitFor, QUESTION);
    const answered = await waitFor(() => text().includes(PRICE));
    if (!answered) fail('C5 — the answer never arrived');
    else ok('C5 — the answer is still displayed, exactly as before');

    const tried = await waitFor(() => attempts > 0);
    if (!tried) fail('C5 — the cloud voice was never attempted');
    else ok('C5 — the cloud voice was attempted');

    // The device has no Persian voice either → the short honest line returns
    const explained = await waitFor(() => text().includes(NO_PERSIAN_LINE), 8000);
    if (!explained) fail('C5 — the customer was left with silence and no explanation');
    else ok('C5 — when nothing can speak, the same short honest line is shown');

    if (!audioLog.some((e) => e.type === 'play' && e.muted === false)) {
      ok('C5 — no broken audio was pushed to the player');
    } else {
      fail('C5 — the player was handed audio although synthesis failed');
    }

    // The chat must keep working after a failed read
    await sendChatMessage(dom, waitFor, 'سلام');
    const stillWorks = await waitFor(() => text().includes('سلام'));
    if (!stillWorks) fail('C5 — the chat broke after a failed read');
    else ok('C5 — the chat keeps working after a failed read');

    expectNoErrors('C5', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C6 — with no cloud configured, behaviour is the pre-phase-9 one
   ════════════════════════════════════════════════════════════ */
{
  const harness = renderAssistant({
    appSource: appNoVoice,
    voiceEndpointImpl: null,
    // this phone DOES have a Persian voice: the device path must still work
    deviceVoices: [
      { lang: 'fa-IR', name: 'ژینو فارسی' },
      { lang: 'en-US', name: 'Google US English' },
    ],
  });
  const { dom, text, waitFor, errors, requests, deviceSpoken } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    const on = await turnVoiceOn(dom, waitFor);
    if (!on) fail('C6 — reading could not be switched on');

    await sendChatMessage(dom, waitFor, QUESTION);
    await waitFor(() => text().includes(PRICE));

    const spoke = await waitFor(() => deviceSpoken.length > 0);
    if (!spoke) fail('C6 — the device engine was not used although it has a Persian voice');
    else ok('C6 — without the cloud service the phone engine is used, exactly as before');

    if (deviceSpoken.every((item) => /^fa/i.test(item.lang))) {
      ok('C6 — the device utterance is still marked Persian (fa)');
    } else {
      fail('C6 — wrong utterance language: ' + deviceSpoken.map((i) => i.lang).join(', '));
    }

    await sleep(300);
    const voiceRequests = requests.filter((r) => /functions\/v1\/zhino-voice/.test(r.url));
    if (voiceRequests.length === 0) {
      ok('C6 — not a single voice request is made when the service is not configured');
    } else {
      fail(`C6 — ${voiceRequests.length} voice request(s) although nothing is configured`);
    }

    expectNoErrors('C6', errors);
  } finally {
    dom.window.close();
  }
}

/* ════════════════════════════════════════════════════════════
   C7 — a LONG answer is read to the very end, nothing is dropped

   Why this scenario exists:
     The assistant may answer with up to 4000 characters, but one
     request to the voice service is capped (1200 chars server-side).
     Before the fix, the cloud path sent the whole answer in a single
     request, so a long answer was cut mid-sentence — the customer
     heard roughly the first half and the rest silently vanished,
     while the phone-engine path read the same answer in full.

     This test locks the contract: every meaningful character of the
     answer must actually be sent to the voice service, and the
     pieces must be played one after another on the audio element.
   ════════════════════════════════════════════════════════════ */
{
  // A realistic long Persian answer (recipe + notes), ~2.4k characters:
  // far beyond one request, well inside the assistant's own 4000 cap.
  const LONG_SENTENCES = [
    'برای تهیهٔ ژله توت فرنگی ابتدا یک بستهٔ پودر ژله را داخل یک کاسهٔ بزرگ بریزید.',
    'سپس یک پیمانه آب جوش را به آرامی اضافه کنید و با همزن دستی هم بزنید تا پودر کاملاً حل شود.',
    'اگر دانه‌های ریز پودر ته کاسه ماند، چند ثانیه بیشتر هم بزنید تا مخلوط شفاف و یکدست شود.',
    'در مرحلهٔ بعد یک پیمانه آب سرد یا آب یخ اضافه کنید تا دمای مخلوط پایین بیاید.',
    'مخلوط را داخل قالب دلخواه بریزید و روی آن را با سلفون بپوشانید تا بوی یخچال را نگیرد.',
    'قالب را حداقل چهار ساعت در یخچال بگذارید تا ژله کاملاً ببندد و قوام مناسب پیدا کند.',
    'برای اینکه ژله راحت از قالب جدا شود، ته قالب را چند ثانیه داخل آب ولرم قرار دهید.',
    'اگر دوست دارید ژله لایه لایه شود، هر لایه را جداگانه بریزید و بگذارید نیمه ببندد.',
    'تکه‌های توت فرنگی تازه را می‌توانید بعد از نیمه بستن لایهٔ اول روی ژله بچینید.',
    'برای مهمانی می‌توانید ژله را داخل لیوان‌های کوچک شیشه‌ای بریزید تا سرو آن ساده‌تر باشد.',
    'روی هر لیوان یک قاشق خامهٔ فرم گرفته و یک برگ نعنا بگذارید تا ظاهر دسر کامل شود.',
    'ژله آمادهٔ ژینو بدون رنگ مصنوعی تهیه می‌شود و طعم آن از عصارهٔ طبیعی میوه می‌آید.',
    'اگر ژله را برای کودکان درست می‌کنید، مقدار شکر اضافه لازم نیست چون پودر به اندازهٔ کافی شیرین است.',
    'ژله آماده را تا دو روز می‌توانید در یخچال نگه دارید، ولی تازه‌خوری طعم بهتری دارد.',
    'در روزهای گرم سال، ژله سرد یکی از بهترین دسرهای سبک برای پایان غذاست.',
    'اگر می‌خواهید ژله سفت‌تر شود، مقدار آب سرد را کمی کمتر کنید تا بافت محکم‌تری بگیرد.',
    'برعکس، برای ژله نرم‌تر می‌توانید چند قاشق آب بیشتر اضافه کنید ولی از حد معمول زیاد نشود.',
    'استفاده از قالب‌های سیلیکونی جداکردن ژله را خیلی ساده‌تر می‌کند و شکل آن سالم می‌ماند.',
    'برای تزیین می‌توانید از خلال پسته، نارگیل رنده شده یا پودر کاکائو استفاده کنید.',
    'ترکیب ژله توت فرنگی با ژله لیمو یک دسر دو رنگ زیبا می‌سازد که برای جشن‌ها مناسب است.',
    'دقت کنید ظرفی که استفاده می‌کنید کاملاً خشک باشد، چون چربی و رطوبت اضافه روی بستن ژله اثر می‌گذارد.',
    'اگر ژله بعد از چهار ساعت هنوز شل بود، احتمالاً نسبت آب بیشتر از اندازه بوده است.',
    'در این حالت می‌توانید مخلوط را دوباره گرم کنید و مقدار کمی پودر ژله به آن اضافه کنید.',
    'کاستر ژینو هم با همین روش آماده می‌شود ولی زمان بستن آن کمی کوتاه‌تر است.',
    'برای سرو حرفه‌ای، ژله را با چاقوی داغ برش بزنید تا لبه‌های آن صاف و تمیز بماند.',
    'نگهداری ژله در فریزر توصیه نمی‌شود چون بافت آن بعد از یخ زدن اسفنجی و آبکی می‌شود.',
    'همهٔ محصولات ژینو دارای پروانهٔ بهداشت هستند و تاریخ تولید روی بسته درج شده است.',
    'اگر سؤال دیگری دربارهٔ طرز تهیه یا سفارش داشتید، خوشحال می‌شوم راهنمایی‌تان کنم.',
  ];
  const LONG_REPLY = LONG_SENTENCES.join(' ');

  const synthCalls = [];
  const harness = renderAssistant({
    voiceEndpointImpl: workingVoiceEndpoint({ onSynthesize: (body) => synthCalls.push(body) }),
    assistantEndpointImpl: async ({ method }) => {
      if (method !== 'POST') throw new Error('offline (cloud voice simulation)');
      return new Response(JSON.stringify({ reply: LONG_REPLY, knowledge: 'database' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const { dom, text, waitFor, errors, audioLog } = harness;
  try {
    await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    await turnVoiceOn(dom, waitFor);
    await sendChatMessage(dom, waitFor, 'طرز تهیه ژله توت فرنگی را کامل توضیح بده');

    // The long answer really reached the screen
    const shown = await waitFor(() => text().includes('قالب را حداقل چهار ساعت'));
    if (!shown) {
      fail('C7 — the long answer never reached the screen');
    } else {
      ok('C7 — the long answer is displayed in full');
    }

    // Wait until synthesis settles (all pieces requested)
    await waitFor(() => synthCalls.length > 0);
    let stable = 0;
    let last = -1;
    while (stable < 4) {
      await sleep(150);
      if (synthCalls.length === last) stable += 1;
      else {
        stable = 0;
        last = synthCalls.length;
      }
    }

    if (synthCalls.length < 2) {
      fail(
        `C7 — the long answer was sent as ${synthCalls.length} request: it is truncated, the end is never spoken`,
      );
    } else {
      ok(`C7 — the long answer is split into ${synthCalls.length} pieces instead of being cut off`);
    }

    // No single piece may exceed the server cap, or the service rejects it
    const SERVER_CAP = 1200;
    const tooBig = synthCalls.filter((b) => String(b?.text ?? '').length > SERVER_CAP);
    if (tooBig.length > 0) {
      fail(`C7 — ${tooBig.length} piece(s) exceed the ${SERVER_CAP}-character service limit`);
    } else {
      ok(`C7 — every piece stays inside the ${SERVER_CAP}-character service limit`);
    }

    // THE POINT: nothing of the answer is lost. Compare on letters only,
    // so punctuation/spacing introduced by the splitter cannot mask a gap.
    const letters = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, '');
    const spoken = letters(synthCalls.map((b) => b?.text ?? '').join(''));
    const expected = letters(LONG_REPLY);
    if (spoken === expected) {
      ok('C7 — every single character of the answer is actually sent to be spoken');
    } else if (expected.startsWith(spoken)) {
      fail(
        `C7 — the answer is TRUNCATED: ${expected.length - spoken.length} of ${expected.length} characters are never spoken`,
      );
    } else {
      fail('C7 — the spoken text does not match the answer (reordered or corrupted)');
    }

    // The last sentence in particular must be spoken — that is what a
    // truncation bug silently eats.
    const lastSentence = letters(LONG_SENTENCES[LONG_SENTENCES.length - 1]);
    if (spoken.includes(lastSentence)) {
      ok('C7 — the final sentence of the answer is spoken, not swallowed');
    } else {
      fail('C7 — the final sentence of the answer is never spoken');
    }

    // The pieces are really played in sequence on the audio element
    const realPlays = audioLog.filter((e) => e.type === 'play' && e.muted === false).length;
    if (realPlays >= 2) {
      ok(`C7 — the pieces are played one after another (${realPlays} playbacks)`);
    } else {
      fail(`C7 — only ${realPlays} playback(s): the rest of the answer is never heard`);
    }

    expectNoErrors('C7', errors);
  } finally {
    dom.window.close();
  }
}

/* ── result ──────────────────────────────────────────────────── */

if (failures > 0) {
  console.error(`\n${failures} cloud-voice scenario(s) failed.`);
  process.exit(1);
}
console.log('\nAll cloud-voice scenarios passed.');
