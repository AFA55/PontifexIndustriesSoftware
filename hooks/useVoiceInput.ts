'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Web Speech API type declarations
 * These are not in TypeScript's lib by default
 */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export interface UseVoiceInputOptions {
  /** Called when a final (committed) transcript is available */
  onResult?: (transcript: string) => void;
  /** Called with interim (in-progress) transcript while speaking */
  onInterim?: (transcript: string) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /** Language code, default 'en-US' */
  language?: string;
  /** Keep listening after pauses, default false */
  continuous?: boolean;
  /**
   * Auto-stop after this many ms of silence (no new speech events).
   * Only used when continuous=true. 0 = disabled.
   * Recommended: 3000 for free-speech mode.
   */
  silenceTimeout?: number;
  /**
   * When true, accumulates all final results into one string and
   * delivers the full concatenation via onResult when done (either
   * by silence timeout or manual stop). Default false.
   */
  accumulateResults?: boolean;
}

export interface UseVoiceInputReturn {
  /** Whether the microphone is currently listening */
  isListening: boolean;
  /** Whether the browser supports Web Speech API */
  isSupported: boolean;
  /** Start listening */
  start: () => void;
  /** Stop listening */
  stop: () => void;
  /** Current error message, if any */
  error: string | null;
  /** The latest final transcript */
  transcript: string;
  /** The current interim (in-progress) transcript */
  interimTranscript: string;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    onResult,
    onInterim,
    onError,
    language = 'en-US',
    continuous = false,
    silenceTimeout = 0,
    accumulateResults = false,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isStoppingRef = useRef(false);

  // Accumulation buffer for free-speech mode
  const accumulatedRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs so they don't cause re-creation of recognition
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onInterimRef.current = onInterim;
    onErrorRef.current = onError;
  }, [onResult, onInterim, onError]);

  // Check browser support on mount
  useEffect(() => {
    const supported = typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    setIsSupported(supported);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (recognitionRef.current) {
        isStoppingRef.current = true;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  /**
   * Reset the silence timer. Called every time new speech is detected.
   * When it expires, stops recognition and delivers accumulated results.
   */
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimeout <= 0) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    silenceTimerRef.current = setTimeout(() => {
      // Silence timeout hit — stop and deliver
      if (recognitionRef.current && !isStoppingRef.current) {
        isStoppingRef.current = true;
        recognitionRef.current.stop();

        // Deliver accumulated results
        if (accumulateResults && accumulatedRef.current.trim()) {
          const fullTranscript = accumulatedRef.current.trim();
          setTranscript(fullTranscript);
          setInterimTranscript('');
          onResultRef.current?.(fullTranscript);
        }

        setIsListening(false);
      }
    }, silenceTimeout);
  }, [silenceTimeout, accumulateResults]);

  const start = useCallback(() => {
    if (!isSupported) {
      const msg = 'Speech recognition is not supported in this browser. Please use Chrome or Edge.';
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      isStoppingRef.current = true;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    setError(null);
    setInterimTranscript('');
    isStoppingRef.current = false;
    accumulatedRef.current = '';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // In accumulate mode, always use continuous so mic stays open
    recognition.continuous = accumulateResults ? true : continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);

      // Start silence timer if configured
      if (silenceTimeout > 0) {
        resetSilenceTimer();
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      // Reset silence timer on any speech activity
      if (silenceTimeout > 0 && (interimText || finalText)) {
        resetSilenceTimer();
      }

      if (accumulateResults) {
        // Accumulation mode: buffer finals, show accumulated + interim
        if (finalText) {
          accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + finalText;
        }

        // Show full accumulated text + current interim
        const display = accumulatedRef.current + (interimText ? ' ' + interimText : '');
        setInterimTranscript(display);
        onInterimRef.current?.(display);
      } else {
        // Normal mode: deliver each final result individually
        if (interimText) {
          setInterimTranscript(interimText);
          onInterimRef.current?.(interimText);
        }

        if (finalText) {
          setTranscript(finalText);
          setInterimTranscript('');
          onResultRef.current?.(finalText);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Don't report errors if we intentionally stopped
      if (isStoppingRef.current) return;

      let errorMessage: string;
      switch (event.error) {
        case 'not-allowed': {
          const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          errorMessage = isSafari
            ? 'Microphone not supported in Safari. Please use Chrome or Edge for voice input.'
            : 'Microphone access denied. Please allow microphone access in your browser settings and try again.';
          break;
        }
        case 'no-speech':
          // In accumulate mode, no-speech after some accumulated text = done talking
          if (accumulateResults && accumulatedRef.current.trim()) {
            const fullTranscript = accumulatedRef.current.trim();
            setTranscript(fullTranscript);
            setInterimTranscript('');
            onResultRef.current?.(fullTranscript);
            setIsListening(false);
            return;
          }
          errorMessage = 'No speech detected. Try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your device.';
          break;
        case 'network':
          errorMessage = 'Network error. Please check your connection.';
          break;
        case 'aborted':
          // User or code aborted — not a real error
          return;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      setError(errorMessage);
      setIsListening(false);
      onErrorRef.current?.(errorMessage);
    };

    recognition.onend = () => {
      // If in accumulate mode with silence timer, the timer handles delivery
      if (accumulateResults && silenceTimeout > 0 && !isStoppingRef.current) {
        // Mic ended due to Chrome's ~60s limit or brief pause
        // Restart to keep listening
        try {
          recognition.start();
          return;
        } catch {
          // Can't restart — deliver what we have
          if (accumulatedRef.current.trim()) {
            const fullTranscript = accumulatedRef.current.trim();
            setTranscript(fullTranscript);
            setInterimTranscript('');
            onResultRef.current?.(fullTranscript);
          }
        }
      }

      setIsListening(false);
      setInterimTranscript('');

      // If continuous mode and we didn't intentionally stop, restart
      if (continuous && !accumulateResults && !isStoppingRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started or other issue — ignore
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      const msg = 'Failed to start speech recognition. Please try again.';
      setError(msg);
      onErrorRef.current?.(msg);
    }
  }, [isSupported, language, continuous, silenceTimeout, accumulateResults, resetSilenceTimer]);

  const stop = useCallback(() => {
    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    isStoppingRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // In accumulate mode, deliver what we have on manual stop
    if (accumulateResults && accumulatedRef.current.trim()) {
      const fullTranscript = accumulatedRef.current.trim();
      setTranscript(fullTranscript);
      setInterimTranscript('');
      onResultRef.current?.(fullTranscript);
    }

    setIsListening(false);
    setInterimTranscript('');
  }, [accumulateResults]);

  return {
    isListening,
    isSupported,
    start,
    stop,
    error,
    transcript,
    interimTranscript,
  };
}
