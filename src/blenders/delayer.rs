use crate::{len, resize, mix, silence, add, cut, x};
use rand::thread_rng;
use rand::Rng;

pub fn delayer(wavs:Vec<Vec<u8>>) -> Result<Vec<u8>,String> {

    let mut rng = thread_rng();

    let mut w0 = cut(&wavs[0],"0","1/4")?;
    let mut w1 = cut(&wavs[1],"0","1/4")?;
    
    let len0 = len(&w0)?;
    let len1 = len(&w1)?;   
    let avg_len = (len0 + len1) / 2.0;
    w0 = resize(&w0, avg_len)?;
    w1 = resize(&w1, avg_len)?;

    let offset = avg_len / [4, 8, 16, 32][rng.gen_range(0..=3)] as f32;
    let pad = silence(offset)?;
    let end = &(avg_len - offset).to_string();
    w1 = add(&pad, &cut(&w1,"0",end)?)?;
    
    let o = mix(&w0,&w1,true)?;
    x(&o, 4)
        
}
