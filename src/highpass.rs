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
    use crate::utils::{get_samples, wrap_samples};
    use hound::{WavSpec, SampleFormat};
    use std::fs;

    fn generate_sine_wave(frequency: f32, duration_seconds: f32, sample_rate: u32) -> Vec<u8> {
        let spec = WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let num_samples = (sample_rate as f32 * duration_seconds) as usize;
        let mut samples: Vec<f32> = Vec::with_capacity(num_samples);

        for i in 0..num_samples {
            let time = i as f32 / sample_rate as f32;
            samples.push((2.0 * PI * frequency * time).sin() * 0.5);
        }
        wrap_samples(samples, spec).unwrap()
    }

    #[test]
    fn test_highpass_simple() {
        let sample_rate = 44100;
        let low_freq = 100.0;
        let cutoff_freq = 1000.0;

        let low_freq_wav = generate_sine_wave(low_freq, 1.0, sample_rate);
        let processed_low_freq_wav = highpass(low_freq_wav, cutoff_freq).expect("Highpass failed");
        let (processed_low_samples, _) = get_samples(processed_low_freq_wav).unwrap();

        let low_freq_amplitude: f32 = processed_low_samples.iter().map(|s| s.abs()).sum::<f32>() / processed_low_samples.len() as f32;
        assert!(low_freq_amplitude < 0.01, "Low frequency should be significantly attenuated");
    }

    #[test]
    fn test_highpass_effect() {
        let sample_rate = 44100;
        let low_freq = 100.0;
        let high_freq = 5000.0;
        let cutoff_freq = 1000.0;

        // Generate a WAV with low and high frequencies
        let low_freq_wav = generate_sine_wave(low_freq, 1.0, sample_rate);
        let high_freq_wav = generate_sine_wave(high_freq, 1.0, sample_rate);

        // Apply highpass filter
        let processed_low_freq_wav = highpass(low_freq_wav, cutoff_freq).expect("Highpass failed for low frequency");
        let processed_high_freq_wav = highpass(high_freq_wav, cutoff_freq).expect("Highpass failed for high frequency");

        let (processed_low_samples, _) = get_samples(processed_low_freq_wav).unwrap();
        let (processed_high_samples, _) = get_samples(processed_high_freq_wav).unwrap();

        // Check if low frequency is attenuated (amplitude should be significantly lower)
        let low_freq_amplitude: f32 = processed_low_samples.iter().map(|s| s.abs()).sum::<f32>() / processed_low_samples.len() as f32;
        assert!(low_freq_amplitude < 0.1, "Low frequency should be attenuated");

        // Check if high frequency is preserved (amplitude should be close to original)
        let high_freq_amplitude: f32 = processed_high_samples.iter().map(|s| s.abs()).sum::<f32>() / processed_high_samples.len() as f32;
        assert!(high_freq_amplitude > 0.1, "High frequency should be preserved");
        assert!(high_freq_amplitude > low_freq_amplitude * 2.0, "High frequency should be significantly louder than low frequency");
    }
}