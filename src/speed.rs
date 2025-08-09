use wasm_bindgen::prelude::*;
use hound::{WavReader, SampleFormat};
use std::io::Cursor;
use js_sys;
use clap::Parser;

pub fn speed(input_wav: Vec<u8>, factor: f32) -> Result<Vec<u8>, String> {
    if factor <= 0.0 {
        return Err("Speed factor must be positive.".to_string());
    }

    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let spec = reader.spec();
    let channels = spec.channels as usize;

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

    let num_samples = samples.len() / channels;
    let new_num_samples = (num_samples as f32 / factor) as usize;
    let mut output_samples = Vec::with_capacity(new_num_samples * channels);

    for i in 0..new_num_samples {
        for ch in 0..channels {
            let original_pos = i as f32 * factor;
            let index1 = original_pos.floor() as usize;
            let index2 = original_pos.ceil() as usize;
            let frac = original_pos.fract();

            let sample1_idx = index1 * channels + ch;
            let sample2_idx = index2 * channels + ch;

            let sample1 = samples.get(sample1_idx).cloned().unwrap_or(0.0);
            let sample2 = samples.get(sample2_idx).cloned().unwrap_or(0.0);

            let new_sample = sample1 * (1.0 - frac) + sample2 * frac;
            output_samples.push(new_sample);
        }
    }

    // Write output as 16-bit PCM
    let mut out_bytes: Vec<u8> = Vec::new();
    {
        let out_cursor = Cursor::new(&mut out_bytes);
        let mut writer = hound::WavWriter::new(out_cursor, hound::WavSpec {
            channels: spec.channels,
            sample_rate: spec.sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        }).map_err(|e| format!("Write error: {}", e))?;

        for sample in output_samples {
            let val = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer.write_sample(val)
                .map_err(|e| format!("Write sample error: {}", e))?;
        }
        writer.finalize()
            .map_err(|e| format!("Finalize error: {}", e))?;
    }

    Ok(out_bytes)
}


#[wasm_bindgen]
pub fn speed_js(input_wav: &[u8], factor: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match speed(input_wav.to_vec(), factor) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Changes the speed and pitch of a WAV file", long_about = None)]
pub struct SpeedArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Speed factor. > 1.0 for faster, < 1.0 for slower.
    #[arg()]
    pub factor: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::len::len;

    #[test]
    fn test_speed_factor() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Test with factor < 1 (slower speed, longer duration)
        let factor_slower = 0.5;
        let output_wav_slower = speed(input_wav.clone(), factor_slower).expect("Speed function failed for slower factor");
        let slower_duration = len(output_wav_slower).expect("Failed to get slower duration");
        assert!(slower_duration > original_duration, "Slower speed should result in longer duration");

        // Test with factor > 1 (faster speed, shorter duration)
        let factor_faster = 2.0;
        let output_wav_faster = speed(input_wav.clone(), factor_faster).expect("Speed function failed for faster factor");
        let faster_duration = len(output_wav_faster).expect("Failed to get faster duration");
        assert!(faster_duration < original_duration, "Faster speed should result in shorter duration");
    }
}