/* Pulse Interval Trainer — vanilla JavaScript, no dependencies. */
(() => {
  'use strict';

  const STORAGE_KEY = 'pulse-interval-trainer-v1';
  const LIMITS = {
    work: { min: 1, max: 3600, step: 5 },
    rest: { min: 0, max: 3600, step: 5 },
    rounds: { min: 1, max: 99, step: 1 },
    prep: { min: 0, max: 60, step: 1 },
  };
  const DEFAULTS = { work: 40, rest: 20, rounds: 8, prep: 5, sound: true, vibrate: true };
  const PRESETS = {
    hiit: { work: 40, rest: 20, rounds: 8 },
    tabata: { work: 20, rest: 10, rounds: 8 },
    endurance: { work: 60, rest: 15, rounds: 5 },
  };
  const CIRCUMFERENCE = 2 * Math.PI * 157;

  const $ = (selector) => document.querySelector(selector);
  const refs = {
    inputs: {
      work: $('#workSeconds'), rest: $('#restSeconds'),
      rounds: $('#roundCount'), prep: $('#prepSeconds'),
    },
    sound: $('#soundToggle'), vibrate: $('#vibrateToggle'),
    phaseName: $('#phaseName'), phaseHint: $('#phaseHint'),
    countdown: $('#countdown'), timerRing: $('#timerRing'),
    statusText: $('#statusText'), roundCurrent: $('#roundCurrent'),
    roundTotal: $('#roundTotal'), progressPercent: $('#progressPercent'),
    progressFill: $('#progressFill'), sessionProgress: $('#sessionProgress'),
    ringProgress: $('#ringProgress'), mainButton: $('#mainButton'),
    mainButtonIcon: $('#mainButtonIcon'), mainButtonText: $('#mainButtonText'),
    skipButton: $('#skipButton'), resetButton: $('#resetButton'),
    estimatedDuration: $('#estimatedDuration'), announcer: $('#announcer'),
    timerCard: $('.timer-card'),
  };

  function clampField(name, value, fallback = DEFAULTS[name]) {
    const num = Number(value);
    if (!Number.isFinite(num) || value === '' || value === null) return fallback;
    const { min, max } = LIMITS[name];
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const result = { ...DEFAULTS };
      for (const key of Object.keys(LIMITS)) result[key] = clampField(key, stored[key], DEFAULTS[key]);
      if (typeof stored.sound === 'boolean') result.sound = stored.sound;
      if (typeof stored.vibrate === 'boolean') result.vibrate = stored.vibrate;
      return result;
    } catch { return { ...DEFAULTS }; }
  }

  let settings = loadSettings();
  // During a session, use a snapshot so changes cannot alter in-flight intervals.
  let config = null;
  let phase = 'idle'; // idle | prep | work | rest | complete
  let running = false;
  let round = 1;
  let remainingMs = 0;
  let phaseDurationMs = 0;
  let endsAt = 0;
  let intervalId = null;
  let audioContext = null;
  let wakeLock = null;

  const icons = {
    play: '<path d="M8 5.5a1 1 0 0 1 1.54-.84l10 6.5a1 1 0 0 1 0 1.68l-10 6.5A1 1 0 0 1 8 18.5z"/>',
    pause: '<path d="M6.5 5.5a1 1 0 0 1 1-1H9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1zm7.5 0a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H15a1 1 0 0 1-1-1z"/>',
    again: '<path d="M12 4a8 8 0 1 1-7.6 10.5 1 1 0 0 1 1.9-.63A6 6 0 1 0 7 8.2L9 10H3V4l2.55 2.55A8 8 0 0 1 12 4z"/>',
  };

  const two = (num) => String(num).padStart(2, '0');
  function clock(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${two(Math.floor(whole / 60))}:${two(whole % 60)}`;
  }
  function totalMs(c) {
    return 1000 * (c.prep + c.work * c.rounds + c.rest * (c.rounds - 1));
  }
  function setAnnouncement(message) { refs.announcer.textContent = message; }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage optional */ }
  }
  function markPreset() {
    document.querySelectorAll('[data-preset]').forEach((button) => {
      const preset = PRESETS[button.dataset.preset];
      button.classList.toggle('is-active', Object.keys(preset).every((key) => settings[key] === preset[key]));
    });
  }
  function showSettings() {
    for (const field of Object.keys(LIMITS)) refs.inputs[field].value = settings[field];
    refs.sound.checked = settings.sound;
    refs.vibrate.checked = settings.vibrate;
    const seconds = totalMs(settings) / 1000;
    const longerThanHour = seconds >= 3600;
    const formatted = longerThanHour
      ? `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`
      : clock(seconds);
    refs.estimatedDuration.innerHTML = `${formatted} <small>${longerThanHour ? 'HRS' : 'MIN'}</small>`;
    markPreset();
    if (phase === 'idle') render();
  }
  function updateSetting(field, raw) {
    if (phase !== 'idle' && phase !== 'complete') return;
    if (phase === 'complete') resetSession();
    settings[field] = clampField(field, raw, settings[field]);
    saveSettings();
    showSettings();
  }
  function updateLockedControls() {
    const locked = phase !== 'idle' && phase !== 'complete';
    for (const field of Object.values(refs.inputs)) field.disabled = locked;
    document.querySelectorAll('[data-field],[data-preset]').forEach((button) => { button.disabled = locked; });
    refs.skipButton.disabled = !locked;
    refs.resetButton.disabled = phase === 'idle';
    refs.timerCard.classList.toggle('session-locked', locked);
  }

  function phaseLengthMs(next) {
    return (next === 'prep' ? config.prep : next === 'work' ? config.work : next === 'rest' ? config.rest : 0) * 1000;
  }
  function setPhase(next) {
    phase = next;
    phaseDurationMs = next === 'complete' ? 0 : phaseLengthMs(next);
    remainingMs = phaseDurationMs;
    if (next === 'complete') {
      running = false;
      clearInterval(intervalId);
      intervalId = null;
      releaseWakeLock();
    }
  }
  function nextPhase() {
    if (phase === 'prep') setPhase('work');
    else if (phase === 'work') {
      if (round >= config.rounds) setPhase('complete');
      else if (config.rest > 0) setPhase('rest');
      else { round += 1; setPhase('work'); }
    } else if (phase === 'rest') { round += 1; setPhase('work'); }
  }

  function elapsedMs() {
    if (phase === 'idle') return 0;
    if (phase === 'complete') return totalMs(config);
    let earlier = 0;
    if (phase !== 'prep') {
      earlier = 1000 * (config.prep + (round - 1) * (config.work + config.rest));
      if (phase === 'rest') earlier += config.work * 1000;
    }
    return earlier + phaseDurationMs - remainingMs;
  }

  function render() {
    const currentConfig = config || settings;
    const inactive = phase === 'idle';
    const complete = phase === 'complete';
    const seconds = inactive ? settings.work : complete ? 0 : remainingMs / 1000;
    const phaseNames = { idle: 'READY', prep: 'GET READY', work: 'WORK', rest: 'REST', complete: 'COMPLETE' };
    const phaseHints = { idle: 'SET YOUR PACE', prep: 'FIND YOUR POSITION', work: 'PUSH YOUR PACE', rest: 'BREATHE. RESET.', complete: 'YOU DID IT.' };
    const visualName = !running && !inactive && !complete ? 'PAUSED' : phaseNames[phase];
    const hint = !running && !inactive && !complete ? `${phaseNames[phase]} · RESUME WHEN READY` : phaseHints[phase];
    const display = clock(seconds);

    document.body.dataset.phase = phase;
    refs.phaseName.textContent = visualName;
    refs.phaseHint.textContent = hint;
    refs.countdown.textContent = display;
    refs.timerRing.setAttribute('aria-label', `Time remaining: ${Math.ceil(seconds)} seconds. ${visualName.toLowerCase()}.`);
    refs.statusText.textContent = complete ? 'DONE' : !running && !inactive ? 'PAUSED' : phaseNames[phase];
    refs.roundCurrent.textContent = two(inactive ? 1 : round);
    refs.roundTotal.textContent = two(currentConfig.rounds);

    const percentage = inactive ? 0 : complete ? 100 : Math.min(100, Math.max(0, elapsedMs() / totalMs(config) * 100));
    refs.progressPercent.textContent = `${Math.floor(percentage)}%`;
    refs.progressFill.style.width = `${percentage}%`;
    refs.sessionProgress.setAttribute('aria-valuenow', String(Math.round(percentage)));
    refs.ringProgress.style.strokeDasharray = String(CIRCUMFERENCE);
    const fraction = (inactive || complete) ? 1 : phaseDurationMs ? remainingMs / phaseDurationMs : 0;
    refs.ringProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction))));

    let icon = 'play', buttonText = 'START SESSION';
    if (complete) { icon = 'again'; buttonText = 'GO AGAIN'; }
    else if (running) { icon = 'pause'; buttonText = 'PAUSE SESSION'; }
    else if (!inactive) { buttonText = 'RESUME SESSION'; }
    refs.mainButtonIcon.innerHTML = icons[icon];
    refs.mainButtonText.textContent = buttonText;
    document.title = running ? `${display} · ${phaseNames[phase]} — Pulse` : 'Pulse — Interval Trainer';
    updateLockedControls();
  }

  // Date.now() and the deadline ensure accurate time even when the browser throttles timers.
  function tick() {
    if (!running) return;
    const now = Date.now();
    let transitions = 0;
    while (running && now >= endsAt && transitions < 220) {
      nextPhase();
      transitions += 1;
      if (phase === 'complete') {
        remainingMs = 0;
        playCue('complete');
        setAnnouncement('Session complete. Great work!');
        break;
      }
      endsAt += phaseDurationMs;
    }
    if (running) {
      remainingMs = Math.max(0, endsAt - now);
      if (transitions) {
        playCue(phase);
        setAnnouncement(`${phase === 'work' ? 'Work' : phase === 'rest' ? 'Rest' : 'Get ready'}, round ${round} of ${config.rounds}.`);
      }
    }
    render();
  }

  function startInterval() {
    clearInterval(intervalId);
    intervalId = setInterval(tick, 80);
    requestWakeLock();
  }
  function ensureAudio() {
    if (!settings.sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audioContext) audioContext = new Context();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* sound support optional */ }
  }
  function beep(frequency, duration, delay = 0) {
    if (!audioContext || !settings.sound) return;
    try {
      const start = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.17, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch { /* cue support optional */ }
  }
  function playCue(kind) {
    if (kind === 'prep') beep(520, 0.13);
    if (kind === 'work') { beep(860, 0.18); beep(1140, 0.22, 0.21); }
    if (kind === 'rest') beep(530, 0.3);
    if (kind === 'complete') { beep(780, 0.15); beep(980, 0.15, 0.2); beep(1240, 0.45, 0.4); }
    if (settings.vibrate && navigator.vibrate) {
      try { navigator.vibrate(kind === 'complete' ? [150, 100, 150, 100, 300] : kind === 'work' ? [150, 80, 150] : 130); } catch { /* unsupported */ }
    }
  }
  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || !running) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* browser or battery restricts wake lock */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function startSession() {
    config = { ...settings };
    round = 1;
    setPhase(config.prep > 0 ? 'prep' : 'work');
    running = true;
    endsAt = Date.now() + remainingMs;
    ensureAudio();
    playCue(phase);
    setAnnouncement(phase === 'prep' ? 'Get ready. Session starting.' : 'Work. Round 1.');
    startInterval();
    render();
  }
  function pauseSession() {
    tick();
    if (!running) return;
    remainingMs = Math.max(0, endsAt - Date.now());
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    releaseWakeLock();
    setAnnouncement('Session paused.');
    render();
  }
  function resumeSession() {
    if (phase === 'idle' || phase === 'complete' || running) return;
    ensureAudio();
    running = true;
    endsAt = Date.now() + remainingMs;
    startInterval();
    setAnnouncement('Session resumed.');
    render();
  }
  function resetSession() {
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    releaseWakeLock();
    phase = 'idle';
    round = 1;
    config = null;
    remainingMs = 0;
    phaseDurationMs = 0;
    setAnnouncement('Timer reset. Ready for a new session.');
    render();
  }
  function skipPhase() {
    if (phase === 'idle' || phase === 'complete') return;
    if (running) {
      endsAt = Date.now();
      tick();
    } else {
      nextPhase();
      if (phase === 'complete') {
        playCue('complete');
        setAnnouncement('Session complete. Great work!');
      } else {
        playCue(phase);
        setAnnouncement(`Skipped to ${phase}. Round ${round}.`);
      }
      render();
    }
  }

  refs.mainButton.addEventListener('click', () => {
    if (phase === 'idle' || phase === 'complete') startSession();
    else if (running) pauseSession();
    else resumeSession();
  });
  refs.skipButton.addEventListener('click', skipPhase);
  refs.resetButton.addEventListener('click', resetSession);

  for (const [field, input] of Object.entries(refs.inputs)) {
    input.addEventListener('change', () => updateSetting(field, input.value));
    input.addEventListener('input', () => {
      if (input.value !== '' && Number.isFinite(Number(input.value))) updateSetting(field, input.value);
    });
  }
  document.querySelectorAll('[data-field]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.field;
      const next = settings[field] + Number(button.dataset.direction) * LIMITS[field].step;
      updateSetting(field, next);
    });
  });
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      if (phase !== 'idle' && phase !== 'complete') return;
      if (phase === 'complete') resetSession();
      Object.assign(settings, PRESETS[button.dataset.preset]);
      saveSettings();
      showSettings();
    });
  });
  refs.sound.addEventListener('change', () => {
    settings.sound = refs.sound.checked;
    if (settings.sound) ensureAudio();
    saveSettings();
  });
  refs.vibrate.addEventListener('change', () => {
    settings.vibrate = refs.vibrate.checked;
    saveSettings();
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || event.target?.isContentEditable) return;
    if (event.code === 'Space') {
      event.preventDefault();
      refs.mainButton.click();
    } else if (event.code === 'ArrowRight' && phase !== 'idle' && phase !== 'complete') {
      event.preventDefault();
      skipPhase();
    } else if (event.key.toLowerCase() === 'r' && phase !== 'idle') {
      resetSession();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (running) { tick(); requestWakeLock(); }
    } else releaseWakeLock();
  });
  window.addEventListener('pagehide', releaseWakeLock);

  showSettings();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
