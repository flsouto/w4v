use rand::rngs::StdRng;
use rand::prelude::SliceRandom;
use rand::Rng;
use crate::{bitcrush, flanger, highpass, lowpass, reverb, reverse, overdrive, speed};
use wasm_bindgen::prelude::*;
use js_sys;
use rand::SeedableRng;

pub fn apply_fx_with_rng(wav:&[u8], rng: &mut StdRng, mut fx: String) -> Result<Vec<u8>,String> {

    if fx.contains(",") {
        let mut o = wav.to_vec();
        for each_fx in fx.split(",") {
            o = apply_fx_with_rng(&o, rng, each_fx.to_string())?;
        }
        return Ok(o);
    }
    
    if fx == "rand" {
        fx = get_rand_fx(rng);
    }

    match fx.as_str() {
        "highpass" => highpass(wav, rng.gen_range(4000.0..=5000.0)),
        "lowpass" => lowpass(wav, rng.gen_range(300.0..=999.0)),
        "bitcrush" => bitcrush(wav, rng.gen_range(1.0..=15.0)),
        "reverb" => reverb(wav, rng.gen_range(1..=250), rng.gen_range(0.1..=0.9)),
        "reverse" => reverse(wav),
        "overdrive" => overdrive(
            wav,
            rng.gen_range(20.0..=50.0), 
            -rng.gen_range(1.0..=5.0)
        ),
        "flanger" => {  
            let delay_ms = rng.gen_range(0.1..=0.6);
            let depth_ms = rng.gen_range(0.1..=9.99);
            let rate_hz  = rng.gen_range(6.666..=666.0);
            let feedback = 0.0;

            flanger(wav, delay_ms, depth_ms, rate_hz, feedback)
        },
        "faster" => speed(wav, rng.gen_range(1.1 ..= 1.9)),
        "slower" => speed(wav, rng.gen_range(0.5 ..= 0.9)),
        _ => Err(format!("FX not recognized: {}", fx))
    }
}

#[wasm_bindgen]
pub fn apply_fx_js(input_wav: &[u8], seed: u64, fx: String) -> Result<js_sys::Uint8Array, JsValue> {
    let mut rng = StdRng::seed_from_u64(seed);
    match apply_fx_with_rng(input_wav, &mut rng, fx) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[wasm_bindgen]
pub fn apply_rand_fx_js(input_wav: &[u8], seed: u64) -> Result<js_sys::Uint8Array, JsValue> {
    let mut rng = StdRng::seed_from_u64(seed);
    match apply_rand_fx_with_rng(input_wav, &mut rng) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

pub fn apply_rand_fx_with_rng(wav:&[u8], rng: &mut StdRng) -> Result<Vec<u8>,String> {
    let fx = get_rand_fx(rng);
    apply_fx_with_rng(wav, rng, fx)
}

#[wasm_bindgen]
pub fn get_fx_list_js() -> js_sys::Array {
    let fx_list = ["bitcrush","flanger", "highpass","lowpass", "reverb","reverse"]
        .into_iter()
        .map(JsValue::from_str)
        .collect::<js_sys::Array>();
    fx_list
}

pub fn get_fx_list() -> Vec<String>{
    ["bitcrush","flanger", "highpass","lowpass", "reverb","reverse"]
        .into_iter()
        .map(String::from)
        .collect()
}

pub fn get_rand_fx(rng: &mut StdRng) -> String {
    let fx = get_fx_list().choose(rng).cloned().unwrap();
    println!("Resolved random fx: {}", fx);
    fx
}
