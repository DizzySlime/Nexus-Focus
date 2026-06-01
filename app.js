// ===== STATE =====
let state = {
  nickname: '',
  tasks: [],
  activeTaskId: null,
  focusMins: 25,
  shortMins: 5,
  longMins: 30,
  phase: 'focus',
  running: false,
  secondsLeft: 0,
  totalSeconds: 0,
  timerInterval: null,
  sessionsCompleted: 0,
  totalFocusSeconds: 0,
  lbInterval: null,
  lbSecondsLeft: 0,
};

const focusTimer = state.focusMins * 60 * 1000;
const shortBreak = state.shortMins * 60 *  1000;
const LongBreak = state.longMins * 60 * 1000;

// ===== WEB AUDIO CONTEXT =====
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Cyberpunk alarm: layered synth tones with bit-crush distortion feel
function playCyberpunkAlarm(isFocus) {
  const ctx = getAudioCtx();
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.05);
  masterGain.gain.setValueAtTime(0.35, ctx.currentTime + 2.7);
  masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3.0);
  masterGain.connect(ctx.destination);

  // Sequence of tones — cyberpunk arpeggio style
  const seq = isFocus
    ? [880, 1320, 1760, 880, 1760, 2200]   // Focus end: ascending aggressive
    : [660, 440, 550, 440, 330, 440];       // Break end: softer descending

  const stepDur = 0.3;

  seq.forEach((freq, i) => {
    const t = ctx.currentTime + i * stepDur;

    // Main oscillator — square wave for that digital bite
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.95, t + stepDur * 0.8);

    // Sub oscillator — sine for body
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq / 2, t);

    // Bit-crush style: add a ring-mod / detuned osc
    const crunchOsc = ctx.createOscillator();
    crunchOsc.type = 'sawtooth';
    crunchOsc.frequency.setValueAtTime(freq * 1.01, t); // slight detune = beat freq

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.01);
    env.gain.setValueAtTime(1, t + stepDur * 0.6);
    env.gain.linearRampToValueAtTime(0, t + stepDur * 0.9);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.3, t);

    const crunchGain = ctx.createGain();
    crunchGain.gain.setValueAtTime(0.15, t);

    // Bandpass filter for lo-fi character
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(freq * 2, t);
    bpf.Q.setValueAtTime(2, t);

    osc.connect(env);
    subOsc.connect(subGain); subGain.connect(env);
    crunchOsc.connect(crunchGain); crunchGain.connect(bpf); bpf.connect(env);

    env.connect(masterGain);

    osc.start(t); osc.stop(t + stepDur);
    subOsc.start(t); subOsc.stop(t + stepDur);
    crunchOsc.start(t); crunchOsc.stop(t + stepDur);
  });

  // Add a glitchy noise burst at the start
  const bufSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (i < bufSize * 0.5 ? 1 : 1 - (i - bufSize * 0.5) / (bufSize * 0.5));

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(3000, ctx.currentTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, ctx.currentTime);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start(ctx.currentTime);
}

// ===== ALARM OVERLAY =====
function showAlarm(isFocusEnd, callback) {
  const overlay = document.getElementById('alarm-overlay');
  const box = document.getElementById('alarm-box');
  const icon = document.getElementById('alarm-icon');
  const title = document.getElementById('alarm-title');
  const sub = document.getElementById('alarm-sub');
  const countdown = document.getElementById('alarm-countdown');
  const fill = document.getElementById('alarm-bar-fill');

  if (isFocusEnd) {
    box.className = 'alarm-box';
    icon.textContent = '⚡';
    title.textContent = 'FOCUS SESSION COMPLETE';
    sub.textContent = 'INITIATING SHORT BREAK...';
  } else {
    box.className = 'alarm-box break-alarm';
    icon.textContent = '🔋';
    title.textContent = 'BREAK OVER';
    sub.textContent = 'RESUMING FOCUS MODE...';
  }

  countdown.textContent = '3';
  fill.style.width = '100%';
  fill.style.transition = 'none';
  overlay.classList.add('show');

  playCyberpunkAlarm(isFocusEnd);

  let secs = 3;
  const alarmTick = setInterval(() => {
    secs--;
    countdown.textContent = secs;
    fill.style.transition = 'width 1s linear';
    fill.style.width = ((secs / 3) * 100) + '%';
    if (secs <= 0) {
      clearInterval(alarmTick);
      overlay.classList.remove('show');
      callback();
    }
  }, 1000);
}

