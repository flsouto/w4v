//! Native-only polymeter inside a power-of-two phrase: independent 4-, 3-, and 6-beat clocks.
use crate::utils::wrap_samples;
use clap::Parser;
use hound::{SampleFormat, WavReader, WavSpec};
use rand::{Rng, rngs::StdRng};
use std::io::Cursor;

const MAX_INPUT_SAMPLES: usize = 32_000_000;
const PHRASE_BARS: usize = 8;

#[derive(Parser, Debug)]
#[command(about = "Layer 4-, 3-, and 6-beat phrases into a dry polymetric loop (CLI only)")]
pub struct OrbitArgs {
    /// Steady four-beat anchor source.
    pub anchor: String,
    /// Three-beat moving motif source.
    pub motif: String,
    /// Sparse six-beat answer source.
    pub answer: String,
    pub output: String,
    #[arg(long, help = "Optional post-FX; the mixer itself is dry")]
    pub fx: Option<String>,
}

struct Plan {
    beat: usize,
    bars: usize,
}
impl Plan {
    fn new(rate: u32, rng: &mut StdRng) -> Self {
        let bpm = rng.gen_range(104..=144);
        let beat = (rate as f64 * 60.0 / bpm as f64).round() as usize;
        Self {
            beat,
            bars: PHRASE_BARS,
        }
    }
}

struct Clip {
    samples: Vec<f32>,
    gain: f32,
}

fn decode(wav: &[u8]) -> Result<(Vec<f32>, WavSpec), String> {
    let reader = WavReader::new(Cursor::new(wav)).map_err(|e| format!("Invalid Orbit WAV: {e}"))?;
    let mut spec = reader.spec();
    let result: Result<Vec<f32>, _> = match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, 32) => reader.into_samples::<f32>().collect(),
        (SampleFormat::Int, 16 | 24 | 32) => {
            let scale = 2.0_f64.powi(spec.bits_per_sample as i32 - 1);
            reader
                .into_samples::<i32>()
                .map(|sample| sample.map(|x| (x as f64 / scale) as f32))
                .collect()
        }
        _ => return Err("Unsupported Orbit WAV format".into()),
    };
    spec.bits_per_sample = 32;
    spec.sample_format = SampleFormat::Float;
    let mut samples = result.map_err(|e| format!("Cannot decode Orbit WAV: {e}"))?;
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err("Orbit requires finite audio samples".into());
    }
    let peak = samples
        .iter()
        .map(|value| value.abs())
        .fold(0.0_f32, f32::max);
    if peak > 1.0 {
        for sample in &mut samples {
            *sample /= peak;
        }
    }
    Ok((samples, spec))
}

fn pick_clip(
    source: &[f32],
    channels: usize,
    wanted: usize,
    level: f32,
    rate: u32,
    rng: &mut StdRng,
) -> Clip {
    let frames = wanted.min(source.len() / channels).max(1);
    // Audition several positions and avoid landing in an empty section of a source.
    let mut start = 0;
    let mut best = -1.0;
    for _ in 0..8 {
        let candidate = rng.gen_range(0..=source.len() / channels - frames);
        let stride = (frames / 256).max(1);
        let energy: f64 = (0..frames)
            .step_by(stride)
            .flat_map(|i| {
                (0..channels).map(move |ch| source[(candidate + i) * channels + ch] as f64)
            })
            .map(|x| x * x)
            .sum();
        if energy > best {
            best = energy;
            start = candidate;
        }
    }
    if best <= 1e-10 {
        let peak = source
            .chunks_exact(channels)
            .enumerate()
            .max_by(|(_, a), (_, b)| {
                let energy = |frame: &[f32]| frame.iter().map(|x| (*x as f64).powi(2)).sum::<f64>();
                energy(a).total_cmp(&energy(b))
            })
            .map(|(i, _)| i)
            .unwrap_or(0);
        start = peak
            .saturating_sub(rate as usize / 100)
            .min(source.len() / channels - frames);
    }
    let mut samples = source[start * channels..(start + frames) * channels].to_vec();
    // Remove DC independently, keeping the original stereo image and pitch.
    for ch in 0..channels {
        let mean = samples
            .iter()
            .skip(ch)
            .step_by(channels)
            .map(|x| *x as f64)
            .sum::<f64>()
            / frames as f64;
        for value in samples.iter_mut().skip(ch).step_by(channels) {
            *value = (*value as f64 - mean) as f32;
        }
    }
    let rms =
        (samples.iter().map(|x| (*x as f64).powi(2)).sum::<f64>() / samples.len() as f64).sqrt();
    let gain = if rms > 1e-8 {
        (level as f64 / rms).min(8.0) as f32
    } else {
        0.0
    };
    let attack = (rate as usize * 3 / 1000).max(1).min(frames / 2);
    let release = (rate as usize * 8 / 1000).max(1).min(frames / 2);
    for (i, frame) in samples.chunks_exact_mut(channels).enumerate() {
        let edge = (i as f32 / attack.max(1) as f32).min(1.0)
            * ((frames - 1 - i) as f32 / release.max(1) as f32).min(1.0);
        for sample in frame {
            *sample *= edge;
        }
    }
    Clip { samples, gain }
}

