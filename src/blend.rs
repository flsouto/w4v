use rand::seq::IteratorRandom;
use rand::rngs::StdRng;
use rand::Rng;
use std::collections::HashMap;
use clap::Parser;
use wasm_bindgen::prelude::*;
use rand::SeedableRng;

use crate::blenders::{mosaic,delayer,xfade,outbreaker};
use crate::maxgain;

type In<'a> = &'a [&'a [u8]];
type Out = Result<Vec<u8>, String>;

pub fn blend<'a>(wavs: In<'a>, rng: &mut StdRng, blender: &str) -> Out{
    
    let mut blenders : HashMap<&str, fn(In<'a>, &mut StdRng) -> Out> = HashMap::new();
    blenders.insert("mosaic", mosaic);
    blenders.insert("delayer", delayer);
    blenders.insert("xfade", xfade);
    blenders.insert("outbreaker", outbreaker);

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

    if rng.gen_bool(0.3) {
        println!("Applying random fx");
        out = crate::fx::apply_rand_fx_with_rng(&out?, rng);
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


}

use hound::{WavReader, WavWriter, WavSpec, SampleFormat};
use std::io::Cursor;

#[wasm_bindgen]
pub fn blend_js(wav1: Vec<u8>, wav2: Vec<u8>, wav3: Vec<u8>, blender: &str, seed: u64) -> Result<Vec<u8>, String> {
    let mut rng = StdRng::seed_from_u64(seed);
    let wavs: Vec<&[u8]> = vec![wav1.as_slice(), wav2.as_slice(), wav3.as_slice()];
    let blended_wav_bytes = self::blend(&wavs, &mut rng, blender)?;

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
