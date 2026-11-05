'use strict';

const $ = (s) => document.querySelector(s);
const STORE_KEY = 'halo.v1';
const DEFAULTS = {
  theme: 'aurora',
  mode: 'auto',
  goals: { focus: 60, tasks: 3, breath: 5 },
  tasks: [],
  days: {},
  celebrated: null,
  pattern: 'box',
  timer: { duration: 1500, endAt: null, remaining: 1500 },
};
const THEME_LABELS = ['aurora', 'ember', 'lagoon', 'orchid'];
const PATTERNS = {
  box: [['שאיפה', 4, 1], ['החזקה', 4, 1], ['נשיפה', 4, 0.58], ['החזקה', 4, 0.58]],
  relax: [['שאיפה', 4, 1], ['החזקה', 7, 1], ['נשיפה', 8, 0.58]],
  coherent: [['שאיפה', 5.5, 1], ['נשיפה', 5.5, 0.58]],
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const prefersDark = matchMedia('(prefers-color-scheme: dark)');

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) return { ...DEFAULTS, ...saved, goals: { ...DEFAULTS.goals, ...saved.goals }, timer: { ...DEFAULTS.timer, ...saved.timer } };
  } catch { /* private mode or corrupt data: start fresh */ }
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
let state = load();

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const emptyDay = () => ({ focus: 0, tasks: 0, breath: 0 });
const today = () => (state.days[dayKey()] ||= emptyDay());
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const fmt = (secs) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pad = (secs) => fmt(secs).padStart(5, '0');
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

function progress(d) {
  const { goals } = state;
  return {
    focus: clamp01(d.focus / goals.focus),
    tasks: clamp01(d.tasks / goals.tasks),
    breath: clamp01(d.breath / 60 / goals.breath),
  };
}
const average = (p) => (p.focus + p.tasks + p.breath) / 3;

