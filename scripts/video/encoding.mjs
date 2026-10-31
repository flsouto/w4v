// Part of cache identity: never reuse older lossy intermediates after encoder changes.
export const ENCODING_PROFILE = 'pcm-f32-aac384-v1';
export const INTERMEDIATE_EXTENSION = 'mov';
export const INTERMEDIATE_AUDIO = ['-c:a', 'pcm_f32le'];
export const FINAL_AUDIO = ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '384k'];
