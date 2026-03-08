'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseVoiceOutputOptions {
  /** Speech rate (0.1 to 10, default 1) */
  rate?: number;
  /** Speech pitch (0 to 2, default 1) */
  pitch?: number;
  /** Preferred voice name — will try to match, falls back to default */
  preferredVoice?: string;
  /** Called when speech finishes */
  onEnd?: () => void;
}

export interface UseVoiceOutputReturn {
  /** Speak text aloud */
  speak: (text: string) => Promise<void>;
  /** Stop any current speech */
  stop: () => void;
  /** Whether currently speaking */
  isSpeaking: boolean;
  /** Whether browser supports speech synthesis */
  isSupported: boolean;
}

export function useVoiceOutput(options: UseVoiceOutputOptions = {}): UseVoiceOutputReturn {
  const {
    rate = 1,
    pitch = 1,
    preferredVoice,
    onEnd,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const onEndRef = useRef(onEnd);
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  // Check support on mount
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setIsSupported(supported);

    // Chrome sometimes needs voices to be loaded
    if (supported) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const findBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();

    if (!voices.length) return null;

    // Try to match preferred voice name
    if (preferredVoice) {
      const match = voices.find(v =>
        v.name.toLowerCase().includes(preferredVoice.toLowerCase())
      );
      if (match) return match;
    }

    // Prefer a natural-sounding US English voice
    const preferredNames = [
      'Google US English',
      'Samantha',          // macOS
      'Alex',              // macOS
      'Microsoft Mark',    // Windows
      'Microsoft David',   // Windows
    ];

    for (const name of preferredNames) {
      const match = voices.find(v =>
        v.name.includes(name) && v.lang.startsWith('en')
      );
      if (match) return match;
    }

    // Fall back to any English voice
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) return englishVoice;

    // Last resort: default voice
    return voices[0] || null;
  }, [preferredVoice]);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!isSupported) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;

      const voice = findBestVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        resolveRef.current = null;
        onEndRef.current?.();
        resolve();
      };

      utterance.onerror = (event) => {
        // 'interrupted' and 'canceled' are expected when we call stop()
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.error('Speech synthesis error:', event.error);
        }
        setIsSpeaking(false);
        resolveRef.current = null;
        resolve();
      };

      resolveRef.current = resolve;
      window.speechSynthesis.speak(utterance);

      // Chrome bug: synthesis stops after ~15 seconds of silence
      // Workaround: keep it alive with a resume interval
      const keepAlive = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearInterval(keepAlive);
        }
      }, 10000);

      utterance.onend = () => {
        clearInterval(keepAlive);
        setIsSpeaking(false);
        resolveRef.current = null;
        onEndRef.current?.();
        resolve();
      };

      utterance.onerror = (event) => {
        clearInterval(keepAlive);
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.error('Speech synthesis error:', event.error);
        }
        setIsSpeaking(false);
        resolveRef.current = null;
        resolve();
      };
    });
  }, [isSupported, rate, pitch, findBestVoice]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, [isSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
  };
}