/* Appearance */
function applyAppearance() {
  const root = document.documentElement;
  const mode = state.mode === 'auto' ? (prefersDark.matches ? 'dark' : 'light') : state.mode;
  root.dataset.mode = mode;
  root.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').content = mode === 'dark' ? '#05060d' : '#f1f0f8';
  document.querySelectorAll('[data-theme-id]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.themeId === state.theme));
  document.querySelectorAll('[data-mode-id]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modeId === state.mode));
}

/* Today */
function setRing(el, value) {
  el.style.strokeDasharray = `${value * 100} 100`;
  el.style.opacity = value > 0 ? 1 : 0;
}

function renderHeader() {
  const now = new Date();
  const h = now.getHours();
  const greeting = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  $('#greeting').textContent = greeting;
  $('#date').textContent = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

function coachLine(d, p) {
  const { goals } = state;
  if (p.focus >= 1 && p.tasks >= 1 && p.breath >= 1) return 'כל הטבעות נסגרו. יום מושלם.';
  if (d.focus === 0 && d.tasks === 0 && d.breath === 0) return 'שלוש טבעות, יום אחד. מתחילים?';
  const left = [
    [1 - p.focus, `עוד ${goals.focus - d.focus} דק׳ מיקוד לסגירת הטבעת`],
    [1 - p.tasks, goals.tasks - d.tasks === 1 ? 'עוד משימה אחת לסגירת הטבעת' : `עוד ${goals.tasks - d.tasks} משימות לסגירת הטבעת`],
    [1 - p.breath, `עוד ${Math.ceil(goals.breath - d.breath / 60)} דק׳ נשימה לסגירת הטבעת`],
  ].filter(([gap]) => gap > 0).sort((a, b) => a[0] - b[0]);
  return left[0][1];
}

function streak() {
  let count = 0;
  const closedAny = (d) => {
    if (!d) return false;
    const p = progress(d);
    return p.focus >= 1 || p.tasks >= 1 || p.breath >= 1;
  };
  const cursor = new Date();
  if (!closedAny(state.days[dayKey(cursor)])) cursor.setDate(cursor.getDate() - 1);
  while (closedAny(state.days[dayKey(cursor)])) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function renderWeek() {
  const list = $('#week');
  list.replaceChildren();
  const svgNS = 'http://www.w3.org/2000/svg';
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const value = average(progress(state.days[dayKey(date)] || emptyDay()));
    const li = document.createElement('li');
    if (i === 0) li.className = 'is-today';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    const circle = (cls) => {
      const c = document.createElementNS(svgNS, 'circle');
      for (const [k, v] of Object.entries({ cx: 20, cy: 20, r: 15, fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', transform: 'rotate(-90 20 20)' })) c.setAttribute(k, v);
      c.setAttribute('class', cls);
      return c;
    };
    const fill = circle('');
    fill.setAttribute('pathLength', 100);
    fill.setAttribute('stroke', 'url(#g1)');
    fill.setAttribute('stroke-dasharray', `${value * 100} 100`);
    if (value === 0) fill.setAttribute('opacity', 0);
    svg.append(circle('track'), fill);
    const label = document.createElement('span');
    label.textContent = `${'אבגדהוש'[date.getDay()]}׳`;
    li.append(svg, label);
    list.append(li);
  }
  const s = streak();
  $('#streak').textContent = s ? `רצף: ${plural(s, 'יום אחד', 'ימים')}` : 'רצף חדש מחכה';
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const DEL_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function renderTasks() {
  const list = $('#tasks');
  list.replaceChildren();
  for (const task of state.tasks) {
    const li = document.createElement('li');
    if (task.done) li.className = 'done';
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'check';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', task.done);
    check.setAttribute('aria-label', task.text);
    check.innerHTML = `<i>${CHECK_ICON}</i>`;
    check.addEventListener('click', () => toggleTask(task.id));
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = task.text;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.setAttribute('aria-label', `מחיקת ${task.text}`);
    del.innerHTML = DEL_ICON;
    del.addEventListener('click', () => deleteTask(task.id));
    li.append(check, text, del);
    list.append(li);
  }
  const open = state.tasks.filter((t) => !t.done).length;
  $('#tasksEmpty').hidden = state.tasks.length > 0;
  $('#taskCount').textContent = state.tasks.length ? (open ? `${open} פתוחות` : 'הכול בוצע') : '';
}

function renderToday() {
  const d = today();
  const p = progress(d);
  setRing($('#ring-focus'), p.focus);
  setRing($('#ring-tasks'), p.tasks);
  setRing($('#ring-breath'), p.breath);
  $('#total').textContent = `${Math.round(average(p) * 100)}%`;
  $('#val-focus').textContent = `${d.focus}/${state.goals.focus}`;
  $('#val-tasks').textContent = `${d.tasks}/${state.goals.tasks}`;
  $('#val-breath').textContent = `${Math.floor(d.breath / 60)}/${state.goals.breath}`;
  $('#coach').textContent = coachLine(d, p);
  renderHeader();
  renderWeek();
  if (average(p) >= 1 && state.celebrated !== dayKey()) {
    state.celebrated = dayKey();
    save();
    celebrate();
  }
}

function addTask(text) {
  state.tasks.push({ id: crypto.randomUUID(), text, done: false, doneOn: null });
  commit();
}
function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  const d = today();
  if (task.done) {
    task.doneOn = dayKey();
    d.tasks++;
  } else {
    if (task.doneOn === dayKey()) d.tasks = Math.max(0, d.tasks - 1);
    task.doneOn = null;
  }
  commit();
}
function deleteTask(id) {
  // A finished task stays counted for the day it was finished.
  state.tasks = state.tasks.filter((t) => t.id !== id);
  commit();
}
function commit() {
  save();
  renderTasks();
  renderToday();
}
// Finished tasks from earlier days clear out when a new day starts.
function rollover() {
  const key = dayKey();
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => !t.done || t.doneOn === key);
  if (state.tasks.length !== before) save();
}

/* Focus timer */
let audio = null;
function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!audio && Ctx) audio = new Ctx();
  if (audio && audio.state === 'suspended') audio.resume();
}
function chime() {
  if (navigator.vibrate) navigator.vibrate([60, 60, 120]);
  if (!audio) return;
  [659.25, 880, 1318.5].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime + i * 0.16;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 1.2);
  });
}
const timerRemaining = () => {
  const t = state.timer;
  return t.endAt ? (t.endAt - Date.now()) / 1000 : t.remaining;
};
function renderTimer() {
  const t = state.timer;
  const left = Math.max(0, timerRemaining());
  const running = Boolean(t.endAt);
  $('#timerText').textContent = pad(left);
  setRing($('#timerRing'), clamp01(left / t.duration));
  const started = left < t.duration;
  $('#timerToggle').textContent = running ? 'השהיה' : started ? 'המשך' : 'התחלה';
  if (running) $('#timerStatus').textContent = 'במיקוד';
  else if (started) $('#timerStatus').textContent = 'מושהה';
  else if ($('#timerStatus').textContent !== 'הסשן הושלם') $('#timerStatus').textContent = 'מוכנים?';
  document.title = running ? `${pad(left)} · Halo` : 'Halo';
  document.querySelectorAll('#presets button').forEach((b) => {
    b.setAttribute('aria-pressed', Number(b.dataset.min) * 60 === t.duration);
    b.disabled = running || started;
  });
}
function logFocus(minutes) {
  if (minutes > 0) today().focus += minutes;
}
function tickTimer() {
  const t = state.timer;
  if (t.endAt && Date.now() >= t.endAt) {
    logFocus(Math.round(t.duration / 60));
    t.endAt = null;
    t.remaining = t.duration;
    save();
    renderTimer();
    $('#timerStatus').textContent = 'הסשן הושלם';
    renderToday();
    chime();
    celebrate();
    return;
  }
  if (t.endAt) renderTimer();
}
function toggleTimer() {
  unlockAudio();
  const t = state.timer;
  if (t.endAt) {
    t.remaining = timerRemaining();
    t.endAt = null;
  } else {
    t.endAt = Date.now() + t.remaining * 1000;
  }
  save();
  renderTimer();
}
function resetTimer() {
  const t = state.timer;
  logFocus(Math.floor((t.duration - timerRemaining()) / 60));
  t.endAt = null;
  t.remaining = t.duration;
  $('#timerStatus').textContent = 'מוכנים?';
  save();
  renderTimer();
  renderToday();
}

