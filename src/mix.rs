use wasm_bindgen::prelude::*;
use clap::Parser;
use crate::utils::{get_samples, wrap_samples};

pub fn mix(input_wav1: &[u8], input_wav2: &[u8], normalize: bool) -> Result<Vec<u8>, String> {
    let (samples1, spec1) = get_samples(input_wav1)?;
    let (samples2, spec2) = get_samples(input_wav2)?;

    if spec1.sample_rate != spec2.sample_rate {
        return Err("Sample rates do not match.".to_string());
    }
    if spec1.channels != spec2.channels {
        return Err("Number of channels do not match.".to_string());
    }
    if spec1.sample_format != spec2.sample_format {
        return Err("Sample formats do not match.".to_string());
    }
    if spec1.bits_per_sample != spec2.bits_per_sample {
        return Err("Bits per sample do not match.".to_string());
    }

    let max_len = samples1.len().max(samples2.len());
    let mut mixed_samples = Vec::with_capacity(max_len);

    for i in 0..max_len {
        let sample1 = samples1.get(i).cloned().unwrap_or(0.0);
        let sample2 = samples2.get(i).cloned().unwrap_or(0.0);
        mixed_samples.push((sample1 + sample2) / 2.0);
    }

    if normalize {
        let mut max_abs_sample = 0.0;
        for &sample in &mixed_samples {
            if sample.abs() > max_abs_sample {
                max_abs_sample = sample.abs();
            }
        }

        if max_abs_sample > 0.0 {
            let scale = 1.0 / max_abs_sample;
            for sample in &mut mixed_samples {
                *sample *= scale;
            }
        }
    }

    wrap_samples(mixed_samples, spec1)
}

#[wasm_bindgen]
pub fn mix_js(
    input_wav1: &[u8],
    input_wav2: &[u8],
    normalize: bool,
) -> Result<js_sys::Uint8Array, JsValue> {
    match mix(input_wav1, input_wav2, normalize) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Mixes two WAV files together", long_about = None)]
pub struct MixArgs {
    /// First input WAV file
    #[arg()]
    pub input1: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Second input WAV file
    #[arg()]
    pub input2: String,

    /// Normalize the output
    #[arg(short, long)]
    pub normalize: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;

    #[test]
    fn test_mix_and_normalize() {
        let input_wav_bytes1 = get_dummy();
        let input_wav_bytes2 = get_dummy();

        let output_wav_bytes = mix(&input_wav_bytes1, &input_wav_bytes2, true)
            .expect("mix function failed");

        let (samples, _) = get_samples(&output_wav_bytes).unwrap();
        let max_sample = samples.iter().fold(0.0f32, |acc, &x| acc.max(x.abs()));

        assert!((max_sample - 1.0f32).abs() < 1e-6, "Normalization should result in a peak of 1.0");
    }

    #[test]
    fn test_mix_different_lengths() {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let input_wav_bytes1 = {
            let mut cursor = std::io::Cursor::new(Vec::new());
            {
                let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
                writer.write_sample(0i16).unwrap();
                writer.flush().unwrap();
            }
            cursor.into_inner()
        };

        let input_wav_bytes2 = {
            let mut cursor = std::io::Cursor::new(Vec::new());
            {
                let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
                writer.write_sample(0i16).unwrap();
                writer.write_sample(0i16).unwrap();
                writer.flush().unwrap();
            }
            cursor.into_inner()
        };

        let output_wav_bytes = mix(&input_wav_bytes1, &input_wav_bytes2, false)
            .expect("mix function failed");

        let (samples, _) = get_samples(&output_wav_bytes).unwrap();
        assert_eq!(samples.len(), 2);
    }
}
