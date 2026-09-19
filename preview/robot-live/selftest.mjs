/* Headless self-test for the Zhino live robot rig (jsdom, no browser needed).
 * Run: node selftest.mjs   (from this folder, needs `npm i jsdom` nearby)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  const tools = path.join(process.env.HOME || '/home/user', '.svgrender');
  ({ JSDOM } = require(path.join(tools, 'node_modules', 'jsdom')));
}

const svg = fs.readFileSync(path.join(here, 'robot.svg'), 'utf8');
const js = fs.readFileSync(path.join(here, 'robot.js'), 'utf8');

const dom = new JSDOM(`<!doctype html><body><div id="stage">${svg}</div></body>`, {
  runScripts: 'outside-only',
  pretendToBeVisual: false,
});
const win = dom.window;
win.matchMedia = win.matchMedia || (() => ({ matches: false }));

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

win.eval(js);
const api = win.ZhinoRobotInit({ manual: true, document: win.document });
check('engine init + API exposed', !!api && typeof api.set === 'function' && win.ZhinoRobot === api);

const $ = (id) => win.document.getElementById(id);
const frames = [];
let ts = 0;
function pump(n, cb) {
  for (let i = 0; i < n; i++) {
    ts += 16.7;
    api.pump(ts);
    if (cb) cb(i);
    frames.push({
      head: $('g-head').getAttribute('transform'),
      eyes: $('g-eyes').getAttribute('transform'),
      torso: $('g-torso').getAttribute('transform'),
      foreR: $('g-fore-r').getAttribute('transform'),
      foreL: $('g-fore-l').getAttribute('transform'),
      antenna: $('g-antenna').getAttribute('transform'),
      talk: parseFloat($('m-talk').getAttribute('opacity')),
      grin: parseFloat($('m-grin').getAttribute('opacity')),
      smile: parseFloat($('m-smile').getAttribute('opacity')),
    });
  }
}

/* idle: breathing + micro motion + at least one blink in ~14s */
let minBlink = 1;
pump(840, () => {
  const m = /scale\(1 ([0-9.]+)\)/.exec($('g-eyes').getAttribute('transform') || '');
  if (m) minBlink = Math.min(minBlink, parseFloat(m[1]));
});
const uniq = new Set(frames.map(f => f.head)).size;
check('idle: head transform animates (non-static)', uniq > 50);
check('idle: torso breathing animates', new Set(frames.map(f => f.torso)).size > 50);
check('idle: antenna moves', new Set(frames.map(f => f.antenna)).size > 50);
check('idle: blink happened (eye scaleY < 0.5)', minBlink < 0.5);
check('idle: smile visible, talk/grin hidden', frames[800].smile > 0.9 && frames[800].talk < 0.05 && frames[800].grin < 0.05);

/* thinking: gaze goes up */
api.set('thinking');
pump(240);
let gyMin = 0;
for (let i = frames.length - 240; i < frames.length; i++) {
  const m = /translate\((-?[0-9.]+) (-?[0-9.]+)\)/.exec(frames[i].eyes);
  if (m) gyMin = Math.min(gyMin, parseFloat(m[2]));
}
check('thinking: eyes look upward', gyMin < -4);

/* speaking: talk mouth opens & closes, smile fades */
api.set('speaking');
let talkMax = 0, talkMin = 1, smileMin = 1, foreLMove = new Set();
pump(420, () => {
  talkMax = Math.max(talkMax, parseFloat($('m-talk').getAttribute('opacity')));
  talkMin = Math.min(talkMin, parseFloat($('m-talk').getAttribute('opacity')));
  smileMin = Math.min(smileMin, parseFloat($('m-smile').getAttribute('opacity')));
  foreLMove.add($('g-fore-l').getAttribute('transform'));
  const ry = parseFloat($('m-talk-dots').getAttribute('ry'));
  talkMax = Math.max(talkMax, 0); // opacity tracked above
  if (!(ry >= 0)) throw new Error('bad mouth ry');
});
check('speaking: talk mouth appears', talkMax > 0.5);
check('speaking: mouth modulates (open/close)', talkMax - talkMin > 0.2);
check('speaking: smile fades while talking', smileMin < 0.5);
check('speaking: hand gesture moves', foreLMove.size > 100);

/* greeting: wave raise (foreR big negative rotation) + grin */
api.set('greeting');
let waveMin = 0, grinMax = 0;
pump(260, () => {
  const m = /rotate\((-?[0-9.]+)/.exec($('g-fore-r').getAttribute('transform') || '');
  if (m) waveMin = Math.min(waveMin, parseFloat(m[1]));
  grinMax = Math.max(grinMax, parseFloat($('m-grin').getAttribute('opacity')));
});
check('greeting: forearm raises into wave (rotate < -60°)', waveMin < -60);
check('greeting: grin appears', grinMax > 0.6);
pump(200);
check('greeting: auto-returns to idle', api.state === 'idle');

/* no NaN in any transform */
const all = ['g-head', 'g-antenna', 'g-eyes', 'g-torso', 'g-upper-l', 'g-fore-l', 'g-upper-r', 'g-fore-r', 'g-elbow-l', 'g-elbow-r'];
const nan = all.some(id => /NaN|undefined/.test($(id).getAttribute('transform') || ''));
check('no NaN/undefined in transforms', !nan);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
