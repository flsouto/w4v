use hound::{WavReader, SampleFormat, WavSpec};
use std::io::Cursor;
use std::fs;

pub fn get_samples(input_wav: &[u8]) -> Result<(Vec<f32>, WavSpec), String> {
    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let mut spec = reader.spec();

    let samples: Vec<f32> = match (spec.bits_per_sample, spec.sample_format) {
        (16, SampleFormat::Int) => reader.into_samples::<i16>()
            .map(|s| s.unwrap_or(0) as f32 / i16::MAX as f32)
            .collect(),
        (24, SampleFormat::Int) => reader.into_samples::<i32>()
            .map(|s| s.unwrap_or(0) as f32 / (1 << 23) as f32)
            .collect(),
        (32, SampleFormat::Int) => reader.into_samples::<i32>()
            .map(|s| s.unwrap_or(0) as f32 / i32::MAX as f32)
            .collect(),
        (32, SampleFormat::Float) => reader.into_samples::<f32>()
            .map(|s| s.unwrap_or(0.0))
            .collect(),
        _ => return Err("Unsupported WAV format".to_string()),
    };

    spec.sample_format = SampleFormat::Float;
    spec.bits_per_sample = 32;

    Ok((samples, spec))
}

// Recreates the WAV out of a samples vector + spec object
pub fn wrap_samples(samples: Vec<f32>, spec: WavSpec) -> Result<Vec<u8>, String>{
    let mut out_bytes: Vec<u8> = Vec::new();
    let out_cursor = Cursor::new(&mut out_bytes);
    let mut writer = hound::WavWriter::new(out_cursor, spec)
        .map_err(|e| format!("Write error: {}", e))?;

    for sample in samples {
        writer.write_sample(sample)
            .map_err(|e| format!("Write sample error: {}", e))?;
    }
    writer.finalize()
        .map_err(|e| format!("Finalize error: {}", e))?;

    Ok(out_bytes)

}

pub fn clamp_samples(samples: &mut Vec<f32>) {
    // Implement soft clipping using tanh
    // A gain of 1.0 means no additional amplification before tanh,
    // effectively mapping values smoothly to the -1.0 to 1.0 range.
    let soft_clip_gain = 1.0; // Default gain for soft clipping
    for sample in samples.iter_mut() {
        *sample = (*sample * soft_clip_gain).tanh();
    }
}

pub fn get_dummy() -> Vec<u8> {
    let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
    fs::read(dummy_wav_path).expect("Failed to read dummy.wav")
}

pub fn normalize_speed(wav1:&[u8], wav2:&[u8]) -> Result<(Vec<u8>,Vec<u8>,f32), String> {
    let len1 = crate::len(wav1)?;
    let len2 = crate::len(wav2)?;
    let avg_len = (len1 + len2) / 2.0;
    let o1 = crate::resize(wav1, avg_len)?;
    let o2 = crate::resize(wav2, avg_len)?;
    Ok((o1, o2, avg_len))
}

/// Align selected CLI inputs without modifying sources or changing playback speed.
/// Target 44.1 kHz stereo; compatible inputs retain their exact bytes.
/// Mono is duplicated to stereo; other channel remaps are rejected.
pub fn normalize_blend_inputs(wavs: &mut [Vec<u8>]) -> Result<(), String> {
    let target = WavSpec { sample_rate: 44100, channels: 2,
        bits_per_sample: 32, sample_format: SampleFormat::Float };
    for (index, wav) in wavs.iter_mut().enumerate() {
        let source = WavReader::new(Cursor::new(wav.as_slice()))
            .map_err(|e| format!("Invalid input WAV {}: {e}", index + 1))?.spec();
        if source.sample_rate == target.sample_rate && source.channels == target.channels {
            continue;
        }
        if source.sample_rate == 0 || source.channels == 0 {
            return Err(format!("Input WAV {} has an invalid rate or channel count", index + 1));
        }
        if source.channels != target.channels && (source.channels > 2 || target.channels > 2) {
            return Err(format!("Cannot convert input WAV {} from {} to stereo; only mono/stereo inputs are supported", index + 1, source.channels));
        }
        let (samples, _) = get_samples(wav)?;
        let channels = source.channels as usize;
        if samples.len() % channels != 0 {
            return Err(format!("Input WAV {} contains an incomplete audio frame", index + 1));
        }
        let frames = samples.len() / channels;
        let output_frames = (frames as u64 * target.sample_rate as u64 + source.sample_rate as u64 / 2)
            / source.sample_rate as u64;
        let output_len = usize::try_from(output_frames).ok()
            .and_then(|n| n.checked_mul(target.channels as usize))
            .filter(|&n| n <= 32_000_000)
            .ok_or("Converted input exceeds the 128 MB processing limit; use shorter inputs")?;
        let mut output = Vec::with_capacity(output_len);
        for i in 0..output_frames as usize {
            let position = i as f64 * source.sample_rate as f64 / target.sample_rate as f64;
            let left = (position.floor() as usize).min(frames - 1);
            let right = (left + 1).min(frames - 1);
            let fraction = position.fract() as f32;
            let at = |frame: usize, ch: usize| {
                samples[frame * channels + if channels == 1 { 0 } else { ch }]
            };
            for ch in 0..target.channels as usize {
                output.push(at(left, ch) * (1.0 - fraction) + at(right, ch) * fraction);
            }
        }
        let spec = WavSpec { sample_rate: target.sample_rate, channels: target.channels,
            bits_per_sample: 32, sample_format: SampleFormat::Float };
        *wav = wrap_samples(output, spec)?;
    }
    Ok(())
}

/// CLI export format, applied after all mixer processing, post-FX and gain.
pub fn finalize_blend_output(wav: Vec<u8>) -> Result<Vec<u8>, String> {
    let mut wavs = [wav];
    normalize_blend_inputs(&mut wavs)?;
    let (samples, mut spec) = get_samples(&wavs[0])?;
    spec.bits_per_sample = 16;
    spec.sample_format = SampleFormat::Int;
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("Failed to create PCM WAV: {e}"))?;
        for sample in samples {
            if !sample.is_finite() {
                return Err("Cannot export non-finite audio samples".into());
            }
            writer.write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16)
                .map_err(|e| format!("Failed to write PCM sample: {e}"))?;
        }
        writer.finalize().map_err(|e| format!("Failed to finalize PCM WAV: {e}"))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_get_samples() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let (samples, spec) = get_samples(&input_wav).expect("Failed to get samples");

        assert!(!samples.is_empty(), "Samples should not be empty");
        assert!(spec.channels > 0, "Channels should be greater than 0");
        assert!(spec.sample_rate > 0, "Sample rate should be greater than 0");
    }
}
