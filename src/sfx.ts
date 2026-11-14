// Sounds made in code with Web Audio (no files to download), plus phone vibration.
let ctx: AudioContext | null = null;
let userMuted = false;
let siteMuted = false; // portal's own mute setting; overrides the in-game toggle
let adPlaying = false;
let vibrateOff = false;
try {
  userMuted = localStorage.getItem('bb-muted') === '1';
  vibrateOff = localStorage.getItem('bb-vibrate') === '0';
} catch { /* storage blocked */ }

export const isMuted = () => userMuted || siteMuted;
export function toggleMute() {
  userMuted = !userMuted;
  try { localStorage.setItem('bb-muted', userMuted ? '1' : '0'); } catch { /* storage blocked */ }
  return isMuted();
}
export const isVibrateOn = () => !vibrateOff;
export function toggleVibrate() {
  vibrateOff = !vibrateOff;
  try { localStorage.setItem('bb-vibrate', vibrateOff ? '0' : '1'); } catch { /* storage blocked */ }
  if (!vibrateOff) navigator.vibrate?.(30); // a buzz confirms it is on
  return !vibrateOff;
}
export const setSiteMuted = (on: boolean) => { siteMuted = on; };

/** Silence everything while an ad plays (suspends sounds already scheduled too). */
export function setAdPlaying(on: boolean) {
  adPlaying = on;
  if (on) ctx?.suspend(); else ctx?.resume();
}

const muted = () => isMuted() || adPlaying;

function tone(freq: number, at: number, dur: number, vol = 0.12, type: OscillatorType = 'sine') {
  if (muted()) return;
  ctx ??= new AudioContext(); // created on first sound, which always follows a tap, so browsers allow it
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

const buzz = (ms: number | number[]) => { if (!vibrateOff && !adPlaying) navigator.vibrate?.(ms); };

const NOTES = [523, 587, 659, 784, 880, 988, 1047, 1175]; // C major, rising

export const sfx = {
  tap: () => { tone(660, 0, 0.06, 0.08, 'triangle'); buzz(10); },
  pick: () => { tone(440, 0, 0.05, 0.06, 'triangle'); buzz(8); },
  place: () => { tone(220, 0, 0.08, 0.15, 'triangle'); buzz(15); },
  bad: () => tone(160, 0, 0.12, 0.08, 'sawtooth'),
  /** Higher and longer chime for more lines and longer streaks. */
  clear: (lines: number, streak: number) => {
    const start = Math.min(streak - 1, 4);
    for (let i = 0; i < 2 + lines; i++) tone(NOTES[Math.min(start + i, NOTES.length - 1)], i * 0.07, 0.25);
    buzz(lines > 1 ? [30, 40, 30] : 25);
  },
  perfect: () => { NOTES.forEach((f, i) => tone(f, i * 0.06, 0.3)); buzz([40, 50, 40, 50, 80]); },
  over: () => { [392, 330, 262].forEach((f, i) => tone(f, i * 0.15, 0.3, 0.1)); buzz(200); },
};
