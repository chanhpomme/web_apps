/* Retro LCD basketball scoreboard — no dependencies, no build step. */
(() => {
  'use strict';

  /* ── seven-segment rendering ───────────────────────────── */

  const SEGMENTS = {
    '0': 'abcdef', '1': 'bc',     '2': 'abdeg',  '3': 'abcdg',  '4': 'bcfg',
    '5': 'acdfg',  '6': 'acdefg', '7': 'abc',    '8': 'abcdefg','9': 'abcdfg',
    '-': 'g',      ' ': ''
  };
  const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  /** A row of 7-segment digits + separators, rebuilt only when the layout changes. */
  class SegDisplay {
    constructor(el) {
      this.el = el;
      this.shape = null;   // e.g. "##:##" — DOM layout signature
      this.cells = [];     // per-character element (digit or separator)
    }

    render(text) {
      const shape = text.replace(/[0-9\- ]/g, '#');
      if (shape !== this.shape) this.build(shape);
      let i = 0;
      for (const ch of text) {
        const cell = this.cells[i++];
        if (cell.dataset.kind === 'digit') {
          const lit = SEGMENTS[ch] ?? '';
          SEG_NAMES.forEach((s, k) => cell.children[k].classList.toggle('on', lit.includes(s)));
        }
      }
    }

    build(shape) {
      this.el.textContent = '';
      this.cells = [...shape].map(ch => {
        const cell = document.createElement('span');
        if (ch === '#') {
          cell.className = 'digit';
          cell.dataset.kind = 'digit';
          for (const s of SEG_NAMES) {
            const seg = document.createElement('i');
            seg.className = `seg seg-${s}`;
            cell.appendChild(seg);
          }
        } else {
          cell.className = ch === ':' ? 'sep sep-colon' : 'sep sep-dot';
          cell.dataset.kind = 'sep';
          cell.appendChild(document.createElement('i'));
          cell.appendChild(document.createElement('i'));
        }
        this.el.appendChild(cell);
        return cell;
      });
      this.shape = shape;
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
  const DEFAULTS = { durationSec: 600, colorA: 'red', colorB: 'black', target: 0, sound: true };
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
      s.durationSec = clamp(Math.round(+s.durationSec || 0), 1, MAX_SEC);
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
  const durMin      = $('#durMin');
  const durSec      = $('#durSec');
  const targetInput = $('#targetCustom');

  const clockDisp = new SegDisplay(clockEl);
  const scoreDisp = { a: new SegDisplay($('#scoreA')), b: new SegDisplay($('#scoreB')) };
  const teamEl    = { a: $('#teamA'), b: $('#teamB') };

  /* ── game state ────────────────────────────────────────── */

  const G = {
    durationMs: 0,
    remainingMs: 0,
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
    settings.durationSec = clamp(m * 60 + s, 1, MAX_SEC);
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
    G.target = settings.target;
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
    if (ms < 60000) {                       // last minute: seconds + tenths
      const tenths = Math.ceil(ms / 100);
      return `${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
    }
    const secs = Math.ceil(ms / 1000);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  function render() {
    const text = formatClock(G.remainingMs);
    if (text !== G.shownClock) {
      clockDisp.render(text);
      G.shownClock = text;
    }
    for (const side of ['a', 'b']) {
      const text = String(G.score[side]).padStart(2, '0');
      scoreDisp[side].el.classList.toggle('wide', text.length > 2);
      scoreDisp[side].render(text);
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
    G.remainingMs = Math.max(0, G.remainingMs - dt);
    render();
    if (G.remainingMs === 0) {
      finish('TIME');
      return;
    }
    G.raf = requestAnimationFrame(loop);
  }

  function start() {
    if (G.running || G.over) return;
    if (G.remainingMs <= 0) return;
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
    setStatus(reason === 'TIME' ? 'TIME UP' : 'TARGET', true);
    buzz(reason === 'TIME' ? 2 : 1);
    render();
  }

  function resetGame() {
    cancelAnimationFrame(G.raf);
    G.running = false;
    G.over = false;
    G.overReason = null;
    G.remainingMs = G.durationMs;
    G.score.a = 0;
    G.score.b = 0;
    G.shownClock = null;
    keepAwake(false);
    setStatus(G.target ? `READY · TARGET ${G.target}` : 'READY');
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
      setStatus(G.remainingMs === G.durationMs ? 'READY' : 'PAUSED');
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
    if (G.score.a || G.score.b || G.remainingMs !== G.durationMs) {
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
  G.remainingMs = G.durationMs;
  G.target = settings.target;
})();
