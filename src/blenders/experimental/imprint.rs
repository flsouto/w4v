//! Native-only rhythmic transfer: A controls timing/envelopes; B and C supply audio.
use crate::utils::wrap_samples;
use clap::Parser;
use hound::{SampleFormat, WavReader, WavSpec};
use rand::{Rng, rngs::StdRng};
use std::{f32::consts::TAU, io::Cursor};

const MAX_SAMPLES: usize = 32_000_000;
const MAX_HITS: usize = 1024;
const CYCLES: usize = 4;

#[derive(Parser, Debug)]
#[command(
    about = "Imprint a rhythm onto a texture, with a third source supplying accents (native only)"
)]
pub struct ImprintArgs {
    /// Groove source: timing and dynamics only, using up to its first six seconds.
    pub rhythm: String,
    /// Sustained texture source for overlapping grains.
    pub texture: String,
    /// Source of transient accents.
    pub accents: String,
    /// Destination PCM WAV; one half of the generated phrase is retained.
    pub output: String,
    #[arg(long, help = "Optional post-FX, including comma-separated chains")]
    pub fx: Option<String>,
}

#[derive(Clone, Debug)]
struct Hit {
    frame: usize,
    end: usize,
    strength: f32,
}

struct Analysis {
    envelope: Vec<f32>,
    hop: usize,
    hits: Vec<Hit>,
}

impl Analysis {
    fn at(&self, frame: usize) -> f32 {
        let index = frame / self.hop;
        let left = self.envelope[index.min(self.envelope.len() - 1)];
        let right = self.envelope[(index + 1).min(self.envelope.len() - 1)];
        left + (right - left) * (frame % self.hop) as f32 / self.hop as f32
    }
}

fn analyze(samples: &[f32], channels: usize, rate: u32) -> Analysis {
    let frames = samples.len() / channels;
    let hop = (rate as usize / 500).max(1); // 2 ms, independent of a musical grid.
    let window = (rate as usize / 100).max(1); // 10 ms RMS; never sum stereo phases.
    let mut powers = vec![0.0_f64; window];
    let mut sum = 0.0;
    let mut envelope = Vec::with_capacity(frames / hop + 1);
    for (i, frame) in samples.chunks_exact(channels).enumerate() {
        sum -= powers[i % window];
        let power = frame.iter().map(|x| (*x as f64).powi(2)).sum::<f64>() / channels as f64;
        powers[i % window] = power;
        sum += power;
        if i % hop == 0 {
            envelope.push((sum.max(0.0) / window as f64).sqrt() as f32);
        }
    }
    let peak = envelope.iter().copied().fold(0.0_f32, f32::max);
    if peak <= 1e-8 {
        return Analysis {
            envelope,
            hop,
            hits: vec![],
        };
    }
    for value in &mut envelope {
        *value /= peak;
    }
    let refractory = (rate as usize / 40).max(hop).max(frames.div_ceil(MAX_HITS)); // At most one new attack per 25 ms.
    let history = (rate as usize / hop / 20).max(1); // Adaptive 50 ms background.
    let mut starts = Vec::new();
    let mut background_sum = 0.0;
    for i in 0..envelope.len() {
        let value = envelope[i];
        let previous = if i == 0 { 0.0 } else { envelope[i - 1] };
        let background = background_sum / i.min(history).max(1) as f32;
        if value > 0.035
            && value - previous > 0.018
            && value > background * 1.45
            && starts
                .last()
                .is_none_or(|last: &usize| i * hop >= *last + refractory)
        {
            // Backtrack the analysis window to the start of this rise, retaining swing.
            let mut start = i;
            while start > i.saturating_sub(window / hop + 1)
                && start > 0
                && envelope[start - 1] < envelope[start]
            {
                start -= 1;
            }
            let frame = start * hop;
            if starts.last().is_none_or(|last| frame >= *last + refractory) {
                starts.push(frame);
            }
        }
        background_sum += value;
        if i >= history {
            background_sum -= envelope[i - history];
        }
    }
    // Constant material still has a single initial attack; silence has none.
    if starts.is_empty() {
        if let Some(index) = envelope.iter().position(|value| *value > 0.1) {
            starts.push(index * hop);
        }
    }
    let mut hits = Vec::with_capacity(starts.len());
    for (index, frame) in starts.iter().copied().enumerate() {
        let next = starts.get(index + 1).copied().unwrap_or(frames);
        let first = frame / hop;
        let peak_end = (first + history)
            .min(envelope.len())
            .min(next.div_ceil(hop));
        let strength = envelope[first..peak_end.max(first + 1)]
            .iter()
            .copied()
            .fold(0.0_f32, f32::max);
        let mut end = next;
        let minimum = first + (rate as usize / hop / 50).max(1);
        let mut quiet = 0;
        for (i, value) in envelope
            .iter()
            .enumerate()
            .take(next.div_ceil(hop))
            .skip(minimum)
        {
            if *value < strength * 0.08 {
                quiet += 1;
            } else {
                quiet = 0;
            }
            if quiet >= 4 {
                end = ((i - 3) * hop).min(next);
                break;
            }
        }
        if end > frame {
            hits.push(Hit {
                frame,
                end,
                strength,
            });
        }
    }
    Analysis {
        envelope,
        hop,
        hits,
    }
}

