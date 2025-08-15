use crate::{mix, silence, add, cut, x, normalize_speed};
use rand::Rng;
use rand::rngs::StdRng;


pub fn delayer(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>,String> {

    let c0 = cut(wavs[0],"0","1/4")?;
    let c1 = cut(wavs[1],"0","1/4")?;
    
    let (n0, n1, len) = normalize_speed(&c0, &c1)?;

    let offset = len / [4, 8, 16, 32][rng.gen_range(0..=3)] as f32;
    let pad = silence(offset)?;
    let end = &(len-offset).to_string();
    let shadow = add(&pad, &cut(&n1,"0",end)?)?;    
    let out = mix(&n0,&shadow, rng.gen_bool(0.2))?;

    x(&out, 4)
        
}
