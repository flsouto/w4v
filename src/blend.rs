use rand::seq::IteratorRandom;
use rand::rngs::StdRng;
use std::collections::HashMap;
use clap::Parser;
use wasm_bindgen::prelude::*;
use rand::SeedableRng;

use crate::blenders::{mosaic,delayer,xfade,outbreaker,m4ze};
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
    ])

}

pub fn blend<'a>(wavs: In<'a>, rng: &mut StdRng, blender: &str, post_fx: Option<&str>) -> Out{
    
    let blenders = get_blenders();

    let mut out = Err(format!("Invalid blender provided: {}", blender));
    
    if let Some(&func) = blenders.get(blender) {
        out = func(wavs, rng);
    }

    if blender == "rand" {
        let fname = blenders.keys().choose(rng).unwrap();
        println!("Rand blender resolved to '{}'", fname);
        let &func = blenders.get(fname).unwrap();
        out = func(wavs, rng);
    }

    if let Some(fx) = post_fx {
        out = crate::fx::apply_fx_with_rng(&out?, rng, fx.to_string());
    }

    maxgain(&out?)

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
pub fn blend_js(wav1: Vec<u8>, wav2: Vec<u8>, wav3: Vec<u8>, seed: u64, blender: &str, post_fx: Option<String>) -> Result<Vec<u8>, String> {
    let mut rng = StdRng::seed_from_u64(seed);
    let wavs: Vec<&[u8]> = vec![wav1.as_slice(), wav2.as_slice(), wav3.as_slice()];
    let blended_wav_bytes = self::blend(&wavs, &mut rng, blender, post_fx.as_deref())?;

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
