// Local React/DOM regression for the observed post-commit click/effect race.
// Instrumentation is injected into this test bundle ONLY, never app source or
// production builds. No request/response content, tokens or secrets are logged.
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

const define = {
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
function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'Instrumentation anchor changed; review, do not skip.');
  return source.replace(needle, replacement);
}
const code = (await build({
  entryPoints: ['src/main.tsx'], bundle: true, format: 'iife', platform: 'browser',
  target: 'es2020', jsx: 'automatic', loader: { '.css': 'empty' }, write: false,
  logLevel: 'silent', define,
  plugins: [{ name: 'test-only-ideas-trace', setup(builder) {
    builder.onLoad({ filter: /\/AssistantChat\.tsx$/ }, ({ path }) => {
      let source = readFileSync(path, 'utf8');
      // Preserve the actual hook type. The test must fail if it regresses back
      // to a passive effect, rather than silently replacing it in the bundle.
      const hook = source.match(/  (useEffect|useLayoutEffect)\(\(\) => \{\n    setIdeasOpen\(false\);\n  \}, \[messages.length\]\);/);
      assert.ok(hook, 'Cannot locate the message-collapse effect');
      source = replaceOnce(source, hook[0], `
  useLayoutEffect(() => window.__ideasTrace('commit', { reactMessages: messages.length, ideasOpen, suggestions: suggestions.length }));
  ${hook[1]}(() => {
    window.__ideasTrace('effect.before', { reactMessages: messages.length, ideasOpen });
    setIdeasOpen(false);
    window.__ideasTrace('effect.after-schedule', { reactMessages: messages.length, ideasOpen });
  }, [messages.length]);`);
      // Import a tracing layout hook independently even if the implementation
      // regresses to a passive hook and removes its own layout-hook import.
      source = "import { useLayoutEffect as traceLayoutEffect } from 'react';\n" + source;
      source = source.replace("  useLayoutEffect(() => window.__ideasTrace('commit'", "  traceLayoutEffect(() => window.__ideasTrace('commit'");
      source = replaceOnce(source, 'onClick={() => setIdeasOpen((open) => !open)}', `onClick={() => {
        window.__ideasTrace('click.handler', { reactMessages: messages.length, ideasOpen });
        setIdeasOpen((open) => !open);
        window.__ideasTrace('click.queued', { reactMessages: messages.length, ideasOpen });
      }}`);
      return { contents: source, loader: 'tsx' };
    });
    builder.onLoad({ filter: /\/useAssistantChat\.ts$/ }, ({ path }) => ({
      contents: replaceOnce(readFileSync(path, 'utf8'), 'const answer = answerLocally(clean, context);', `const answer = answerLocally(clean, context);
        window.__ideasTrace('answer.computed', {
          answerHasPrice: answer.text.includes('۲۰۰٬۰۰۰ تومان'),
          recipeSuggested: answer.suggestions?.some(item => item.label.includes('طرز تهیه ژله')) === true,
        });`), loader: 'ts',
    }));
  } }],
})).outputFiles[0].text;

