use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, wrap_samples};

pub fn add(input_wav1: Vec<u8>, input_wav2: Vec<u8>) -> Result<Vec<u8>, String> {
    let (samples1, spec1) = get_samples(input_wav1)?;
    let (samples2, spec2) = get_samples(input_wav2)?;

    // Check for compatibility (sample rate, channels, sample format)
    if spec1.sample_rate != spec2.sample_rate {
        return Err("Sample rates do not match.".to_string());
    }
    if spec1.channels != spec2.channels {
        return Err("Number of channels do not match.".to_string());
    }
    if spec1.sample_format != spec2.sample_format {
        return Err("Sample formats do not match.".to_string());
    }
    if spec1.bits_per_sample != spec2.bits_per_sample {
        return Err("Bits per sample do not match.".to_string());
    }

    let mut output_samples = Vec::with_capacity(samples1.len() + samples2.len());
    output_samples.extend_from_slice(&samples1);
    output_samples.extend_from_slice(&samples2);

    wrap_samples(output_samples, spec1)
}

#[wasm_bindgen]
pub fn add_js(
    input_wav1: &[u8],
    input_wav2: &[u8],
) -> Result<js_sys::Uint8Array, JsValue> {
    match add(input_wav1.to_vec(), input_wav2.to_vec()) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Concatenates two WAV files", long_about = None)]
pub struct AddArgs {
    /// First input WAV file
    #[arg()]
    pub input1: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Second input WAV file
    #[arg()]
    pub input2: String,

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_add_duration() {
        let input_wav_bytes1 = get_dummy();
        let input_wav_bytes2 = get_dummy();

        let output_wav_bytes = add(input_wav_bytes1.clone(), input_wav_bytes2.clone())
            .expect("add function failed");

        let input_duration1 = len(input_wav_bytes1.clone()).expect("Failed to get input1 duration");
        let input_duration2 = len(input_wav_bytes2.clone()).expect("Failed to get input2 duration");
        let output_duration = len(output_wav_bytes.clone()).expect("Failed to get output duration");

        assert_eq!(output_duration, input_duration1 + input_duration2,
                   "Output duration should be the sum of input durations");
    }
}
