use wasm_bindgen::prelude::*;
use js_sys;
use clap::Parser;
use crate::utils::{get_samples,wrap_samples};

pub fn flanger(
    input_wav: Vec<u8>,
    delay_ms: f32, // Base delay in milliseconds
    depth_ms: f32, // Depth of modulation in milliseconds
    rate_hz: f32,  // LFO rate in Hz
    feedback: f32, // Feedback amount (-1.0 to 1.0)
) -> Result<Vec<u8>, String> {
    let (samples, spec) = get_samples(input_wav)?;

    let sample_rate = spec.sample_rate as f32;
    let channels = spec.channels as usize;
    let num_samples = samples.len();

    // Max delay in samples, ensuring enough space for modulation
    let max_delay_samples = (((delay_ms + depth_ms) / 1000.0 * sample_rate) as usize).max(1);

    let mut delay_line = vec![0.0; max_delay_samples * channels];
    let mut write_pointer = 0;

    let mut lfo_phase: f32 = 0.0;
    let lfo_increment = 2.0 * std::f32::consts::PI * rate_hz / sample_rate;

    let mut output_samples = Vec::with_capacity(num_samples);

    for i in 0..num_samples {
        let current_input_sample = samples[i];

        // Calculate modulated delay for current sample
        let modulated_delay_ms = delay_ms + (depth_ms * (lfo_phase.sin() * 0.5 + 0.5));
        let modulated_delay_samples_float = modulated_delay_ms / 1000.0 * sample_rate;

        // Read pointer for delay line (circular buffer)
        let read_pointer_float = (write_pointer as f32 - modulated_delay_samples_float).rem_euclid(max_delay_samples as f32);
        
        let read_pointer_floor = read_pointer_float.floor() as usize;
        let read_pointer_ceil = read_pointer_float.ceil() as usize;
        let frac = read_pointer_float.fract();

        let delayed_sample;
        if max_delay_samples > 0 {
            let sample1 = delay_line[read_pointer_floor];
            let sample2 = delay_line[read_pointer_ceil % max_delay_samples]; // Ensure wrap-around
            delayed_sample = sample1 * (1.0 - frac) + sample2 * frac;
        } else {
            delayed_sample = 0.0;
        }

        // Flanger equation
        let flanged_sample = current_input_sample + delayed_sample + feedback * delayed_sample; // Simplified feedback

        // Write current sample to delay line
        delay_line[write_pointer] = current_input_sample + feedback * delayed_sample; // Feedback into delay line

        // Advance write pointer (circular)
        write_pointer = (write_pointer + 1) % max_delay_samples;

        output_samples.push(flanged_sample.clamp(-1.0, 1.0));

        lfo_phase += lfo_increment;
    }

    wrap_samples(output_samples, spec)
}

#[wasm_bindgen]
pub fn flanger_js(
    input_wav: &[u8],
    delay_ms: f32,
    depth_ms: f32,
    rate_hz: f32,
    feedback: f32,
) -> Result<js_sys::Uint8Array, JsValue> {
    match flanger(input_wav.to_vec(), delay_ms, depth_ms, rate_hz, feedback) {
        Ok(result_vec) => Ok(js_sys::Uint8Array::from(result_vec.as_slice())),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[derive(Parser, Debug)]
#[command(about = "Applies a flanger effect to a WAV file", long_about = None)]
pub struct FlangerArgs {
    /// Input WAV file
    #[arg()]
    pub input: String,

    /// Output WAV file
    #[arg()]
    pub output: String,

    /// Base delay in milliseconds
    #[arg(default_value_t = 0.0)]
    pub delay: f32,

    /// Depth of modulation in milliseconds
    #[arg(default_value_t = 0.0)]
    pub depth: f32,

    /// LFO rate in Hz
    #[arg(default_value_t = 0.1)]
    pub rate: f32,

    /// Feedback amount (-1.0 to 1.0)
    #[arg(default_value_t = 0.0)]
    pub feedback: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::len::len;
    use crate::utils::get_dummy;
    
    #[test]
    fn test_flanger_effect() {

        let input_wav = get_dummy();
        
        let original_duration = len(input_wav.clone()).expect("Failed to get original duration");

        // Apply flanger with some parameters
        let delay_ms = 5.0;
        let depth_ms = 2.0;
        let rate_hz = 0.5;
        let feedback = 0.7;
        let output_wav = flanger(input_wav.clone(), delay_ms, depth_ms, rate_hz, feedback).expect("Flanger function failed");

        let processed_duration = len(output_wav.clone()).expect("Failed to get processed duration");

        // Assert that the duration remains the same
        assert_eq!(original_duration, processed_duration, "Flanger should not change the duration");

        // Assert that the content has changed (i.e., flanger was applied)
        assert_ne!(input_wav, output_wav, "Flanger should modify the audio content");
    }
}
