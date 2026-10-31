import React, { useEffect, useRef, useState } from 'react';
import { IconButton } from './Icon.jsx';

const clock = seconds => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export function AudioPlayer({ src, name, buffer, rate = 1, autoPlay = false, renderTime, durationHint, onError }) {
  const audio = useRef(null), surface = useRef(null), canvas = useRef(null);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  const [duration, setDuration] = useState(buffer?.duration || durationHint || 0);
  const [loop, setLoop] = useState(Boolean(buffer)), [muted, setMuted] = useState(false);
  const waveform = Boolean(buffer);
  const displayTime = renderTime ?? time;
  const displayPlaying = renderTime !== undefined || playing;
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
    if (renderTime !== undefined) {
      surface.current?.style.setProperty('--progress', `${buffer?.duration ? renderTime / buffer.duration * 100 : 0}%`);
      return;
    }
    let frame;
    const update = () => {
      const media = audio.current;
      const fraction = media.duration > 0 ? media.currentTime / media.duration : 0;
      surface.current?.style.setProperty('--progress', `${Math.min(1, fraction) * 100}%`);
      if (playing) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [playing, time, renderTime, buffer]);
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
    <IconButton icon={displayPlaying ? 'pause' : 'play'} label={`${displayPlaying ? 'Pause' : 'Play'} ${name}`} className={`play-button ${displayPlaying ? 'active' : ''}`}  disabled={!src} onClick={toggle}/>
    {waveform && <IconButton icon="stop" label="Stop loop output" onClick={() => { audio.current.pause(); seek(0); }}/>}
  </>;
  return <div ref={surface} data-capture={waveform ? 'player' : undefined} className={waveform ? 'waveform-player' : 'compact-player'}>
    <audio ref={audio} src={src} preload={durationHint ? 'none' : 'metadata'} loop={loop} muted={muted}
      onLoadedMetadata={() => setDuration(audio.current.duration)}
      onTimeUpdate={() => setTime(audio.current.currentTime)}
      onPlay={() => { document.querySelectorAll('audio').forEach(other => { if (other !== audio.current) other.pause(); }); setPlaying(true); }}
      onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(audio.current.currentTime); }}
      onError={() => onError?.(`Unable to load ${name}`)}/>
    {waveform ? <>
      <div data-capture="timeline" className="waveform-seek" role="slider" tabIndex={0} aria-label={seekLabel} aria-valuemin={0} aria-valuemax={Number.isFinite(duration) ? duration : 0} aria-valuenow={displayTime} aria-valuetext={`${clock(displayTime / rate)} of ${clock(duration / rate)}`}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); seek((event.clientX - box.left) / box.width * duration); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const box = event.currentTarget.getBoundingClientRect(); seek((event.clientX - box.left) / box.width * duration); }}
        onKeyDown={event => {
          const targets = { ArrowRight: time + 5 * rate, ArrowLeft: time - 5 * rate, Home: 0, End: duration };
          if (Object.hasOwn(targets, event.key)) { event.preventDefault(); seek(targets[event.key]); }
        }}>
        <canvas data-capture="waveform" ref={canvas} width="1000" height="160" aria-hidden="true"/>
        <div className="played-region"/><div className="playhead" data-capture="playhead"/>
      </div>
      <div className="waveform-transport"><div className="transport-buttons">{transport}<IconButton icon="repeat" label="Loop playback" aria-pressed={loop} className={loop ? 'active' : ''} onClick={() => setLoop(!loop)}/></div><span className="playback-time" data-capture="clock">{clock(displayTime / rate)} <span>/ {clock(duration / rate)}</span></span><IconButton icon={muted ? 'mute' : 'volume'} label={muted ? 'Unmute loop output' : 'Mute loop output'} aria-pressed={muted} onClick={() => setMuted(!muted)}/></div>
    </> : <>{transport}<input className="audio-seek" aria-label={seekLabel} type="range" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.01" value={time} disabled={!duration} onChange={event => seek(Number(event.target.value))}/><span className="playback-time">{clock(time)} <span>/ {clock(duration)}</span></span></>}
  </div>;
}
