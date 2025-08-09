use wasm_bindgen::prelude::*;
use hound::{WavReader, SampleFormat};
use std::io::Cursor;
use js_sys;
use clap::Parser;

pub fn reverse(input_wav: Vec<u8>) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let spec = reader.spec();

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

        match (spec.bits_per_sample, spec.sample_format) {
            (16, SampleFormat::Int) => {
                let samples: Vec<i16> = reader
                    .into_samples::<i16>()
                    .map(|s| s.unwrap_or(0))
                    .collect();

                for s in samples.into_iter().rev() {
                    writer.write_sample(s)
                        .map_err(|e| format!("Write sample error: {}", e))?;
                }
            }
            (24, SampleFormat::Int) => {
                let samples: Vec<i32> = reader
                    .into_samples::<i32>()
                    .map(|s| s.unwrap_or(0))
                    .collect();

                for s in samples.into_iter().rev() {
                    let val = (s >> 8) as i16; // downscale 24-bit to 16-bit
                    writer.write_sample(val)
                        .map_err(|e| format!("Write sample error: {}", e))?;
                }
            }
            (32, SampleFormat::Int) => {
                let samples: Vec<i32> = reader
                    .into_samples::<i32>()
                    .map(|s| s.unwrap_or(0))
                    .collect();

                for s in samples.into_iter().rev() {
                    // downscale 32-bit int to 16-bit by shifting right 16 bits
                    let val = (s >> 16) as i16;
                    writer.write_sample(val)
                        .map_err(|e| format!("Write sample error: {}", e))?;
                }
            }
            (32, SampleFormat::Float) => {
                let samples: Vec<f32> = reader
                    .into_samples::<f32>()
                    .map(|s| s.unwrap_or(0.0))
                    .collect();

                for s in samples.into_iter().rev() {
                    let clamped = s.clamp(-1.0, 1.0);
                    let val = (clamped * i16::MAX as f32) as i16;
                    writer.write_sample(val)
                        .map_err(|e| format!("Write sample error: {}", e))?;
                }
            }
            _ => {
                return Err(
                    format!("Unsupported WAV format: {} bits {:?}", spec.bits_per_sample, spec.sample_format),
                );
            }
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