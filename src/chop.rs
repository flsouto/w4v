use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::len::len;
use crate::cut::cut;
use crate::x::x;

pub fn chop(input_wav: Vec<u8>, n: u32) -> Result<Vec<u8>, String> {
    if n == 0 {
        return Err("n must be greater than 0.".to_string());
    }

    let total_duration = len(input_wav.clone())?;
    let segment_duration = total_duration / n as f32;

    // Cut the first segment
    let first_segment_wav = cut(input_wav.clone(), "0", &segment_duration.to_string())?;

    // Repeat the first segment n times
    let output_wav = x(first_segment_wav, n)?;

    Ok(output_wav)
}

#[wasm_bindgen]
pub fn chop_js(
    input_wav: &[u8],
    n: u32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match chop(input_wav.to_vec(), n) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a stutter effect by chopping and repeating the first segment", long_about = None)]
pub struct ChopArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Number of segments to chop into (and repeat the first segment)
    #[arg()]
    pub n: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_chop_duration() {
        let input_wav_bytes = get_dummy();
        let n = 3;

        let output_wav_bytes = chop(input_wav_bytes.clone(), n)
            .expect("chop function failed");

        let input_duration = len(input_wav_bytes.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");

        // The duration should be approximately the same as the input duration
        // due to floating point inaccuracies, we'll use a small delta for comparison
        let delta = 0.001;
        assert!((output_duration - input_duration).abs() < delta,
                   "Output duration should be approximately the same as input duration");
    }
}
