import { execFileSync, spawn } from 'node:child_process';
import { FINAL_AUDIO } from './encoding.mjs';
import { access, rename, unlink } from 'node:fs/promises';

export async function concatenateClips(records, destination, fps) {
  if (!records.length || records.some(record => !['complete','skipped-existing'].includes(record.status))) throw new Error('A compilation requires every selected clip to complete');
  const segments = records.map(record => {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=codec_type,duration','-of','json',record.video], {encoding:'utf8'}));
    const duration = Number(probe.streams.find(stream=>stream.codec_type==='video')?.duration);
    if (!(duration > 0) || !Number.isFinite(duration)) throw new Error(`Invalid video duration: ${record.video}`);
    return { name:record.name, video:record.video, duration };
  });
  const duration = segments.reduce((total,clip)=>total+clip.duration,0);
  try { await access(destination); return {status:'skipped-existing',video:destination,duration,segments}; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const partial = `${destination}.${process.pid}.partial.mp4`;
  const filters = segments.flatMap((clip,i)=>[
    `[${i}:v]setpts=PTS-STARTPTS[v${i}]`,
    `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${clip.duration},asetpts=PTS-STARTPTS[a${i}]`,
  ]);
  filters.push(`${segments.map((_,i)=>`[v${i}][a${i}]`).join('')}concat=n=${segments.length}:v=1:a=1[v][a]`);
  const args=['-hide_banner','-loglevel','error','-y',...segments.flatMap(clip=>['-i',clip.video]),'-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-r',String(fps),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',...FINAL_AUDIO,'-movflags','+faststart',partial];
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let errors='';
      child.stderr.on('data',data=>{errors=(errors+data).slice(-8000);});
      child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`Compilation failed (${code}): ${errors}`)));
    });
    await rename(partial,destination);
  } catch(error) { await unlink(partial).catch(()=>{}); throw error; }
  return {status:'complete',video:destination,duration,segments};
}
