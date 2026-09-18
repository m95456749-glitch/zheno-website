// ============================================================
// ZHINO — Cloud voice Edge Function checks (phase 9)
//
// What this script proves WITHOUT deploying anything and WITHOUT
// any real Azure call:
//
//   V1 — the function exists, reads AZURE_SPEECH_KEY only from
//        Deno.env (Supabase Secrets), and no key string is in the
//        repository
//   V2 — GET health: ok/configured/voice — and never a key
//   V3 — success: SSML goes to the right regional endpoint with
//        fa-IR-DilaraNeural, the key travels only in the request
//        header, and audio/mpeg bytes come back
//   V4 — secret not set → 501 not_configured (frontend falls back
//        to the browser voice)
//   V5 — Azure quota/network/timeout/invalid-audio map to honest
//        status codes (429 / 502 / 504 / 502)
//   V6 — input guards: empty text, over-long text, huge body
//   V7 — per-IP rate limit holds after 30 requests
//   V8 — no response body ever contains the configured key
//
// Usage:  node scripts/verify-voice.mjs
// ============================================================

import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FN_PATH = join(root, 'supabase', 'functions', 'zhino-voice', 'index.ts');

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── V1 — static security shape ────────────────────────────── */
{
  let code = '';
  try {
    code = readFileSync(FN_PATH, 'utf8');
    ok('zhino-voice edge function file is present');
  } catch {
    fail('supabase/functions/zhino-voice/index.ts is missing');
  }

  if (code) {
    if (/Deno\.env\.get\('AZURE_SPEECH_KEY'\)/.test(code)) {
      ok('the Azure key is read only from Deno.env (Supabase Secrets)');
    } else {
      fail('zhino-voice must read AZURE_SPEECH_KEY from Deno.env');
    }
    if (/fa-IR-DilaraNeural/.test(code)) {
      ok('the Persian voice fa-IR-DilaraNeural is the default');
    } else {
      fail('the fa-IR-DilaraNeural default voice is missing');
    }
    // Nothing that even looks like a real key may be committed here.
    if (!/Ocp-Apim-Subscription-Key:\s*['"][A-Za-z0-9]{20,}/.test(code)) {
      ok('no Azure key literal is committed in the function');
    } else {
      fail('a possible Azure key literal was found in the function source');
    }
    if (/Deno\.serve/.test(code) && /not_configured/.test(code)) {
      ok('the function degrades honestly when secrets are missing');
    } else {
      fail('zhino-voice must serve via Deno and report not_configured');
    }
  }
}

/* ── harness: load the Deno function with a shim + mocked net ── */

async function loadVoiceFunction(env, marker) {
  const bundled = buildSync({
    entryPoints: [FN_PATH],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text;

  let handler = null;
  const previousDeno = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (key) => (key in env ? env[key] : undefined) },
    serve: (fn) => {
      handler = fn;
    },
  };
  try {
    await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}#${marker}`);
  } finally {
    globalThis.Deno = previousDeno;
  }
  if (!handler) throw new Error('zhino-voice did not register a handler');
  return handler;
}

const ENDPOINT = 'https://voice-sim.supabase.co/functions/v1/zhino-voice';
// Assembled at runtime so this fixture never looks like a committed key.
const AZURE_KEY = ['verify', 'azure', 'key', 'placeholder'].join('-');
const FAKE_MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x01]).buffer;