/* Breath */
const breath = { running: false, timeout: null, interval: null, startedAt: 0, phase: 0 };
function renderPatterns() {
  document.querySelectorAll('#patterns button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.p === state.pattern);
    b.disabled = breath.running;
  });
}
function runPhase() {
  const phases = PATTERNS[state.pattern];
  const [label, secs, scale] = phases[breath.phase % phases.length];
  const orb = $('#orb');
  orb.style.transitionDuration = `${secs}s`;
  orb.style.transform = `scale(${scale})`;
  $('#breathLabel').textContent = label;
  breath.phase++;
  breath.timeout = setTimeout(runPhase, secs * 1000);
}
function startBreath() {
  breath.running = true;
  breath.phase = 0;
  breath.startedAt = Date.now();
  $('#breathToggle').textContent = 'סיום';
  $('#breathTime').textContent = '0:00';
  breath.interval = setInterval(() => {
    $('#breathTime').textContent = fmt((Date.now() - breath.startedAt) / 1000);
  }, 500);
  renderPatterns();
  runPhase();
}
function stopBreath() {
  if (!breath.running) return;
  breath.running = false;
  clearTimeout(breath.timeout);
  clearInterval(breath.interval);
  const elapsed = Math.round((Date.now() - breath.startedAt) / 1000);
  today().breath += elapsed;
  save();
  const orb = $('#orb');
  orb.style.transitionDuration = '1s';
  orb.style.transform = 'scale(.58)';
  $('#breathToggle').textContent = 'התחלה';
  $('#breathLabel').textContent = 'נשימה אחת בכל פעם';
  renderPatterns();
  renderToday();
}

/* Settings */
const GOALS = [
  { key: 'focus', label: 'מיקוד', unit: 'דק׳', step: 15, min: 15, max: 240 },
  { key: 'tasks', label: 'משימות', unit: '', step: 1, min: 1, max: 12 },
  { key: 'breath', label: 'נשימה', unit: 'דק׳', step: 1, min: 1, max: 30 },
];
function renderGoals() {
  const box = $('#goals');
  box.replaceChildren();
  for (const g of GOALS) {
    const row = document.createElement('div');
    row.className = 'goal';
    const name = document.createElement('span');
    name.textContent = g.label;
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    const value = document.createElement('b');
    value.textContent = `${state.goals[g.key]} ${g.unit}`.trim();
    const button = (sign, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = sign > 0 ? '+' : '−';
      b.setAttribute('aria-label', `${label} ${g.label}`);
      b.addEventListener('click', () => {
        state.goals[g.key] = Math.min(g.max, Math.max(g.min, state.goals[g.key] + sign * g.step));
        save();
        renderGoals();
        renderToday();
      });
      return b;
    };
    stepper.append(button(1, 'הגדלת'), value, button(-1, 'הקטנת'));
    row.append(name, stepper);
    box.append(row);
  }
}

