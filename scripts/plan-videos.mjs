import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { dirname,resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVideoSource } from './video/config.mjs';
import { readHistory } from './video/history.mjs';
import { selectInputs,chooseInputs,parseOptions } from './video/inputs.mjs';
import { clipTiming } from './video/timing.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{input:{type:'string',multiple:true},glob:{type:'string'},last:{type:'string'},random:{type:'string'},portion:{type:'string'},cycles:{type:'string'},seconds:{type:'string'},fps:{type:'string'},size:{type:'string'},history:{type:'string'},json:{type:'boolean'},help:{type:'boolean'},'random-ui':{type:'boolean'},'show-url':{type:'boolean'}}});
if(values.help) {
  console.log('npm run plan:videos -- --last 10 --portion 1/4 --cycles 2\nUse --random X instead of --last to sample X uncompiled loops at random.\nReports remaining unique uncompiled WAVs and selected batch duration.\nUses the same .env VIDEO_INPUT_GLOB, --glob, --input, --history and timing options as render:videos.\n--json returns machine-readable details. No rendering, history updates, commits, or pushes.');process.exit(0);
}
try {
  const settings=parseOptions(values),source=await resolveVideoSource(values,root);
  const history=await readHistory(resolve(values.history??join(root,'compiled-loops.txt')));
  const eligible=await selectInputs(source.directories,Infinity,history,source.glob);
  const requested=settings.random??settings.last;
  const selected=chooseInputs(eligible,requested,{random:settings.random!==undefined});
  const clips=selected.map(file=>{
    try {
      const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate','-of','json',file.path],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
      const sourceDuration=Number(info.format?.duration),sampleRate=Number(info.streams.find(s=>s.codec_type==='audio')?.sample_rate);
      const timing=clipTiming(sourceDuration,sampleRate,settings);
      return {...file,sourceDuration,...timing,estimatedVideoDuration:Math.max(1,Math.round(timing.duration*settings.fps))/settings.fps};
    } catch(error) {return {...file,error:error.message};}
  });
  const invalid=clips.filter(c=>c.error);
  const result={remaining:eligible.length,requested,selectionMode:settings.random!==undefined?'random':'last',selected:selected.length,remainingAfterSuccess:eligible.length-selected.length,source,settings,requestedDuration:invalid.length?null:clips.reduce((n,c)=>n+c.duration,0),estimatedVideoDuration:invalid.length?null:clips.reduce((n,c)=>n+c.estimatedVideoDuration,0),clips};
  if(values.json) console.log(JSON.stringify(result,null,2));
  else {
    const format=seconds=>`${Math.floor(seconds/60)}m ${(seconds%60).toFixed(2)}s`;
    console.log(`Uncompiled matching loops: ${result.remaining}\nSelection mode: ${result.selectionMode}\nSelected for next compilation: ${result.selected} / ${result.requested}\nRemaining after successful compilation: ${result.remainingAfterSuccess}`);
    if(invalid.length) {console.log('Cannot estimate: some selected WAVs are invalid.');for(const clip of invalid)console.error(`${clip.name}: ${clip.error}`);}
    else console.log(`Requested audio length: ${format(result.requestedDuration)}\nEstimated final video length: ${format(result.estimatedVideoDuration)} (frame-rounded; allow up to one frame per clip)`);
  }
  if(invalid.length)process.exitCode=1;
} catch(error) {console.error(error.message);process.exitCode=1;}
