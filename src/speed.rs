use wasm_bindgen::prelude::*;
use js_sys;
use clap::Parser;
use crate::utils::{get_samples,wrap_samples};

pub fn speed(input_wav: Vec<u8>, factor: f32) -> Result<Vec<u8>, String> {
    if factor <= 0.0 {
        return Err("Speed factor must be positive.".to_string());
    }

    let (samples, spec) = get_samples(input_wav)?;
    let channels = spec.channels as usize;

    let num_samples = samples.len() / channels;
    let new_num_samples = (num_samples as f32 / factor) as usize;
    let mut output_samples = Vec::with_capacity(new_num_samples * channels);

    for i in 0..new_num_samples {
        for ch in 0..channels {
            let original_pos = i as f32 * factor;
            let index1 = original_pos.floor() as usize;
            let index2 = original_pos.ceil() as usize;
            let frac = original_pos.fract();

            let sample1_idx = index1 * channels + ch;
            let sample2_idx = index2 * channels + ch;

            let sample1 = samples.get(sample1_idx).cloned().unwrap_or(0.0);
            let sample2 = samples.get(sample2_idx).cloned().unwrap_or(0.0);

            let new_sample = sample1 * (1.0 - frac) + sample2 * frac;
            output_samples.push(new_sample);
        }
    }

    wrap_samples(output_samples,spec)
}


#[wasm_bindgen]
pub fn speed_js(input_wav: &[u8], factor: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match speed(input_wav.to_vec(), factor) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Changes the speed and pitch of a WAV file", long_about = None)]
pub struct SpeedArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Speed factor. > 1.0 for faster, < 1.0 for slower.
    #[arg()]
    pub factor: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::len::len;

    #[test]
    fn test_speed_factor() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Test with factor < 1 (slower speed, longer duration)
        let factor_slower = 0.5;
        let output_wav_slower = speed(input_wav.clone(), factor_slower).expect("Speed function failed for slower factor");
        let slower_duration = len(output_wav_slower).expect("Failed to get slower duration");
        assert!(slower_duration > original_duration, "Slower speed should result in longer duration");

        // Test with factor > 1 (faster speed, shorter duration)
        let factor_faster = 2.0;
        let output_wav_faster = speed(input_wav.clone(), factor_faster).expect("Speed function failed for faster factor");
        let faster_duration = len(output_wav_faster).expect("Failed to get faster duration");
        assert!(faster_duration < original_duration, "Faster speed should result in shorter duration");
    }
}
