use hound::{WavReader, SampleFormat, WavSpec};
use std::io::Cursor;

pub fn get_samples(input_wav: Vec<u8>) -> Result<(Vec<f32>, WavSpec), String> {
    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let spec = reader.spec();

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
    Ok((samples, spec))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_get_samples() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let (samples, spec) = get_samples(input_wav).expect("Failed to get samples");

        assert!(!samples.is_empty(), "Samples should not be empty");
        assert!(spec.channels > 0, "Channels should be greater than 0");
        assert!(spec.sample_rate > 0, "Sample rate should be greater than 0");
    }
}