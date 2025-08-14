use crate::utils::{get_samples, wrap_samples};

pub fn split(input_wav: &[u8], n: usize) -> Result<Vec<Vec<u8>>, String> {
    if n == 1 {
        return Ok(vec![input_wav.to_vec()]);
    }
    let (samples, spec) = get_samples(input_wav)?;
    let total_samples = samples.len();
    let segment_length = total_samples / n;

    if segment_length == 0 {
        return Err("The number of segments is larger than the number of samples.".to_string());
    }

    let mut segments = Vec::new();
    for i in 0..n {
        let start = i * segment_length;
        let end = if i == n - 1 {
            total_samples
        } else {
            (i + 1) * segment_length
        };
        let segment_samples = samples[start..end].to_vec();
        let segment_wav = wrap_samples(segment_samples.clone(), spec)?;
        segments.push(segment_wav);
    }

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_dummy;
    use crate::len::len;

    #[test]
    fn test_split_normal() {
        let input_wav_bytes = get_dummy();
        let n = 4;

        let segments = split(&input_wav_bytes, n).expect("split function failed");

        assert_eq!(segments.len(), n, "Should produce n segments");

        let original_duration = len(&input_wav_bytes).unwrap();
        let segment_duration = original_duration / n as f32;

        for (i, segment) in segments.iter().enumerate() {
            let duration = len(&segment).unwrap();
            if i < n - 1 {
                assert!((duration - segment_duration).abs() < 0.01, "Segment {} duration is incorrect", i);
            } else {
                // Last segment might be slightly longer to account for rounding
                assert!(duration >= segment_duration, "Last segment duration is incorrect");
            }
        }
    }

    #[test]
    fn test_split_more_segments_than_samples() {
        let input_wav_bytes = get_dummy();
        let (samples, _) = get_samples(&input_wav_bytes).unwrap();
        let n = samples.len() + 1;

        let result = split(&get_dummy(), n);
        assert!(result.is_err(), "Should fail if n is greater than number of samples");
    }

    #[test]
    fn test_split_one_segment() {
        let input_wav_bytes = get_dummy();
        let n = 1;

        let segments = split(&input_wav_bytes, n).expect("split function failed for n=1");

        assert_eq!(segments.len(), n, "Should produce 1 segment");
        assert_eq!(segments[0], input_wav_bytes, "The single segment should be identical to the original");
    }
}