const traces = [];
for (let iteration = 1; iteration <= 20; iteration++) {
  // Ten earliest-observable clicks, then ten using the smoke's 100ms polling.
  const immediate = iteration <= 10;
  const events = [], errors = [];
  let window, previousEffectMessages = null, committedMessages = null, clicked = false;
  const recipeChip = () => [...window.document.querySelectorAll('.zhino-assistant-ideas-body .zhino-assistant-chip')]
    .find(chip => chip.textContent.includes('طرز تهیه ژله'));
  const trace = (event, extra = {}) => {
    const document = window.document;
    if (event === 'commit') committedMessages = extra.reactMessages;
    events.push({
      t: +window.performance.now().toFixed(3), event, previousEffectMessages, committedMessages,
      domRows: document.querySelectorAll('.zhino-assistant-row').length,
      expanded: document.querySelector('.zhino-assistant-ideas-toggle')?.getAttribute('aria-expanded') ?? null,
      chips: document.querySelectorAll('.zhino-assistant-ideas-body .zhino-assistant-chip').length,
      domHasPrice: document.body.textContent.includes('۲۰۰٬۰۰۰ تومان'), ...extra,
    });
    if (event === 'effect.after-schedule') previousEffectMessages = extra.reactMessages;
  };
  const clickIdeas = () => {
    if (clicked) return;
    clicked = true;
    trace('test.price-observed'); trace('test.before-click');
    window.document.querySelector('.zhino-assistant-ideas-toggle').click();
    trace('test.after-click');
  };
  const console = new VirtualConsole();
  console.on('jsdomError', error => { if (!/Not implemented|Could not load|network/i.test(error.message)) errors.push(error.message); });
  console.on('error', () => errors.push('Unexpected browser console.error'));
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/zheno-website/assistant', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
    beforeParse(win) {
      window = win; win.__ideasTrace = trace;
      Object.assign(win, { fetch: async () => { throw new TypeError('offline test'); }, Headers, Request, Response, AbortController, TextEncoder, TextDecoder });
      win.scrollTo = () => {}; win.scrollBy = () => {};
    },
  });
  const observer = new window.MutationObserver(() => {
    trace('DOM.mutation');
    if (immediate && !clicked && window.document.body.textContent.includes('۲۰۰٬۰۰۰ تومان')) clickIdeas();
  });
  observer.observe(window.document.querySelector('#root'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-expanded'] });
  const waitFor = async predicate => {
    const end = Date.now() + 4000;
    while (Date.now() < end) { if (predicate()) return true; await sleep(100); }
    return false;
  };
  const send = async text => {
    const input = window.document.querySelector('#zhino-assistant-input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.ok(await waitFor(() => !window.document.querySelector('button[aria-label="ارسال پیام"]').disabled));
    window.document.querySelector('button[aria-label="ارسال پیام"]').click();
  };
  try {
    window.eval(code);
    assert.ok(await waitFor(() => window.document.querySelector('#zhino-assistant-input')));
    await send('قیمت ژله توت فرنگی چند است؟');
    assert.ok(await waitFor(() => window.document.body.textContent.includes('۲۰۰٬۰۰۰ تومان')), 'Grounded price response missing');
    if (!immediate) clickIdeas();
    assert.ok(await waitFor(recipeChip), 'Recipe chip lost after the post-answer click');
    const price = events.findIndex(e => e.event === 'answer.computed' && e.answerHasPrice);
    const effect = events.findIndex((e, i) => i > price && e.event === 'effect.after-schedule' && e.reactMessages === 3);
    const click = events.findIndex(e => e.event === 'click.handler');
    assert.ok(price >= 0 && effect > price && click > effect, 'Message-collapse must complete BEFORE the post-answer click');
    assert.equal(events[price].recipeSuggested, true, 'Recipe suggestion data is missing');
    assert.equal(events[click].committedMessages, 3);
    assert.equal(events[click].previousEffectMessages, 3);
    assert.ok(events.some((e, i) => i > click && e.expanded === 'true' && e.chips > 0));
    // Flush a later event-loop turn; a delayed collapse must not erase the click.
    await sleep(150);
    assert.ok(recipeChip(), 'A delayed effect closed an explicitly opened ideas row');
    // Unchanged normal behavior: manual toggle still closes/reopens the row.
    window.document.querySelector('.zhino-assistant-ideas-toggle').click();
    assert.ok(await waitFor(() => !window.document.querySelector('.zhino-assistant-ideas-body')));
    window.document.querySelector('.zhino-assistant-ideas-toggle').click();
    assert.ok(await waitFor(recipeChip));
    recipeChip().click();
    assert.ok(await waitFor(() => window.document.body.textContent.includes('۱.۵ لیوان آب')), 'Recipe suggestion no longer works');
    assert.ok(await waitFor(() => !window.document.querySelector('.zhino-assistant-ideas-body')), 'A new message must still collapse suggestions');
    assert.deepEqual(errors, []);
    trace('test.complete');
    process.stdout.write(`PASS: assistant ideas iteration ${iteration} (${immediate ? 'commit-observer click' : 'smoke polling click'}): ordering, stable chips, manual toggle and new-message collapse\n`);
  } finally {
    traces.push({ iteration, mode: immediate ? 'immediate' : 'poll', events });
    mkdirSync('.qa', { recursive: true });
    writeFileSync('.qa/assistant-ideas-trace.json', JSON.stringify(traces, null, 2));
    observer.disconnect(); dom.window.close();
  }
}
console.log('20 instrumented assistant ideas regressions passed. Offline only; no production tracing.');
