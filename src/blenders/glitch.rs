//! Musical port of beatcli/mixers/glitch.php; bounded, decoded-PCM processing.
use crate::utils::{get_samples, wrap_samples};
use rand::{Rng, rngs::StdRng};
use std::f64::consts::TAU;

pub fn glitch(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    if wavs.len() < 2 {
        return Err("glitch requires two input WAVs".into());
    }
    let (mut a, spec) = get_samples(wavs[0])?;
    let (mut b, other) = get_samples(wavs[1])?;
    let channels = spec.channels as usize;
    if channels == 0
        || spec.sample_rate == 0
        || other.channels != spec.channels
        || other.sample_rate != spec.sample_rate
    {
        return Err("glitch inputs must have matching channels and sample rates".into());
    }
    if [a.as_slice(), b.as_slice()].iter().any(|s| {
        s.len() % channels != 0 || s.len() / channels < 64 || s.iter().any(|v| !v.is_finite())
    }) {
        return Err("glitch requires finite audio with at least 64 frames per input".into());
    }
    // first_segment() in PHP retains the first quarter before normalizing speed.
    a.truncate((a.len() / channels / 4) * channels);
    b.truncate((b.len() / channels / 4) * channels);
    let frames_a = a.len() / channels;
    let frames_b = b.len() / channels;
    let frames = if rng.gen_bool(0.5) {
        (frames_a + frames_b) / 2
    } else {
        frames_a
    };
    let output_samples = frames
        .checked_mul(channels)
        .and_then(|n| n.checked_mul(4))
        .filter(|&n| n <= 32_000_000)
        .ok_or("glitch output exceeds the 128 MB processing limit; use shorter inputs")?;
    let a = resize(&a, channels, frames);
    let b = resize(&b, channels, frames);
    let chop = rng.gen_bool(0.5);
    let extras = rng.gen_bool(0.5);
    let mut out = Vec::with_capacity(output_samples);
    for index in 0..16 {
        // Integer boundaries keep every frame, including non-divisible lengths.
        let start = index * frames / 16;
        let end = (index + 1) * frames / 16;
        let source = if rng.gen_bool(0.5) { &a } else { &b };
        let mut piece = source[start * channels..end * channels].to_vec();
        fade_edges(&mut piece, channels, spec.sample_rate);
        if !extras || rng.gen_bool(0.5) {
            let mut pitch = 10;
            let mut cents = 0;
            for _ in 0..16 {
                cents += pitch;
                pitch += rng.gen_range(5..=20);
            }
            // Consecutive SoX pitch calls add cents. Collapse them into one pass
            // instead of sixteen expensive time-stretch/re-encoding operations.
            piece = granular(
                &piece,
                channels,
                spec.sample_rate,
                2_f64.powf(cents as f64 / 1200.0),
                1.0,
            );
        } else if chop && rng.gen_bool(0.5) {
            let slices = rng.gen_range(16..=99);
            let period = ((end - start) / slices).max(1);
            for frame in period..end - start {
                for ch in 0..channels {
                    piece[frame * channels + ch] = piece[(frame % period) * channels + ch];
                }
            }
        } else {
            // tempo .5 doubles duration without changing pitch; cut(0,'1/2')
            // keeps the original duration, covering the first half of the source.
            piece = granular(&piece, channels, spec.sample_rate, 1.0, 0.5);
        }
        out.extend(piece);
    }
    let cycle = out.len();
    out.extend_from_within(..cycle);
    out.extend_from_within(..cycle * 2);
    wrap_samples(out, spec)
}

fn resize(input: &[f32], channels: usize, frames: usize) -> Vec<f32> {
    let source_frames = input.len() / channels;
    (0..frames * channels)
        .map(|i| {
            sample(
                input,
                channels,
                i % channels,
                (i / channels) as f64 * source_frames as f64 / frames as f64,
            )
        })
        .collect()
}

fn sample(input: &[f32], channels: usize, ch: usize, position: f64) -> f32 {
    let frames = input.len() / channels;
    let position = position.clamp(0.0, (frames - 1) as f64);
    let left = position.floor() as usize;
    let right = (left + 1).min(frames - 1);
    let fraction = position.fract() as f32;
    input[left * channels + ch] * (1.0 - fraction) + input[right * channels + ch] * fraction
}

fn fade_edges(input: &mut [f32], channels: usize, rate: u32) {
    let frames = input.len() / channels;
    let fade = (rate as f64 * 0.005).round().max(1.0) as usize;
    for (i, frame) in input.chunks_exact_mut(channels).enumerate() {
        // SoX defaults to a logarithmic fade from -100 dB to unity.
        let envelope =
            |distance: usize| 10_f64.powf(5.0 * ((distance as f64 / fade as f64).min(1.0) - 1.0));
        let gain = (envelope(i) * envelope(frames - i)) as f32;
        for value in frame {
            *value *= gain;
        }
    }
}

