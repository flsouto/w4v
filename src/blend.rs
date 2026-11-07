use rand::seq::IteratorRandom;
use rand::rngs::StdRng;
use std::collections::HashMap;
use clap::Parser;
use wasm_bindgen::prelude::*;
use rand::SeedableRng;

use crate::blenders::{mosaic,delayer,xfade,outbreaker,m4ze,samplicat,dim,glitch};
use crate::maxgain;

type In<'a> = &'a [&'a [u8]];
type Out = Result<Vec<u8>, String>;
type BlenderFn<'a> = fn(In<'a>, &mut StdRng) -> Out;

pub fn get_blenders<'a>() -> HashMap<&'a str, BlenderFn<'a>> {

    HashMap::from([
        ("mosaic", mosaic as BlenderFn),
        ("delayer", delayer as BlenderFn),    
        ("xfade", xfade as BlenderFn),
        ("outbreaker", outbreaker as BlenderFn),
        ("m4ze", m4ze as BlenderFn),
        ("samplicat", samplicat as BlenderFn),
        ("dim", dim as BlenderFn),
        ("glitch", glitch as BlenderFn)
    ])

}

pub fn blend<'a>(wavs: In<'a>, rng: &mut StdRng, blender: &str, post_fx: Option<&str>) -> Out{

    blend_with_patterns(wavs, rng, blender, post_fx, None)
}

pub fn blend_with_patterns(wavs: In<'_>, rng: &mut StdRng, blender: &str, post_fx: Option<&str>, patterns: Option<&[String]>) -> Out {
    if let Some(pool) = patterns {
        if pool.is_empty() || pool.iter().any(|p| p.is_empty() || p.len() > 256 || !p.bytes().all(|c| c.is_ascii_lowercase() || c == b'_') || !p.bytes().any(|c| c.is_ascii_lowercase())) {
            return Err("Patterns must contain 1–256 lowercase letters or underscores and at least one letter".into());
        }
    }
    let required = match blender {
        "samplicat" => 1,
        "mosaic" | "delayer" | "xfade" | "m4ze" | "dim" | "glitch" => 2,
        _ => 3,
    };
    if wavs.len() < required {
        return Err(format!("Blender {} requires {} input WAVs", blender, required));
    }
    let blenders = get_blenders();

    let blender = if blender == "rand" {
        let &fname = blenders.keys().choose(rng).unwrap();
        println!("Rand blender resolved to '{}'", fname);
        fname
    } else { blender };
    let func = blenders.get(blender)
        .ok_or_else(|| format!("Invalid blender provided: {}", blender))?;
    let mut out = if blender == "mosaic" {
        crate::blenders::mosaic::mosaic_with_patterns(wavs, rng, patterns)
    } else { func(wavs, rng) };

    if let Some(fx) = post_fx {
        out = crate::fx::apply_fx_with_rng(&out?, rng, fx.to_string());
    }

    let out = maxgain(&out?)?;
    if blender == "glitch" {
        // Trim after normalization and FX so maxgain cannot undo the reduction.
        // Avoid gain(), whose tanh soft clipping would also reshape the audio.
        let (mut samples, spec) = crate::utils::get_samples(&out)?;
        let trim = 10.0_f32.powf(-3.0 / 20.0);
        for sample in &mut samples { *sample *= trim; }
        crate::utils::wrap_samples(samples, spec)
    } else {
        Ok(out)
    }

}

#[derive(Parser)]
pub struct BlendArgs{


    #[arg()]
    pub input_folder : String,

    #[arg()]
    pub output_path : String,

    #[arg()]
    pub blender : String,

    #[arg()]
    pub fx: Option<String>


}

use hound::{WavReader, WavWriter, SampleFormat};
use std::io::Cursor;

#[wasm_bindgen]
pub fn get_blenders_js() -> Vec<String> {
    get_blenders().keys().map(|str|str.to_string()).collect()
}

#[wasm_bindgen]
pub fn blend_js(wav1: Vec<u8>, wav2: Vec<u8>, wav3: Vec<u8>, seed: u64, blender: &str, post_fx: Option<String>, patterns: Option<String>) -> Result<Vec<u8>, String> {
    let mut rng = StdRng::seed_from_u64(seed);
    let wavs: Vec<&[u8]> = vec![wav1.as_slice(), wav2.as_slice(), wav3.as_slice()];
    let pool = patterns.map(|value| value.lines().map(String::from).collect::<Vec<_>>());
    let blended_wav_bytes = blend_with_patterns(&wavs, &mut rng, blender, post_fx.as_deref(), pool.as_deref())?;

    // Re-encode to 16-bit
    let mut reader = WavReader::new(Cursor::new(&blended_wav_bytes))
        .map_err(|e| format!("Failed to create WAV reader: {}", e))?;
    let spec = reader.spec();

    let mut new_spec = spec;
    new_spec.sample_format = SampleFormat::Int;
    new_spec.bits_per_sample = 16;

    let mut writer_buffer = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut writer_buffer, new_spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

        for sample in reader.samples::<f32>() {
            let sample = sample.map_err(|e| format!("Failed to read sample: {}", e))?;
            writer.write_sample((sample * i16::MAX as f32) as i16)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }
    } // writer is dropped here

    Ok(writer_buffer.into_inner())
}
