use wasm_bindgen::prelude::*;
use hound::{SampleFormat};
use std::io::Cursor;
use js_sys;
use clap::Parser;
use crate::utils::get_samples;
use crate::time::Time;
use crate::len::len;


pub fn cut(
    input_wav_bytes: Vec<u8>,
    start_offset_arg: Time,
    duration_arg: Time,
) -> Result<Vec<u8>, String> {
    let total_wav_duration = len(input_wav_bytes.clone())?;
    let start_offset_seconds = start_offset_arg.resolve(total_wav_duration)?;
    let duration_seconds = duration_arg.resolve(total_wav_duration)?;

    let (samples, spec) = get_samples(input_wav_bytes)?;

    let sample_rate = spec.sample_rate as f32;
    let channels = spec.channels as usize;

    let start_sample_index = (start_offset_seconds * sample_rate * channels as f32) as usize;
    let end_sample_index = (start_sample_index as f32 + (duration_seconds * sample_rate * channels as f32)) as usize;

    let num_total_samples = samples.len();

    if start_sample_index >= num_total_samples {
        return Err("Start offset is beyond the end of the WAV file.".to_string());
    }

    let mut actual_end_sample_index = end_sample_index.min(num_total_samples);

    // Ensure the length of the cut segment is a multiple of channels
    let segment_length = actual_end_sample_index - start_sample_index;
    let remainder = segment_length % channels;
    if remainder != 0 {
        actual_end_sample_index -= remainder;
    }

    let cut_samples = samples[start_sample_index..actual_end_sample_index].to_vec();

    // Write output as 16-bit PCM
    let mut out_bytes: Vec<u8> = Vec::new();
    {
        let out_cursor = Cursor::new(&mut out_bytes);
        let mut writer = hound::WavWriter::new(out_cursor, hound::WavSpec {
            channels: spec.channels,
            sample_rate: spec.sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        }).map_err(|e| format!("Write error: {}", e))?;

        for sample in cut_samples {
            let val = (sample * i16::MAX as f32) as i16;
            writer.write_sample(val)
                .map_err(|e| format!("Write sample error: {}", e))?;
        }
        writer.finalize()
            .map_err(|e| format!("Finalize error: {}", e))?;
    }

    Ok(out_bytes)
}

#[wasm_bindgen]
pub fn cut_js(
    input_wav: &[u8],
    start_offset: &str,
    duration: &str,
) -> Result<js_sys::Uint8Array, JsValue> {
    let start_offset_arg = start_offset.parse::<Time>().map_err(|e| JsValue::from_str(&e))?;
    let duration_arg = duration.parse::<Time>().map_err(|e| JsValue::from_str(&e))?;
    match cut(input_wav.to_vec(), start_offset_arg, duration_arg) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Cuts a segment from a WAV file", long_about = None)]
pub struct CutArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Start offset in seconds (can be absolute or fraction like "1/2")
    #[arg(value_parser = clap::value_parser!(Time))]
    pub start_offset: Time,

    /// Duration of the segment to cut in seconds (can be absolute or fraction like "1/2")
    #[arg(value_parser = clap::value_parser!(Time))]
    pub duration: Time,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::len::len;

    #[test]
    fn test_cut_effect() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Test cutting a segment from the middle with absolute values
        let start_offset_abs = original_duration / 4.0;
        let duration_abs = original_duration / 2.0;
        let output_wav_abs = cut(input_wav.clone(), Time::abs(start_offset_abs), Time::abs(duration_abs)).expect("Cut function failed with absolute values");

        let processed_duration_abs = len(output_wav_abs.clone()).expect("Failed to get processed duration for absolute values");
        assert!((processed_duration_abs - duration_abs).abs() < 0.01, "Cut duration should be accurate for absolute values");
        assert_ne!(input_wav, output_wav_abs, "Cut should modify the audio content for absolute values");

        // Test cutting a segment from the middle with fractional values
        let start_offset_frac = Time::fract(0.25);
        let duration_frac = Time::fract(0.5);
        let output_wav_frac = cut(input_wav.clone(), start_offset_frac, duration_frac).expect("Cut function failed with fractional values");

        let processed_duration_frac = len(output_wav_frac.clone()).expect("Failed to get processed duration for fractional values");
        assert!((processed_duration_frac - (original_duration / 2.0)).abs() < 0.01, "Cut duration should be accurate for fractional values");
        assert_ne!(input_wav, output_wav_frac, "Cut should modify the audio content for fractional values");
    }

    #[test]
    fn test_cut_channel_alignment() {
        let dummy_wav_path = format!("{}/tests/data/dummy.wav", env!("CARGO_MANIFEST_DIR"));
        let input_wav = fs::read(dummy_wav_path).expect("Failed to read dummy.wav");

        // Choose a duration that is unlikely to be a perfect multiple of channels
        // For a stereo WAV (2 channels), a duration that results in an odd number of samples
        // would trigger the alignment logic.
        let start_offset = Time::abs(0.0);
        let duration = Time::fract(1.0/1000.0); // A very small, non-integer duration

        // The cut function should not panic or return an error
        let output_wav = cut(input_wav.clone(), start_offset, duration).expect("Cut function should handle channel alignment");

        // Verify that the output WAV is valid (can be read by len)
        let processed_duration = len(output_wav).expect("Failed to get processed duration for channel alignment test");
        assert!(processed_duration >= 0.0, "Processed duration should be non-negative");
    }
}
