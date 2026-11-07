use crate::{x,reverb,reverse,add,pick_with_rng as pick};
use crate::mosaic_with_rng as mosaic_fx;
use rand::prelude::SliceRandom;
use rand::Rng;
use rand::rngs::StdRng;

pub fn mosaic(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String>{

    mosaic_with_patterns(wavs, rng, None)
}

pub fn mosaic_with_patterns(wavs: &[&[u8]], rng: &mut StdRng, patterns: Option<&[String]>) -> Result<Vec<u8>, String> {
    mosaic_with_pattern_details(wavs, rng, patterns).map(|(audio, _)| audio)
}

pub fn mosaic_with_pattern_details(wavs: &[&[u8]], rng: &mut StdRng, patterns: Option<&[String]>) -> Result<(Vec<u8>, String), String> {
    let mut w1 = pick( wavs[0], rng, "1/16")?;
    let mut w2 = pick( wavs[1], rng, "1/16")?;

    if rng.gen_bool(0.5) {
        w1 = reverse(&w1)?;
    }

    if rng.gen_bool(0.5) {
        w2 = reverse(&w2)?;
    }

    let pat = match patterns {
        Some(pool) => pool.choose(rng).ok_or("Select at least one mosaic pattern")?.clone(),
        None => get_random_pattern(rng),
    };    
    let segment_len = rng.gen_range(0.1..=0.2);
    let mut o = mosaic_fx(&add(&w1,&w2)?, rng, &pat, segment_len)?;

    // todo randomize params
    o = reverb(&o, rng.gen_range(80..=180), rng.gen_range(0.3..=0.8))?;

    Ok((x(&o, 4)?, pat))

}

pub fn get_random_pattern(rng: &mut StdRng) -> String{
    get_patterns()
        .choose(rng)
        .unwrap()
        .to_string()
}

pub fn get_patterns() -> Vec<String> {
    include_str!("mosaic-patterns.txt").lines().map(String::from).collect()
}

#[cfg(test)]
mod pattern_tests {
    use super::*;
    use rand::SeedableRng;
    #[test]
    fn selected_pattern_controls_mosaic_length() {
        let input = crate::utils::get_dummy();
        let patterns = vec!["z_".to_string()];
        let output = mosaic_with_patterns(&[&input, &input], &mut StdRng::seed_from_u64(42), Some(&patterns)).unwrap();
        let duration = crate::len::len(&output).unwrap();
        assert!((0.8..=1.6).contains(&duration), "duration: {}", duration);
        assert!(mosaic_with_patterns(&[&input, &input], &mut StdRng::seed_from_u64(42), Some(&[])).is_err());
    }
}
