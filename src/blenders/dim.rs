//! Port of beatcli/mixers/dim.php. DSP stays in decoded PCM until final encoding.
//! SoX conventions: oops = L-R on both channels, delay affects channel 1 only,
//! synth sin fmod multiplies the input by an offset sine, tremolo starts at its peak.
use crate::utils::{get_samples, wrap_samples};
use rand::{Rng, rngs::StdRng};
use std::f64::consts::{FRAC_1_SQRT_2, TAU};

#[derive(Clone, Copy)]
struct Params {
    oops: bool,
    speed: f64,
    cutoff: f64,
    delay: f64,
    layer: Option<(f64, f64, f64)>, // carrier Hz, offset fraction, tremolo Hz
}

pub fn dim(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    if wavs.len() < 2 {
        return Err("dim requires two input WAVs".into());
    }
    let oops = rng.gen_bool(0.5);
    let speed = rng.gen_range(2..=6) as f64 / 10.0;
    let cutoff = rng.gen_range(200..=600) as f64;
    let delay = rng.gen_range(2..=6) as f64 / 10.0;
    let layer = if rng.gen_bool(0.5) {
        Some((
            rng.gen_range(250..=500) as f64,
            rng.gen_range(5..=40) as f64 / 100.0,
            rng.gen_range(1..=9) as f64 / 10.0,
        ))
    } else {
        None
    };
    render(
        wavs,
        Params {
            oops,
            speed,
            cutoff,
            delay,
            layer,
        },
    )
}

fn render(wavs: &[&[u8]], params: Params) -> Result<Vec<u8>, String> {
    let (mut a, spec) = get_samples(wavs[0])?;
    let channels = spec.channels as usize;
    let rate = spec.sample_rate as f64;
    if channels == 0 || rate * params.speed <= 2.0 * params.cutoff || a.is_empty() {
        return Err("dim requires nonempty audio and a sample rate above twice the cutoff".into());
    }
    // Decode both inputs even when the optional layer is off, to reject invalid input consistently.
    let (b, b_spec) = get_samples(wavs[1])?;
    if b.is_empty() || b_spec.channels != spec.channels || b_spec.sample_rate != spec.sample_rate {
        return Err(
            "dim inputs must be nonempty and have matching channels and sample rates".into(),
        );
    }
    if params.layer.is_some() && rate <= 6000.0 {
        return Err("dim's 3000 Hz highpass requires a sample rate above 6000 Hz".into());
    }
    if params.oops && channels == 2 {
        for frame in a.chunks_exact_mut(2) {
            let side = (frame[0] - frame[1]).clamp(-1.0, 1.0);
            frame.fill(side);
        }
    }
    let frames = ((a.len() / channels) as f64 / params.speed).round() as usize;
    // Limit intermediate PCM to 32 million samples (~128 MB), including slowed audio.
    // The browser has its own source limits; this also protects native callers.
    if frames
        .checked_mul(channels)
        .filter(|&n| n <= 32_000_000)
        .is_none()
    {
        return Err(
            "dim slowed audio exceeds the 128 MB processing limit; use a shorter sample".into(),
        );
    }
    // Within one SoX mod call, speed changes the effective rate seen by lowpass.
    filter(&mut a, channels, rate * params.speed, params.cutoff, false);
    let mut out = resample(&a, channels, frames);
    drop(a);

    // `delay .d` pads the first channel only. PHP cut(0, '-.d') then removes
    // that extra duration, leaving this channel shifted inside the original length.
    let offset = (params.delay * rate).round() as usize;
    for frame in (0..frames).rev() {
        out[frame * channels] = if frame >= offset {
            out[(frame - offset) * channels]
        } else {
            0.0
        };
    }
    // PHP halves once (it does not repeatedly halve until <=40 seconds).
    if frames as f64 / rate > 40.0 {
        out.truncate((frames / 2) * channels);
    }

    if let Some((frequency, offset, tremolo)) = params.layer {
        let mut layer = resample(&b, channels, out.len() / channels);
        let gain = 10.0_f64.powf(-30.0 / 20.0);
        for (i, frame) in layer.chunks_exact_mut(channels).enumerate() {
            let carrier = (TAU * frequency * i as f64 / rate).sin() * (1.0 - offset) + offset;
            for sample in frame {
                *sample = (*sample as f64 * gain * carrier) as f32;
            }
        }
        filter(&mut layer, channels, rate, 3000.0, true);
        for (i, frame) in layer.chunks_exact(channels).enumerate() {
            let envelope = 0.6 + 0.4 * (TAU * tremolo * i as f64 / rate).cos(); // depth 80%
            for (ch, &sample) in frame.iter().enumerate() {
                let index = i * channels + ch;
                // PHP mix(false) sums at unity, unlike the existing Rust mix's averaging.
                out[index] = (out[index] as f64 + sample as f64 * envelope).clamp(-1.0, 1.0) as f32;
            }
        }
    }
    wrap_samples(out, spec)
}

