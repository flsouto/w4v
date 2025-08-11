use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, clamp_samples, wrap_samples};

// Helper function from fade.rs
fn db_to_amplitude(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

pub fn overdrive(input_wav: Vec<u8>, gain_db: f32, output_gain_db: f32) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav)?;

    let input_amplitude = db_to_amplitude(gain_db);
    let output_amplitude = db_to_amplitude(output_gain_db);

    for sample in samples.iter_mut() {
        // Apply input gain
        let mut processed_sample = *sample * input_amplitude;

        // Apply soft clipping (tanh function)
        processed_sample = processed_sample.tanh();

        // Apply output gain
        *sample = processed_sample * output_amplitude;
    }

    clamp_samples(&mut samples);
    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn overdrive_js(
    input_wav: &[u8],
    gain_db: f32,
    output_gain_db: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match overdrive(input_wav.to_vec(), gain_db, output_gain_db) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies an overdrive effect to a WAV file", long_about = None)]
pub struct OverdriveArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Input gain in dB (e.g., 10.0 for 10dB gain before distortion)
    #[arg(allow_hyphen_values = true)]
    pub gain: f32,

    /// Output gain in dB (e.g., -3.0 for 3dB attenuation after distortion)
    #[arg(allow_hyphen_values = true)]
    pub output_gain: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;

    #[test]
    fn test_overdrive_effect() {
        let input_wav_bytes = get_dummy();
        let gain_db = 10.0;
        let output_gain_db = -3.0;

        let output_wav_bytes = overdrive(input_wav_bytes.clone(), gain_db, output_gain_db)
            .expect("overdrive function failed");

        // Basic check: output should be different from input
        assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content");

        // Further checks could involve analyzing sample values for clipping/distortion
        // For now, just ensure it doesn't panic and produces output.
    }
}
