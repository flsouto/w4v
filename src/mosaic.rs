use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use crate::utils::{get_samples, wrap_samples};
use crate::pick::pick;
use crate::add::add;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(about = "Creates a mosaic from a WAV file", long_about = None)]
pub struct MosaicArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Pattern for the mosaic
    #[arg()]
    pub pattern: String,

    /// Segment length in seconds
    #[arg()]
    pub segment_len: f32,
}

pub fn mosaic(
    input_wav_bytes: Vec<u8>,
    pattern: &str,
    segment_len: f32,
) -> Result<Vec<u8>, String> {
    let (_samples, spec) = get_samples(input_wav_bytes.clone())?;
    let mut segments: HashMap<char, Vec<u8>> = HashMap::new();
    let mut result_wav = wrap_samples(vec![], spec)?;

    let silent_samples_count = (spec.sample_rate as f32 * segment_len) as usize * spec.channels as usize;
    let silent_samples = vec![0.0; silent_samples_count];
    let silence = wrap_samples(silent_samples, spec)?;

    for c in pattern.chars() {
        let segment_to_add = if c == '_' {
            silence.clone()
        } else {
            if !segments.contains_key(&c) {
                let new_segment = pick(input_wav_bytes.clone(), &segment_len.to_string())?;
                segments.insert(c, new_segment);
            }
            segments.get(&c).unwrap().clone()
        };
        result_wav = add(result_wav, segment_to_add)?;
    }

    Ok(result_wav)
}

#[wasm_bindgen]
pub fn mosaic_js(
    input_wav: &[u8],
    pattern: &str,
    segment_len: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match mosaic(input_wav.to_vec(), pattern, segment_len) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_mosaic() {
        let input_wav = get_dummy();
        let pattern = "ab_ab_ac_d_";
        let segment_len = 0.1;

        let output_wav = mosaic(input_wav, pattern, segment_len).expect("mosaic function failed");

        let output_duration = len(output_wav).expect("Failed to get output duration");
        let expected_duration = pattern.chars().count() as f32 * segment_len;

        assert!((output_duration - expected_duration).abs() < 0.01, "Mosaic duration is incorrect");
    }
}