/* Confetti */
const canvas = $('#confetti');
function celebrate() {
  if (reducedMotion.matches) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--a', '--b', '--c'].map((v) => css.getPropertyValue(v).trim());
  const bits = Array.from({ length: 140 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 10;
    return {
      x: innerWidth / 2, y: innerHeight * 0.38,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
      size: 4 + Math.random() * 7, spin: Math.random() * 6, turn: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const start = performance.now();
  const frame = (now) => {
    const age = (now - start) / 2200;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (age >= 1) return;
    ctx.globalAlpha = 1 - age * age;
    for (const b of bits) {
      b.vy += 0.22;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.spin += b.turn;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* Navigation */
const VIEWS = ['today', 'focus', 'breath', 'settings'];
function moveIndicator() {
  const active = $('#tabbar button[aria-current="page"]');
  if (!active) return;
  const indicator = $('#tabIndicator');
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}
function showView(name) {
  if (name !== 'breath') stopBreath();
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  document.querySelectorAll('#tabbar button').forEach((b) => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  moveIndicator();
  scrollTo({ top: 0 });
  if (name === 'today') renderToday();
}

/* Wiring */
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) showView(b.dataset.view);
});
$('#taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#taskInput');
  const text = input.value.trim();
  if (!text) return;
  addTask(text);
  input.value = '';
});
$('#timerToggle').addEventListener('click', toggleTimer);
$('#timerReset').addEventListener('click', resetTimer);
$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-min]');
  if (!b || b.disabled) return;
  const secs = Number(b.dataset.min) * 60;
  state.timer = { duration: secs, endAt: null, remaining: secs };
  $('#timerStatus').textContent = 'מוכנים?';
  save();
  renderTimer();
});
$('#breathToggle').addEventListener('click', () => (breath.running ? stopBreath() : startBreath()));
$('#patterns').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-p]');
  if (!b || b.disabled) return;
  state.pattern = b.dataset.p;
  save();
  renderPatterns();
});
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-id]');
  if (!b || !THEME_LABELS.includes(b.dataset.themeId)) return;
  state.theme = b.dataset.themeId;
  save();
  applyAppearance();
});
$('#modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode-id]');
  if (!b) return;
  state.mode = b.dataset.modeId;
  save();
  applyAppearance();
});
let resetArmed = null;
$('#resetAll').addEventListener('click', (e) => {
  const button = e.currentTarget;
  if (!resetArmed) {
    button.textContent = 'בטוח? לחיצה נוספת תמחק הכול';
    resetArmed = setTimeout(() => {
      resetArmed = null;
      button.textContent = 'איפוס כל הנתונים';
    }, 3500);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  button.textContent = 'איפוס כל הנתונים';
  const { theme, mode } = state;
  state = { ...structuredClone(DEFAULTS), theme, mode };
  save();
  renderAll();
});
// Specular highlight follows the pointer across glass surfaces.
document.addEventListener('pointermove', (e) => {
  const glass = e.target.closest?.('.glass');
  if (!glass) return;
  const r = glass.getBoundingClientRect();
  glass.style.setProperty('--mx', `${e.clientX - r.left}px`);
  glass.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });
prefersDark.addEventListener('change', applyAppearance);
addEventListener('resize', moveIndicator);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  rollover();
  tickTimer();
  renderTasks();
  renderToday();
});
setInterval(tickTimer, 250);

function renderAll() {
  applyAppearance();
  renderTasks();
  renderToday();
  renderTimer();
  renderPatterns();
  renderGoals();
}

rollover();
renderAll();
tickTimer();
showView('today');
document.fonts?.ready.then(moveIndicator);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
