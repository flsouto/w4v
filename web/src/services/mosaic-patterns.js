export const PATTERN_STORAGE_KEY = 'looplicator.mosaic-patterns.v1';
export const validPattern = value => typeof value === 'string' && /^[a-z_]{1,256}$/.test(value) && /[a-z]/.test(value);
export function loadPatternSettings(store = localStorage) {
  try {
    const value = JSON.parse(store.getItem(PATTERN_STORAGE_KEY));
    return {
      custom: [...new Set((Array.isArray(value?.custom) ? value.custom : []).filter(validPattern))],
      excluded: [...new Set((Array.isArray(value?.excluded) ? value.excluded : []).filter(validPattern))],
    };
  } catch { return { custom: [], excluded: [] }; }
}