#[derive(Clone, Copy)]
struct Grain {
    start: usize,
    gain: f32,
    score: f32,
}

fn texture_grains(samples: &[f32], channels: usize, length: usize) -> Vec<Grain> {
    let frames = samples.len() / channels;
    let peak = samples
        .iter()
        .copied()
        .map(f32::abs)
        .fold(0.0_f32, f32::max);
    let mut grains = Vec::new();
    for i in 0..128 {
        let start = (frames - length) * i / 127;
        let mut energy = 0.0_f64;
        let mut change = 0.0_f64;
        let mut half = [0.0_f64; 2];
        for t in 0..length {
            for ch in 0..channels {
                let sample = samples[(start + t) * channels + ch] as f64;
                let square = sample * sample;
                energy += square;
                half[usize::from(t >= length / 2)] += square;
                if t > 0 {
                    change += (sample - samples[(start + t - 1) * channels + ch] as f64).powi(2);
                }
            }
        }
        let rms = (energy / (length * channels) as f64).sqrt() as f32;
        if rms > (peak * 0.015).max(1e-8) {
            let score = ((half[0] - half[1]).abs() + change) / energy.max(1e-20);
            grains.push(Grain {
                start,
                gain: (0.2 / rms).min(8.0),
                score: score as f32,
            });
        }
    }
    grains.sort_by(|a, b| a.score.total_cmp(&b.score));
    grains.truncate(24); // Prefer sustained windows while retaining seeded variety.
    grains
}

fn edge(frame: usize, length: usize, attack: usize, release: usize) -> f32 {
    (frame as f32 / attack.max(1) as f32).min(1.0)
        * ((length - 1 - frame) as f32 / release.max(1) as f32).min(1.0)
}

fn decode(wav: &[u8]) -> Result<(Vec<f32>, WavSpec), String> {
    let reader =
        WavReader::new(Cursor::new(wav)).map_err(|e| format!("Invalid imprint WAV: {e}"))?;
    let mut spec = reader.spec();
    let samples: Result<Vec<f32>, _> = match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, 32) => reader.into_samples::<f32>().collect(),
        (SampleFormat::Int, 16 | 24 | 32) => {
            let scale = 2.0_f64.powi(spec.bits_per_sample as i32 - 1);
            reader
                .into_samples::<i32>()
                .map(|value| value.map(|value| (value as f64 / scale) as f32))
                .collect()
        }
        _ => return Err("Unsupported imprint WAV format".into()),
    };
    spec.sample_format = SampleFormat::Float;
    spec.bits_per_sample = 32;
    Ok((
        samples.map_err(|e| format!("Cannot decode imprint WAV: {e}"))?,
        spec,
    ))
}

