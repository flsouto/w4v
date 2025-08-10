use wasm_bindgen::prelude::*;
use crate::utils::{get_samples, clamp_samples, wrap_samples};
use clap::Parser;
use std::f32::consts::PI;

pub fn lowpass(
    input_wav_bytes: Vec<u8>,
    cutoff_frequency: f32,
) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav_bytes)?;
    let sample_rate = spec.sample_rate as f32;
    let num_channels = spec.channels as usize;

    let alpha = (2.0 * PI * cutoff_frequency) / (sample_rate + (2.0 * PI * cutoff_frequency));

    let mut y_prev = vec![0.0; num_channels];

    for i in 0..samples.len() {
        let channel_index = i % num_channels;
        let x_curr = samples[i];
        samples[i] = alpha * x_curr + (1.0 - alpha) * y_prev[channel_index];
        y_prev[channel_index] = samples[i];
    }

    clamp_samples(&mut samples);
    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn lowpass_js(
    input_wav: &[u8],
    cutoff_frequency: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match lowpass(input_wav.to_vec(), cutoff_frequency) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a lowpass filter to a WAV file", long_about = None)]
pub struct LowpassArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Cutoff frequency in Hz
    #[arg()]
    pub cutoff_frequency: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_lowpass_output_properties() {
        let input_wav_bytes = get_dummy();
        let cutoff_frequency = 1000.0; // Example cutoff frequency

        let output_wav_bytes = lowpass(input_wav_bytes.clone(), cutoff_frequency)
            .expect("lowpass function failed");

        // Check that the output has the same duration using the len function
        let input_duration = len(input_wav_bytes.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");
        assert_eq!(input_duration, output_duration, "Output WAV duration should be the same as input WAV duration");

        // Check that the content has changed
        assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content");
    }
}
