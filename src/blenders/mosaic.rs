use crate::{x,reverb,reverse,add,pick_with_rng as pick};
use crate::mosaic_with_rng as mosaic_fx;
use rand::prelude::SliceRandom;
use rand::Rng;
use rand::rngs::StdRng;

pub fn mosaic(wavs: &[&[u8]], rng: &mut StdRng) -> Result<Vec<u8>, String>{

    let mut w1 = pick( wavs[0], rng, "1/16")?;
    let mut w2 = pick( wavs[1], rng, "1/16")?;

    if rng.gen_bool(0.5) {
        w1 = reverse(&w1)?;
    }

    if rng.gen_bool(0.5) {
        w2 = reverse(&w2)?;
    }

    let pat = get_random_pattern(rng);    
    let segment_len = rng.gen_range(0.1..=0.34);
    let mut o = mosaic_fx(&add(&w1,&w2)?, rng, &pat, segment_len)?;

    // todo randomize params
    o = reverb(&o, rng.gen_range(30..=180), rng.gen_range(0.3..=0.8))?;

    x(&o, 4)

}

pub fn get_random_pattern(rng: &mut StdRng) -> String{
    get_patterns()
        .choose(rng)
        .unwrap()
        .to_string()
}

pub fn get_patterns() -> Vec<String> {
    [
        "a_b_a__ca_b_c___",
        "a_b_a__ca_b_d___",
        "a_a_b__ca_b_d___",
        "aa__b__ca_c_d___",
        "aa__b__aa___c___",
        "aa__b__ad___c___",
        "ababbabb",
        "dabab_dbabc_",
        "cabab_d_",
        "abcabcab",
        "abcabcaa",
        "ab_c_b__",
        "aa_b_cb_",
        "aaaaa_____b_ac__",
        "d_aa_bb_cccc____",
        "aabac_a_a_abad__",
        "aa_ac_a_a_abac__",
        "abbbcb_aabbbcac_",
        "abbbcbaabbbcac__",
        "a_b_bbb_c_d_d_d_",
        "a_b_d_b_c_b_bdb_",
        "a_b_a_b_c_b_bcbb",
        "a_b_a_b_a_b_b_a_b_b_a_b_a_a_a_a_",
        "a_a_b_a_a_b_a_b_",
        "a_a_b_a_a_b_a_c_",
        "a_a_b_a_a_b_aabc",
        "a_a_b_a_c_b_c_b_",
        "a_a_b_a_c_b_ccba",
        "a__b_a_a_b__",
        "a__b_aca_d__",
        "a_ba_ab_",
        "a_bacab_",
        "adbacabd",
        "adcbcabd",
        "a_b_a_baa_baaaba",
        "aa__b___d_b_c___",
        "abcb",
        "abbbcbbb",
        "a_b_",
        "aaaab__aaaaa__b_",
        "aabaabaaaababbba",
        "aaa_b_aaaa__b___",
        "aaa_b_aaaaa_b___",
        "aaa_b_aaaaa___b_",
        "aaaabaaaaaaa_aaa",
        "aaaabaaaaaaa_aab",
        "aaaabaaaaaaa_aca",
        "a_a_b_abcbaab_a_",
        "a_a_b_abcbaab_c_",
        "a_c_b_cbcbacb_c_",
        "a___b__bcbaab___",
        "aaaab_a_aaab_ab_",
        "aabcabac_abcabac",
        "aabcabac_abcab_d",
        "aaaa_aaaa_bababa",
        "a_a_b_a___a_b___",
        "aa_baa_baa_baa_a",
        "ab_ab_ab_ab_a_b_",
        "ab_ab_ab_ab_baaa",
        "a___b__a_aa_b___",
        "aaaabaababaabbbb",
        "baaabaaabaab_b_b",
        "a_aba_a_aba_b_b_",
        "aa_ab_aa_a_abab_",
        "abbaaaabbaaaa_b_",
        "a__ab_a___abab__",
        "a_a___b__a_ba__b",
        "babab_babab_bab_",
        "babab_bab_babab_",
        "abbaaabb",
        "a_ba_bb_",
        "a_ba_bbaabbabbbb",
        "a_ba_ab_",
        "aa_bb_aa_bbbbbb_",
        "ab_baab_",
        "a_b_b_ab_bb__b__",
        "aa_a_aa_",
        "a_baca__",

        // GENERATED PATTERNS
        "a_b_ab__c_d_a_d_",
        "a_a_b___aba_d_b_",
        "aaa_b_abcbcab___",
        "a___cba_a_a_a___",
        "a_a_bbb_cbd_d_d_",
        "aab_b__ca_b_c_b_",
        "aab_a_ab_bbaa_a_",
        "aabbb__c__b_b_b_",
        "aababa_a__bababa"

    ].into_iter().map(String::from).collect()
}