// ===== CLOCK =====
function updateClock() {
  document.getElementById('clock-display').textContent =
    new Date().toLocaleTimeString('en-US', {hour12:false});
}
setInterval(updateClock, 1000);
updateClock();

// ===== NOTIFICATIONS =====
// 1. Inisialisasi file audio kustom
const sfxNotif = new Audio("./Cyberpunk SFX.mp3");
let notifTimerInterval;

function mulaiTimer() {
  putarSuara();
  notifFocusTimer = setTimeOut(function() {
    putarSuara();
  },focusTimer);

   notifShortBreakTimer = setTimeOut(function() {
    putarSuara();
  },shortBreak);

   notifLongBreakTimer = setTimeOut(function() {
    putarSuara();
  },LongBreak);
}

function hentiTimer() {
  // Hentikan interval notif audio saat sesi pomodoro selesai
  clearInterval(notifTimerInterval);
}

function putarSuara() {
  // Reset durasi ke 0 agar audio langsung berbunyi ulang dari awal tanpa jeda delay
  sfxNotif.currentTime = 0;
  sfxNotif.play().catch(error => {
    console.log("Gagal memutar audio karena kebijakan browser:", error);
  });
}

function notify(msg, type='info') {
  const el = document.createElement('div');
  el.className = `notif${type==='warn'?' warn':type==='danger'?' danger':''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  putarSuara();
  setTimeout(() => el.remove(),4000);
}

// ===== PAGES =====
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== NICK =====
document.getElementById('nick-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitNick();
});

function submitNick() {
  const val = document.getElementById('nick-input').value.trim().toUpperCase();
  if (!val) { notify('// CALLSIGN CANNOT BE EMPTY', 'warn'); return; }
  state.nickname = val;
  document.getElementById('dash-username').textContent = val;
  showPage('page-dash');
  notify(`ACCESS GRANTED // WELCOME, ${val}`);
}

// ===== TASKS =====
function addTask() {
  const input = document.getElementById('task-input');
  const name = input.value.trim();
  if (!name) { notify('// TASK NAME CANNOT BE EMPTY', 'warn'); return; }
  const task = { id: Date.now(), name, done: false };
  state.tasks.push(task);
  input.value = '';
  renderTasks();
  if (state.tasks.length === 1) selectTask(task.id);
  notify(`TASK QUEUED: ${name}`);
}

function selectTask(id) {
  if (state.tasks.find(t=>t.id===id)?.done) return;
  state.activeTaskId = id;
  renderTasks();
  updateStartBtn();
}

function deleteTask(id, e) {
  e.stopPropagation();
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.activeTaskId === id) {
    state.activeTaskId = state.tasks.find(t=>!t.done)?.id || null;
  }
  renderTasks();
  updateStartBtn();
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const pending = state.tasks.filter(t=>!t.done);
  const done = state.tasks.filter(t=>t.done);
  const all = [...pending, ...done];

  if (all.length === 0) {
    list.innerHTML = '<div class="empty-state" id="empty-state">// QUEUE EMPTY — ADD A NEW TASK</div>';
    return;
  }
  list.innerHTML = '';
  all.forEach(t => {
    const div = document.createElement('div');
    div.className = `schedule-item${t.id===state.activeTaskId?' active-task':''}${t.done?' task-done':''}`;
    div.onclick = () => selectTask(t.id);
    div.innerHTML = `
      <div class="task-dot"></div>
      <div class="task-name">${t.name}</div>
      <div class="task-delete" onclick="deleteTask(${t.id},event)">✕</div>
    `;
    list.appendChild(div);
  });
}

function updateStartBtn() {
  const btn = document.getElementById('start-btn');
  const hint = document.getElementById('start-hint');
  const hasTask = state.activeTaskId !== null && state.tasks.find(t=>t.id===state.activeTaskId && !t.done);
  if (hasTask) {
    btn.className = 'btn btn-active-glow';
    hint.textContent = '// TASK READY — PRESS START TO BEGIN';
  } else {
    btn.className = 'btn btn-dim';
    hint.textContent = '// SELECT A TASK TO ACTIVATE START';
  }
}