pub(crate) fn limit_duration(wav: Vec<u8>, rng: &mut StdRng) -> Result<Vec<u8>, String> {
    let (spec, count) = {
        let reader = WavReader::new(Cursor::new(&wav))
            .map_err(|e| format!("Invalid imprint output: {e}"))?;
        (reader.spec(), reader.len() as usize)
    };
    let cap = spec.sample_rate as usize * 23 * spec.channels as usize;
    if count <= cap {
        return Ok(wav);
    }
    let maximum =
        (spec.sample_rate as f64 * rng.gen_range(18.0..23.0)) as usize * spec.channels as usize;
    let (mut samples, spec) = decode(&wav)?;
    samples.truncate(maximum);
    let channels = spec.channels as usize;
    let frames = samples.len() / channels;
    let fade = (spec.sample_rate as usize / 200).max(1).min(frames);
    for t in 0..fade {
        let gain = t as f32 / fade as f32;
        for ch in 0..channels {
            samples[(frames - 1 - t) * channels + ch] *= gain;
        }
    }
    wrap_samples(samples, spec)
}

fn keep_half(mut samples: Vec<f32>, spec: WavSpec, rng: &mut StdRng) -> Result<Vec<u8>, String> {
    let channels = spec.channels as usize;
    let half = samples.len() / channels / 2 * channels;
    if rng.gen_bool(0.5) {
        samples.copy_within(half.., 0);
    }
    samples.truncate(half);
    let frames = half / channels;
    let fade = (spec.sample_rate as usize / 500).max(1).min(frames / 2);
    for i in 0..fade {
        let gain = i as f32 / fade as f32;
        for ch in 0..channels {
            samples[i * channels + ch] *= gain;
            samples[(frames - 1 - i) * channels + ch] *= gain;
        }
    }
    wrap_samples(samples, spec)
}

