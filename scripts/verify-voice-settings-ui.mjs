// ============================================================
// ZHINO — admin «ربات ژینو» voice-settings UI verification
//
// Regression test for the dead-button bug: when Supabase was
// configured (the production build), useVoiceSettings() returned a
// fresh object on EVERY render and the page's sync effect
// (setForm(liveSettings) keyed on that object) caused a runaway
// render loop that instantly reverted every toggle, selector and
// test click — «none of the voice buttons work».
//
// What this proves by driving the REAL AdminAssistantPage in jsdom:
//   A1  — the page renders all three voice toggles
//   A2  — every toggle flips AND STAYS flipped (no snap-back)
//   A3  — voice + speed selectors keep the chosen value
//   A4  — «تست صدا» really speaks through the shared engine, at the
//         chosen speed, with the Persian status note
//   A5  — «ذخیره تنظیمات ربات» persists (localStorage) + «ذخیره شد»
//   A6  — reset restores the defaults
//   A7  — master switch OFF blocks the test with a clear Persian note
//   B1  — same toggle stability in Supabase-connected mode (prod shape)
//   B2  — selectors persist in connected mode
//   B3  — save writes the site_content rows via PostgREST upsert
//   B4  — an undeployed/broken cloud voice surfaces a clear Persian
//         error instead of a silent no-op
//   *   — no React/console errors and no runaway render loop
//
// Usage:  node scripts/verify-voice-settings-ui.mjs
// ============================================================

