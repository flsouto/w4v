use wasm_bindgen::prelude::*;
use crate::utils::{get_samples, clamp_samples, wrap_samples};
use clap::Parser;
use std::f32::consts::PI;

pub fn highpass(
    input_wav_bytes: Vec<u8>,
    cutoff_frequency: f32,
) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav_bytes)?;
    let sample_rate = spec.sample_rate as f32;
    let num_channels = spec.channels as usize;

    let alpha = 1.0 / (1.0 + (sample_rate / (2.0 * PI * cutoff_frequency)));
    let gain_compensation = 1.0 / ((1.0 + alpha) / 2.0);

    let mut y_prev = vec![0.0; num_channels];
    let mut x_prev = vec![0.0; num_channels];

    for i in 0..samples.len() {
        let channel_index = i % num_channels;
        let x_curr = samples[i];
        samples[i] = alpha * (y_prev[channel_index] + x_curr - x_prev[channel_index]) * gain_compensation;
        y_prev[channel_index] = samples[i];
        x_prev[channel_index] = x_curr;
    }

    clamp_samples(&mut samples);
    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn highpass_js(
    input_wav: &[u8],
    cutoff_frequency: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match highpass(input_wav.to_vec(), cutoff_frequency) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a highpass filter to a WAV file", long_about = None)]
pub struct HighpassArgs {
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
    use crate::len::len;
    use std::fs;

    #[test]
    fn test_highpass_output_properties() {
        let input_wav_bytes = fs::read("tests/data/dummy.wav").expect("Failed to read dummy.wav");
        let cutoff_frequency = 1000.0; // Example cutoff frequency

        let output_wav_bytes = highpass(input_wav_bytes.clone(), cutoff_frequency)
            .expect("highpass function failed");

        // Check that the output has the same duration using the len function
        let input_duration = len(input_wav_bytes.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");
        assert_eq!(input_duration, output_duration, "Output WAV duration should be the same as input WAV duration");

        // Check that the content has changed
        assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content");
    }

}
