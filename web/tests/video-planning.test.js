import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { selectInputs } from '../../scripts/video/inputs.mjs';
import { resolveVideoSource } from '../../scripts/video/config.mjs';
import { clipTiming } from '../../scripts/video/timing.mjs';
import { concatenateClips } from '../../scripts/video/concatenate.mjs';

test('env glob filters nested candidates before last/history selection, with explicit overrides',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'looplicator-glob-'));
  try{
    await mkdir(join(dir,'nested'));await writeFile(join(dir,'nested','keep.wav'),'new');await writeFile(join(dir,'nested','skip.wav'),'other');
    const pattern=join(dir,'**','keep*.wav');
    await writeFile(join(dir,'.env'),`VIDEO_INPUT_GLOB="${pattern}"\n`);
    const configured=await resolveVideoSource({},dir,{});assert.equal(configured.glob,pattern);
    assert.deepEqual((await selectInputs([],10,new Set(),configured.glob)).map(f=>f.name),['keep.wav']);
    assert.equal((await selectInputs([],10,new Set(['keep.wav']),configured.glob)).length,0);
    assert.equal((await resolveVideoSource({},dir,{VIDEO_INPUT_GLOB:'custom/*.wav'})).glob,'custom/*.wav');
    assert.equal((await resolveVideoSource({glob:'override/*.wav'},dir,{})).glob,'override/*.wav');
    assert.deepEqual((await resolveVideoSource({input:['explicit']},dir,{})).directories,['explicit']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('planner and renderer share sample-rounded excerpt, repeat, and seconds-cap timing',()=>{
  const settings={portion:.25,cycles:3,fps:30};
  const timing=clipTiming(16,44100,settings);assert.equal(timing.duration,12);assert.equal(timing.excerptDuration,4);assert.equal(timing.frames,360);
  assert.equal(clipTiming(16,44100,{...settings,seconds:2.5}).duration,2.5);
  assert.equal(clipTiming(8,48000,settings).duration,6);
  assert.throws(()=>clipTiming(0,44100,settings));
});
test('final compilation atomically replaces the existing fixed path on every successful run',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'looplicator-fixed-compilation-'));
  try{
    const clips=[];
    for(const duration of [.2,.4]){
      const video=join(dir,`clip-${duration}.mov`);
      execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=320x320:r=20','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(duration),'-c:v','libx264','-pix_fmt','yuv420p','-c:a','pcm_f32le',video],{stdio:'pipe'});
      clips.push({name:String(duration),video,status:'complete'});
    }
    const destination=join(dir,'compilation.mp4');await writeFile(destination,'old file');
    const first=await concatenateClips([clips[0]],destination,20);assert.equal(first.status,'complete');assert.equal(first.duration,.2);
    const second=await concatenateClips([clips[1]],destination,20);assert.equal(second.video,destination);assert.equal(second.duration,.4);
    const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',destination],{encoding:'utf8'}));
    assert.ok(Math.abs(duration-.4)<.03);
    assert.notEqual((await readFile(destination)).toString(),'old file');
  }finally{await rm(dir,{recursive:true,force:true});}
});
