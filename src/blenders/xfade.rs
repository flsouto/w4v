use crate::{normalize_speed,fade,mix,cut,x};
use rand::rngs::StdRng;
use rand::Rng;

pub fn xfade(wavs:&[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String>{

    let f1 = cut(wavs[0],"0","1/4")?;
    let f2 = cut(wavs[1],"0","1/4")?;

    let (w1,w2,_) = normalize_speed(&f1,&f2)?;

    let l1 = fade(&w1,0.0,-30.0)?;
    let l2 = fade(&w2,-30.0,0.0)?;

    let m = mix(&l1,&l2,rng.gen_bool(0.5))?;

    x(&m, 4)
    
}
