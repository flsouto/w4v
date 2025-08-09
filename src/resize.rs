use wasm_bindgen::prelude::*;
use js_sys;
use clap::Parser;
use crate::len::len;
use crate::speed::speed;

pub fn resize(input_wav: Vec<u8>, new_duration: f32) -> Result<Vec<u8>, String> {
    if new_duration <= 0.0 {
        return Err("New duration must be positive.".to_string());
    }

    let current_duration = len(input_wav.clone())?;
    if current_duration == 0.0 {
        // Cannot determine speed factor if original duration is 0
        return Ok(input_wav);
    }

    let factor = current_duration / new_duration;
    speed(input_wav, factor)
}

#[wasm_bindgen]
pub fn resize_js(input_wav: &[u8], new_duration: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match resize(input_wav.to_vec(), new_duration) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Resizes a WAV file to a new duration in seconds", long_about = None)]
pub struct ResizeArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// New duration in seconds
    #[arg()]
    pub new_duration: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::len::len;
    use crate::utils::get_dummy;

    #[test]
    fn test_resize_effect() {

        let input_wav = get_dummy();

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Test with shorter duration
        let shorter_duration = original_duration / 2.0;
        let output_wav_shorter = resize(input_wav.clone(), shorter_duration).expect("Resize function failed for shorter duration");
        let processed_shorter_duration = len(output_wav_shorter.clone()).expect("Failed to get processed shorter duration");
        assert!((processed_shorter_duration - shorter_duration).abs() < 0.01, "Shorter duration should be accurate");
        assert_ne!(input_wav, output_wav_shorter, "Shorter resize should modify content");

        // Test with longer duration
        let longer_duration = original_duration * 2.0;
        let output_wav_longer = resize(input_wav.clone(), longer_duration).expect("Resize function failed for longer duration");
        let processed_longer_duration = len(output_wav_longer.clone()).expect("Failed to get processed longer duration");
        assert!((processed_longer_duration - longer_duration).abs() < 0.01, "Longer duration should be accurate");
        assert_ne!(input_wav, output_wav_longer, "Longer resize should modify content");
    }
}
