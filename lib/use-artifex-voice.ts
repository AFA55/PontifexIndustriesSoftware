'use client';

/**
 * Artifex voice (Phase C) — ElevenLabs TTS out, Web Speech API in.
 *
 * speak(text): fetches streamed MP3 from /api/command-center/tts (ElevenLabs
 * behind the server; key never client-side) and plays it. If the server says
 * 503 (no ELEVENLABS_API_KEY yet), voice marks itself unavailable and the UI
 * hides the controls — everything lights up the moment the founder pastes the
 * key into Vercel, zero code changes.
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

  useEffect(() => {
    setMicSupported(!!getRecognition());
    return () => {
      audioRef.current?.pause();
      recRef.current?.abort();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim() || ttsAvailable === false) return;
      stopSpeaking();
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/command-center/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        if (res.status === 503) {
          setTtsAvailable(false); // key not configured yet — hide controls
          return;
        }
        if (!res.ok) return;
        setTtsAvailable(true);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setSpeaking(true);
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play().catch(() => setSpeaking(false));
      } catch {
        setSpeaking(false);
      }
    },
    [stopSpeaking, ttsAvailable]
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

  return { ttsAvailable, speaking, listening, micSupported, speak, stopSpeaking, startListening, stopListening };
}
