use rand::{rngs::StdRng, SeedableRng};
use w4v::{mosaic_with_rng, utils::{get_dummy, get_samples, wrap_samples}};

#[test]
fn mosaic_keeps_seeded_output_and_silence() {
    let input = get_dummy();
    let mut expected_rng = StdRng::seed_from_u64(42);
    let (_, spec) = get_samples(&input).unwrap();
    let a = w4v::fade(&w4v::pick_with_rng(&input, &mut expected_rng, "0.05").unwrap(), 0.0, -30.0).unwrap();
    let silence = wrap_samples(vec![0.0; (spec.sample_rate as f32 * 0.05) as usize * spec.channels as usize], spec).unwrap();
    let expected = w4v::add(&w4v::add(&a, &silence).unwrap(), &a).unwrap();
    let actual = mosaic_with_rng(&input, &mut StdRng::seed_from_u64(42), "a_a", 0.05).unwrap();
    assert_eq!(actual, expected);
}

#[test]
fn invalid_parameters_return_errors() {
    let input = get_dummy();
    assert!(w4v::split(&input, 0).is_err());
    assert!(w4v::speed(&input, f32::NAN).is_err());
    assert!(w4v::resize(&input, f32::INFINITY).is_err());
    assert!(mosaic_with_rng(&input, &mut StdRng::seed_from_u64(1), "a", f32::NAN).is_err());
    assert!(w4v::blend::blend(&[], &mut StdRng::seed_from_u64(1), "mosaic", None).is_err());
}