// ===== TIMER SETTINGS =====
function adjustTime(type, delta) {
  if (type === 'focus') {
    state.focusMins = Math.max(1, Math.min(90, state.focusMins + delta));
    document.getElementById('focus-input').value = state.focusMins;
    document.getElementById('focus-display').innerHTML = `${state.focusMins}<span style="font-size:0.6rem;opacity:0.5">m</span>`;
  } else {
    state.shortMins = Math.max(1, Math.min(30, state.shortMins + delta));
    document.getElementById('short-input').value = state.shortMins;
    document.getElementById('short-display').innerHTML = `${state.shortMins}<span style="font-size:0.6rem;opacity:0.5">m</span>`;
  }
}

function syncTime(type) {
  if (type==='focus') {
    state.focusMins = Math.max(1, Math.min(90, parseInt(document.getElementById('focus-input').value)||25));
    document.getElementById('focus-input').value = state.focusMins;
    document.getElementById('focus-display').innerHTML = `${state.focusMins}<span style="font-size:0.6rem;opacity:0.5">m</span>`;
  } else {
    state.shortMins = Math.max(1, Math.min(30, parseInt(document.getElementById('short-input').value)||5));
    document.getElementById('short-input').value = state.shortMins;
    document.getElementById('short-display').innerHTML = `${state.shortMins}<span style="font-size:0.6rem;opacity:0.5">m</span>`;
  }
}

// ===== START POMODORO =====
function startPomodoro() {
  const task = state.tasks.find(t=>t.id===state.activeTaskId && !t.done);
  if (!task) return;

  state.phase = 'focus';
  state.running = false;
  state.sessionsCompleted = 0;
  state.totalFocusSeconds = 0;
  clearInterval(state.timerInterval);

  document.getElementById('pomo-task-name').textContent = task.name;
  setPhaseUI('focus');
  buildSessionDots();

  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }

  showPage('page-pomo');
  notify('⛔ DO NOT DISTURB MODE ACTIVE');
  mulaiTimer(); // Aktifkan interval audio notifikasi saat sesi dimulai
}

function setPhaseUI(phase) {
  state.phase = phase;
  const isF = phase==='focus';
  const isSB = phase==='short-break';

  const secs = isF ? state.focusMins*60 : isSB ? state.shortMins*60 : state.longMins*60;
  state.secondsLeft = secs;
  state.totalSeconds = secs;

  const phaseEl = document.getElementById('phase-label');
  const timeEl = document.getElementById('timer-display');
  const ring = document.getElementById('ring-prog');

  phaseEl.className = `phase-label ${phase}`;
  phaseEl.textContent = isF ? '◈ FOCUS MODE' : isSB ? '◎ SHORT BREAK' : '◉ LONG BREAK';
  timeEl.className = `timer-time ${phase}`;
  ring.className = `ring-prog ${phase}`;

  updateTimerDisplay();
  updateRing();

  const sub = document.getElementById('session-phase-sub');
  if (isF) sub.textContent = `FOCUS #${state.sessionsCompleted+1}`;
  else if (isSB) sub.textContent = 'SHORT BREAK';
  else sub.textContent = 'LONG BREAK';

  updateStatsDisplay();
}

function buildSessionDots(count=4) {
  const wrap = document.getElementById('session-dots');
  wrap.innerHTML = '';
  for (let i=0;i<count;i++) {
    const d = document.createElement('div');
    d.className = 'sdot';
    if (i < state.sessionsCompleted) d.classList.add('done');
    if (i === state.sessionsCompleted) d.classList.add('current');
    wrap.appendChild(d);
  }
}