// Hann-windowed overlap-add: fixed output length, shared grain positions for
// all channels. Source-center speed controls tempo; local rate controls pitch.
fn granular(input: &[f32], channels: usize, rate: u32, pitch: f64, speed: f64) -> Vec<f32> {
    let frames = input.len() / channels;
    let grain = ((rate as usize / 25).max(8)).min(frames.max(8));
    let hop = (grain / 4).max(1);
    let mut output = vec![0.0; input.len()];
    let mut weights = vec![0.0_f64; frames];
    let mut center = -(grain as isize);
    while center < (frames + grain) as isize {
        for offset in 0..grain {
            let relative = offset as f64 - grain as f64 / 2.0;
            let destination = center + offset as isize - (grain / 2) as isize;
            if destination < 0 || destination >= frames as isize {
                continue;
            }
            let source = center as f64 * speed + relative * pitch;
            if source < 0.0 || source > (frames - 1) as f64 {
                continue;
            }
            let weight = 0.5 - 0.5 * (TAU * offset as f64 / grain as f64).cos();
            let i = destination as usize;
            weights[i] += weight;
            for ch in 0..channels {
                output[i * channels + ch] += sample(input, channels, ch, source) * weight as f32;
            }
        }
        center += hop as isize;
    }
    for (frame, weight) in output.chunks_exact_mut(channels).zip(weights) {
        if weight > 1e-9 {
            for value in frame {
                *value /= weight as f32;
            }
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{SampleFormat, WavSpec};
    use rand::SeedableRng;

    fn input(frames: usize, channels: u16) -> Vec<u8> {
        wrap_samples(
            (0..frames)
                .flat_map(|i| {
                    (0..channels).map(move |_| (TAU * 220.0 * i as f64 / 8000.0).sin() as f32 * 0.4)
                })
                .collect(),
            WavSpec {
                channels,
                sample_rate: 8000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap()
    }

    #[test]
    fn registered_seeded_and_four_identical_cycles() {
        let a = input(16003, 2);
        let b = input(8001, 2);
        assert!(crate::blend::get_blenders().contains_key("glitch"));
        for seed in 0..32 {
            let run = || {
                crate::blend::blend(&[&a, &b], &mut StdRng::seed_from_u64(seed), "glitch", None)
                    .unwrap()
            };
            let bytes = run();
            assert_eq!(bytes, run());
            let (samples, spec) = get_samples(&bytes).unwrap();
            assert_eq!(spec.channels, 2);
            assert!(samples.iter().all(|s| s.is_finite() && s.abs() <= 1.00001));
            assert!(samples.iter().any(|s| s.abs() > 0.1));
            let cycle = samples.len() / 4;
            assert!([4000 * 2, 3000 * 2].contains(&cycle));
            assert!(samples.chunks_exact(cycle).all(|c| c == &samples[..cycle]));
        }
    }

    #[test]
    fn final_level_is_three_db_lower_after_normalization_and_fx() {
        let a = input(8000, 2);
        for fx in [None, Some("reverse")] {
            let mut rng = StdRng::seed_from_u64(42);
            let raw = glitch(&[&a, &a], &mut rng).unwrap();
            let processed = match fx {
                Some(name) => crate::fx::apply_fx_with_rng(&raw, &mut rng, name.into()).unwrap(),
                None => raw,
            };
            let (expected, spec) = get_samples(&crate::maxgain(&processed).unwrap()).unwrap();
            let result =
                crate::blend::blend(&[&a, &a], &mut StdRng::seed_from_u64(42), "glitch", fx)
                    .unwrap();
            let (actual, actual_spec) = get_samples(&result).unwrap();
            assert_eq!(actual_spec, spec);
            assert_eq!(actual.len(), expected.len());
            let trim = 10.0_f32.powf(-3.0 / 20.0);
            assert!(
                actual
                    .iter()
                    .zip(expected)
                    .all(|(a, b)| (*a - b * trim).abs() < 1e-6)
            );
            let peak = actual.iter().fold(0.0_f32, |p, s| p.max(s.abs()));
            assert!((peak - trim).abs() < 1e-6);
        }
        let raw = crate::blenders::xfade(&[&a, &a], &mut StdRng::seed_from_u64(42)).unwrap();
        assert_eq!(
            crate::blend::blend(&[&a, &a], &mut StdRng::seed_from_u64(42), "xfade", None).unwrap(),
            crate::maxgain(&raw).unwrap()
        );
    }

    #[test]
    fn rejects_missing_empty_and_mismatched_inputs() {
        let a = input(8000, 1);
        let b = input(8000, 2);
        let empty = input(0, 1);
        for inputs in [vec![], vec![a.as_slice()], vec![&a, &b], vec![&a, &empty]] {
            assert!(glitch(&inputs, &mut StdRng::seed_from_u64(0)).is_err());
        }
    }

    #[test]
    fn granular_pitch_changes_frequency_without_changing_duration() {
        let (samples, _) = get_samples(&input(8000, 1)).unwrap();
        let shifted = granular(&samples, 1, 8000, 2.0, 1.0);
        let stretched = granular(&samples, 1, 8000, 1.0, 0.5);
        let crossings = |s: &[f32]| {
            s[800..7200]
                .windows(2)
                .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
                .count()
        };
        assert_eq!(shifted.len(), samples.len());
        assert!((crossings(&shifted) as f64 / crossings(&samples) as f64 - 2.0).abs() < 0.1);
        assert!((crossings(&stretched) as f64 / crossings(&samples) as f64 - 1.0).abs() < 0.1);
    }

    #[test]
    fn fade_matches_sox_logarithmic_reference() {
        let mut samples = vec![1.0; 160];
        fade_edges(&mut samples, 1, 8000);
        for (i, expected) in [
            (0, 0.00001),
            (20, 0.00316228),
            (40, 1.0),
            (120, 1.0),
            (140, 0.00316228),
        ] {
            assert!((samples[i] - expected).abs() < 1e-6);
        }
    }
}
