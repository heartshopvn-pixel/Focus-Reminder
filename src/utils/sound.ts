import { SoundType } from '../types';

export const SOUND_OPTIONS: { value: Exclude<SoundType, 'custom'>; label: string; detail: string }[] = [
  { value: 'dingdong', label: '🔔 Ding-Dong', detail: '🔔 Ding-Dong (0.65s)' },
  { value: 'crystal', label: '✨ Crystal Bell', detail: '✨ Crystal Bell (0.75s)' },
  { value: 'marimba', label: '🎶 Marimba', detail: '🎶 Marimba (0.55s)' },
  { value: 'bell', label: '🛎️ Service Bell', detail: '🛎️ Service Bell (0.8s)' },
  { value: 'breeze', label: '💨 Breeze Synth', detail: '💨 Breeze Synth (0.6s)' },
];

export function playSynthesizedSound(type: SoundType): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    const playNotes = (
      notes: number[],
      wave: OscillatorType,
      step: number,
      dur: number,
      peak = 0.28
    ) => {
      notes.forEach((freq, idx) => {
        const start = now + idx * step;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(peak, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur);
      });
    };

    if (type === 'crystal') playNotes([659.25, 987.77, 1318.51], 'sine', 0.1, 0.65, 0.25);
    else if (type === 'marimba') playNotes([523.25, 659.25, 783.99], 'triangle', 0.12, 0.35, 0.3);
    else if (type === 'bell') playNotes([1046.5], 'sine', 0, 0.8, 0.35);
    else if (type === 'breeze') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.5);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } else {
      playNotes([659.25, 880.0], 'sine', 0.22, 0.45, 0.3);
    }
  } catch (e) {
    console.log('Audio error:', e);
  }
}
