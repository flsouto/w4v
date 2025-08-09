use wasm_bindgen::prelude::*;
use hound::{WavReader, SampleFormat};
use std::io::Cursor;
use js_sys;
use clap::Parser;

pub fn reverb(input_wav: Vec<u8>, delay_ms: u32, decay: f32) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let spec = reader.spec();
    let sample_rate = spec.sample_rate as usize;
    let delay_samples = (sample_rate * delay_ms as usize) / 1000;

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

    // Mono or stereo channels (interleaved)
    let channels = spec.channels as usize;
    let total_samples = samples.len();

    // Create output buffer
    let mut output = samples.clone();

    // Simple reverb: output[n] = input[n] + decay * output[n - delay_samples]
    // Process per channel
    for ch in 0..channels {
        for i in delay_samples..(total_samples / channels) {
            let idx = i * channels + ch;
            let delayed_idx = (i - delay_samples) * channels + ch;
            output[idx] += decay * output[delayed_idx];
            // Clamp to [-1.0, 1.0]
            if output[idx] > 1.0 { output[idx] = 1.0; }
            else if output[idx] < -1.0 { output[idx] = -1.0; }
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

        for sample in output {
            let val = (sample * i16::MAX as f32) as i16;
            writer.write_sample(val)
                .map_err(|e| format!("Write sample error: {}", e))?;
        }
        writer.finalize()
            .map_err(|e| format!("Finalize error: {}", e))?;
    }

    Ok(out_bytes)
}

#[wasm_bindgen]
pub fn reverb_js(input_wav: &[u8], delay_ms: u32, decay: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match reverb(input_wav.to_vec(), delay_ms, decay) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a reverb effect to a WAV file", long_about = None)]
pub struct ReverbArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Delay in milliseconds
    #[arg()]
    pub delay: u32,

    /// Decay factor
    #[arg()]
    pub decay: f32,
}