// Linear interpolation, consistent with this project's speed/resize approach.
// SoX uses a band-limited resampler; output is intentionally not bit-identical.
fn resample(samples: &[f32], channels: usize, frames: usize) -> Vec<f32> {
    let source_frames = samples.len() / channels;
    let mut out = Vec::with_capacity(frames * channels);
    for i in 0..frames {
        let position = i as f64 * source_frames as f64 / frames as f64;
        let left = position.floor() as usize;
        let right = (left + 1).min(source_frames - 1);
        let fraction = position.fract() as f32;
        for ch in 0..channels {
            out.push(
                samples[left * channels + ch] * (1.0 - fraction)
                    + samples[right * channels + ch] * fraction,
            );
        }
    }
    out
}

// Standard RBJ two-pole Butterworth low/high-pass, matching SoX's default Q.
// https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html
fn filter(samples: &mut [f32], channels: usize, rate: f64, cutoff: f64, high: bool) {
    let omega = TAU * cutoff / rate;
    let cosine = omega.cos();
    let alpha = omega.sin() / (2.0 * FRAC_1_SQRT_2);
    let a0 = 1.0 + alpha;
    let b0 = if high {
        (1.0 + cosine) / 2.0
    } else {
        (1.0 - cosine) / 2.0
    } / a0;
    let b1 = if high { -(1.0 + cosine) } else { 1.0 - cosine } / a0;
    let a1 = -2.0 * cosine / a0;
    let a2 = (1.0 - alpha) / a0;
    let mut state = vec![[0.0_f64; 4]; channels];
    for (i, sample) in samples.iter_mut().enumerate() {
        let [x1, x2, y1, y2] = state[i % channels];
        let x = *sample as f64;
        let y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        state[i % channels] = [x, x1, y, y1];
        *sample = y.clamp(-1.0, 1.0) as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{SampleFormat, WavSpec};
    use rand::SeedableRng;

    fn input(seconds: f64, mono: bool) -> Vec<u8> {
        let channels = if mono { 1 } else { 2 };
        let samples = (0..(seconds * 8000.0) as usize)
            .flat_map(|i| {
                (0..channels).map(move |ch| {
                    (0.2 * (TAU * (230.0 + ch as f64 * 110.0) * i as f64 / 8000.0).sin()) as f32
                })
            })
            .collect();
        wrap_samples(
            samples,
            WavSpec {
                channels,
                sample_rate: 8000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap()
    }
    fn params() -> Params {
        Params {
            oops: false,
            speed: 0.5,
            cutoff: 400.0,
            delay: 0.2,
            layer: None,
        }
    }

    #[test]
    fn delay_shifts_only_first_channel_and_discards_tail() {
        let wav = input(0.5, false);
        let out = render(&[&wav, &wav], params()).unwrap();
        let (samples, spec) = get_samples(&out).unwrap();
        assert_eq!(spec.channels, 2);
        assert_eq!(samples.len(), 16000); // 1 second; no added delay tail
        assert!(samples[..3200].chunks_exact(2).all(|f| f[0] == 0.0));
        assert!(samples[..3200].chunks_exact(2).any(|f| f[1].abs() > 0.01));
        assert!(samples[3200..].chunks_exact(2).any(|f| f[0].abs() > 0.01));
    }
    #[test]
    fn optional_layer_and_oops_both_affect_audio() {
        let wav = input(0.5, false);
        let base = render(&[&wav, &wav], params()).unwrap();
        let side = render(
            &[&wav, &wav],
            Params {
                oops: true,
                ..params()
            },
        )
        .unwrap();
        let layered = render(
            &[&wav, &wav],
            Params {
                layer: Some((350.0, 0.2, 0.5)),
                ..params()
            },
        )
        .unwrap();
        assert_ne!(base, side);
        assert_ne!(base, layered);
        let (samples, _) = get_samples(&layered).unwrap();
        assert!(samples.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
    }
    #[test]
    fn long_audio_is_halved_once() {
        let wav = input(17.0, true);
        let out = render(
            &[&wav, &wav],
            Params {
                speed: 0.2,
                ..params()
            },
        )
        .unwrap();
        assert!((crate::len(&out).unwrap() - 42.5).abs() < 0.001);
    }
    #[test]
    fn seeded_mixer_is_repeatable_and_registered() {
        let wav = input(0.1, false);
        assert!(crate::blend::get_blenders().contains_key("dim"));
        for seed in 0..8 {
            let run = || dim(&[&wav, &wav], &mut StdRng::seed_from_u64(seed)).unwrap();
            assert_eq!(run(), run());
        }
        assert!(dim(&[], &mut StdRng::seed_from_u64(0)).is_err());
        assert!(dim(&[&wav], &mut StdRng::seed_from_u64(0)).is_err());
    }

    #[test]
    #[ignore = "requires the reference SoX executable"]
    fn compare_fixed_parameters_with_sox() {
        use std::{fs, process::Command};
        let dir = std::env::temp_dir().join(format!("w4v-dim-sox-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let a = input(0.5, false);
        fs::write(dir.join("input.wav"), &a).unwrap();
        let (_, spec) = get_samples(&a).unwrap();
        let bright: Vec<f32> = (0..8000)
            .flat_map(|i| {
                (0..2).map(move |ch| {
                    (0.3 * (TAU * (2800.0 + ch as f64 * 200.0) * i as f64 / 8000.0).sin()) as f32
                })
            })
            .collect();
        let b = wrap_samples(bright, spec).unwrap();
        fs::write(dir.join("second.wav"), &b).unwrap();
        for oops in [false, true] {
            for layer in [None, Some((350.0, 0.2, 0.5))] {
                let p = Params {
                    oops,
                    layer,
                    ..params()
                };
                let actual = render(&[&a, &b], p).unwrap();
                let mut args = vec!["input.wav", "base.wav"];
                if oops {
                    args.push("oops");
                }
                args.extend(["speed", ".5", "lowpass", "400", "delay", ".2"]);
                let run = |args: &[&str]| {
                    let result = Command::new("sox")
                        .current_dir(&dir)
                        .args(args)
                        .output()
                        .unwrap();
                    assert!(
                        result.status.success(),
                        "{}",
                        String::from_utf8_lossy(&result.stderr)
                    );
                };
                run(&args);
                run(&["base.wav", "trim.wav", "trim", "0", "1"]);
                let expected_file = if layer.is_some() {
                    run(&["second.wav", "resized.wav", "speed", "1"]);
                    run(&[
                        "resized.wav",
                        "layer.wav",
                        "gain",
                        "-30",
                        "synth",
                        "sin",
                        "fmod",
                        "350",
                        "20",
                        "highpass",
                        "3000",
                        "tremolo",
                        ".5",
                        "80",
                    ]);
                    run(&[
                        "-m",
                        "-v",
                        "1",
                        "trim.wav",
                        "-v",
                        "1",
                        "layer.wav",
                        "mixed.wav",
                    ]);
                    "mixed.wav"
                } else {
                    "trim.wav"
                };
                let (expected, _) =
                    get_samples(&fs::read(dir.join(expected_file)).unwrap()).unwrap();
                let (actual, _) = get_samples(&actual).unwrap();
                assert_eq!(actual.len(), expected.len());
                let error: f64 = actual
                    .iter()
                    .zip(&expected)
                    .map(|(a, b)| (*a as f64 - *b as f64).powi(2))
                    .sum();
                let energy: f64 = expected.iter().map(|s| (*s as f64).powi(2)).sum();
                let relative_error = (error / energy).sqrt();
                assert!(
                    relative_error < 0.03,
                    "oops={oops}, layer={layer:?}, relative RMS error={relative_error}"
                );
            }
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
