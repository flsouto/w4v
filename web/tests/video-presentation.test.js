import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePresentation } from '../../scripts/video/presentation.mjs';
import { parseOptions } from '../../scripts/video/inputs.mjs';
const catalog = {blenders:['mosaic','glitch'],effects:['reverse','reverb']};
test('explicit random selects remain random and override randomized named selections', () => {
  const settings = parseOptions({'random-ui':true,mixer:'random',fx:'random'});
  assert.deepEqual(choosePresentation(settings,catalog,()=>assert.fail('Explicit random must not pick a named option')),{mixer:'random',fx:'random',visualOnly:true});
  assert.deepEqual(choosePresentation(parseOptions({mixer:'glitch',fx:''}),catalog),{mixer:'glitch',fx:'',visualOnly:true});
  assert.deepEqual(choosePresentation(parseOptions({fx:'random','random-ui':true}),catalog,values=>values[0]),{mixer:'mosaic',fx:'random',visualOnly:true});
  assert.deepEqual(choosePresentation(parseOptions({}),null),{mixer:'',fx:'',visualOnly:false});
  assert.throws(()=>choosePresentation(parseOptions({mixer:'missing'}),catalog),/Unknown capture mixer/);
  assert.throws(()=>choosePresentation(parseOptions({fx:'missing'}),catalog),/Unknown capture FX/);
});
