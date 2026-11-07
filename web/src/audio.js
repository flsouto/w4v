// Normalize imports to the engine's 44.1 kHz stereo PCM format.
export async function prepareWav(file, context, encode = encodeWav) {
  if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name}: maximum input size is 40 MB`);
  const decoded = await context.decodeAudioData(await file.arrayBuffer());
  if (decoded.duration > 60) throw new Error(`${file.name}: use samples no longer than 60 seconds`);
  const offline = new OfflineAudioContext(2, Math.max(1, Math.round(decoded.duration * 44100)), 44100);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return encode(await offline.startRendering());
}
export function encodeWav(buffer, rate = 1) {
  const channels = buffer.numberOfChannels;
  const bytes = new Uint8Array(44 + buffer.length * channels * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  const sampleRate = Math.round(buffer.sampleRate * rate);
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data');
  view.setUint32(40, bytes.length - 44, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, data[c][i]));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return bytes;
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
