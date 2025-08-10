use wasm_bindgen::prelude::*;
use crate::utils::{get_samples, clamp_samples, wrap_samples};
use clap::Parser;

fn db_to_amplitude(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

pub fn fade(
    input_wav_bytes: Vec<u8>,
    initial_volume_db: f32,
    end_volume_db: f32,
) -> Result<Vec<u8>, String> {
    let (mut samples, spec) = get_samples(input_wav_bytes)?;
    let num_samples = samples.len();

    let initial_amplitude = db_to_amplitude(initial_volume_db);
    let end_amplitude = db_to_amplitude(end_volume_db);

    for i in 0..num_samples {
        let factor = i as f32 / (num_samples - 1) as f32;
        let amplitude = initial_amplitude + (end_amplitude - initial_amplitude) * factor;
        samples[i] *= amplitude;
    }

    clamp_samples(&mut samples);
    wrap_samples(samples, spec)
}

#[wasm_bindgen]
pub fn fade_js(
    input_wav: &[u8],
    initial_volume_db: f32,
    end_volume_db: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match fade(input_wav.to_vec(), initial_volume_db, end_volume_db) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a fade effect to a WAV file", long_about = None)]
pub struct FadeArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Initial volume in dB
    #[arg(allow_hyphen_values = true)]
    pub initial_volume: f32,

    /// End volume in dB
    #[arg(allow_hyphen_values = true)]
    pub end_volume: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::{get_samples, get_dummy};

    #[test]
    fn test_fade_in_simple() {
        let input_wav = get_dummy();
        let (original_samples, _) = get_samples(input_wav.clone()).unwrap();

        let output_wav = fade(input_wav, -30.0, 0.0).expect("Fade function failed");
        let (processed_samples, _) = get_samples(output_wav).unwrap();

        let failing_indices: Vec<usize> = (0..100)
            .filter(|&i| processed_samples[i].abs() >= original_samples[i].abs())
            .collect();

        assert!(
            failing_indices.is_empty(),
            "Fade-in failed at indices: {:?}",
            failing_indices
        );
    }

    #[test]
    fn test_fade_out_simple() {
        let input_wav = get_dummy();
        let (original_samples, _) = get_samples(input_wav.clone()).unwrap();

        let output_wav = fade(input_wav, 0.0, -30.0).expect("Fade function failed");
        let (processed_samples, _) = get_samples(output_wav).unwrap();

        let num_samples = processed_samples.len();
        let failing_indices: Vec<usize> = (num_samples - 100..num_samples)
            .filter(|&i| processed_samples[i].abs() >= original_samples[i].abs())
            .collect();

        assert!(
            failing_indices.is_empty(),
            "Fade-out failed at indices: {:?}",
            failing_indices
        );
    }
}