function updateTimerDisplay() {
  const m = Math.floor(state.secondsLeft/60).toString().padStart(2,'0');
  const s = (state.secondsLeft%60).toString().padStart(2,'0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

function updateRing() {
  const circumference = 628.3;
  const progress = state.secondsLeft / state.totalSeconds;
  document.getElementById('ring-prog').style.strokeDashoffset = circumference * (1 - progress);
}

function updateStatsDisplay() {
  document.getElementById('stat-sessions').textContent = state.sessionsCompleted;
  document.getElementById('stat-time').textContent = Math.floor(state.totalFocusSeconds/60) + 'm';
}

function togglePomo() {
  const btn = document.getElementById('pomo-start-btn');
  if (state.running) {
    state.running = false;
    clearInterval(state.timerInterval);
    btn.textContent = '▶ RESUME';
    btn.className = 'btn btn-cyan';
  } else {
    state.running = true;
    btn.textContent = '⏸ PAUSE';
    btn.className = 'btn btn-yellow';
    state.timerInterval = setInterval(tick, 1000);
  }
}

function tick() {
  if (!state.running) return;
  if (state.phase === 'focus') state.totalFocusSeconds++;
  state.secondsLeft--;
  updateTimerDisplay();
  updateRing();
  updateStatsDisplay();

  if (state.secondsLeft <= 0) {
    clearInterval(state.timerInterval);
    state.running = false;
    onPhaseEnd();
  }
}

function onPhaseEnd() {
  const btn = document.getElementById('pomo-start-btn');
  btn.textContent = '▶ START';
  btn.className = 'btn btn-cyan';

  if (state.phase === 'focus') {
    state.sessionsCompleted++;
    buildSessionDots();
    showAlarm(true, () => {
      notify('✓ FOCUS COMPLETE — SHORT BREAK STARTING!', 'warn');
      setPhaseUI('short-break');
      state.running = true;
      btn.textContent = '⏸ PAUSE';
      btn.className = 'btn btn-yellow';
      state.timerInterval = setInterval(tick, 1000);
    });
  } else if (state.phase === 'short-break') {
    showAlarm(false, () => {
      notify('🔋 BREAK OVER — BACK TO FOCUS!');
      setPhaseUI('focus');
      state.running = true;
      btn.textContent = '⏸ PAUSE';
      btn.className = 'btn btn-yellow';
      state.timerInterval = setInterval(tick, 1000);
    });
  }
}

function skipPhase() {
  clearInterval(state.timerInterval);
  state.running = false;
  state.secondsLeft = 0;
  const btn = document.getElementById('pomo-start-btn');
  btn.textContent = '▶ START';
  btn.className = 'btn btn-cyan';
  onPhaseEnd();
}

function markDone() {
  clearInterval(state.timerInterval);
  state.running = false;
  hentiTimer(); // Hentikan interval audio notifikasi

  const task = state.tasks.find(t=>t.id===state.activeTaskId);
  if (task) task.done = true;

  const totalMins = Math.ceil(state.totalFocusSeconds/60);

  document.getElementById('complete-message').textContent =
    `Outstanding, ${state.nickname}! You completed "${task?.name||'task'}" with full focus.`;
  document.getElementById('final-sessions').textContent = state.sessionsCompleted;
  document.getElementById('final-time').textContent = totalMins;

  showPage('page-complete');
  notify('🎉 TASK COMPLETE! EXCELLENT WORK!');
  startLongBreak();
}

function startLongBreak() {
  state.lbSecondsLeft = state.longMins * 60;
  clearInterval(state.lbInterval);
  updateLBDisplay();
  state.lbInterval = setInterval(() => {
    state.lbSecondsLeft--;
    updateLBDisplay();
    if (state.lbSecondsLeft <= 0) {
      clearInterval(state.lbInterval);
      document.getElementById('lb-timer').textContent = 'DONE!';
      notify('☀ LONG BREAK OVER — READY FOR A NEW SESSION?');
    }
  }, 1000);
}

function updateLBDisplay() {
  const m = Math.floor(state.lbSecondsLeft/60).toString().padStart(2,'0');
  const s = (state.lbSecondsLeft%60).toString().padStart(2,'0');
  document.getElementById('lb-timer').textContent = `${m}:${s}`;
}

function exitPomodoro() {
  clearInterval(state.timerInterval);
  state.running = false;
  hentiTimer(); // Hentikan interval audio notifikasi
  showPage('page-dash');
  renderTasks();
  updateStartBtn();
  notify('⚠ SESSION CANCELLED', 'warn');
}

function backToDash() {
  clearInterval(state.lbInterval);
  renderTasks();
  updateStartBtn();
  showPage('page-dash');
}

function newSession() {
  clearInterval(state.lbInterval);
  const next = state.tasks.find(t=>!t.done);
  state.activeTaskId = next?.id || null;
  renderTasks();
  updateStartBtn();
  showPage('page-dash');
  if (next) notify(`NEW SESSION READY: ${next.name}`);
  else notify('// ALL TASKS COMPLETE! ADD A NEW TASK', 'warn');
}

// ===== INIT =====
document.getElementById('nick-input').focus();
