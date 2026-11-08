//! Native-only AI experiments. Register new experiments here, outside the rand pool.
pub mod imprint;
pub mod orbit;

use rand::{rngs::StdRng, seq::SliceRandom};

pub struct ExperimentalMixer {
    pub name: &'static str,
    pub mix: fn(&[&[u8]], &mut StdRng) -> Result<Vec<u8>, String>,
    /// Applied after shared normalization and optional effects.
    pub finish: fn(Vec<u8>, &mut StdRng) -> Result<Vec<u8>, String>,
}

pub static MIXERS: &[ExperimentalMixer] = &[
    ExperimentalMixer {
        name: "orbit",
        mix: orbit::orbit,
        finish: |audio, _| orbit::limit_duration(audio),
    },
    ExperimentalMixer {
        name: "imprint",
        mix: imprint::imprint,
        finish: imprint::limit_duration,
    },
];

pub fn find(name: &str) -> Option<&'static ExperimentalMixer> {
    MIXERS.iter().find(|mixer| mixer.name == name)
}

pub fn choose(rng: &mut StdRng) -> &'static ExperimentalMixer {
    MIXERS
        .choose(rng)
        .expect("experimental catalog must not be empty")
}

pub fn experimental(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String> {
    let mixer = choose(rng);
    (mixer.finish)((mixer.mix)(wavs, rng)?, rng)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    #[test]
    fn random_catalog_exposes_only_the_broad_experimental_entry() {
        let catalog = crate::blend::get_blenders();
        assert_eq!(catalog.len(), 9);
        assert!(catalog.contains_key("experimental"));
        for mixer in MIXERS {
            assert!(!catalog.contains_key(mixer.name));
            assert!(find(mixer.name).is_some());
        }
        let browser = crate::blend::get_blenders_js();
        assert_eq!(browser.len(), 8);
        assert!(
            !browser
                .iter()
                .any(|name| name == "experimental" || find(name).is_some())
        );
        let choices: std::collections::HashSet<_> = (0..32)
            .map(|seed| choose(&mut StdRng::seed_from_u64(seed)).name)
            .collect();
        assert_eq!(choices.len(), MIXERS.len());
    }

    #[test]
    fn experimental_dispatch_matches_the_seeded_experiment_selection() {
        let input = crate::utils::get_dummy();
        let inputs = [&input[..], &input[..], &input[..]];
        let mut rng = StdRng::seed_from_u64(42);
        let selected = choose(&mut rng);
        let expected =
            crate::blend::blend(&inputs, &mut rng, selected.name, Some("slower")).unwrap();
        let actual = crate::blend::blend(
            &inputs,
            &mut StdRng::seed_from_u64(42),
            "experimental",
            Some("slower"),
        )
        .unwrap();
        assert_eq!(actual, expected);
    }
}
