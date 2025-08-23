
use crate::{resize, len, split, mix, gain, speed, add, join};
use rand::Rng;
use rand::rngs::StdRng;

pub fn m4ze(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    let s1 = wavs[0];
    let s2 = wavs[1];

    let s2 = resize(s2, len(s1)?)?;

    let size = 64;
    let mut a = split(s1, size)?;
    let mut b = split(&s2, size)?;

    if a.is_empty() || b.is_empty() {
        return Err("Input samples are too short to be split into segments.".to_string());
    }

    let normal = rng.gen_range(0..=2);
    let mut speeder = false;
    let mut speeder_rate = 0;
    if rng.gen_range(0..=2) == 0 {
        speeder = true;
        speeder_rate = rng.gen_range(1..=4);
    }
    let clone_t = rng.gen_bool(0.5);

    let mut l1: Vec<Vec<u8>> = Vec::new();
    let mut l2: Vec<Vec<u8>> = Vec::new();

    for _ in 0..size {
        if a.is_empty() || b.is_empty() {
            break;
        }
        let s = a.remove(0);
        let mut t = b.remove(0);

        match rng.gen_range(1..=3) {
            1 => {
                if normal == 1 || (normal != 0 && rng.gen_bool(0.5)) {
                    l1.push(mix(&s, &t, false)?);
                    l2.push(gain(&s, -100.0)?);
                } else {
                    l1.push(s);
                    if clone_t {
                        l2.push(t.clone());
                    } else {
                        l2.push(t);
                    }
                }
            },
            2 => {
                l1.push(s);
                l2.push(gain(&t, -100.0)?);
            },
            3 => {
                l1.push(gain(&s, -100.0)?);
                if speeder && rng.gen_range(0..=speeder_rate) == 0 && !b.is_empty() {
                    let next_t = b[0].clone();
                    let t_mod = speed(&t, 2.0)?;
                    let next_t_mod = speed(&next_t, 2.0)?;
                    t = add(&t_mod, &next_t_mod)?;
                }
                if clone_t {
                    l2.push(t.clone());
                } else {
                    l2.push(t);
                }
            },
            _ => unreachable!(),
        }
    }

    if l1.is_empty() || l2.is_empty() {
        return Err("Could not generate any audio layers.".to_string());
    }

    let layer1 = join(&l1)?;
    let layer2 = join(&l2)?;

    mix(&layer1, &layer2, false)
}