fn place(cycle: &mut [f32], clip: &Clip, start: usize, channels: usize, pan: f32) {
    let cycle_frames = cycle.len() / channels;
    let balance = [(1.0 - pan).sqrt(), (1.0 + pan).sqrt()];
    for (i, frame) in clip.samples.chunks_exact(channels).enumerate() {
        for ch in 0..channels {
            let gain = if channels == 1 {
                clip.gain
            } else {
                clip.gain * balance[ch]
            };
            // Only event tails wrap; no events are scheduled beyond the final bar.
            cycle[((start + i) % cycle_frames) * channels + ch] += frame[ch] * gain;
        }
    }
}

pub fn orbit(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    if wavs.len() < 3 {
        return Err("Orbit requires anchor, motif, and answer WAVs".into());
    }
    let mut total = 0_usize;
    let mut format = None;
    for wav in &wavs[..3] {
        let reader =
            WavReader::new(Cursor::new(*wav)).map_err(|e| format!("Invalid Orbit input: {e}"))?;
        let spec = reader.spec();
        if !matches!(spec.channels, 1 | 2) || !(8000..=192000).contains(&spec.sample_rate) {
            return Err("Orbit requires mono/stereo audio at 8–192 kHz".into());
        }
        if format.is_some_and(|value| value != (spec.sample_rate, spec.channels)) {
            return Err("Orbit inputs must have matching sample rates and channels".into());
        }
        format = Some((spec.sample_rate, spec.channels));
        let count = reader.len() as usize;
        if count % spec.channels as usize != 0 || count / (spec.channels as usize) < 32 {
            return Err("Orbit requires at least 32 complete frames per input".into());
        }
        total = total
            .checked_add(count)
            .filter(|count| *count <= MAX_INPUT_SAMPLES)
            .ok_or("Orbit inputs exceed the 128 MB decoded-audio limit")?;
    }
    let (anchor, spec) = decode(wavs[0])?;
    let (motif, _) = decode(wavs[1])?;
    let (answer, _) = decode(wavs[2])?;
    let channels = spec.channels as usize;
    let plan = Plan::new(spec.sample_rate, rng);
    let cycle_frames = plan.beat * plan.bars * 4;
    let mut cycle = vec![0.0_f32; cycle_frames * channels];
    let a = pick_clip(
        &anchor,
        channels,
        plan.beat * 4,
        0.18,
        spec.sample_rate,
        rng,
    );
    for bar in 0..plan.bars {
        place(&mut cycle, &a, bar * 4 * plan.beat, channels, 0.0);
    }
    let b = pick_clip(
        &motif,
        channels,
        (plan.beat as f64 * rng.gen_range(0.4..0.85)) as usize,
        0.10,
        spec.sample_rate,
        rng,
    );
    let b_phase = rng.gen_range(0..6); // Half-beat offsets in a three-beat phrase.
    let b_pan = rng.gen_range(-0.4..-0.1);
    let b_answer = rng.gen_bool(0.55);
    for base in (0..cycle_frames).step_by(plan.beat * 3) {
        let position = base + b_phase * plan.beat / 2;
        if position < cycle_frames {
            place(&mut cycle, &b, position, channels, b_pan);
        }
        if b_answer {
            let position = base + ((b_phase + 3) % 6) * plan.beat / 2;
            if position < cycle_frames {
                place(&mut cycle, &b, position, channels, b_pan);
            }
        }
    }
    let c = pick_clip(
        &answer,
        channels,
        (plan.beat as f64 * rng.gen_range(0.35..1.1)) as usize,
        0.075,
        spec.sample_rate,
        rng,
    );
    let c_phase = rng.gen_range(0..12);
    let c_pan = rng.gen_range(0.1..0.4);
    let c_answer = rng.gen_bool(0.3);
    for base in (0..cycle_frames).step_by(plan.beat * 6) {
        let position = base + c_phase * plan.beat / 2;
        if position < cycle_frames {
            place(&mut cycle, &c, position, channels, c_pan);
        }
        if c_answer {
            let position = base + ((c_phase + 5) % 12) * plan.beat / 2;
            if position < cycle_frames {
                place(&mut cycle, &c, position, channels, c_pan);
            }
        }
    }
    let peak = cycle.iter().map(|x| x.abs()).fold(0.0_f32, f32::max);
    if peak > 0.95 {
        for sample in &mut cycle {
            *sample *= 0.95 / peak;
        }
    }
    wrap_samples(cycle, spec)
}

