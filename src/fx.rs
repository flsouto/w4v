use rand::rngs::StdRng;
use rand::prelude::SliceRandom;
use rand::Rng;
use crate::{bitcrush, flanger, highpass, lowpass};

pub fn apply_fx_with_rng(wav:&[u8], rng: &mut StdRng, mut fx: String) -> Result<Vec<u8>,String> {

    
    if fx == "rand" {
        fx = get_rand_fx(rng);
    }

    match fx.as_str() {
        "highpass" => highpass(wav, rng.gen_range(4000.0..=5000.0)),
        "lowpass" => lowpass(wav, rng.gen_range(300.0..=999.0)),
        "bitcrush" => bitcrush(wav, rng.gen_range(1.0..=45.0)),
        "flanger" => {  
            let delay_ms = rng.gen_range(0.1..=0.6);
            let depth_ms = rng.gen_range(0.1..=9.99);
            let rate_hz  = rng.gen_range(6.666..=666.0);
            let feedback = 0.0;

            flanger(wav, delay_ms, depth_ms, rate_hz, feedback)
        },
        _ => Err(format!("FX not recognized: {}", fx))
    }
}

pub fn apply_rand_fx_with_rng(wav:&[u8], rng: &mut StdRng) -> Result<Vec<u8>,String> {
    let fx = get_rand_fx(rng);
    apply_fx_with_rng(wav, rng, fx)
}

pub fn get_fx_list() -> Vec<String>{
    ["bitcrush","flanger"]
        .into_iter()
        .map(String::from)
        .collect()
}

pub fn get_rand_fx(rng: &mut StdRng) -> String {
    let fx = get_fx_list().choose(rng).cloned().unwrap();
    println!("Resolved random fx: {}", fx);
    fx
}
