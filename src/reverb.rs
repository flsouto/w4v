use wasm_bindgen::prelude::*;
use js_sys;
use clap::Parser;
use crate::utils::{get_samples, wrap_samples};

pub fn reverb(input_wav: Vec<u8>, delay_ms: u32, decay: f32) -> Result<Vec<u8>, String> {

    let (samples, spec) = get_samples(input_wav)?;

    let sample_rate = spec.sample_rate as usize;
    let delay_samples = (sample_rate * delay_ms as usize) / 1000;

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

    wrap_samples(output, spec)

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
    #[arg(default_value_t = 120)]
    pub delay: u32,

    /// Decay factor
    #[arg(default_value_t = 0.4)]
    pub decay: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::len::len;

    #[test]
    fn test_reverb_effect() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Apply reverb with some parameters
        let delay_ms = 100;
        let decay = 0.5;
        let output_wav = reverb(input_wav.clone(), delay_ms, decay).expect("Reverb function failed");

        let processed_duration = len(output_wav.clone()).expect("Failed to get processed duration");

        // Assert that the duration remains the same
        assert_eq!(original_duration, processed_duration, "Reverb should not change the duration");

        // Assert that the duration remains the same
        assert_eq!(original_duration, processed_duration, "Reverb should not change the duration");

        // Assert that the content has changed (i.e., reverb was applied)
        assert_ne!(input_wav, output_wav, "Reverb should modify the audio content");
    }

    #[test]
    fn test_reverb_increases_sample_values() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let (original_samples, _) = crate::utils::get_samples(input_wav.clone()).expect("Failed to get original samples");
        let original_avg_abs_value: f32 = original_samples.iter().map(|s| s.abs()).sum::<f32>() / original_samples.len() as f32;

        // Apply reverb with some parameters
        let delay_ms = 100;
        let decay = 0.5;
        let output_wav = reverb(input_wav.clone(), delay_ms, decay).expect("Reverb function failed");

        let (processed_samples, _) = crate::utils::get_samples(output_wav).expect("Failed to get processed samples");
        let processed_avg_abs_value: f32 = processed_samples.iter().map(|s| s.abs()).sum::<f32>() / processed_samples.len() as f32;

        // Assert that the average absolute sample value increases
        assert!(processed_avg_abs_value > original_avg_abs_value, "Reverb should increase the average absolute sample value");
    }
}
