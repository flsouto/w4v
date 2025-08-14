use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, wrap_samples};

pub fn maxgain(input_wav: &[u8]) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav)?;

    let mut max_abs_sample = 0.0f32;
    for &sample in samples.iter() {
        let abs_sample = sample.abs();
        if abs_sample > max_abs_sample {
            max_abs_sample = abs_sample;
        }
    }

    let gain_factor = if max_abs_sample == 0.0 {
        1.0 // Silent audio, no change
    } else if max_abs_sample >= 1.0 {
        1.0 // Already at max or clipping, no further gain
    } else {
        1.0 / max_abs_sample
    };

    for sample in samples.iter_mut() {
        *sample *= gain_factor;
    }

    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn maxgain_js(
    input_wav: &[u8],
) -> Result<js_sys::Uint8Array, JsValue> {
    match maxgain(input_wav) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies maximum non-clipping gain to a WAV file", long_about = None)]
pub struct MaxGainArgs {
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
    use crate::utils::get_dummy;
    use crate::len::len;
    use crate::utils::get_samples as get_samples_util;
    use hound::{WavSpec, SampleFormat};

    #[test]
    fn test_maxgain_effect() {
        let input_wav_bytes = get_dummy();

        let output_wav_bytes = maxgain(&input_wav_bytes)
            .expect("maxgain function failed");

        // Basic check: output should be different from input if not already at max volume
        let (input_samples, _) = get_samples_util(&input_wav_bytes).unwrap();
        let max_input_abs: f32 = input_samples.iter().map(|s| s.abs()).fold(0.0, |max, val| max.max(val));

        if max_input_abs < 1.0 && max_input_abs > 0.0 {
            assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content if gain applied");
        }

        // Check that the output duration remains the same
        let input_duration = len(&input_wav_bytes).expect("Failed to get input duration");
        let output_duration = len(&output_wav_bytes).expect("Failed to get output duration");
        assert_eq!(input_duration, output_duration, "Maxgain should not change the duration");

        // Check that the maximum absolute sample in the output is close to 1.0 (if gain was applied)
        let (output_samples, _) = get_samples_util(&output_wav_bytes).unwrap();
        let max_output_abs: f32 = output_samples.iter().map(|s| s.abs()).fold(0.0, |max, val| max.max(val));

        if max_input_abs < 1.0 && max_input_abs > 0.0 {
            assert!((max_output_abs - 1.0).abs() < 0.001, "Max output sample should be close to 1.0 after maxgain");
        }
    }

    #[test]
    fn test_maxgain_already_clipping() {
        // Create a dummy WAV that is already clipping (all samples at 1.0)
        let spec = WavSpec { 
            channels: 1, 
            sample_rate: 44100, 
            bits_per_sample: 32, 
            sample_format: SampleFormat::Float 
        };
        let clipping_samples = vec![1.0f32; 44100]; // 1 second of max volume
        let clipping_wav = wrap_samples(clipping_samples, spec).expect("Failed to wrap clipping samples");

        let output_wav_bytes = maxgain(&clipping_wav).expect("maxgain failed for clipping audio");

        // Output should be identical to input if already clipping
        assert_eq!(clipping_wav, output_wav_bytes, "Output should be identical for already clipping audio");
    }

    #[test]
    fn test_maxgain_silent_audio() {
        // Create a dummy silent WAV (all samples at 0.0)
        let spec = WavSpec { 
            channels: 1, 
            sample_rate: 44100, 
            bits_per_sample: 32, 
            sample_format: SampleFormat::Float 
        };
        let silent_samples = vec![0.0f32; 44100]; // 1 second of silent audio
        let silent_wav = wrap_samples(silent_samples, spec).expect("Failed to wrap silent samples");

        let output_wav_bytes = maxgain(&silent_wav).expect("maxgain failed for silent audio");

        // Output should be identical to input for silent audio
        assert_eq!(silent_wav, output_wav_bytes, "Output should be identical for silent audio");
    }
}
