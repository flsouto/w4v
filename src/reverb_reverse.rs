use wasm_bindgen::prelude::*;
use js_sys;
use crate::reverb::reverb;
use crate::reverse::reverse;

pub fn reverb_reverse(input_wav: Vec<u8>, delay_ms: u32, decay: f32) -> Result<Vec<u8>, String> {
    let reverbed = reverb(input_wav, delay_ms, decay)?;
    reverse(reverbed)
}

#[wasm_bindgen]
pub fn reverb_reverse_js(input_wav: &[u8], delay_ms: u32, decay: f32) -> Result<js_sys::Uint8Array, JsValue> {
    match reverb_reverse(input_wav.to_vec(), delay_ms, decay) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}