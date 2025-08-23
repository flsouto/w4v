use crate::add::add;

pub fn join(wavs: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    if wavs.is_empty() {
        return Err("Cannot join an empty list of wavs".to_string());
    }

    let mut result = wavs[0].clone();

    for i in 1..wavs.len() {
        result = add(&result, &wavs[i])?;
    }

    Ok(result)
}
