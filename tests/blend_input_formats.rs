use hound::{SampleFormat, WavSpec};
use std::{
    fs,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use w4v::utils::{finalize_blend_output, get_samples, normalize_blend_inputs, wrap_samples};

fn wav(rate: u32, channels: u16) -> Vec<u8> {
    let samples = (0..rate / 2)
        .flat_map(|i| {
            (0..channels).map(move |ch| {
                (std::f64::consts::TAU * 220.0 * i as f64 / rate as f64).sin() as f32
                    * if ch == 0 { 0.2 } else { 0.6 }
            })
        })
        .collect();
    wrap_samples(
        samples,
        WavSpec {
            channels,
            sample_rate: rate,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        },
    )
    .unwrap()
}

#[test]
fn resampling_preserves_duration_and_pitch_at_standard_rate() {
    for second_rate in [48000, 22050] {
        let first_rate = 44100;
        let first = wav(first_rate, 2);
        let mut inputs = vec![first.clone(), wav(second_rate, 1)];
        normalize_blend_inputs(&mut inputs).unwrap();
        assert_eq!(inputs[0], first);
        let (samples, spec) = get_samples(&inputs[1]).unwrap();
        assert_eq!(spec.sample_rate, first_rate);
        assert_eq!(spec.channels, 2);
        assert_eq!(samples.len(), first_rate as usize);
        assert!(samples.chunks_exact(2).all(|frame| frame[0] == frame[1]));
        let mono: Vec<_> = samples.chunks_exact(2).map(|f| f[0]).collect();
        let crossings = mono
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        assert!(
            (crossings as i32 - 110).abs() <= 1,
            "pitch must stay at 220 Hz"
        );
    }
}

#[test]
fn compatible_wavs_are_unchanged_and_stereo_channels_stay_distinct() {
    let original = wav(44100, 2);
    let mut inputs = vec![original.clone(), wav(48000, 2)];
    normalize_blend_inputs(&mut inputs).unwrap();
    assert_eq!(inputs[0], original);
    let (samples, _) = get_samples(&inputs[1]).unwrap();
    assert!(
        samples
            .chunks_exact(2)
            .all(|f| (f[1] - 3.0 * f[0]).abs() < 1e-6)
    );
    let normalized = inputs.clone();
    normalize_blend_inputs(&mut inputs).unwrap();
    assert_eq!(inputs, normalized);
    assert!(normalize_blend_inputs(&mut [vec![0; 16]]).is_err());
    assert!(normalize_blend_inputs(&mut [wav(44100, 6)]).is_err());
}

#[test]
fn final_export_resamples_and_clips_to_pcm16() {
    let bytes = wrap_samples(
        vec![-2.0, -0.5, 0.0, 0.5, 2.0],
        WavSpec {
            channels: 1,
            sample_rate: 22050,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        },
    )
    .unwrap();
    let output = finalize_blend_output(bytes).unwrap();
    let mut reader = hound::WavReader::new(std::io::Cursor::new(output)).unwrap();
    assert_eq!(reader.spec().sample_rate, 44100);
    assert_eq!(reader.spec().channels, 2);
    assert_eq!(reader.spec().bits_per_sample, 16);
    assert_eq!(reader.spec().sample_format, SampleFormat::Int);
    let samples: Vec<_> = reader.samples::<i16>().map(Result::unwrap).collect();
    assert_eq!(samples.len(), 20);
    assert_eq!(samples[0], -32767);
    assert_eq!(samples[8], 0);
    assert_eq!(samples[16], 32767);
    assert!(samples.chunks_exact(2).all(|f| f[0] == f[1]));
}

#[test]
fn cli_xfade_accepts_mixed_rates_and_channels_without_changing_sources() {
    let directory = std::env::temp_dir().join(format!(
        "w4v-formats-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let input = directory.join("inputs");
    fs::create_dir_all(&input).unwrap();
    let originals: Vec<_> = [8000, 11025, 16000, 22050]
        .into_iter()
        .enumerate()
        .map(|(i, rate)| wav(rate, if i % 2 == 0 { 1 } else { 2 }))
        .collect();
    for (i, bytes) in originals.iter().enumerate() {
        fs::write(input.join(format!("{i}.wav")), bytes).unwrap();
    }
    let result = Command::new(env!("CARGO_BIN_EXE_w4v"))
        .args(["--seed", "42", "blend"])
        .arg(&input)
        .arg(directory.join("output.wav"))
        .arg("xfade")
        .output()
        .unwrap();
    let bytes = fs::read(directory.join("output.wav"));
    let unchanged = originals
        .iter()
        .enumerate()
        .all(|(i, bytes)| fs::read(input.join(format!("{i}.wav"))).unwrap() == *bytes);
    fs::remove_dir_all(&directory).unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(unchanged);
    let bytes = bytes.unwrap();
    let spec = hound::WavReader::new(std::io::Cursor::new(&bytes))
        .unwrap()
        .spec();
    assert_eq!(spec.sample_rate, 44100);
    assert_eq!(spec.channels, 2);
    assert_eq!(spec.bits_per_sample, 16);
    assert_eq!(spec.sample_format, SampleFormat::Int);
    let (samples, _) = get_samples(&bytes).unwrap();
    assert!(samples.iter().all(|s| s.is_finite()));
    assert!((w4v::len(&bytes).unwrap() - 0.5).abs() < 0.005);
}
