/* Retro LCD basketball scoreboard — no dependencies, no build step. */
(() => {
  'use strict';

  /* ── dot-matrix rendering ──────────────────────────────── */

  // 5x7 bulb font; separators are one column wide.
  const GLYPHS = {
    '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    ':': ['0', '0', '1', '0', '1', '0', '0'],
    '.': ['0', '0', '0', '0', '0', '0', '1']
  };

  const ROWS = 7;
  const isSep = ch => ch === ':' || ch === '.';

  // Character metrics as multiples of --ds, mirroring the CSS bulb grid.
  const CHAR_W = 0.6286;   // 5 bulbs + 4 gaps
  const SEP_W  = 0.1069;   // 1 bulb
  const CHAR_H = 0.8894;   // 7 bulbs + 6 gaps
  const KERN   = 0.12;     // gap between characters

  /** A row of dot-matrix characters, rebuilt only when the layout changes. */
  class DotDisplay {
    /**
     * @param refUnits width, in --ds units, to size the bulbs against instead
     *   of the current text — the clock passes its widest shape so the bulbs
     *   stay put when MM:SS becomes SS.T.
     */
    constructor(el, refUnits = 0, fitToHeight = false) {
      this.el = el;
      this.refUnits = refUnits;
      this.fitToHeight = fitToHeight;
      this.shape = null;   // e.g. "##:##" — DOM layout signature
      this.cells = [];     // one element per character
    }

    render(text) {
      const shape = [...text].map(ch => (isSep(ch) ? ch : '#')).join('');
      if (shape !== this.shape) this.build(shape);
      [...text].forEach((ch, i) => {
        const bulbs = this.cells[i].children;
        let k = 0;
        for (const row of GLYPHS[ch] ?? GLYPHS[' ']) {
          for (const bit of row) bulbs[k++].classList.toggle('on', bit === '1');
        }
      });
    }

    build(shape) {
      this.el.textContent = '';
      this.cells = [...shape].map(ch => {
        const wide = ch === '#';
        const cell = document.createElement('span');
        cell.className = wide ? 'char' : 'char char-sep';
        for (let k = (wide ? 5 : 1) * ROWS; k > 0; k--) {
          cell.appendChild(document.createElement('i'));
        }
        this.el.appendChild(cell);
        return cell;
      });
      this.shape = shape;
      this.widthUnits = this.refUnits
        || [...shape].reduce((w, ch) => w + (ch === '#' ? CHAR_W : SEP_W), 0)
           + KERN * (shape.length - 1);
      this.fit();
    }

    /**
     * Size the bulbs to the panel it sits in, so the text always keeps the
     * panel's padding clear. The CSS font-size carries the height cap — it
     * resolves vw/vh units for us, which a custom property would not.
     *
     * Only panels whose height comes from the layout (the scores, which flex
     * to fill) measure their own height; the clock's height comes from its
     * content, so measuring it would feed back into itself.
     */
    fit() {
      const style = getComputedStyle(this.el);
      const inner = this.el.clientWidth
                  - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (!(inner > 0) || !this.widthUnits) return;

      let cap = parseFloat(style.fontSize) || inner;
      if (this.fitToHeight) {
        const room = this.el.clientHeight
                   - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        if (room > 0) cap = Math.min(cap, room);
      }
      const ds = Math.min(inner / this.widthUnits, cap / CHAR_H);
      const px = `${Math.floor(ds * 100) / 100}px`;
      if (px !== this.appliedDs) {
        this.el.style.setProperty('--ds', px);
        this.appliedDs = px;
      }
    }
  }

  /* ── config ────────────────────────────────────────────── */

  // `edge` keeps the point-pad borders visible for the very dark / very light kits.
  const COLORS = {
    red:   { label: 'RED',   css: 'var(--c-red)',   ink: '#fff',    edge: '#e8474d' },
    green: { label: 'GREEN', css: 'var(--c-green)', ink: '#fff',    edge: '#6ec03f' },
    black: { label: 'BLACK', css: 'var(--c-black)', ink: '#e8e8e8', edge: '#5b636d' },
    white: { label: 'WHITE', css: 'var(--c-white)', ink: '#111',    edge: '#d8dade' }
  };

  const STORE_KEY = 'scoreboard.settings.v1';
  // durationSec 0 means no period clock — the clock counts up and only the
  // target score ends the game.
  const DEFAULTS = { durationSec: 0, colorA: 'red', colorB: 'black', target: 7, sound: true };
  const MAX_SEC = 99 * 60 + 59;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const $ = sel => document.querySelector(sel);

  const settings = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      const s = { ...DEFAULTS, ...raw };
      if (!COLORS[s.colorA]) s.colorA = DEFAULTS.colorA;
      if (!COLORS[s.colorB]) s.colorB = DEFAULTS.colorB;
      s.durationSec = clamp(Math.round(+s.durationSec || 0), 0, MAX_SEC);
      s.target = clamp(Math.round(+s.target || 0), 0, 199);
      s.sound = s.sound !== false;
      return s;
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }

  /* ── elements ──────────────────────────────────────────── */

  const setupScreen = $('#setup');
  const gameScreen  = $('#game');
  const board       = $('.board');
  const clockEl     = $('#clock');
  const statusEl    = $('#status');
  const toggleBtn   = $('#toggle');
  const soundBtn    = $('#soundBtn');
  const targetBadge = $('#targetBadge');
  const targetValue = $('#targetValue');
  const durMin      = $('#durMin');
  const durSec      = $('#durSec');
  const targetInput = $('#targetCustom');

  const CLOCK_UNITS = 4 * CHAR_W + SEP_W + 4 * KERN;   // widest shape: "88:88"
  const clockDisp = new DotDisplay(clockEl, CLOCK_UNITS);
  const scoreDisp = {
    a: new DotDisplay($('#scoreA'), 0, true),
    b: new DotDisplay($('#scoreB'), 0, true)
  };
  const teamEl    = { a: $('#teamA'), b: $('#teamB') };

  const displays = [clockDisp, scoreDisp.a, scoreDisp.b];
  const fitAll = () => displays.forEach(d => d.fit());

  if ('ResizeObserver' in window) {
    // fit() is idempotent, so the resize it may cause settles on the next pass
    const ro = new ResizeObserver(fitAll);
    displays.forEach(d => ro.observe(d.el));
  }
  addEventListener('resize', fitAll);
  addEventListener('orientationchange', fitAll);

  /* ── game state ────────────────────────────────────────── */

  const MAX_CLOCK_MS = MAX_SEC * 1000;

  const G = {
    durationMs: 0,
    countUp: false,     // no period set: the clock counts up from zero
    clockMs: 0,         // time left, or time elapsed when counting up
    running: false,
    over: false,
    overReason: null,
    target: 0,
    score: { a: 0, b: 0 },
    last: 0,
    raf: 0,
    shownClock: null
  };

  /* ── setup screen wiring ───────────────────────────────── */

  function paintSetup() {
    const total = settings.durationSec;
    document.querySelectorAll('#durationChips .chip').forEach(c => {
      c.setAttribute('aria-pressed', String(+c.dataset.sec === total));
    });
    durMin.value = Math.floor(total / 60);
    durSec.value = total % 60;

    document.querySelectorAll('.swatches').forEach(group => {
      const picked = group.dataset.team === 'a' ? settings.colorA : settings.colorB;
      group.querySelectorAll('.sw').forEach(sw => {
        sw.setAttribute('aria-pressed', String(sw.dataset.color === picked));
      });
    });

    document.querySelectorAll('#targetChips .chip').forEach(c => {
      c.setAttribute('aria-pressed', String(+c.dataset.target === settings.target));
    });
    targetInput.value = settings.target || '';
  }

  $('#durationChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    settings.durationSec = +chip.dataset.sec;
    save();
    paintSetup();
  });

  function readCustomDuration() {
    const m = clamp(Math.floor(+durMin.value || 0), 0, 99);
    const s = clamp(Math.floor(+durSec.value || 0), 0, 59);
    settings.durationSec = clamp(m * 60 + s, 0, MAX_SEC);
    save();
    document.querySelectorAll('#durationChips .chip').forEach(c => {
      c.setAttribute('aria-pressed', String(+c.dataset.sec === settings.durationSec));
    });
  }
  durMin.addEventListener('input', readCustomDuration);
  durSec.addEventListener('input', readCustomDuration);
  durMin.addEventListener('blur', paintSetup);
  durSec.addEventListener('blur', paintSetup);

  document.querySelectorAll('.swatches').forEach(group => {
    group.addEventListener('click', e => {
      const sw = e.target.closest('.sw');
      if (!sw) return;
      const side = group.dataset.team;
      const other = side === 'a' ? 'colorB' : 'colorA';
      const mine  = side === 'a' ? 'colorA' : 'colorB';
      const picked = sw.dataset.color;
      // Taking the other team's color swaps them, so the two are never identical.
      if (settings[other] === picked) settings[other] = settings[mine];
      settings[mine] = picked;
      save();
      paintSetup();
    });
  });

  $('#targetChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    settings.target = +chip.dataset.target;
    save();
    paintSetup();
  });

  targetInput.addEventListener('input', () => {
    settings.target = clamp(Math.floor(+targetInput.value || 0), 0, 199);
    save();
    document.querySelectorAll('#targetChips .chip').forEach(c => {
      c.setAttribute('aria-pressed', String(+c.dataset.target === settings.target));
    });
  });
  targetInput.addEventListener('blur', paintSetup);

  $('#startGame').addEventListener('click', startGame);

  /* ── screens ───────────────────────────────────────────── */

  function startGame() {
    G.durationMs = settings.durationSec * 1000;
    G.countUp = G.durationMs === 0;
    G.target = settings.target;
    targetBadge.hidden = !G.target;
    targetValue.textContent = G.target || '';
    resetGame();
    applyColors();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    render();
  }

  function backToSetup() {
    pause();
    gameScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    paintSetup();
  }

  function applyColors() {
    for (const side of ['a', 'b']) {
      const c = COLORS[side === 'a' ? settings.colorA : settings.colorB];
      const el = teamEl[side];
      el.style.setProperty('--team', c.css);
      el.style.setProperty('--team-ink', c.ink);
      el.style.setProperty('--team-edge', c.edge);
      el.querySelector('.name').textContent = c.label;
    }
  }

  /* ── clock ─────────────────────────────────────────────── */

  function formatClock(ms) {
    if (!G.countUp && ms < 60000) {          // last minute: seconds + tenths
      const tenths = Math.ceil(ms / 100);
      return `${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
    }
    const secs = G.countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  /** Where the clock sits before anyone touches it. */
  const clockStart = () => (G.countUp ? 0 : G.durationMs);

  function render() {
    const text = formatClock(G.clockMs);
    if (text !== G.shownClock) {
      clockDisp.render(text);
      G.shownClock = text;
    }
    for (const side of ['a', 'b']) {
      scoreDisp[side].render(String(G.score[side]).padStart(2, '0'));
    }
    toggleBtn.textContent = G.running ? 'PAUSE' : G.over ? 'RESET' : 'START';
    toggleBtn.dataset.state = G.running ? 'run' : 'idle';
    board.classList.toggle('over', G.over);
  }

  function setStatus(text, alert = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('alert', alert);
  }

  function loop() {
    const now = performance.now();
    const dt = now - G.last;
    G.last = now;
    if (G.countUp) {
      G.clockMs = Math.min(MAX_CLOCK_MS, G.clockMs + dt);
      render();
    } else {
      G.clockMs = Math.max(0, G.clockMs - dt);
      render();
      if (G.clockMs === 0) {
        finish('TIME');
        return;
      }
    }
    G.raf = requestAnimationFrame(loop);
  }

  function start() {
    if (G.running || G.over) return;
    if (!G.countUp && G.clockMs <= 0) return;
    G.running = true;
    G.last = performance.now();
    G.raf = requestAnimationFrame(loop);
    // iOS only lets audio start from a gesture — open the context on this tap
    // so the end-of-period buzzer can actually sound later.
    if (settings.sound) { try { ctx(); } catch { /* no audio */ } }
    setStatus('RUNNING');
    keepAwake(true);
    render();
  }

  function pause() {
    if (!G.running) return;
    cancelAnimationFrame(G.raf);
    G.running = false;
    setStatus('PAUSED');
    keepAwake(false);
    render();
  }

  function toggleRun() {
    if (G.over) { resetGame(); render(); return; }
    G.running ? pause() : start();
  }

  function finish(reason) {
    cancelAnimationFrame(G.raf);
    G.running = false;
    G.over = true;
    G.overReason = reason;
    keepAwake(false);
    targetBadge.classList.toggle('hit', reason === 'TARGET');
    setStatus(reason === 'TIME' ? 'TIME UP' : 'FINAL', true);
    buzz(reason === 'TIME' ? 2 : 1);
    render();
  }

  function resetGame() {
    cancelAnimationFrame(G.raf);
    G.running = false;
    G.over = false;
    G.overReason = null;
    G.clockMs = clockStart();
    G.score.a = 0;
    G.score.b = 0;
    G.shownClock = null;
    keepAwake(false);
    targetBadge.classList.remove('hit');
    setStatus('READY');
  }

  /* ── scoring ───────────────────────────────────────────── */

  board.addEventListener('click', e => {
    const btn = e.target.closest('.pt');
    if (!btn) return;
    const side = btn.dataset.team;
    const next = clamp(G.score[side] + +btn.dataset.delta, 0, 199);
    if (next === G.score[side]) return;
    G.score[side] = next;
    tap();

    // A correction that drops a team back under the target un-ends the game.
    if (G.over && G.overReason === 'TARGET' && !targetReached()) {
      G.over = false;
      G.overReason = null;
      targetBadge.classList.remove('hit');
      setStatus(G.clockMs === clockStart() ? 'READY' : 'PAUSED');
    }
    render();
    if (!G.over && targetReached()) finish('TARGET');
  });

  const targetReached = () =>
    G.target > 0 && (G.score.a >= G.target || G.score.b >= G.target);

  /* ── buttons ───────────────────────────────────────────── */

  clockEl.addEventListener('click', toggleRun);
  toggleBtn.addEventListener('click', toggleRun);

  $('#resetBtn').addEventListener('click', () => {
    if (G.score.a || G.score.b || G.clockMs !== clockStart()) {
      if (!confirm('Reset clock and scores?')) return;
    }
    resetGame();
    render();
  });

  $('#setupBtn').addEventListener('click', backToSetup);

  soundBtn.addEventListener('click', () => {
    settings.sound = !settings.sound;
    soundBtn.setAttribute('aria-pressed', String(settings.sound));
    save();
    if (settings.sound) tap();
  });

  document.addEventListener('keydown', e => {
    if (!setupScreen.classList.contains('hidden')) return;
    if (e.target.closest('button')) return;   // let the focused button handle it
    if (e.code === 'Space') { e.preventDefault(); toggleRun(); }
  });

  /* ── sound ─────────────────────────────────────────────── */

  let audio = null;

  function ctx() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function beep({ freq, dur, type = 'square', gain = .18, at = 0 }) {
    const ac = ctx();
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + .01);
    amp.gain.setValueAtTime(gain, t0 + dur - .04);
    amp.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + .02);
  }

  function tap() {
    if (!settings.sound) return;
    try { beep({ freq: 880, dur: .05, type: 'triangle', gain: .1 }); } catch { /* no audio */ }
  }

  /** Buzzer: 1 blast for target reached, 2 for time up. */
  function buzz(blasts) {
    if (!settings.sound) return;
    try {
      for (let i = 0; i < blasts; i++) {
        beep({ freq: 220, dur: .55, gain: .22, at: i * .7 });
        beep({ freq: 165, dur: .55, gain: .18, at: i * .7 });
      }
    } catch { /* no audio */ }
  }

  /* ── keep the screen on while the clock runs ────────────── */

  let wakeLock = null;

  async function keepAwake(on) {
    try {
      if (on) {
        if (!('wakeLock' in navigator) || wakeLock) return;
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { wakeLock = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && G.running) keepAwake(true);
  });

  /* ── boot ──────────────────────────────────────────────── */

  soundBtn.setAttribute('aria-pressed', String(settings.sound));
  paintSetup();
  G.durationMs = settings.durationSec * 1000;
  G.countUp = G.durationMs === 0;
  G.clockMs = clockStart();
  G.target = settings.target;
})();
