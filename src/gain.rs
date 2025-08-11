use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, clamp_samples, wrap_samples};

// Helper function from fade.rs
fn db_to_amplitude(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

pub fn gain(input_wav: Vec<u8>, gain_db: f32) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav)?;

    let amplitude_multiplier = db_to_amplitude(gain_db);

    for sample in samples.iter_mut() {
        *sample *= amplitude_multiplier;
    }

    clamp_samples(&mut samples);
    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn gain_js(
    input_wav: &[u8],
    gain_db: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match gain(input_wav.to_vec(), gain_db) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a gain to a WAV file", long_about = None)]
pub struct GainArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Gain in dB (e.g., 6.0 for 6dB gain, -3.0 for 3dB attenuation)
    #[arg(allow_hyphen_values = true)]
    pub gain: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_gain_effect() {
        let input_wav_bytes = get_dummy();
        let gain_db = 6.0;

        let output_wav_bytes = gain(input_wav_bytes.clone(), gain_db)
            .expect("gain function failed");

        // Basic check: output should be different from input if gain is not 0dB
        if gain_db != 0.0 {
            assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content");
        }

        // Check that the duration remains the same
        let input_duration = len(input_wav_bytes.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");
        assert_eq!(input_duration, output_duration, "Gain should not change the duration");
    }
}