pub fn imprint(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    if wavs.len() < 3 {
        return Err("imprint requires rhythm, texture, and accent WAVs".into());
    }
    let mut total = 0_usize;
    let mut expected = None;
    for (index, wav) in wavs[..3].iter().enumerate() {
        let reader = WavReader::new(Cursor::new(*wav))
            .map_err(|e| format!("Invalid imprint input {}: {e}", index + 1))?;
        let spec = reader.spec();
        if !matches!(spec.channels, 1 | 2) || !(8000..=192000).contains(&spec.sample_rate) {
            return Err("imprint requires mono/stereo audio at 8–192 kHz".into());
        }
        if expected.is_some_and(|value| value != (spec.sample_rate, spec.channels)) {
            return Err("imprint inputs must have matching sample rates and channels".into());
        }
        expected = Some((spec.sample_rate, spec.channels));
        let count = reader.len() as usize;
        if count % spec.channels as usize != 0 || count / (spec.channels as usize) < 64 {
            return Err("imprint requires at least 64 complete frames per input".into());
        }
        total = total
            .checked_add(count)
            .filter(|n| *n <= MAX_SAMPLES)
            .ok_or("imprint inputs exceed the 128 MB decoded-audio limit")?;
    }
    let (mut rhythm, spec) = decode(wavs[0])?;
    let (texture, _) = decode(wavs[1])?;
    let (accents, _) = decode(wavs[2])?;
    if [&rhythm, &texture, &accents]
        .iter()
        .any(|s| s.iter().any(|x| !x.is_finite()))
    {
        return Err("imprint requires finite audio samples".into());
    }
    let channels = spec.channels as usize;
    // Keep the entire chosen groove's relative timing, varying its tempo by seed.
    let source_frames = (rhythm.len() / channels)
        .min(spec.sample_rate as usize * 6)
        .min(MAX_SAMPLES / CYCLES / channels);
    rhythm.truncate(source_frames * channels);
    let frames = ((source_frames as f64 * rng.gen_range(0.6..0.95)).round() as usize).max(1);
    let analysis = analyze(&rhythm, channels, spec.sample_rate);
    let mut output = vec![0.0_f32; frames * channels * CYCLES];
    if analysis.hits.is_empty() {
        return keep_half(output, spec, rng);
    }
    let texture_frames = texture.len() / channels;
    let mut grain_size = ((spec.sample_rate as f32 * rng.gen_range(0.025..=0.065)) as usize)
        .clamp(16, texture_frames);
    grain_size -= grain_size % 2;
    let hop = grain_size / 2;
    let window: Vec<f32> = (0..grain_size)
        .map(|i| 0.5 - 0.5 * (TAU * i as f32 / grain_size as f32).cos())
        .collect();
    let grains = texture_grains(&texture, channels, grain_size);
    let mut accent_analysis = analyze(&accents, channels, spec.sample_rate);
    accent_analysis
        .hits
        .sort_by(|a, b| b.strength.total_cmp(&a.strength));
    accent_analysis.hits.truncate(16);
    let accent_peak = accents
        .iter()
        .copied()
        .map(f32::abs)
        .fold(0.0_f32, f32::max);
    let strongest = analysis
        .hits
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.strength.total_cmp(&b.strength))
        .unwrap()
        .0;
    let mut strengths: Vec<f32> = analysis.hits.iter().map(|hit| hit.strength).collect();
    strengths.sort_by(f32::total_cmp);
    let strong_threshold = strengths[strengths.len() * 3 / 5];
    let density = rng.gen_range(0.6..=1.0);
    for (cycle, probability) in [0.15, 0.35, 0.65, 0.4].into_iter().enumerate() {
        for (index, hit) in analysis.hits.iter().enumerate() {
            let frame = hit.frame * frames / source_frames;
            let end = hit.end * frames / source_frames;
            let length = end - frame;
            if length == 0 {
                continue;
            }
            let attack = (spec.sample_rate as f32 * rng.gen_range(0.001..=0.005)) as usize;
            let release =
                ((spec.sample_rate as f32 * rng.gen_range(0.012..=0.040)) as usize).min(length / 3);
            if !grains.is_empty() {
                let choices: Vec<Grain> = (0..length / hop + 2)
                    .map(|_| grains[rng.gen_range(0..grains.len())])
                    .collect();
                for t in 0..length {
                    let step = t / hop + 1;
                    let offset = t % hop;
                    let gain = analysis.at((frame + t) * source_frames / frames)
                        * edge(t, length, attack, release);
                    for ch in 0..channels {
                        let a = choices[step];
                        let b = choices[step - 1];
                        let value =
                            texture[(a.start + offset) * channels + ch] * a.gain * window[offset]
                                + texture[(b.start + offset + hop) * channels + ch]
                                    * b.gain
                                    * window[offset + hop];
                        output[((cycle * frames + frame + t) * channels) + ch] += value * gain;
                    }
                }
            }
            let accent = ((cycle == 1 || cycle == 2) && index == strongest)
                || (hit.strength >= strong_threshold && rng.gen_bool(probability * density));
            if accent && !accent_analysis.hits.is_empty() && accent_peak > 1e-8 {
                let donor = &accent_analysis.hits[rng.gen_range(0..accent_analysis.hits.len())];
                let size = ((spec.sample_rate as f32 * rng.gen_range(0.025..=0.110)) as usize)
                    .max(2)
                    .min(accents.len() / channels - donor.frame)
                    .min(length);
                let gain = rng.gen_range(0.25..=0.5) / accent_peak;
                let repeats = if cycle == 3 && index + 1 == analysis.hits.len() {
                    2
                } else {
                    1
                };
                for repeat in 0..repeats {
                    let delay = repeat * (size / 3).max(1);
                    let duration = size.min(length.saturating_sub(delay));
                    for t in 0..duration {
                        let position = frame + t + delay;
                        let gain = gain
                            * analysis.at(position * source_frames / frames)
                            * edge(
                                t,
                                duration,
                                (spec.sample_rate as usize / 1000).max(1),
                                (size / 4).max(1),
                            );
                        for ch in 0..channels {
                            output[(cycle * frames + position) * channels + ch] +=
                                accents[(donor.frame + t) * channels + ch] * gain;
                        }
                    }
                }
            }
        }
    }
    let peak = output.iter().copied().map(f32::abs).fold(0.0_f32, f32::max);
    if peak > 0.95 {
        for value in &mut output {
            *value *= 0.95 / peak;
        }
    }
    keep_half(output, spec, rng)
}

