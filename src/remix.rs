use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::add::add;
use crate::split::split;

pub fn remix(input_wav: Vec<u8>, pattern: &str) -> Result<Vec<u8>, String> {
    let num_segments = pattern.chars().count();
    if num_segments == 0 {
        return Err("Pattern cannot be empty.".to_string());
    }

    let mut pattern_indices: Vec<usize> = Vec::new();
    for c in pattern.chars() {
        let digit = c.to_digit(10).ok_or_else(|| format!("Invalid character in pattern: {}", c))?;
        pattern_indices.push(digit as usize);
    }

    for &index in &pattern_indices {
        if index == 0 || index > num_segments {
            return Err(format!(
                "Invalid segment index in pattern: {}. Indices must be between 1 and {}.",
                index, num_segments
            ));
        }
    }

    let segments = split(input_wav, num_segments)?;

    if segments.is_empty() {
        return Err("Splitting the audio resulted in no segments.".to_string());
    }

    let mut output_wav = segments[pattern_indices[0] - 1].clone();

    for &index in pattern_indices.iter().skip(1) {
        output_wav = add(output_wav, segments[index - 1].clone())?;
    }

    Ok(output_wav)
}

#[wasm_bindgen]
pub fn remix_js(
    input_wav: &[u8],
    pattern: &str,
) -> Result<js_sys::Uint8Array, JsValue> {
    match remix(input_wav.to_vec(), pattern) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Remixes a WAV file based on a pattern", long_about = None)]
pub struct RemixArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Remix pattern (e.g., "1213")
    #[arg()]
    pub pattern: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_remix_normal() {
        let input_wav_bytes = get_dummy();
        let pattern = "1324";

        let original_duration = len(input_wav_bytes.clone()).unwrap();

        let output_wav_bytes = remix(input_wav_bytes.clone(), pattern).expect("remix function failed");
        let output_duration = len(output_wav_bytes).unwrap();

        assert!((output_duration - original_duration).abs() < 0.01, "Output duration should be close to original duration");
    }

    #[test]
    fn test_remix_repeating() {
        let input_wav_bytes = get_dummy();
        let pattern = "1111";
        let num_segments = pattern.len();

        let original_duration = len(input_wav_bytes.clone()).unwrap();
        let segment_duration = original_duration / num_segments as f32;

        let output_wav_bytes = remix(input_wav_bytes.clone(), pattern).expect("remix function failed");
        let output_duration = len(output_wav_bytes).unwrap();

        assert!((output_duration - (segment_duration * 4.0)).abs() < 0.1, "Output duration should be 4 times a segment duration");
    }

    #[test]
    fn test_remix_invalid_pattern_char() {
        let input_wav_bytes = get_dummy();
        let pattern = "1a23";
        let result = remix(input_wav_bytes, pattern);
        assert!(result.is_err(), "Should fail with invalid character in pattern");
    }

    #[test]
    fn test_remix_invalid_pattern_index_too_high() {
        let input_wav_bytes = get_dummy();
        let pattern = "125"; // 3 segments, but index 5 is invalid
        let result = remix(input_wav_bytes, pattern);
        assert!(result.is_err(), "Should fail with index out of bounds");
    }

    #[test]
    fn test_remix_invalid_pattern_index_zero() {
        let input_wav_bytes = get_dummy();
        let pattern = "120"; // 3 segments, but index 0 is invalid
        let result = remix(input_wav_bytes, pattern);
        assert!(result.is_err(), "Should fail with index 0");
    }

    #[test]
    fn test_remix_empty_pattern() {
        let input_wav_bytes = get_dummy();
        let pattern = "";
        let result = remix(input_wav_bytes, pattern);
        assert!(result.is_err(), "Should fail with empty pattern");
    }
}