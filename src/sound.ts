import { SOUND_ACTIONS, type StageAction } from "./playback";

export const isSoundAction = (action: StageAction): action is (typeof SOUND_ACTIONS)[number] => (SOUND_ACTIONS as readonly string[]).includes(action);

export function playQueuedSound(action: StageAction) {
  if (!isSoundAction(action)) return;
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const now = context.currentTime;
  const tone = (frequency: number, duration: number, type: OscillatorType = "sine", delay = 0, endFrequency = frequency) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + delay + duration);
    gain.gain.setValueAtTime(.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(.22, now + delay + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration);
  };
  const noise = (duration: number, delay = 0, volume = .22) => {
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, now + delay);
    gain.gain.exponentialRampToValueAtTime(.0001, now + delay + duration);
    source.connect(gain).connect(context.destination);
    source.start(now + delay);
  };

  if (action === "crash") { noise(.8, 0, .38); tone(100, .8, "sawtooth", 0, 38); }
  if (action === "gallop") for (let index = 0; index < 8; index += 1) tone(index % 2 ? 92 : 118, .13, "triangle", index * .19, 55);
  if (action === "arrow_shot") { noise(.28, 0, .16); tone(1250, .5, "sine", 0, 180); }
  if (action === "sword_clash") for (let index = 0; index < 4; index += 1) tone(950 + index * 230, .28, "square", index * .22, 260);
  if (action === "yell") { tone(310, 1, "sawtooth", 0, 155); tone(390, .8, "triangle", .08, 210); }
  if (action === "murmur") for (let index = 0; index < 7; index += 1) tone(110 + index * 17, 1.5, "sine", index * .05, 90 + index * 11);
  if (action === "cheer") { noise(1.5, 0, .09); for (let index = 0; index < 9; index += 1) tone(280 + index * 35, .8, "triangle", index * .08, 520 + index * 30); }
  window.setTimeout(() => void context.close(), 2300);
}
