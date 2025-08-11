use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, wrap_samples};

pub fn x(input_wav: Vec<u8>, repeat_count: u32) -> Result<Vec<u8>, String> {
    if repeat_count == 0 {
        return Err("Repeat count must be greater than 0.".to_string());
    }

    let (samples, spec) = get_samples(input_wav)?;
    let num_original_samples = samples.len();

    let mut output_samples = Vec::with_capacity(num_original_samples * repeat_count as usize);

    for _ in 0..repeat_count {
        output_samples.extend_from_slice(&samples);
    }

    wrap_samples(output_samples, spec)
}

#[wasm_bindgen]
pub fn x_js(
    input_wav: &[u8],
    repeat_count: u32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match x(input_wav.to_vec(), repeat_count) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Repeats the audio a specified number of times", long_about = None)]
pub struct XArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Number of times to repeat the audio
    #[arg()]
    pub count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_x_duration() {
        let input_wav_bytes = get_dummy();
        let repeat_count = 3;

        let output_wav_bytes = x(input_wav_bytes.clone(), repeat_count)
            .expect("x function failed");

        let input_duration = len(input_wav_bytes.clone()).expect("Failed to get input duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");

        assert_eq!(output_duration, input_duration * repeat_count as f32,
                   "Output duration should be input duration multiplied by repeat count");
    }
}