// Optional post-FX can stretch audio; this guard is applied by the native dispatcher.
pub(crate) fn limit_duration(wav: Vec<u8>) -> Result<Vec<u8>, String> {
    let (spec, count) = {
        let reader = WavReader::new(Cursor::new(&wav)).map_err(|e| e.to_string())?;
        (reader.spec(), reader.len() as usize)
    };
    let mut frames = count / spec.channels as usize;
    let maximum = spec.sample_rate as usize * 24;
    let mut bars = PHRASE_BARS;
    while frames >= maximum && bars > 2 {
        frames /= 2;
        bars /= 2;
    }
    if frames >= maximum {
        return Err(
            "Orbit post-FX make even two bars exceed 24 seconds; use less time stretching".into(),
        );
    }
    if frames * spec.channels as usize == count {
        return Ok(wav);
    }
    let (mut samples, spec) = decode(&wav)?;
    samples.truncate(frames * spec.channels as usize);
    let channels = spec.channels as usize;
    let frames = samples.len() / channels;
    let fade = (spec.sample_rate as usize / 200).max(1).min(frames / 2);
    for i in 0..fade {
        let gain = i as f32 / fade as f32;
        for ch in 0..channels {
            samples[i * channels + ch] *= gain;
            samples[(frames - 1 - i) * channels + ch] *= gain;
        }
    }
    wrap_samples(samples, spec)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_samples;
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
    fn tone(frequency: f32) -> Vec<f32> {
        (0..RATE * 3)
            .map(|i| (std::f32::consts::TAU * frequency * i as f32 / RATE as f32).sin() * 0.3)
            .collect()
    }
    fn render(wavs: &[&[u8]], seed: u64) -> Vec<f32> {
        get_samples(&orbit(wavs, &mut StdRng::seed_from_u64(seed)).unwrap())
            .unwrap()
            .0
    }
    #[test]
    fn independent_lanes_keep_their_periods_inside_a_power_of_two_phrase() {
        let donor = wav(tone(217.0), 1);
        let silent = wav(vec![0.0; RATE as usize * 3], 1);
        let seed = 42;
        let plan = Plan::new(RATE, &mut StdRng::seed_from_u64(seed));
        for (role, period) in [(0, 4), (1, 3), (2, 6)] {
            let mut inputs = [silent.as_slice(); 3];
            inputs[role] = donor.as_slice();
            let output = render(&inputs, seed);
            assert_eq!(output.len(), plan.beat * 4 * plan.bars);
            assert!([2, 4, 8, 16].contains(&plan.bars));
            assert!(output.iter().any(|x| x.abs() > 0.01));
            for i in plan.beat * 6..output.len() - plan.beat * (6 + period) {
                assert!(
                    (output[i] - output[i + plan.beat * period]).abs() < 1e-6,
                    "Lane {role} lost its {period}-beat clock"
                );
            }
        }
        let output = render(&[&donor, &donor, &donor], seed);
        for i in plan.beat * 6..output.len() - plan.beat * 18 {
            assert!((output[i] - output[i + plan.beat * 12]).abs() < 1e-6);
        }
        assert!(output.iter().all(|x| x.is_finite() && x.abs() <= 0.951));
        let largest_step = output
            .windows(2)
            .map(|s| (s[1] - s[0]).abs())
            .fold(0.0_f32, f32::max);
        assert!(
            (output[0] - output[output.len() - 1]).abs() <= largest_step + 1e-5,
            "The loop seam must not introduce a larger discontinuity"
        );
    }
    #[test]
    fn seeded_outputs_repeat_but_lengths_vary_around_sixteen_seconds() {
        let (a, b, c) = (
            wav(tone(173.0), 1),
            wav(tone(271.0), 1),
            wav(tone(431.0), 1),
        );
        let inputs = [a.as_slice(), b.as_slice(), c.as_slice()];
        assert_eq!(render(&inputs, 42), render(&inputs, 42));
        let mut lengths = std::collections::HashSet::new();
        for seed in 0..12 {
            let output = render(&inputs, seed);
            let duration = output.len() as f64 / RATE as f64;
            assert!(
                (11.0..21.0).contains(&duration),
                "Unexpected duration {duration}"
            );
            assert!(duration < 24.0);
            lengths.insert(output.len());
        }
        assert!(lengths.len() > 2);
    }
    #[test]
    fn stereo_donors_keep_their_channels_and_silence_stays_silent() {
        let donor = wav(
            tone(217.0)
                .into_iter()
                .flat_map(|x| [x, -x * 0.5])
                .collect(),
            2,
        );
        let silent = wav(vec![0.0; RATE as usize * 3 * 2], 2);
        let output = render(&[&silent, &donor, &silent], 42);
        let ratio = output
            .chunks_exact(2)
            .find(|frame| frame[0].abs() > 0.01)
            .map(|frame| frame[1] / frame[0])
            .unwrap();
        assert!(ratio < 0.0);
        assert!(
            output
                .chunks_exact(2)
                .all(|frame| (frame[1] - frame[0] * ratio).abs() < 1e-5)
        );
        assert!(
            render(&[&silent, &silent, &silent], 42)
                .iter()
                .all(|x| *x == 0.0)
        );
    }
    #[test]
    fn native_registration_validation_and_post_fx_duration_guard() {
        assert!(crate::blenders::experimental::find("orbit").is_some());
        assert!(!crate::blend::get_blenders().contains_key("orbit"));
        assert!(
            !crate::blend::get_blenders_js()
                .iter()
                .any(|name| name == "orbit")
        );
        let a = wav(tone(220.0), 1);
        let mut rng = StdRng::seed_from_u64(42);
        assert!(orbit(&[&a, &a], &mut rng).is_err());
        assert!(orbit(&[&a, &a, b"invalid"], &mut rng).is_err());
        assert!(orbit(&[&a[..a.len() - 2], &a, &a], &mut rng).is_err());
        assert!(orbit(&[&a, &a, &wav(vec![f32::NAN; 8000], 1)], &mut rng).is_err());
        assert!(orbit(&[&a, &a, &wav(vec![0.0; 16], 1)], &mut rng).is_err());
        assert!(orbit(&[&a, &a, &wav(vec![0.0; 16000], 2)], &mut rng).is_err());
        let mut large = a.clone();
        let data = large.windows(4).position(|s| s == b"data").unwrap();
        large[data + 4..data + 8].copy_from_slice(&200_000_000_u32.to_le_bytes());
        assert!(
            orbit(&[&large, &a, &a], &mut rng)
                .unwrap_err()
                .contains("limit")
        );
        let long = wav(vec![0.2; RATE as usize * 30], 1);
        let (samples, spec) = get_samples(&limit_duration(long).unwrap()).unwrap();
        assert!((samples.len() as f64 / spec.sample_rate as f64) < 24.0);
        assert_eq!(
            samples.len(),
            15 * RATE as usize,
            "Post-FX limiting must keep a whole half (four bars)"
        );
        assert_eq!(samples[0], 0.0);
        assert_eq!(samples.last(), Some(&0.0));
    }
}