import { buildSync } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (m) => { console.error('FAIL: ' + m); failures += 1; };
const ok = (m) => console.log('PASS: ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── bundle the REAL page with production defines ─────────── */

function buildApp(withSupabase) {
  return buildSync({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client';
        import { createElement as h } from 'react';
        import { AdminAuthProvider } from './src/admin/auth/AuthContext';
        import AdminAssistantPage from './src/admin/pages/AdminAssistantPage';
        createRoot(document.getElementById('root')).render(
          h(AdminAuthProvider, null, h(AdminAssistantPage)),
        );
      `,
      resolveDir: root,
      loader: 'tsx',
      sourcefile: 'voice-settings-ui-entry.tsx',
    },
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    jsx: 'automatic', loader: { '.css': 'empty' }, write: false, logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.VITE_API_BASE_URL': '""',
      'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
      'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
      'import.meta.env.VITE_ADMIN_AUTH_MODE': '"demo"',
      'import.meta.env.VITE_SUPABASE_URL': withSupabase ? '"https://voice-sim.supabase.co"' : '""',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': withSupabase ? '"sb_publishable_verify_key"' : '""',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
      'import.meta.env.VITE_ASSISTANT_API_URL': '""',
    },
  }).outputFiles[0].text;
}

/* ── DOM helpers ─────────────────────────────────────────── */
const q = (dom, sel) => dom.window.document.querySelector(sel);
const qa = (dom, sel) => [...dom.window.document.querySelectorAll(sel)];
const byText = (dom, text, sel = 'button') =>
  qa(dom, sel).find((el) => el.textContent.trim().includes(text));
const toggleByLabel = (dom, label) => q(dom, `[role="switch"][aria-label="${label}"]`);
const click = (dom, el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setSelect = (dom, el, value) => {
  el.value = value;
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
};

function makeDom() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const msg = String(e?.message ?? '') + ' ' + String(e?.detail?.message ?? '');
    if (!msg.includes('Not implemented')) errors.push(msg);
  });
  vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://zheno.local/admin/assistant',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  return { dom, errors };
}

/** Mock SpeechSynthesis: utterances are captured; Persian voice optional. */
function installSpeechMock(dom, { persian }) {
  const w = dom.window;
  const spoken = [];
  class Utterance {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
  }
  w.SpeechSynthesisUtterance = Utterance;
  const voices = persian
    ? [{ name: 'Google فارسی', lang: 'fa-IR', default: false, voiceURI: 'fa', localService: true }]
    : [{ name: 'Google US English', lang: 'en-US', default: true, voiceURI: 'en', localService: true }];
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => voices,
    speak(u) {
      spoken.push(u);
      setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => { u.onend && u.onend({}); }, 15); }, 5);
    },
    cancel() {},
    resume() {},
    pause() {},
    addEventListener() {},
    removeEventListener() {},
  };
  w.speechSynthesis = synth;
  return spoken;
}

/* ── Scenario A: offline/demo mode, Persian browser voice ── */
async function scenarioA() {
  const { dom, errors } = makeDom();
  const spoken = installSpeechMock(dom, { persian: true });
  dom.window.eval(buildApp(false));
  await sleep(120);

  const master = toggleByLabel(dom, 'صدای ربات (کلید اصلی)');
  const auto = toggleByLabel(dom, 'خواندن خودکار پاسخ‌های جدید');
  const cloud = toggleByLabel(dom, 'صدای ابری فارسی');
  if (!master || !auto || !cloud) { fail('A — page did not render the three voice toggles'); return; }
  ok('A — page rendered with all three voice toggles');

  // A2: toggles flip and STAY (the reported dead-button behaviour)
  click(dom, master);
  await sleep(300);
  if (toggleByLabel(dom, 'صدای ربات (کلید اصلی)').getAttribute('aria-checked') === 'false') {
    ok('A — «صدای ربات» toggle turns OFF and stays OFF (no snap-back)');
  } else fail('A — master toggle did not stay OFF');
  click(dom, toggleByLabel(dom, 'صدای ربات (کلید اصلی)'));
  await sleep(300);
  if (toggleByLabel(dom, 'صدای ربات (کلید اصلی)').getAttribute('aria-checked') === 'true') {
    ok('A — «صدای ربات» toggle turns back ON and stays ON');
  } else fail('A — master toggle did not turn back ON');

  click(dom, toggleByLabel(dom, 'خواندن خودکار پاسخ‌های جدید'));
  click(dom, toggleByLabel(dom, 'صدای ابری فارسی'));
  await sleep(300);
  const autoNow = toggleByLabel(dom, 'خواندن خودکار پاسخ‌های جدید').getAttribute('aria-checked');
  const cloudNow = toggleByLabel(dom, 'صدای ابری فارسی').getAttribute('aria-checked');
  if (autoNow === 'false' && cloudNow === 'false') ok('A — auto-read and cloud toggles flip and stay');
  else fail(`A — auto/cloud toggles wrong after flip (${autoNow}/${cloudNow})`);
  click(dom, toggleByLabel(dom, 'خواندن خودکار پاسخ‌های جدید'));
  click(dom, toggleByLabel(dom, 'صدای ابری فارسی'));
  await sleep(200);

  // A3: voice + speed selectors keep their value
  const selects = qa(dom, 'select.adm-input');
  if (selects.length < 2) { fail('A — voice/speed selects missing'); return; }
  setSelect(dom, selects[0], 'fa-IR-FaridNeural');
  setSelect(dom, selects[1], '1.3');
  await sleep(300);
  const s0 = qa(dom, 'select.adm-input')[0].value;
  const s1 = qa(dom, 'select.adm-input')[1].value;
  if (s0 === 'fa-IR-FaridNeural' && s1 === '1.3') ok('A — voice (فرید) and speed (۱٫۳×) selections persist');
  else fail(`A — selectors did not persist (${s0}/${s1})`);

  // A4: test button really speaks with the selected rate
  const testBtn = byText(dom, 'تست صدا');
  click(dom, testBtn);
  await sleep(450);
  if (spoken.length >= 1 && Math.abs(spoken[0].rate - 1.3) < 1e-9) {
    ok('A — «تست صدا» speaks through the shared engine at the chosen speed');
  } else fail(`A — test button did not speak (utterances=${spoken.length}, rate=${spoken[0]?.rate})`);
  const note = dom.window.document.querySelector('[role="status"], [role="alert"]');
  if (note && note.textContent.includes('در حال پخش تست')) ok('A — test note shows «در حال پخش تست…»');
  else fail(`A — missing test note (got: ${note?.textContent ?? 'none'})`);

  // A5: save persists to localStorage + SavedFlash
  click(dom, byText(dom, 'ذخیره تنظیمات ربات'));
  await sleep(150);
  const stored = JSON.parse(dom.window.localStorage.getItem('zhino_admin_voice_settings_v1') ?? 'null');
  const flash = byText(dom, 'ذخیره شد', 'p');
  if (stored && stored.voiceName === 'fa-IR-FaridNeural' && stored.rate === 1.3 && flash) {
    ok('A — «ذخیره تنظیمات ربات» persists settings and shows «ذخیره شد»');
  } else fail(`A — save failed (stored=${JSON.stringify(stored)}, flash=${!!flash})`);

  // A6: reset restores defaults (confirm dialog auto-accepted)
  dom.window.confirm = () => true;
  click(dom, byText(dom, 'بازنشانی به مقادیر اولیه'));
  await sleep(300);
  const rs0 = qa(dom, 'select.adm-input')[0].value;
  const rs1 = qa(dom, 'select.adm-input')[1].value;
  if (rs0 === 'fa-IR-DilaraNeural' && rs1 === '1') ok('A — reset restores defaults (دیلارا, سرعت ۱×)');
  else fail(`A — reset did not restore defaults (${rs0}/${rs1})`);

  // A7: master switch OFF blocks the test with a clear Persian note
  click(dom, toggleByLabel(dom, 'صدای ربات (کلید اصلی)'));
  await sleep(200);
  const before = spoken.length;
  click(dom, byText(dom, 'تست صدا'));
  await sleep(300);
  const alert = qa(dom, '[role="alert"], [role="status"]').find((el) => el.textContent.includes('خاموش'));
  if (alert && spoken.length === before) ok('A — with master switch OFF, test is blocked with a clear Persian note');
  else fail('A — master-OFF test block failed');

  if (errors.length > 0) fail(`A — console/React errors: ${errors.join(' | ').slice(0, 300)}`);
  else ok('A — no React/console errors (no runaway loop)');
  dom.window.close();
}

/* ── Scenario B: Supabase connected (production shape) ───── */
async function scenarioB() {
  const { dom, errors } = makeDom();
  installSpeechMock(dom, { persian: false }); // device has no Persian voice

  let dbRows = []; // site_content rows the "database" knows
  const upserts = [];
  dom.window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    const rawHeaders = init.headers && typeof init.headers === 'object' ? init.headers : {};
    const header = (name) => {
      if (typeof rawHeaders.get === 'function') return String(rawHeaders.get(name) ?? '');
      const lower = name.toLowerCase();
      for (const key of Object.keys(rawHeaders)) {
        if (key.toLowerCase() === lower) return String(rawHeaders[key]);
      }
      return '';
    };
    const R = dom.window.Response ?? Response;
    const json = (data, status = 200) => new R(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    // Edge function zhino-voice: GET healthy, POST → 404 (not deployed)
    if (url.includes('/functions/v1/zhino-voice')) {
      if (method === 'GET') return json({ ok: true, configured: true, voice: 'fa-IR-DilaraNeural', enabled: true });
      return new R(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/site_content') && method === 'POST' && header('prefer').includes('merge-duplicates')) {
      const payload = JSON.parse(init.body);
      upserts.push(payload);
      for (const row of payload) {
        dbRows = dbRows.filter((r) => r.key !== row.key);
        dbRows.push({ key: row.key, value: row.value, published: true });
      }
      return new R('', { status: 201 });
    }
    if (url.includes('/rest/v1/site_content')) return json(dbRows);
    if (url.includes('/rest/v1/site_settings')) return new R('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/rest/v1/recipes')) return json([]);
    return json({});
  };

  dom.window.eval(buildApp(true));
  await sleep(200);

  const master = toggleByLabel(dom, 'صدای ربات (کلید اصلی)');
  if (!master) { fail('B — page did not render (connected mode)'); return; }
  ok('B — page rendered in Supabase-connected mode');

  // B1: toggles flip and STAY — this was the reported dead-button bug
  click(dom, toggleByLabel(dom, 'صدای ابری فارسی'));
  await sleep(350);
  if (toggleByLabel(dom, 'صدای ابری فارسی').getAttribute('aria-checked') === 'false') {
    ok('B — cloud-voice toggle turns OFF and stays OFF (bug fixed)');
  } else fail('B — cloud-voice toggle snapped back (loop still present)');
  click(dom, toggleByLabel(dom, 'صدای ابری فارسی'));
  await sleep(300);

  // B2: selectors keep value in connected mode
  setSelect(dom, qa(dom, 'select.adm-input')[0], 'fa-IR-FaridNeural');
  await sleep(300);
  if (qa(dom, 'select.adm-input')[0].value === 'fa-IR-FaridNeural') ok('B — voice selection persists in connected mode');
  else fail('B — voice selection did not persist');

  // B3: save writes real site_content rows via PostgREST
  click(dom, byText(dom, 'ذخیره تنظیمات ربات'));
  await sleep(500);
  const flat = upserts.flat();
  const nameRow = flat.find((r) => r.key === 'assistant_voice_name');
  const enabledRow = flat.find((r) => r.key === 'assistant_voice_enabled');
  if (nameRow?.value === 'fa-IR-FaridNeural' && enabledRow?.value === '1') {
    ok('B — save upserts the voice rows into site_content');
  } else fail(`B — save did not write the expected rows (${JSON.stringify(flat).slice(0, 200)})`);
  if (qa(dom, 'select.adm-input')[0].value === 'fa-IR-FaridNeural') ok('B — UI keeps the saved value after the DB round-trip');
  else fail('B — UI lost the saved value after the DB round-trip');

  // B4: undeployed edge function + no Persian device voice → clear Persian error
  click(dom, byText(dom, 'تست صدا'));
  await sleep(700);
  const texts = qa(dom, '[role="alert"], [role="status"]').map((el) => el.textContent).join(' ');
  if (texts.includes('zhino-voice') || texts.includes('مستقر نشده') || texts.includes('صدای ابری در دسترس نبود')) {
    ok('B — cloud failure surfaces a clear Persian error (no silent failure)');
  } else fail(`B — no Persian cloud-failure note (got: ${texts.slice(0, 200)})`);

  if (errors.length > 0) fail(`B — console/React errors: ${errors.join(' | ').slice(0, 300)}`);
  else ok('B — no React/console errors in connected mode');
  dom.window.close();
}

await scenarioA();
await scenarioB();
console.log('');
if (failures > 0) {
  console.error(`voice-settings UI verify (${basename(fileURLToPath(import.meta.url))}): ${failures} failure(s)`);
  process.exit(1);
}
console.log('voice-settings UI verify: all checks passed (real AdminAssistantPage, no real network)');
