import React, { useEffect, useRef, useState } from 'react';
import { IconButton } from './Icon.jsx';

const clock = seconds => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export function AudioPlayer({ src, name, buffer, rate = 1, autoPlay = false, onError }) {
  const audio = useRef(null), surface = useRef(null), canvas = useRef(null);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  const [duration, setDuration] = useState(buffer?.duration || 0);
  const [loop, setLoop] = useState(Boolean(buffer)), [muted, setMuted] = useState(false);
  const waveform = Boolean(buffer);
  useEffect(() => {
    const media = audio.current;
    media.preservesPitch = false;
    media.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    if (!autoPlay || !src) return;
    const media = audio.current;
    let cancelled = false;
    media.play().catch(error => {
      if (cancelled || error.name === 'AbortError') return;
      onError?.(error.name === 'NotAllowedError'
        ? 'Press play to start the loop. Your browser blocked autoplay.'
        : `Unable to play ${name}: ${error.message}`);
    });
    return () => { cancelled = true; media.pause(); };
  }, [autoPlay, src, name, onError]);
  useEffect(() => {
    let frame;
    const update = () => {
      const media = audio.current;
      const fraction = media.duration > 0 ? media.currentTime / media.duration : 0;
      surface.current?.style.setProperty('--progress', `${Math.min(1, fraction) * 100}%`);
      if (playing) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [playing, time]);
  useEffect(() => {
    if (!buffer || !canvas.current) return;
    const el = canvas.current, ctx = el.getContext('2d'), samples = buffer.getChannelData(0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.fillStyle = '#7fe0be';
    const step = Math.max(1, Math.ceil(samples.length / el.width));
    for (let x = 0; x < el.width; x++) {
      let peak = 0;
      for (let i = x * step; i < Math.min(samples.length, (x + 1) * step); i++) peak = Math.max(peak, Math.abs(samples[i]));
      ctx.fillRect(x, (1 - peak) * el.height / 2, 1, Math.max(1, peak * el.height));
    }
  }, [buffer]);
  function seek(next) {
    if (!Number.isFinite(duration) || duration <= 0) return;
    audio.current.currentTime = Math.max(0, Math.min(duration, next));
    setTime(audio.current.currentTime);
  }
  async function toggle() {
    const media = audio.current;
    if (!media.paused) { media.pause(); return; }
    try { await media.play(); }
    catch (error) { onError?.(`Unable to play ${name}: ${error.message}`); }
  }
  const seekLabel = `Seek ${name}`;
  const transport = <>
    <IconButton icon={playing ? 'pause' : 'play'} label={`${playing ? 'Pause' : 'Play'} ${name}`} className={`play-button ${playing ? 'active' : ''}`} disabled={!src} onClick={toggle}/>
    {waveform && <IconButton icon="stop" label="Stop loop output" onClick={() => { audio.current.pause(); seek(0); }}/>}
  </>;
  return <div ref={surface} className={waveform ? 'waveform-player' : 'compact-player'}>
    <audio ref={audio} src={src} preload="metadata" loop={loop} muted={muted}
      onLoadedMetadata={() => setDuration(audio.current.duration)}
      onTimeUpdate={() => setTime(audio.current.currentTime)}
      onPlay={() => { document.querySelectorAll('audio').forEach(other => { if (other !== audio.current) other.pause(); }); setPlaying(true); }}
      onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(audio.current.currentTime); }}
      onError={() => onError?.(`Unable to load ${name}`)}/>
    {waveform ? <>
      <div className="waveform-seek" role="slider" tabIndex={0} aria-label={seekLabel} aria-valuemin={0} aria-valuemax={Number.isFinite(duration) ? duration : 0} aria-valuenow={time} aria-valuetext={`${clock(time / rate)} of ${clock(duration / rate)}`}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); seek((event.clientX - box.left) / box.width * duration); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const box = event.currentTarget.getBoundingClientRect(); seek((event.clientX - box.left) / box.width * duration); }}
        onKeyDown={event => {
          const targets = { ArrowRight: time + 5 * rate, ArrowLeft: time - 5 * rate, Home: 0, End: duration };
          if (Object.hasOwn(targets, event.key)) { event.preventDefault(); seek(targets[event.key]); }
        }}>
        <canvas ref={canvas} width="1000" height="160" aria-hidden="true"/>
        <div className="played-region"/><div className="playhead"/>
      </div>
      <div className="waveform-transport"><div className="transport-buttons">{transport}<IconButton icon="repeat" label="Loop playback" aria-pressed={loop} className={loop ? 'active' : ''} onClick={() => setLoop(!loop)}/></div><span className="playback-time">{clock(time / rate)} <span>/ {clock(duration / rate)}</span></span><IconButton icon={muted ? 'mute' : 'volume'} label={muted ? 'Unmute loop output' : 'Mute loop output'} aria-pressed={muted} onClick={() => setMuted(!muted)}/></div>
    </> : <>{transport}<input className="audio-seek" aria-label={seekLabel} type="range" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.01" value={time} disabled={!duration} onChange={event => seek(Number(event.target.value))}/><span className="playback-time">{clock(time)} <span>/ {clock(duration)}</span></span></>}
  </div>;
}
