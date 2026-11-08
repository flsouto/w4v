#![cfg(not(target_arch = "wasm32"))]
use hound::{SampleFormat, WavReader, WavSpec};
use std::{
    fs,
    io::Cursor,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use w4v::utils::wrap_samples;
#[test]
fn cli_supports_explicit_roles_and_three_file_folders_without_modifying_sources() {
    let root = std::env::temp_dir().join(format!(
        "w4v-orbit-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("inputs")).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let mut sources = Vec::new();
    for (name, rate, channels, frequency) in [
        ("anchor", 16000, 1, 173.0),
        ("motif", 22050, 2, 271.0),
        ("answer", 8000, 1, 431.0),
    ] {
        let samples = (0..rate * 3)
            .flat_map(|i| {
                vec![
                    (std::f32::consts::TAU * frequency * i as f32 / rate as f32).sin() * 0.3;
                    channels as usize
                ]
            })
            .collect();
        let bytes = wrap_samples(
            samples,
            WavSpec {
                sample_rate: rate,
                channels,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        let path = root.join("inputs").join(format!("{name}.wav"));
        fs::write(&path, &bytes).unwrap();
        sources.push((path, bytes));
    }
    for name in ["one", "two"] {
        let output = root.join(format!("{name}.wav"));
        let result = Command::new(env!("CARGO_BIN_EXE_w4v"))
            .args(["--seed", "42", "orbit"])
            .args(sources.iter().map(|(path, _)| path))
            .arg(&output)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let reader = WavReader::new(Cursor::new(fs::read(output).unwrap())).unwrap();
        assert_eq!(reader.spec().sample_rate, 44100);
        assert_eq!(reader.spec().channels, 2);
        assert_eq!(reader.spec().bits_per_sample, 16);
        assert!(reader.duration() > 11 * 44100 && reader.duration() < 21 * 44100);
        assert!(
            reader
                .into_samples::<i16>()
                .any(|s| s.unwrap().unsigned_abs() > 100)
        );
    }
    assert_eq!(
        fs::read(root.join("one.wav")).unwrap(),
        fs::read(root.join("two.wav")).unwrap()
    );
    let imprint_output = root.join("imprint.wav");
    let result = Command::new(env!("CARGO_BIN_EXE_w4v"))
        .args(["--seed", "42", "imprint"])
        .args(sources.iter().map(|(path, _)| path))
        .arg(&imprint_output)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let imprint = WavReader::open(imprint_output).unwrap();
    assert_eq!(imprint.spec().sample_rate, 44100);
    assert_eq!(imprint.spec().channels, 2);
    assert_eq!(imprint.spec().bits_per_sample, 16);
    assert!(imprint.duration() > 0 && imprint.duration() < 24 * 44100);
    for mixer in ["orbit", "imprint", "experimental"] {
        let result = Command::new(env!("CARGO_BIN_EXE_w4v"))
            .args(["--seed", "42", "blend"])
            .arg(root.join("inputs"))
            .arg(root.join("folder.wav"))
            .args([mixer, "slower"])
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let reader =
            WavReader::new(Cursor::new(fs::read(root.join("folder.wav")).unwrap())).unwrap();
        assert!(reader.duration() < 24 * 44100);
        if mixer == "experimental" {
            assert!(String::from_utf8_lossy(&result.stdout).contains("Experimental blender resolved to '"));
        }
    }
    for (path, bytes) in sources {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}
