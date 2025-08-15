use rand::seq::IteratorRandom;
use rand::rngs::StdRng;
use rand::Rng;
use std::collections::HashMap;
use clap::Parser;

use crate::blenders::{mosaic,delayer,xfade};
use crate::maxgain;

type In<'a> = &'a [&'a [u8]];
type Out = Result<Vec<u8>, String>;

pub fn blend<'a>(wavs: In<'a>, rng: &mut StdRng, blender: &str) -> Out{
    
    let mut blenders : HashMap<&str, fn(In<'a>, &mut StdRng) -> Out> = HashMap::new();
    blenders.insert("mosaic", mosaic);
    blenders.insert("delayer", delayer);
    blenders.insert("xfade", xfade);

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
