// Combine channel peaks rather than averaging samples: stereo cancellation and
// a delayed/silent first channel must not hide audible audio in another channel.
export function waveformPeaks(buffer, width) {
  const peaks = new Float32Array(width);
  if (!buffer.length || !buffer.numberOfChannels) return peaks;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  for (let x = 0; x < width; x++) {
    const start = Math.floor(x * buffer.length / width);
    const end = Math.min(buffer.length, Math.max(start + 1, Math.floor((x + 1) * buffer.length / width)));
    let peak = 0;
    for (const samples of channels) {
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    }
    peaks[x] = peak;
  }
  return peaks;
}
