import { randomInt } from 'node:crypto';
import { CAPTURE_RANDOM_VALUE } from '../../web/src/capture-contract.js';

export function choosePresentation(settings, catalog, pick = values => values[randomInt(values.length)]) {
  const choose = (explicit, choices, label) => {
    if (explicit !== undefined) {
      if (explicit !== '' && explicit !== CAPTURE_RANDOM_VALUE && !choices.includes(explicit)) throw new Error(`Unknown capture ${label}: ${explicit}`);
      return explicit;
    }
    return settings.randomUi ? pick(choices) : '';
  };
  return {
    mixer: choose(settings.mixer, catalog?.blenders ?? [], 'mixer'),
    fx: choose(settings.fx, catalog?.effects ?? [], 'FX'),
    visualOnly: Boolean(settings.randomUi || settings.mixer !== undefined || settings.fx !== undefined),
  };
}
