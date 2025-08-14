use rand::seq::IteratorRandom;
use rand::rngs::StdRng;
use std::collections::HashMap;
use clap::Parser;

use crate::blenders::{mosaic,delayer};
use crate::maxgain;

type In<'a> = &'a [&'a [u8]];
type Out = Result<Vec<u8>, String>;

pub fn blend<'a>(wavs: In<'a>, rng: &mut StdRng, blender: &str) -> Out{
    
    let mut blenders : HashMap<&str, fn(In<'a>, &mut StdRng) -> Out> = HashMap::new();
    blenders.insert("mosaic", mosaic);
    blenders.insert("delayer", delayer);

    if let Some(&func) = blenders.get(blender) {
        return maxgain(&func(wavs, rng)?);
    }

    if blender == "rand" {
        let &func = blenders.values().choose(rng).unwrap();
        return maxgain(&func(wavs, rng)?);
    }    

    Err(format!("Invalid blender provided: {}", blender))
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