#[cfg(test)]
mod duration_tests {
    use super::*;
    use crate::utils::get_samples;
    use rand::SeedableRng;
    #[test]
    fn extended_effect_output_is_shortened_and_faded() {
        let spec = WavSpec {
            sample_rate: 8000,
            channels: 1,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let long = wrap_samples(vec![0.2; 8000 * 30], spec).unwrap();
        let output = limit_duration(long, &mut StdRng::seed_from_u64(42)).unwrap();
        let (samples, _) = get_samples(&output).unwrap();
        assert!(samples.len() < 24 * 8000);
        assert_eq!(samples.last(), Some(&0.0));
    }
    #[test]
    fn long_inputs_produce_at_most_twenty_four_seconds() {
        let rate = 8000;
        let spec = WavSpec {
            sample_rate: rate,
            channels: 2,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let rhythm = wrap_samples(vec![0.2; rate as usize * 17 * 2], spec).unwrap();
        let donor = wrap_samples(
            (0..rate * 2)
                .map(|i| (TAU * 220.0 * (i / 2) as f32 / rate as f32).sin() * 0.2)
                .collect(),
            spec,
        )
        .unwrap();
        let output = imprint(&[&rhythm, &donor, &donor], &mut StdRng::seed_from_u64(42)).unwrap();
        let (samples, spec) = get_samples(&output).unwrap();
        assert!(samples.len() / (spec.channels as usize) < 12 * rate as usize);
        let mut lengths = std::collections::HashSet::new();
        for seed in 0..8 {
            let result =
                imprint(&[&rhythm, &donor, &donor], &mut StdRng::seed_from_u64(seed)).unwrap();
            let (samples, spec) = get_samples(&result).unwrap();
            assert!(samples.len() / (spec.channels as usize) < 24 * rate as usize);
            lengths.insert(samples.len());
        }
        assert!(
            lengths.len() > 1,
            "Different seeds must produce varying loop lengths"
        );
        assert!(samples.iter().any(|value| value.abs() > 0.01));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_samples;
    use hound::{SampleFormat, WavSpec};
    use rand::SeedableRng;
    const RATE: u32 = 8000;
    fn wav(samples: Vec<f32>, channels: u16) -> Vec<u8> {
        wrap_samples(
            samples,
            WavSpec {
                channels,
                sample_rate: RATE,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap()
    }
    fn rhythm() -> Vec<f32> {
        let mut out = vec![0.0; RATE as usize];
        for (seconds, gain) in [(0.11, 1.0), (0.337, 0.65), (0.718, 0.85)] {
            let start = (seconds * RATE as f64) as usize;
            for t in 0..320 {
                out[start + t] = (TAU * 1300.0 * t as f32 / RATE as f32).sin()
                    * gain
                    * (-(t as f32) / 75.0).exp();
            }
        }
        out
    }
    fn tone(frequency: f32) -> Vec<f32> {
        (0..RATE)
            .map(|i| (TAU * frequency * i as f32 / RATE as f32).sin() * 0.3)
            .collect()
    }
    fn generate(a: &[f32], b: &[f32], c: &[f32], seed: u64) -> Vec<f32> {
        let (a, b, c) = (wav(a.to_vec(), 1), wav(b.to_vec(), 1), wav(c.to_vec(), 1));
        get_samples(&imprint(&[&a, &b, &c], &mut StdRng::seed_from_u64(seed)).unwrap())
            .unwrap()
            .0
    }
    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    #[test]
    fn transfers_irregular_hits_and_preserves_gaps_in_the_retained_half() {
        let a = rhythm();
        let b = tone(220.0);
        let silence = vec![0.0; RATE as usize];
        let output = generate(&a, &b, &silence, 42);
        let cycle_frames = output.len() / 2;
        assert!(cycle_frames < a.len() && cycle_frames > a.len() / 2);
        for cycle in 0..2 {
            let start = cycle * cycle_frames;
            for seconds in [0.11, 0.337, 0.718] {
                let hit = start + (seconds * cycle_frames as f64) as usize;
                assert!(
                    rms(&output[hit + 8..hit + 100]) > 0.01,
                    "Missing hit at {seconds}, cycle {cycle}"
                );
            }
            for seconds in [0.02, 0.24, 0.55, 0.9] {
                let gap = start + (seconds * cycle_frames as f64) as usize;
                assert!(
                    rms(&output[gap..gap + 80]) < 1e-6,
                    "Filled a quiet gap at {seconds}"
                );
            }
            assert!(output[start].abs() < 1e-6 && output[start + cycle_frames - 1].abs() < 1e-6);
        }
        assert!(
            output
                .iter()
                .all(|sample| sample.is_finite() && sample.abs() <= 0.951)
        );
    }
    #[test]
    fn seed_is_repeatable_but_generations_vary_and_the_rhythm_audio_never_leaks() {
        let (a, b, c) = (rhythm(), tone(217.0), tone(877.0));
        let output = generate(&a, &b, &c, 42);
        assert_eq!(output, generate(&a, &b, &c, 42));
        assert_ne!(output, generate(&a, &b, &c, 43));
        let silence = vec![0.0; RATE as usize];
        assert!(
            generate(&a, &silence, &silence, 42)
                .iter()
                .all(|x| *x == 0.0)
        );
        assert!(generate(&silence, &b, &c, 42).iter().all(|x| *x == 0.0));
        let accents_only = generate(&a, &silence, &c, 42);
        assert!(
            rms(&accents_only) > 0.005,
            "Either retained half must include source C"
        );
    }
    #[test]
    fn donor_timbre_replaces_the_trigger_carrier() {
        let output = generate(&rhythm(), &tone(220.0), &vec![0.0; RATE as usize], 42);
        let power = |frequency: f32| {
            let mut real = 0.0;
            let mut imaginary = 0.0;
            for (i, sample) in output.iter().enumerate() {
                let phase = TAU * frequency * i as f32 / RATE as f32;
                real += sample * phase.cos();
                imaginary += sample * phase.sin();
            }
            real * real + imaginary * imaginary
        };
        assert!(power(220.0) > power(1300.0) * 20.0);
    }
    #[test]
    fn opposite_phase_stereo_still_triggers_and_keeps_the_texture_image() {
        let a: Vec<_> = rhythm().into_iter().flat_map(|x| [x, -x]).collect();
        let b: Vec<_> = tone(217.0)
            .into_iter()
            .flat_map(|x| [x, -x * 0.5])
            .collect();
        let silence = vec![0.0; b.len()];
        let (a, b, c) = (wav(a, 2), wav(b, 2), wav(silence, 2));
        let result = imprint(&[&a, &b, &c], &mut StdRng::seed_from_u64(42)).unwrap();
        let (samples, spec) = get_samples(&result).unwrap();
        assert_eq!(spec.channels, 2);
        assert!(rms(&samples) > 0.005);
        assert!(
            samples
                .chunks_exact(2)
                .all(|pair| (pair[1] + pair[0] * 0.5).abs() < 1e-6)
        );
    }
    #[test]
    fn rejects_bad_inputs_and_is_absent_from_the_browser_catalog() {
        let a = wav(rhythm(), 1);
        let b = wav(tone(220.0), 1);
        let mut rng = StdRng::seed_from_u64(42);
        assert!(crate::blenders::experimental::find("imprint").is_some());
        assert!(!crate::blend::get_blenders().contains_key("imprint"));
        assert!(
            !crate::blend::get_blenders_js()
                .iter()
                .any(|name| name == "imprint")
        );
        assert!(imprint(&[&a, &b], &mut rng).is_err());
        assert!(imprint(&[&a, &b, b"invalid"], &mut rng).is_err());
        assert!(imprint(&[&a, &b, &wav(vec![0.0; 32], 1)], &mut rng).is_err());
        assert!(imprint(&[&a, &b, &wav(vec![f32::NAN; RATE as usize], 1)], &mut rng).is_err());
        assert!(imprint(&[&a, &b, &wav(vec![0.0; RATE as usize * 2], 2)], &mut rng).is_err());
        let other = wrap_samples(
            tone(220.0),
            WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        assert!(imprint(&[&a, &b, &other], &mut rng).is_err());
        let mut oversized = a.clone();
        let pos = oversized
            .windows(4)
            .position(|bytes| bytes == b"data")
            .unwrap();
        oversized[pos + 4..pos + 8].copy_from_slice(&200_000_000_u32.to_le_bytes());
        assert!(
            imprint(&[&oversized, &b, &b], &mut rng)
                .unwrap_err()
                .contains("limit")
        );
    }
}
