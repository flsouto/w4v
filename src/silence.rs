use wasm_bindgen::prelude::*;
use hound;

pub fn silence(duration_s: f32) -> Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 44100,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let num_samples = (duration_s * 44100 as f32) as usize;

    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
        for _ in 0..num_samples {
            writer.write_sample(0.0f32).map_err(|e| e.to_string())?;
            writer.write_sample(0.0f32).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }

    Ok(cursor.into_inner())
}

#[wasm_bindgen]
pub fn silence_js(duration_s: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match silence(duration_s) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}
