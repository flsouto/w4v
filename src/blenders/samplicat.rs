use rand::Rng;
use rand::rngs::StdRng;
use crate::{pick,x,fade};

pub fn samplicat(wavs: &[&[u8]], rng: &mut StdRng ) -> Result<Vec<u8>, String> {

    let mut a = pick(wavs[0], "1/16")?;
    a = x(&a, 4)?;
    
    if rng.gen_bool(0.5) {
        a = fade(&a,0.0,-30.0)?;
    }

    x(&a, 4)
}
