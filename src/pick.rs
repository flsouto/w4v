use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::len::len;
use crate::time::resolve_time;
use crate::cut::cut;
use rand::Rng;
use rand::rngs::StdRng;
use rand::SeedableRng;

pub fn pick(
    input_wav_bytes: &[u8],
    duration_arg: &str,
) -> Result<Vec<u8>, String> {
    let mut rng = StdRng::from_entropy();
    pick_with_rng(input_wav_bytes, &mut rng, duration_arg)
}

pub fn pick_with_rng(
    input_wav_bytes: &[u8],
    rng: &mut StdRng,
    duration_arg: &str,
) -> Result<Vec<u8>, String> {
    let total_wav_duration = len(input_wav_bytes)?;
    let duration_seconds = resolve_time(duration_arg, total_wav_duration)?;

    if duration_seconds > total_wav_duration {
        return Err("Duration cannot be greater than the total duration of the WAV file.".to_string());
    }

    let max_start_offset = total_wav_duration - duration_seconds;
    let start_offset = rng.gen_range(0.0..=max_start_offset);

    cut(input_wav_bytes, &start_offset.to_string(), &duration_seconds.to_string())
}

#[wasm_bindgen]
pub fn pick_js(
    input_wav: &[u8],
    duration: &str,
) -> Result<js_sys::Uint8Array, JsValue> {
    let mut rng = StdRng::from_entropy();
    match pick_with_rng(input_wav, &mut rng, duration) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Picks a random segment from a WAV file", long_about = None)]
pub struct PickArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Duration of the segment to pick in seconds (can be absolute or fraction like "1/2")
    #[arg()]
    pub duration: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::len::len;
    use crate::utils::get_dummy;

    #[test]
    fn test_pick_effect() {
        let input_wav = get_dummy();
        let original_duration = len(&input_wav).expect("Failed to get original duration");

        let duration = (original_duration / 2.0).to_string();
        let output_wav = pick(&input_wav, &duration).expect("Pick function failed");
        let processed_duration = len(&output_wav).expect("Failed to get processed duration");

        assert!((processed_duration - (original_duration / 2.0)).abs() < 0.01, "Picked duration should be accurate");
        assert_ne!(input_wav, output_wav, "Pick should modify the audio content");
    }
}
