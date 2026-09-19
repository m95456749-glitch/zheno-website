/* Zhino — live robot animation engine (concept-A-v3)
 * Organic, non-looping idle / thinking / speaking / greeting behavior.
 * Transform-only updates on a few SVG groups => cheap & smooth.
 * Public API: window.ZhinoRobot = { set(state), wave(), get state }
 *   states: 'idle' | 'thinking' | 'speaking' | 'greeting'
 */
(function () {
  'use strict';

  function init(opts) {
    opts = opts || {};
    var doc = opts.document || document;
    var win = doc.defaultView || window;
    function $(id) { return doc.getElementById(id); }

    var els = {
      head: $('g-head'), antenna: $('g-antenna'), eyes: $('g-eyes'),
      torso: $('g-torso'),
      armL: $('g-upper-l'), foreL: $('g-fore-l'), elbowL: $('g-elbow-l'),
      armR: $('g-upper-r'), foreR: $('g-fore-r'), elbowR: $('g-elbow-r'),
      smile: $('m-smile'), talk: $('m-talk'), grin: $('m-grin'),
      talkGlow: $('m-talk-glow'), talkDots: $('m-talk-dots')
    };
    if (!els.head || !els.eyes) throw new Error('ZhinoRobot: svg rig not found in document');

    /* ---------- per-load random seeds: every session is unique, no visible loop ---------- */
    var R = Math.random;
    var seeds = [];
    for (var i = 0; i < 14; i++) seeds.push(R() * Math.PI * 2);
    function noise(t, i, speed) {
      var s = seeds[i % seeds.length];
      speed = speed || 1;
      return Math.sin(t * 0.90 * speed + s) * 0.55 +
             Math.sin(t * 1.73 * speed + s * 2.7) * 0.30 +
             Math.sin(t * 2.57 * speed + s * 5.1) * 0.15;
    }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
    function lerp(a, b, k) { return a + (b - a) * k; }

    var reduce = 1;
    try {
      if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) reduce = 0.25;
    } catch (e) { /* ignore */ }

    /* ---------- state blending ---------- */
    var STATES = ['idle', 'thinking', 'speaking', 'greeting'];
    var state = 'idle';
    var w = { idle: 1, thinking: 0, speaking: 0, greeting: 0 };
    var target = { idle: 1, thinking: 0, speaking: 0, greeting: 0 };
    var waveT0 = -100, thinkSide = R() < 0.5 ? -1 : 1, speechSeed = R() * 10;

    function setState(s) {
      if (w.hasOwnProperty(s) === false) return;
      if (s === state) { if (s === 'greeting') waveT0 = clock; return; }
      state = s;
      for (var k in target) target[k] = (k === s) ? 1 : 0;
      if (s === 'greeting') waveT0 = clock;
      if (s === 'thinking') thinkSide = R() < 0.5 ? -1 : 1;
      if (s === 'speaking') speechSeed = R() * 10;
    }

    /* ---------- blink scheduler (irregular, occasional double blinks) ---------- */
    var nextBlink = 0.9 + R() * 2.2, blinkStart = -1, blinkDouble = false;
    function blinkScale(t) {
      if (blinkStart < 0) {
        if (t >= nextBlink) { blinkStart = t; blinkDouble = R() < 0.2; }
        else return 1;
      }
      var p = t - blinkStart;
      if (p < 0) return 1;
      var c = 0.085, h = 0.04, o = 0.17;
      if (p < c) return 1 - 0.94 * ease(p / c);
      if (p < c + h) return 0.06;
      if (p < c + h + o) return 0.06 + 0.94 * ease((p - c - h) / o);
      if (blinkDouble) { blinkDouble = false; blinkStart = t + 0.14; return 1; }
      blinkStart = -1;
      nextBlink = t + 1.5 + R() * 4.6;
      return 1;
    }

    /* ---------- saccades (natural eye movement) ---------- */
    var gx = 0, gy = 0, sacFromX = 0, sacFromY = 0, sacToX = 0, sacToY = 0;
    var sacT0 = -1, sacDur = 0.12, nextSaccade = 0.5 + R() * 1.2;
    function pickGaze() {
      var tx, ty;
      if (w.thinking > 0.4) { tx = thinkSide * (3 + R() * 3); ty = -6 - R() * 3; }
      else if (w.speaking > 0.4) { tx = (R() - 0.5) * 7; ty = (R() - 0.5) * 4; }
      else { tx = (R() - 0.5) * 11; ty = (R() - 0.5) * 5; }
      return [tx, ty];
    }
    function stepGaze(t, dt) {
      if (t >= nextSaccade) {
        sacFromX = gx; sacFromY = gy;
        var g = pickGaze(); sacToX = g[0]; sacToY = g[1];
        sacT0 = t; sacDur = 0.09 + R() * 0.09;
        var hold = (w.thinking > 0.4) ? 1.1 : (w.speaking > 0.4 ? 0.55 : 0.75);
        nextSaccade = t + hold * (0.4 + R() * 1.6);
      }
      var k = sacT0 < 0 ? 1 : ease((t - sacT0) / sacDur);
      gx = lerp(sacFromX, sacToX, k) + 0.35 * noise(t, 5, 1.9);
      gy = lerp(sacFromY, sacToY, k) + 0.25 * noise(t, 6, 2.3);
    }

    /* ---------- antenna spring (follows head with lag) ---------- */
    var antA = 0, antV = 0;

    var clock = 0, last = null, raf = 0;

    function step(dt) {
      var t = clock;
      var k, s;
      for (k in w) w[k] += (target[k] - w[k]) * Math.min(1, dt / 0.26);

      /* greeting one-shot envelope: raise -> wave -> lower, then back to idle */
      var wp = (t - waveT0) / 1;
      var raise = 0;
      if (wp >= 0) {
        if (wp < 0.55) raise = ease(wp / 0.55);
        else if (wp < 2.35) raise = 1;
        else if (wp < 3.0) raise = 1 - ease((wp - 2.35) / 0.65);
        else { raise = 0; if (state === 'greeting') setState('idle'); }
      }

      /* speech envelope: syllables + phrase pauses */
      var syl = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 2.7 + speechSeed)), 0.65);
      var gate = clamp(noise(t, 7, 0.5) * 0.9 + 0.62, 0, 1);
      var talkAmp = w.speaking * gate;
      var open = talkAmp * (0.22 + 0.78 * syl);

      /* breathing */
      var brPhase = t * 2 * Math.PI * 0.235 + 0.7 * noise(t, 3, 0.11);
      var br = 1 + reduce * 0.011 * Math.sin(brPhase);
      var torsoTy = reduce * 0.9 * Math.sin(brPhase);
      var torsoRot = reduce * 0.35 * noise(t, 9, 0.17);

      /* head */
      var hr = reduce * (1.05 * noise(t, 0, 0.19)
            + w.thinking * (1.6 * Math.sin(t * 0.7 + seeds[2]) + 1.2 * thinkSide)
            + w.speaking * 1.5 * syl * gate
            + raise * 3.2 * thinkSide * 0.6);
      var hx = reduce * (1.4 * noise(t, 1, 0.15) + w.thinking * 1.2 * thinkSide);
      var hy = reduce * (-1.1 * (br - 1) * 90 + w.thinking * 1.4 + raise * -1.0);

      /* antenna: damped spring driven by head + own micro sway */
      var antTarget = -hr * 1.9 + reduce * (1.5 * noise(t, 4, 0.55)) * (0.55 + w.thinking * 0.9 + raise * 1.1 + w.speaking * 0.5);
      antV += ((antTarget - antA) * 46 - antV * 7.5) * dt;
      antA += antV * dt;

      /* eyes */
      stepGaze(t, dt);
      var bs = blinkScale(t);
      var squint = 1 - 0.16 * raise;

      /* mouth cross-fade */
      var talkOp = clamp(w.speaking * 1.25, 0, 1) * clamp(gate * 2.2, 0, 1);
      var grinOp = clamp(raise * 1.1, 0, 1);
      var smileOp = clamp(1 - talkOp * 0.92 - grinOp * 0.85, 0, 1);
      var mrx = 13 + 8 * open, mry = 3 + 12 * open;

      /* arms */
      var aL = reduce * (0.9 * noise(t, 8, 0.21) + w.speaking * 2.2 * Math.sin(t * 1.9 + 1.2) * gate);
      var fL = reduce * (1.3 * noise(t, 10, 0.29) + w.speaking * 5.5 * Math.sin(t * 2 * Math.PI * 0.85 + 0.4) * gate);
      var aR = reduce * (0.9 * noise(t, 11, 0.23)) - raise * 107;
      var fR = reduce * (1.3 * noise(t, 12, 0.31)) + raise * (-140 + 16 * Math.sin(t * 2 * Math.PI * 1.9 + 0.7));

      /* apply */
      els.torso.setAttribute('transform',
        'translate(0 ' + torsoTy.toFixed(2) + ') rotate(' + torsoRot.toFixed(2) + ' 360 662) ' +
        'translate(360 662) scale(1 ' + br.toFixed(4) + ') translate(-360 -662)');
      els.head.setAttribute('transform',
        'translate(' + hx.toFixed(2) + ' ' + hy.toFixed(2) + ') rotate(' + hr.toFixed(2) + ' 360 400)');
      els.antenna.setAttribute('transform', 'rotate(' + antA.toFixed(2) + ' 136 236)');
      els.eyes.setAttribute('transform',
        'translate(' + gx.toFixed(2) + ' ' + gy.toFixed(2) + ') translate(360 254) scale(1 ' + (bs * squint).toFixed(3) + ') translate(-360 -254)');
      els.armL.setAttribute('transform', 'rotate(' + aL.toFixed(2) + ' 204 472)');
      els.foreL.setAttribute('transform', 'rotate(' + fL.toFixed(2) + ' 185 557)');
      els.elbowL.setAttribute('transform', 'rotate(' + aL.toFixed(2) + ' 204 472) rotate(8 185 557)');
      els.armR.setAttribute('transform', 'rotate(' + aR.toFixed(2) + ' 516 472)');
      els.foreR.setAttribute('transform', 'rotate(' + fR.toFixed(2) + ' 535 557)');
      els.elbowR.setAttribute('transform', 'rotate(' + aR.toFixed(2) + ' 516 472) rotate(-8 535 557)');
      els.smile.setAttribute('opacity', smileOp.toFixed(3));
      els.talk.setAttribute('opacity', talkOp.toFixed(3));
      els.grin.setAttribute('opacity', grinOp.toFixed(3));
      els.talkGlow.setAttribute('rx', mrx.toFixed(2)); els.talkGlow.setAttribute('ry', mry.toFixed(2));
      els.talkDots.setAttribute('rx', mrx.toFixed(2)); els.talkDots.setAttribute('ry', mry.toFixed(2));
    }

    function frame(ts) {
      raf = win.requestAnimationFrame(frame);
      if (last === null) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      clock += dt;
      step(dt);
    }

    function start() {
      if (opts.manual) return;
      if (raf) return;
      last = null;
      raf = win.requestAnimationFrame(frame);
    }
    function stop() { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }

    if (!opts.manual) {
      doc.addEventListener('visibilitychange', function () {
        if (doc.hidden) stop(); else start();
      });
      start();
    }

    var api = {
      set: setState,
      wave: function () { setState('greeting'); },
      get state() { return state; },
      /* test hooks */
      pump: function (tsMs) {
        if (last === null) last = tsMs;
        var dt = Math.min(0.05, (tsMs - last) / 1000);
        last = tsMs; clock += dt; step(dt);
      },
      reset: function () { clock = 0; last = null; }
    };
    win.ZhinoRobot = api;
    return api;
  }

  if (typeof window !== 'undefined') {
    window.ZhinoRobotInit = init;
    /* auto-init when the rig is already in the DOM */
    if (document.getElementById('g-head')) {
      try { window.ZhinoRobotInit(); } catch (e) { /* page wires it after fetch */ }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = init;
})();
