use wasm_bindgen::prelude::*;
use hound::{SampleFormat};
use std::io::Cursor;
use js_sys;
use clap::Parser;
use crate::utils::get_samples;

pub fn reverse(input_wav: Vec<u8>) -> Result<Vec<u8>, String> {
    let (samples, spec) = get_samples(input_wav)?;

    let mut out_bytes: Vec<u8> = Vec::new();
    {
        let out_cursor = Cursor::new(&mut out_bytes);
        // Output as 16-bit PCM for compatibility
        let mut writer = hound::WavWriter::new(out_cursor, hound::WavSpec {
            channels: spec.channels,
            sample_rate: spec.sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        }).map_err(|e| format!("Write error: {}", e))?;

        for s in samples.into_iter().rev() {
            let val = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer.write_sample(val)
                .map_err(|e| format!("Write sample error: {}", e))?;
        }

        writer.finalize()
            .map_err(|e| format!("Finalize error: {}", e))?;
    }

    Ok(out_bytes)
}

#[wasm_bindgen]
pub fn reverse_js(input_wav: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    match reverse(input_wav.to_vec()) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Reverses a WAV file", long_about = None)]
pub struct ReverseArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::len::len;

    #[test]
    fn test_reverse_effect() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        let output_wav = reverse(input_wav.clone()).expect("Reverse function failed");

        let processed_duration = len(output_wav.clone()).expect("Failed to get processed duration");

        // Assert that the duration remains the same
        assert_eq!(original_duration, processed_duration, "Reverse should not change the duration");

        // Assert that the content has changed (i.e., reverse was applied)
        assert_ne!(input_wav, output_wav, "Reverse should modify the audio content");
    }
}