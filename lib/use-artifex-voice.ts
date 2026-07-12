'use client';

/**
 * Artifex voice (Phase C/D) — ElevenLabs TTS out, Web Speech API in.
 *
 * speak(text): fetches streamed MP3 from /api/command-center/tts (ElevenLabs
 * behind the server; key never client-side) and plays it. If the server says
 * 503 (no ELEVENLABS_API_KEY yet), voice marks itself unavailable and the UI
 * hides the controls — everything lights up the moment the founder pastes the
 * key into Vercel, zero code changes.
 *
 * Phase D (voice-first Command Center): playback is routed through a WebAudio
 * AnalyserNode and the live RMS loudness is written into `amplitudeRef`
 * (0..1, mutable ref — NOT state) every animation frame while speaking. The
 * orb reads it inside its own rAF loop via a getter, so the "center talks"
 * visual costs zero React re-renders. speak() also accepts an onEnd callback
 * so the caller can chain conversation turns (auto re-listen).
 *
 * Listening uses the browser's SpeechRecognition (Chrome/Safari/Edge) — no
 * vendor dependency for input; ElevenLabs carries the signature VOICE out.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}

export function useArtifexVoice() {
  // null = unknown (assume available until a 503 says otherwise)
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  // Set when the browser BLOCKED autoplay of a finished reply — the UI shows
  // a "tap to hear" button; tapping plays inside a fresh gesture (always allowed).
  const [pendingBuffer, setPendingBuffer] = useState<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Live speech loudness 0..1 — mutable ref by design (see header comment).
  const amplitudeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ampRafRef = useRef(0);

  useEffect(() => {
    setMicSupported(!!getRecognition());
    return () => {
      audioRef.current?.pause();
      recRef.current?.abort();
      if (ampRafRef.current) cancelAnimationFrame(ampRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Chrome's autoplay policy can leave the AudioContext 'suspended' until a
  // user gesture. CRITICAL: audio routed through a suspended context plays
  // into a dead end — the orb animates but NO SOUND comes out (founder bug
  // Jul 12: "I didn't hear him"). Call this from gesture handlers (mic tap,
  // voice toggle, send) so the context is running before playback.
  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch { /* WebAudio unavailable — speak() plays directly */ }
  }, []);

  const stopAmplitudeLoop = useCallback(() => {
    if (ampRafRef.current) cancelAnimationFrame(ampRafRef.current);
    ampRafRef.current = 0;
    amplitudeRef.current = 0;
  }, []);

  const startAmplitudeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      // RMS ≈ 0..0.5 for speech; scale + clamp for a lively 0..1 signal.
      amplitudeRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
      ampRafRef.current = requestAnimationFrame(tick);
    };
    ampRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    sourceRef.current = null;
    stopAmplitudeLoop();
    setSpeaking(false);
  }, [stopAmplitudeLoop]);

  const speak = useCallback(
    async (text: string, opts?: { onEnd?: () => void }) => {
      if (!text.trim() || ttsAvailable === false) {
        opts?.onEnd?.();
        return;
      }
      stopSpeaking();
      setPendingBuffer(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          opts?.onEnd?.();
          return;
        }
        const res = await fetch('/api/command-center/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        if (res.status === 503) {
          setTtsAvailable(false); // key not configured yet — hide controls
          opts?.onEnd?.();
          return;
        }
        if (!res.ok) {
          opts?.onEnd?.();
          return;
        }
        setTtsAvailable(true);

        // PURE WebAudio playback (Jul 12 definitive fix): HTMLMediaElement's
        // play() is gated PER CALL by Chrome's transient-activation rule —
        // which expires (~5s) while Artifex is still thinking/generating, so
        // even mic-started turns got blocked. A running AudioContext has no
        // per-play gate: unlock once on any tap, every later reply just plays.
        const arrayBuf = await res.arrayBuffer();
        if (!audioCtxRef.current) {
          const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (Ctx) audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current;
        if (!ctx) { opts?.onEnd?.(); return; }
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

        const buffer = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (ctx.state !== 'running') {
          // Engine never got a user gesture — park the decoded reply; the UI
          // shows "Tap to hear" and the tap (a gesture) plays it instantly.
          console.warn('[artifex-voice] audio engine locked — offering tap-to-play');
          setPendingBuffer(buffer);
          opts?.onEnd?.();
          return;
        }

        const finish = () => {
          sourceRef.current = null;
          stopAmplitudeLoop();
          setSpeaking(false);
          opts?.onEnd?.();
        };
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
        sourceRef.current = source;
        setSpeaking(true);
        startAmplitudeLoop();
        source.onended = finish;
        try { source.start(); } catch { finish(); }
      } catch {
        stopAmplitudeLoop();
        setSpeaking(false);
        opts?.onEnd?.();
      }
    },
    [stopSpeaking, stopAmplitudeLoop, startAmplitudeLoop, ttsAvailable]
  );

  const playPendingAudio = useCallback(() => {
    const buffer = pendingBuffer;
    const ctx = audioCtxRef.current;
    if (!buffer || !ctx) return;
    setPendingBuffer(null);
    // We're inside a user gesture — resume is guaranteed to succeed.
    ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    sourceRef.current = source;
    setSpeaking(true);
    startAmplitudeLoop();
    source.onended = () => { sourceRef.current = null; stopAmplitudeLoop(); setSpeaking(false); };
    try { source.start(); } catch { setSpeaking(false); }
  }, [pendingBuffer, startAmplitudeLoop, stopAmplitudeLoop]);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      const rec = getRecognition();
      if (!rec) return;
      recRef.current?.abort();
      recRef.current = rec;
      setListening(true);
      rec.onresult = (e) => {
        const transcript = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
          .join(' ')
          .trim();
        if (transcript) onTranscript(transcript);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    },
    []
  );

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return {
    ttsAvailable,
    speaking,
    listening,
    micSupported,
    amplitudeRef,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    unlockAudio,
    pendingAudio: pendingBuffer != null,
    playPendingAudio,
  };
}

export type ArtifexVoice = ReturnType<typeof useArtifexVoice>;
