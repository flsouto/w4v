export function clipTiming(sourceDuration, sampleRate, settings) {
  if (!(sourceDuration > 0) || !Number.isFinite(sourceDuration) || !(sampleRate > 0) || !Number.isFinite(sampleRate)) throw new Error('Invalid audio duration or sample rate');
  const excerptSamples = Math.max(1, Math.round(sourceDuration * settings.portion * sampleRate));
  const excerptDuration = excerptSamples / sampleRate;
  const duration = Math.min(excerptDuration * settings.cycles, settings.seconds ?? Infinity);
  return {excerptSamples,excerptDuration,duration,frames:Math.ceil(duration*settings.fps)};
}