/** make a fetch mock from a behaviour table */
function makeFetchMock({ mode = 'ok', calls, restRows = null, restFails = false, hangMs = 60000 }) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = init.headers
      ? Object.fromEntries(new globalThis.Headers(init.headers).entries())
      : {};
    calls.push({ url, headers, body: String(init.body ?? '') });

    // PostgREST reads (public site_content settings) — answered locally
    if (url.includes('/rest/v1/')) {
      if (restFails) return new globalThis.Response('db boom', { status: 500 });
      return new globalThis.Response(JSON.stringify(restRows ?? []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'network') throw new Error('simulated network failure');
    if (mode === 'hang') {
      // never resolves on its own; respects the abort signal from the function
      return await new Promise((_res, reject) => {
        const signal = init.signal;
        if (signal) {
          const onAbort = () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        } else {
          setTimeout(() => {}, hangMs);
        }
      });
    }
    if (mode === 'quota') return new globalThis.Response('quota', { status: 429 });
    if (mode === 'auth') return new globalThis.Response('denied', { status: 403 });
    if (mode === 'upstream') return new globalThis.Response('boom', { status: 500 });
    if (mode === 'not-audio') {
      return new globalThis.Response('{"oops":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (mode === 'empty-audio') {
      return new globalThis.Response(new ArrayBuffer(0), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }
    return new globalThis.Response(FAKE_MP3, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  };
}

const post = (handler, body, extra = {}) =>
  handler(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sb_publishable_verify_key',
        'x-forwarded-for': '198.51.100.9',
        ...(extra.headers ?? {}),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

function assertNoKey(bodyText, label) {
  if (bodyText.includes(AZURE_KEY)) {
    fail(`${label} — the Azure key leaked into a response body`);
    return false;
  }
  return true;
}

/* ── V2..V8 — behaviour with secrets present ───────────────── */
{
  const env = {
    ['AZURE_SPEECH' + '_KEY']: AZURE_KEY,
    ['AZURE_SPEECH' + '_REGION']: 'eastus',
    SUPABASE_URL: 'https://voice-sim.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_verify_key',
    ALLOWED_ORIGINS: '*',
    // short upstream timeout so the hang simulation stays fast
    ['VOICE_UPSTREAM_TIMEOUT' + '_MS']: '400',
  };

  // -- success path -------------------------------------------------
  {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
    try {
      const handler = await loadVoiceFunction(env, 'ok');

      // V2 — health
      const health = await handler(new Request(ENDPOINT, { method: 'GET' }));
      const healthBody = await health.text();
      const healthJson = JSON.parse(healthBody);
      if (
        health.status === 200 &&
        healthJson.ok === true &&
        healthJson.configured === true &&
        healthJson.voice === 'fa-IR-DilaraNeural'
      ) {
        ok('V2 — GET health reports ready with the Persian voice');
      } else {
        fail(`V2 — unexpected health response (${health.status}): ${healthBody}`);
      }
      assertNoKey(healthBody, 'V2 health');

      // V3 — a real synthesis round trip
      const res = await post(handler, { text: 'سلام! ژله & کاستر <ژینو> آماده است.' });
      const audio = await res.arrayBuffer();
      if (res.status === 200 && (res.headers.get('Content-Type') ?? '').includes('audio/mpeg')) {
        ok('V3 — POST returns audio/mpeg on success');
      } else {
        fail(`V3 — expected 200 audio/mpeg, got ${res.status} ${res.headers.get('Content-Type')}`);
      }
      if (audio.byteLength === FAKE_MP3.byteLength) {
        ok('V3 — the exact upstream audio bytes are streamed back');
      } else {
        fail('V3 — audio body does not match the upstream bytes');
      }

      const call = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
      if (call && call.url === 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1') {
        ok('V3 — the request hits the correct regional Azure endpoint');
      } else {
        fail(`V3 — wrong Azure endpoint: ${call?.url}`);
      }
      if (call?.headers['ocp-apim-subscription-key'] === AZURE_KEY) {
        ok('V3 — the key travels only in the Azure request header');
      } else {
        fail('V3 — the Azure request header does not carry the key');
      }
      if (call && call.body.includes('name="fa-IR-DilaraNeural"')) {
        ok('V3 — SSML selects fa-IR-DilaraNeural');
      } else {
        fail('V3 — SSML does not select fa-IR-DilaraNeural');
      }
      if (call && call.body.includes('&amp;') && !call.body.includes('<ژینو>')) {
        ok('V3 — synthesis text is XML-escaped (no SSML injection)');
      } else {
        fail('V3 — SSML escaping failed');
      }
      if (
        call?.headers['content-type'] === 'application/ssml+xml' &&
        call?.headers['x-microsoft-outputformat'] === 'audio-16khz-32kbitrate-mono-mp3'
      ) {
        ok('V3 — SSML content type and small MP3 output format are set');
      } else {
        fail('V3 — missing/wrong SSML or output-format headers');
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V4: secret not set -------------------------------------------
  {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
    try {
      const handler = await loadVoiceFunction({ ALLOWED_ORIGINS: '*' }, 'no-secret');
      const res = await post(handler, { text: 'سلام' });
      const body = await res.text();
      if (res.status === 501 && body.includes('not_configured')) {
        ok('V4 — missing secret → 501 not_configured (frontend falls back)');
      } else {
        fail(`V4 — expected 501 not_configured, got ${res.status}: ${body}`);
      }
      if (calls.length === 0) {
        ok('V4 — without a secret, no Azure call is ever attempted');
      } else {
        fail('V4 — the Azure API was called without a configured key');
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V5: upstream failure mapping ---------------------------------
  {
    const realFetch = globalThis.fetch;
    const scenarios = [
      ['quota', 429, 'quota_exceeded'],
      ['auth', 502, 'upstream_auth'],
      ['network', 502, 'upstream_error'],
      ['hang', 504, 'upstream_timeout'],
      ['not-audio', 502, 'invalid_upstream_audio'],
      ['empty-audio', 502, 'invalid_upstream_audio'],
      ['upstream', 502, 'upstream_error'],
    ];
    try {
      for (const [mode, wantStatus, wantError] of scenarios) {
        const calls = [];
        globalThis.fetch = makeFetchMock({ mode, calls });
        const handler = await loadVoiceFunction(env, `fail-${mode}`);
        const res = await post(handler, { text: 'یک پاسخ کوتاه' });
        const body = await res.text();
        const named = `V5/${mode}`;
        if (res.status === wantStatus && body.includes(wantError)) {
          ok(`${named} — maps to ${wantStatus} ${wantError}`);
        } else {
          fail(`${named} — expected ${wantStatus} ${wantError}, got ${res.status}: ${body}`);
        }
        assertNoKey(body, named);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V6: input guards ---------------------------------------------
  {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
    try {
      const handler = await loadVoiceFunction(env, 'guards');

      const empty = await post(handler, { text: '   ' });
      if (empty.status === 400 && (await empty.text()).includes('empty_text')) {
        ok('V6 — empty text → 400 empty_text');
      } else {
        fail('V6 — empty text was not rejected');
      }

      const longText = 'ژ'.repeat(2001);
      const tooLong = await post(handler, { text: longText });
      if (tooLong.status === 400 && (await tooLong.text()).includes('text_too_long')) {
        ok('V6 — text over 2000 chars → 400 text_too_long');
      } else {
        fail('V6 — over-long text was not rejected');
      }

      const hugeBody = JSON.stringify({ text: 'ژ'.repeat(12000) });
      const huge = await post(handler, hugeBody, {
        headers: { 'Content-Length': String(hugeBody.length) },
      });
      if (huge.status === 413) {
        ok('V6 — oversized body → 413 payload_too_large');
      } else {
        fail(`V6 — oversized body expected 413, got ${huge.status}`);
      }

      const notJson = await post(handler, 'this is not json');
      if (notJson.status === 400) {
        ok('V6 — invalid JSON body → 400');
      } else {
        fail('V6 — invalid JSON was not rejected');
      }

      const badMethod = await handler(new Request(ENDPOINT, { method: 'PUT' }));
      if (badMethod.status === 405) {
        ok('V6 — PUT → 405 method_not_allowed');
      } else {
        fail('V6 — PUT was not rejected');
      }

      if (calls.length === 0) {
        ok('V6 — guarded inputs never reach Azure');
      } else {
        fail('V6 — a guarded input still triggered an Azure call');
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V9: admin voice settings from public site_content -------------
  {
    const realFetch = globalThis.fetch;
    try {
      // (الف) صدای انتخابی مدیر + سرعت → در SSML اعمال می‌شود
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [
            { key: 'assistant_voice_name', value: 'fa-IR-FaridNeural' },
            { key: 'assistant_voice_rate', value: '1.15' },
            { key: 'assistant_voice_cloud', value: '1' },
          ],
        });
        const handler = await loadVoiceFunction(env, 'set-farid');
        const res = await post(handler, { text: 'سلام' });
        await res.arrayBuffer();
        const azure = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
        if (res.status === 200 && azure?.body.includes('name="fa-IR-FaridNeural"') && azure.body.includes('rate="+15%"')) {
          ok('V9 — admin voice choice + rate are applied to the SSML');
        } else {
          fail(`V9 — SSML does not reflect admin settings: ${azure?.body ?? '(no azure call)'}`);
        }
        const rest = calls.find((c) => c.url.includes('/rest/v1/site_content'));
        if (rest && !rest.url.includes('orders')) {
          ok('V9 — settings are read from public site_content only (never orders)');
        } else {
          fail('V9 — settings were read from the wrong table');
        }
      }

      // (ب) کلید اصلی خاموش → ۴۰۳ بدون هیچ تماسی با Azure
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [{ key: 'assistant_voice_cloud', value: '0' }],
        });
        const handler = await loadVoiceFunction(env, 'set-off');
        const res = await post(handler, { text: 'سلام' });
        const body = await res.text();
        if (res.status === 403 && body.includes('voice_disabled')) {
          ok('V9 — the admin master switch off → 403 voice_disabled');
        } else {
          fail(`V9 — master switch off expected 403 voice_disabled, got ${res.status}`);
        }
        if (!calls.some((c) => c.url.includes('tts.speech.microsoft.com'))) {
          ok('V9 — when disabled, no Azure call is ever made (no spend)');
        } else {
          fail('V9 — Azure was called although the admin disabled the cloud voice');
        }
        // ب — GET سلامت هم وضعیت واقعی را گزارش می‌دهد
        const health = await handler(new Request(ENDPOINT, { method: 'GET' }));
        const healthJson = JSON.parse(await health.text());
        if (healthJson.enabled === false) {
          ok('V9 — GET health reports the disabled master switch');
        } else {
          fail('V9 — GET health did not report the disabled state');
        }
      }

      // (ب-۲) کلید اصلی «صدای ربات» (فاز ۱۱) → ۴۰۳ با صفر تماس Azure
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [
            { key: 'assistant_voice_enabled', value: '0' },
            { key: 'assistant_voice_cloud', value: '1' },
          ],
        });
        const handler = await loadVoiceFunction(env, 'master-off');
        const res = await post(handler, { text: 'سلام' });
        const body = await res.text();
        if (res.status === 403 && body.includes('voice_disabled')) {
          ok('V9 — the assistant master voice switch off → 403 voice_disabled');
        } else {
          fail(`V9 — assistant master switch off expected 403 voice_disabled, got ${res.status}`);
        }
        if (!calls.some((c) => c.url.includes('tts.speech.microsoft.com'))) {
          ok('V9 — master switch off means zero Azure calls (no spend at all)');
        } else {
          fail('V9 — Azure was called although the master voice switch was off');
        }
        // بازگرداندن کلید اصلی فقط همه‌چیز را به حالت قبل برمی‌گرداند
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [
            { key: 'assistant_voice_enabled', value: '1' },
            { key: 'assistant_voice_cloud', value: '1' },
          ],
        });
        const handlerBack = await loadVoiceFunction(env, 'master-on');
        const resBack = await post(handlerBack, { text: 'سلام' });
        await resBack.arrayBuffer();
        if (resBack.status === 200) {
          ok('V9 — turning the master switch back on restores the service');
        } else {
          fail(`V9 — master switch back on expected 200, got ${resBack.status}`);
        }
      }

      // (ج) مقدار نامعتبر در دیتابیس → clamp به پیش‌فرض امن
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [
            { key: 'assistant_voice_name', value: 'en-US-AriaNeural' },
            { key: 'assistant_voice_rate', value: '2.5' },
          ],
        });
        const handler = await loadVoiceFunction(env, 'set-invalid');
        const res = await post(handler, { text: 'سلام' });
        await res.arrayBuffer();
        const azure = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
        if (
          res.status === 200 &&
          azure?.body.includes('name="fa-IR-DilaraNeural"') &&
          azure.body.includes('rate="+40%"')
        ) {
          ok('V9 — an invalid voice is clamped to Dilara and a wild rate is clamped to +40%');
        } else {
          fail(`V9 — clamping failed: ${azure?.body ?? '(no azure call)'}`);
        }
      }

      // (د) خرابی دیتابیس → پیش‌فرض‌های امن، بدون خفتن سرویس
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({ mode: 'ok', calls, restFails: true });
        const handler = await loadVoiceFunction(env, 'set-dbdown');
        const res = await post(handler, { text: 'سلام' });
        await res.arrayBuffer();
        const azure = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
        if (res.status === 200 && azure?.body.includes('name="fa-IR-DilaraNeural"')) {
          ok('V9 — a database failure falls back to safe defaults (Dilara, enabled)');
        } else {
          fail(`V9 — database-failure fallback failed (${res.status})`);
        }
      }

      // (ه) سرعت کمتر از بازه → clamp به ‎-30%‎
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({
          mode: 'ok',
          calls,
          restRows: [{ key: 'assistant_voice_rate', value: '0.4' }],
        });
        const handler = await loadVoiceFunction(env, 'set-slow');
        const res = await post(handler, { text: 'سلام' });
        await res.arrayBuffer();
        const azure = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
        if (azure?.body.includes('rate="-30%"')) {
          ok('V9 — an under-range rate is clamped to -30%');
        } else {
          fail(`V9 — under-range rate clamp failed: ${azure?.body ?? '(no azure call)'}`);
        }
      }

      // (و) بدون SUPABASE_URL/ANON_KEY → پیش‌فرض امن، بدون خطا
      {
        const calls = [];
        globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
        const noDbEnv = { ...env };
        delete noDbEnv.SUPABASE_URL;
        delete noDbEnv.SUPABASE_ANON_KEY;
        const handler = await loadVoiceFunction(noDbEnv, 'set-noenv');
        const res = await post(handler, { text: 'سلام' });
        await res.arrayBuffer();
        const azure = calls.find((c) => c.url.includes('tts.speech.microsoft.com'));
        if (res.status === 200 && azure?.body.includes('name="fa-IR-DilaraNeural"')) {
          ok('V9 — without database envs the function still serves the safe default voice');
        } else {
          fail(`V9 — missing-env default failed (${res.status})`);
        }
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V7: anti-abuse rate limit ------------------------------------
  {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
    try {
      const handler = await loadVoiceFunction(env, 'rate-limit');
      let lastStatus = 0;
      for (let i = 0; i < 30; i += 1) {
        lastStatus = (await post(handler, { text: 'تست سهمیه' })).status;
      }
      if (lastStatus === 200) {
        ok('V7 — 30 requests within the window are served');
      } else {
        fail(`V7 — request inside the limit got ${lastStatus}`);
      }
      const blocked = await post(handler, { text: 'تست سهمیه' });
      const blockedBody = await blocked.text();
      if (blocked.status === 429 && blockedBody.includes('rate_limited')) {
        ok('V7 — request 31 in the window → 429 rate_limited');
      } else {
        fail(`V7 — rate limit did not engage (${blocked.status})`);
      }
      // a different IP must not be affected
      const otherIp = await handler(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.4',
          },
          body: JSON.stringify({ text: 'تست سهمیه' }),
        }),
      );
      if (otherIp.status === 200) {
        ok('V7 — the limit is per IP, not global');
      } else {
        fail(`V7 — a different IP was wrongly limited (${otherIp.status})`);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- V8: CORS allow-list honoured ---------------------------------
  {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock({ mode: 'ok', calls });
    try {
      const handler = await loadVoiceFunction(
        { ...env, ALLOWED_ORIGINS: 'https://zheno-shop.example' },
        'cors',
      );
      const denied = await handler(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
          body: JSON.stringify({ text: 'سلام' }),
        }),
      );
      if (denied.status === 403 && !denied.headers.get('Access-Control-Allow-Origin')) {
        ok('V8 — an unknown origin is denied without CORS headers');
      } else {
        fail('V8 — an unknown origin was not denied');
      }
      const allowed = await handler(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://zheno-shop.example' },
          body: JSON.stringify({ text: 'سلام' }),
        }),
      );
      await allowed.arrayBuffer();
      if (
        allowed.status === 200 &&
        allowed.headers.get('Access-Control-Allow-Origin') === 'https://zheno-shop.example'
      ) {
        ok('V8 — the configured origin is served with the CORS header');
      } else {
        fail('V8 — the configured origin was not served correctly');
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  }
}

console.log('');
if (failures > 0) {
  console.error(`zhino-voice verify: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`zhino-voice verify: all checks passed (${basename(FN_PATH)} simulated, no real network)`);
