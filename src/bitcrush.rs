use wasm_bindgen::prelude::*;
use js_sys;
use clap::Parser;
use crate::utils::{get_samples,wrap_samples, clamp_samples};

pub fn bitcrush(input_wav: Vec<u8>, mut semitones: f32) -> Result<Vec<u8>, String> {

    semitones += 24.0;

    let factor = 2.0f32.powf(semitones / 12.0);

    if factor <= 0.0 {
        return Err("Pitch factor must be positive.".to_string());
    }

    let (samples,spec) = get_samples(input_wav)?;
    let channels = spec.channels as usize;

    let num_input_frames = samples.len() / channels;
    let num_output_frames_speed_alg = (num_input_frames as f32 / factor) as usize;

    let mut speed_alg_output_samples = Vec::with_capacity(num_output_frames_speed_alg * channels);

    for i in 0..num_output_frames_speed_alg {
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
            speed_alg_output_samples.push(new_sample);
        }
    }

    // New approach for stuttering/removal
    let mut final_output_samples = Vec::with_capacity(num_input_frames * channels);
    let target_len = num_input_frames * channels;
    let source_len = speed_alg_output_samples.len();

    if target_len == source_len {
        final_output_samples = speed_alg_output_samples;
    } else {
        let ratio = source_len as f32 / target_len as f32; // Ratio of source to target

        for i in 0..target_len {
            let source_pos = i as f32 * ratio;
            let index1 = source_pos.floor() as usize;
            let index2 = source_pos.ceil() as usize;
            let frac = source_pos.fract();

            let sample1 = speed_alg_output_samples.get(index1).cloned().unwrap_or(0.0);
            let sample2 = speed_alg_output_samples.get(index2).cloned().unwrap_or(sample1); // Use sample1 if index2 is out of bounds

            let new_sample = sample1 * (1.0 - frac) + sample2 * frac;
            final_output_samples.push(new_sample);
        }
    }


    clamp_samples(&mut final_output_samples);
    wrap_samples(final_output_samples, spec)
}

#[wasm_bindgen]
pub fn bitcrush_js(
    input_wav: &[u8],
    semitones: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match bitcrush(input_wav.to_vec(), semitones) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies bitcrush effect to a WAV file", long_about = None)]
pub struct BitcrushArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Pitch shift in semitones (e.g., 12 for one octave up, -12 for one octave down)
    #[arg(allow_hyphen_values = true)]
    pub semitones: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_pitch_output_properties() {
        let input_wav_bytes = get_dummy();
        let semitones = 2.0; // Example shift in semitones

        let output_wav_bytes = bitcrush(input_wav.clone(), semitones)
            .expect("bitcrush function failed");

        // Check that the output has the same duration using the len function
        let input_duration = len(input_wav.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");
        assert_eq!(input_duration, output_duration, "Output WAV duration should be the same as input WAV duration");

        // Check that the content has changed
        assert_ne!(input_wav_bytes, output_wav_bytes, "Output WAV content should be different from input WAV content");
    }
}
