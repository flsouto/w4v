// cargo run --release --example profile_blenders -- path/to/input.wav
use rand::{rngs::StdRng, SeedableRng};
use std::{env, fs, time::Instant};
fn main() {
    let input = fs::read(env::args().nth(1).expect("Supply an input WAV path")).unwrap();
    let inputs = [input.as_slice(); 3];
    let mut names: Vec<_> = w4v::blend::get_blenders().keys().copied().collect();
    names.sort();
    for name in names {
        for seed in 0..3 {
            let start = Instant::now();
            let result = w4v::blend::blend(&inputs, &mut StdRng::seed_from_u64(seed), name, None);
            println!("{name},seed={seed},ms={:.1},{}", start.elapsed().as_secs_f64() * 1000.0,
                match result { Ok(wav) => format!("bytes={}", wav.len()), Err(error) => format!("error={error}") });
        }
    }
}
