/** Original, brief educational UI cues. Deterministic PCM; no downloaded audio. */
import { writeFileSync } from 'node:fs';
const cues = {
  tick: [[1046.5, 0, .075, .11]],
  success: [[659.25, 0, .14, .12], [880, .075, .2, .12]],
  error: [[233.08, 0, .14, .1], [207.65, .08, .16, .1]],
};
for (const [name, voices] of Object.entries(cues)) {
  const rate = 22050;
  const length = Math.ceil(Math.max(...voices.map(([, at, duration]) => at + duration)) * rate);
  const data = Buffer.alloc(44 + length * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    let value = 0;
    for (const [frequency, at, duration, peak] of voices) {
      const t = i / rate - at;
      if (t >= 0 && t < duration) value += Math.sin(2 * Math.PI * frequency * t) * Math.min(1, t / .009) * Math.pow(1 - t / duration, 3) * peak;
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  writeFileSync(new URL(`../assets/audio/${name}.wav`, import.meta.url), data);
}
