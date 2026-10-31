import { encodeWav } from './audio.js';
self.onmessage=({data:{channels,sampleRate,rate}})=>{
  try {
    const bytes=encodeWav({numberOfChannels:channels.length,length:channels[0].length,sampleRate,getChannelData:index=>channels[index]},rate);
    self.postMessage({bytes},[bytes.buffer]);
  } catch(error) { self.postMessage({error:error.message}); }
};
