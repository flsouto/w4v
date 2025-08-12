use crate::{x,reverb,bitcrush,reverse,cut};
use crate::mosaic as mosaic_fx;

pub fn mosaic(wavs:Vec<Vec<u8>>) -> Result<Vec<u8>, String>{

    let w1 = wavs[0].clone();
    let mut a = mosaic_fx(w1, "aa_ac_a_a_abac__", 0.17)?;
    a = reverse(a)?;
    a = reverb(a, 100, 0.5)?;
    a = x(a, 4)?;
    Ok(a)

}

