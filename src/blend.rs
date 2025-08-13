use rand::seq::IteratorRandom;
use rand::thread_rng;
use std::collections::HashMap;
use clap::Parser;

use crate::blenders::{mosaic};
use crate::maxgain;

type In = Vec<Vec<u8>>;
type Out = Result<Vec<u8>, String>;

pub fn blend(wavs:In, blender:&str) -> Out{
    
    let mut blenders : HashMap<&str, fn(In) -> Out> = HashMap::new();
    blenders.insert("mosaic", mosaic);

    if let Some(&func) = blenders.get(blender) {
        return maxgain(func(wavs)?);
    }

    if blender == "rand" {
        let mut rng = thread_rng();
        let &func = blenders.values().choose(&mut rng).unwrap();
        return maxgain(func(wavs)?);
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
