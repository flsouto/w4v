use wasm_bindgen::prelude::*;
use hound::WavReader;
use std::io::Cursor;
use clap::Parser;

pub fn len(input_wav: &[u8]) -> Result<f32, String> {
    let cursor = Cursor::new(input_wav);
    let reader = WavReader::new(cursor)
        .map_err(|e| format!("Invalid WAV: {}", e))?;

    let spec = reader.spec();
    let duration = reader.duration();
    let sample_rate = spec.sample_rate;

    if sample_rate == 0 {
        return Ok(0.0);
    }

    Ok(duration as f32 / sample_rate as f32)
}



#[wasm_bindgen]
pub fn len_js(input_wav: &[u8]) -> Result<f32, JsValue> {
    match len(input_wav) {
        Ok(duration) => Ok(duration),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Calculates the duration of a WAV file in seconds", long_about = None)]
pub struct LenArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,
}