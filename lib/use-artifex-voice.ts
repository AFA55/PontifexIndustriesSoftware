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
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        // Route through an analyser so the orb can breathe with the words.
        try {
          if (!audioCtxRef.current) {
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            audioCtxRef.current = new Ctx();
          }
          const ctx = audioCtxRef.current!;
          if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;
        } catch {
          analyserRef.current = null; // fallback: orb uses its internal sine
        }

        const finish = () => {
          stopAmplitudeLoop();
          setSpeaking(false);
          URL.revokeObjectURL(url);
          opts?.onEnd?.();
        };
        setSpeaking(true);
        startAmplitudeLoop();
        audio.onended = finish;
        audio.onerror = finish;
        await audio.play().catch(() => finish());
      } catch {
        stopAmplitudeLoop();
        setSpeaking(false);
        opts?.onEnd?.();
      }
    },
    [stopSpeaking, stopAmplitudeLoop, startAmplitudeLoop, ttsAvailable]
  );

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
  };
}

export type ArtifexVoice = ReturnType<typeof useArtifexVoice>;
