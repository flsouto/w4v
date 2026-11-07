export const SUPPORT_STORAGE_KEY = 'looplicator.support.v1';
export const SUPPORT_LOOP_INTERVAL = 10;

export function readSupportPreferences(store) {
  let value;
  try { value = JSON.parse((store ?? localStorage).getItem(SUPPORT_STORAGE_KEY)); } catch { /* Session defaults work when storage is unavailable. */ }
  return {
    supported: value?.supported === true,
    generatedSincePrompt: Number.isSafeInteger(value?.generatedSincePrompt) && value.generatedSincePrompt >= 0
      ? Math.min(value.generatedSincePrompt, SUPPORT_LOOP_INTERVAL) : 0,
  };
}

export function saveSupportPreferences(value, store) {
  try { (store ?? localStorage).setItem(SUPPORT_STORAGE_KEY, JSON.stringify(value)); } catch { /* Keep the choice in memory for this session. */ }
}

export function recordSupportGeneration(preferences) {
  return preferences.supported ? preferences : {
    ...preferences, generatedSincePrompt: Math.min(SUPPORT_LOOP_INTERVAL, preferences.generatedSincePrompt + 1),
  };
}

export function supportPromptDue(preferences) {
  return !preferences.supported && preferences.generatedSincePrompt >= SUPPORT_LOOP_INTERVAL;
}
