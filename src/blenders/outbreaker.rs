use crate::{add, cut, resize, len, speed, chop, gain, fade, split};
use rand::Rng;
use rand::rngs::StdRng;
use rand::seq::SliceRandom;

pub fn outbreaker(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    let split_options = [4, 8, 16, 32];

    let s1 = wavs[0];
    let s1_cut = cut(s1, "0", "1/4")?;
    let s1_split_n = *split_options.choose(rng).unwrap();
    let arr0 = split(&s1_cut, s1_split_n as usize)?;
    if arr0.is_empty() {
        return Err("Loop 1 split produced no segments".to_string());
    }
    let a = arr0[0].clone();

    let s2 = wavs[1];
    let s2_cut = cut(s2, "0", "1/4")?;
    let s2_split_n = *split_options.choose(rng).unwrap();
    let arr1 = split(&s2_cut, s2_split_n as usize)?;
    if arr1.len() < 2 {
        return Err("Loop 2 split did not produce enough segments".to_string());
    }
    let a_len = len(&a)?;
    let b = resize(&arr1[1], a_len)?;

    let s3 = wavs[2];
    let s3_cut = cut(s3, "0", "1/4")?;
    let s3_split_n = *split_options.choose(rng).unwrap();
    let arr2 = split(&s3_cut, s3_split_n as usize)?;
    if arr2.len() < 3 {
        return Err("Loop 3 split did not produce enough segments".to_string());
    }
    let c = resize(&arr2[2], a_len)?;

    let a_half = fade(&cut(&a, "0", "1/2")?, 0.0, 0.01)?;

    let s1_mk = mk(rng, &a, &b, &c, &a_half, &arr0)?;
    let mut s2_mk = mk(rng, &a, &b, &c, &a_half, &arr0)?;
    let mut s3_mk = mk(rng, &a, &b, &c, &a_half, &arr0)?;

    if rng.gen_bool(0.5) {
        let s2_len = len(&s2_mk)?;
        let part_dur = s2_len / 16.0;
        let main_part_dur = s2_len - part_dur;
        
        let s2_main = cut(&s2_mk, "0", &main_part_dur.to_string())?;
        let s2_part = cut(&s2_mk, &main_part_dur.to_string(), &part_dur.to_string())?;
        let s2_part_mod = gain(&s2_part, -90.0)?;
        s2_mk = add(&s2_main, &s2_part_mod)?;
    }

    let s3_len = len(&s3_mk)?;
    let part_dur = s3_len / 16.0 * 2.0;
    let main_part_dur = s3_len - part_dur;

    let s3_main = cut(&s3_mk, "0", &main_part_dur.to_string())?;
    let s3_part = cut(&s3_mk, &main_part_dur.to_string(), &part_dur.to_string())?;
    let s3_part_mod = gain(&s3_part, -90.0)?;
    s3_mk = add(&s3_main, &s3_part_mod)?;

    let f = add(&s1_mk, &s2_mk)?;
    let f = add(&f, &s1_mk)?;
    let f = add(&f, &s3_mk)?;
    let final_len = rng.gen_range(12.0..=16.0);
    
    resize(&f, final_len)
}

fn get_c_half(rng: &mut StdRng, c: &[u8], arr0: &Vec<Vec<u8>>) -> Result<Vec<u8>, String> {
    if arr0.len() < 3 {
        return Err("arr0 does not have enough segments for get_c_half".to_string());
    }
    if rng.gen_bool(0.5) {
        fade(&cut(c, "0", "1/2")?, 0.0, 0.01)
    } else {
        fade(&cut(&arr0[2], "1/2", "1")?, 0.0, 0.01)
    }
}

fn get_b_half(rng: &mut StdRng, b: &[u8], arr0: &Vec<Vec<u8>>) -> Result<Vec<u8>, String> {
    if arr0.len() < 2 {
        return Err("arr0 does not have enough segments for get_b_half".to_string());
    }
    if rng.gen_bool(0.5) {
        cut(b, "0", "1/2")
    } else {
        cut(&arr0[1], "1/2", "1")
    }
}

fn mk(
    rng: &mut StdRng,
    a: &[u8],
    b: &[u8],
    c: &[u8],
    a_half: &[u8],
    arr0: &Vec<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let mut s = a.to_vec();

    if rng.gen_bool(0.5) {
        s = add(&s, &gain(b, -5.0)?)?;
    } else {
        if rng.gen_bool(0.5) {
            s = add(&s, &gain(a, -5.0)?)?;
        } else {
            s = speed(&s, 0.5)?;
        }
    }

    s = add(&s, c)?;
    s = add(&s, &gain(&get_b_half(rng, b, arr0)?, -5.0)?)?;

    if rng.gen_bool(0.5) {
        s = add(&s, &get_c_half(rng, c, arr0)?)?;
    } else {
        s = add(&s, &chop(&get_c_half(rng, c, arr0)?, 8)?)?;
    }

    s = add(&s, &get_b_half(rng, b, arr0)?)?;
    s = add(&s, &get_c_half(rng, c, arr0)?)?;

    s = add(&s, a_half)?;

    if rng.gen_bool(0.5) {
        s = add(&s, &gain(&get_b_half(rng, b, arr0)?, -5.0)?)?;
    } else {
        if rng.gen_bool(0.5) {
            s = add(&s, &gain(&get_c_half(rng, c, arr0)?, -5.0)?)?;
        } else {
            s = add(&s, &gain(&chop(&get_c_half(rng, c, arr0)?, 2)?, -5.0)?)?;
        }
    }

    s = add(&s, c)?;
    if rng.gen_bool(0.5) {
        s = add(&s, &gain(b, -10.0)?)?;
    } else {
        if rng.gen_bool(0.5) {
            s = add(&s, &gain(a, -10.0)?)?;
        } else {
            s = add(&s, &gain(&chop(b, 8)?, -10.0)?)?;
        }
    }

    Ok(s)
}
