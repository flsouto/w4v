export function encodeWavAsync(buffer,rate=1) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./wav-worker.js',import.meta.url),{type:'module'});
    const stop=()=>{clearTimeout(timer);worker.terminate();};
    const timer=setTimeout(()=>{stop();reject(new Error('WAV export timed out'));},60000);
    worker.onmessage=({data})=>{stop();data.error?reject(new Error(data.error)):resolve(data.bytes);};
    worker.onerror=event=>{stop();reject(new Error(event.message || 'WAV export failed'));};
    worker.onmessageerror=()=>{stop();reject(new Error('Unable to read WAV export result'));};
    try {
      const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice());
      worker.postMessage({channels,sampleRate:buffer.sampleRate,rate},channels.map(channel=>channel.buffer));
    } catch(error) {stop();reject(error);}
  });
}
