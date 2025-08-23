use hound::{WavReader, WavWriter};
use std::io::Cursor;

pub fn join(wavs: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    if wavs.is_empty() {
        return Err("Cannot join an empty list of wavs".to_string());
    }

    let mut readers: Vec<_> = wavs.iter().map(|w| WavReader::new(Cursor::new(w)).unwrap()).collect();
    let spec = readers[0].spec();

    let mut out_bytes: Vec<u8> = Vec::new();
    let out_cursor = Cursor::new(&mut out_bytes);
    let mut writer = WavWriter::new(out_cursor, spec).map_err(|e| e.to_string())?;

    for reader in &mut readers {
        for sample in reader.samples::<f32>() {
            writer.write_sample(sample.unwrap()).map_err(|e| e.to_string())?;
        }
    }

    writer.finalize().map_err(|e| e.to_string())?;
    Ok(out_bytes)
}
